import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/api/validate";
import { getAnthropic, MODEL_FAST, textFromMessage, parseJsonResponse } from "@/lib/ai/client";
import { consumeQuota, quotaDeniedResponse, recordTokens, refundQuota } from "@/lib/ai/quota";
import { readingCasesPrompt } from "@/lib/ai/prompts";
import { getReadingText, type CaseWhy, type GlossedWord } from "@/lib/reading/texts";
import { toSentenceExplanation } from "@/lib/reading/explanation";

/**
 * « Pourquoi ces cas ? » pour une phrase d'un texte.
 *
 * UNE PHRASE À LA FOIS, PAS UN MOT. Les cas d'une phrase s'expliquent
 * ensemble — « Я иду́ к дру́гу в шко́лу » oppose un datif et un accusatif de
 * direction — et un appel par mot aurait coûté trois fiches là où une suffit.
 * Toucher le mot suivant de la même phrase ne relance donc rien.
 *
 * LE TEXTE EST RELU EN BASE, JAMAIS PRIS AU CLIENT. La route ne reçoit qu'un
 * identifiant et un numéro de phrase : elle ne sert pas de traducteur libre
 * sur le quota de l'apprenant, et ce qu'elle explique est bien ce qu'il lit.
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

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const textId = typeof body.textId === "string" ? body.textId.slice(0, 100) : "";
  const sentenceIndex = Number(body.sentenceIndex);
  if (!textId || !Number.isInteger(sentenceIndex) || sentenceIndex < 0 || sentenceIndex > 500) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  let sentences: GlossedWord[][];
  let textLevel: string | null = null;
  const owned = isUuid(textId);
  if (owned) {
    const { data } = await supabase
      .from("reading_texts")
      .select("sentences, level")
      .eq("id", textId)
      .eq("user_id", user.id)
      .single();
    if (!data || !Array.isArray(data.sentences)) {
      return NextResponse.json({ error: "Texte introuvable" }, { status: 404 });
    }
    sentences = data.sentences as GlossedWord[][];
    textLevel = data.level;
  } else {
    const library = getReadingText(textId);
    if (!library) return NextResponse.json({ error: "Texte introuvable" }, { status: 404 });
    sentences = library.sentences;
    textLevel = library.level;
  }

  const sentence = sentences[sentenceIndex];
  if (!Array.isArray(sentence)) {
    return NextResponse.json({ error: "Phrase introuvable" }, { status: 404 });
  }

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
        level: profile?.level ?? textLevel ?? "A1",
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

    // Mise en cache dans le texte de l'apprenant. Un échec d'écriture ne le
    // prive pas de l'explication qu'il vient d'obtenir : elle sera
    // simplement redemandée la prochaine fois.
    if (owned) {
      const nextSentence = sentence.map((word, index) => {
        const why = explanation.words[index];
        const withWhy = why ? { ...word, why } : word;
        return index === 0 && explanation.translation
          ? { ...withWhy, sentenceFr: explanation.translation }
          : withWhy;
      });
      const nextSentences = sentences.map((s, i) => (i === sentenceIndex ? nextSentence : s));
      const { error: saveError } = await supabase
        .from("reading_texts")
        .update({ sentences: nextSentences })
        .eq("id", textId)
        .eq("user_id", user.id);
      if (saveError) console.error("reading explain: échec de la mise en cache", saveError);
    }

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
