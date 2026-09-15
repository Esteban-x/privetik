import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/api/validate";
import { getAnthropic, MODEL_FAST, textFromMessage, parseJsonResponse } from "@/lib/ai/client";
import { consumeQuota, quotaDeniedResponse, recordTokens, refundQuota } from "@/lib/ai/quota";
import { readingCasesPrompt } from "@/lib/ai/prompts";
import { getReadingText, type CaseWhy, type GlossedWord } from "@/lib/reading/texts";
import { toSentenceExplanation, type SentenceExplanation } from "@/lib/reading/explanation";
import { sentencesFromClient } from "@/lib/reading/validate";
import { withExplanation } from "@/lib/reading/client";

/**
 * « Pourquoi ces cas ? » pour une phrase d'un texte.
 *
 * UNE PHRASE À LA FOIS, PAS UN MOT. Les cas d'une phrase s'expliquent
 * ensemble — « Я иду́ к дру́гу в шко́лу » oppose un datif et un accusatif de
 * direction — et un appel par mot aurait coûté trois fiches là où une suffit.
 * Toucher le mot suivant de la même phrase ne relance donc rien.
 *
 * LE TEXTE EST RELU EN BASE QUAND IL Y EST. La route reçoit alors un
 * identifiant et un numéro de phrase : ce qu'elle explique est bien ce que
 * l'apprenant lit.
 *
 * SAUF UN TEXTE QUI N'A PAS ÉTÉ ENREGISTRÉ. Un texte collé se lit sans
 * rejoindre « Mes textes », et le serveur n'en a aucune copie : la phrase
 * arrive avec la demande. Elle passe par sentencesFromClient — forme,
 * longueurs, cas connus, et du russe, pour que la route ne serve pas de
 * rédacteur libre sur le quota de l'apprenant. C'est alors le navigateur qui
 * garde l'explication, et l'enregistre avec le texte s'il est gardé.
 *
 * MISE EN CACHE DANS LE TEXTE LUI-MÊME. Chaque mot expliqué garde son
 * explication (`why`), la phrase sa traduction (`sentenceFr`, sur son
 * premier mot) : rouvrir le texte n'appelle plus rien, et aucune table n'a
 * été ajoutée pour ça. Les textes de la bibliothèque portent des
 * explications écrites et relues à la main — ils ne passent jamais par le
 * modèle.
 *
 * Décompté sur le poste `explain`, celui des fiches de mots : c'est la même
 * nature de dépense, et le même plafond pour l'apprenant.
 */
export const maxDuration = 30;

type Supabase = Awaited<ReturnType<typeof createClient>>;

type Found =
  | {
      sentence: GlossedWord[];
      level: string | null;
      /** Garde l'explication dans le texte en base — pour un texte enregistré seulement. */
      keep?: (explanation: SentenceExplanation) => Promise<void>;
    }
  | { error: string; status: number };

/** La phrase à expliquer : envoyée avec la demande, de la bibliothèque, ou d'un texte de l'apprenant. */
async function findSentence(supabase: Supabase, userId: string, body: Record<string, unknown>): Promise<Found> {
  if (Array.isArray(body.sentence)) {
    const sentence = sentencesFromClient([body.sentence])?.[0];
    return sentence ? { sentence, level: null } : { error: "Requête invalide", status: 400 };
  }

  const textId = typeof body.textId === "string" ? body.textId.slice(0, 100) : "";
  const sentenceIndex = Number(body.sentenceIndex);
  if (!textId || !Number.isInteger(sentenceIndex) || sentenceIndex < 0 || sentenceIndex > 500) {
    return { error: "Requête invalide", status: 400 };
  }

  if (!isUuid(textId)) {
    const library = getReadingText(textId);
    if (!library) return { error: "Texte introuvable", status: 404 };
    const sentence = library.sentences[sentenceIndex];
    return Array.isArray(sentence)
      ? { sentence, level: library.level }
      : { error: "Phrase introuvable", status: 404 };
  }

  const { data } = await supabase
    .from("reading_texts")
    .select("sentences, level")
    .eq("id", textId)
    .eq("user_id", userId)
    .single();
  if (!data || !Array.isArray(data.sentences)) return { error: "Texte introuvable", status: 404 };
  const sentences = data.sentences as GlossedWord[][];
  const sentence = sentences[sentenceIndex];
  if (!Array.isArray(sentence)) return { error: "Phrase introuvable", status: 404 };

  return {
    sentence,
    level: data.level,
    // Un échec d'écriture ne prive pas l'apprenant de l'explication qu'il
    // vient d'obtenir : elle sera simplement redemandée la prochaine fois.
    keep: async (explanation) => {
      const next = sentences.map((s, i) => (i === sentenceIndex ? withExplanation(s, explanation) : s));
      const { error } = await supabase
        .from("reading_texts")
        .update({ sentences: next })
        .eq("id", textId)
        .eq("user_id", userId);
      if (error) console.error("reading explain: échec de la mise en cache", error);
    },
  };
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const found = await findSentence(supabase, user.id, body && typeof body === "object" ? body : {});
  if ("error" in found) return NextResponse.json({ error: found.error }, { status: found.status });
  const { sentence } = found;

  const tagged = sentence
    .map((word, index) => ({ word, index }))
    .filter(({ word }) => Boolean(word?.case));
  if (tagged.length === 0) {
    return NextResponse.json({ error: "Aucun cas à expliquer dans cette phrase." }, { status: 400 });
  }

  // DÉJÀ EXPLIQUÉE : servie telle quelle, sans appel ni quota.
  if (tagged.every(({ word }) => word.why)) {
    return NextResponse.json({
      cached: true,
      translation: sentence[0]?.sentenceFr ?? null,
      words: Object.fromEntries(tagged.map(({ word, index }) => [index, word.why as CaseWhy])),
    });
  }

  const quota = await consumeQuota(supabase, "explain");
  if (!quota.allowed) return quotaDeniedResponse(quota);

  const { data: profile } = await supabase
    .from("profiles")
    .select("level")
    .eq("id", user.id)
    .single();

  try {
    const msg = await getAnthropic().messages.create({
      model: MODEL_FAST,
      max_tokens: 1400,
      system: readingCasesPrompt({
        sentence: sentence.map((w) => w.ru).join(" "),
        words: tagged.map(({ word, index }) => ({
          index,
          ru: word.ru,
          gloss: word.gloss ?? "",
          case: word.case!,
        })),
        level: profile?.level ?? found.level ?? "A1",
      }),
      messages: [{ role: "user", content: "Explique les cas de cette phrase." }],
    });
    await recordTokens(supabase, "explain", msg.usage);

    const explanation = toSentenceExplanation(parseJsonResponse(textFromMessage(msg)), sentence);
    if (!explanation) {
      console.error("reading explain: forme inattendue");
      await refundQuota(supabase, "explain");
      return NextResponse.json({ error: "Explication indisponible pour le moment." }, { status: 502 });
    }

    await found.keep?.(explanation);

    return NextResponse.json({
      cached: false,
      translation: explanation.translation,
      words: explanation.words,
    });
  } catch (err) {
    console.error("reading explain route error", err);
    await refundQuota(supabase, "explain");
    return NextResponse.json({ error: "Explication indisponible pour le moment." }, { status: 502 });
  }
}
