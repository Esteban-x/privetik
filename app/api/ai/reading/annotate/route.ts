import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnthropic, MODEL_FAST, textFromMessage, parseJsonResponse } from "@/lib/ai/client";
import { consumeQuota, quotaDeniedResponse, recordTokens, refundQuota } from "@/lib/ai/quota";
import { readingAnnotationPrompt } from "@/lib/ai/prompts";
import {
  annotationLines,
  applyAnnotations,
  checkManualText,
  detectTextLanguage,
  fallbackTitle,
} from "@/lib/reading/manual";
import { verifyCaseTags } from "@/lib/reading/verify-cases";
import type { ReadingText } from "@/lib/reading/texts";
import { READING_LEVELS, type CefrLevel } from "@/lib/supabase/types";

/**
 * Annoter un texte que l'apprenant a collé : chaque mot reçoit sa glose et
 * son cas.
 *
 * RIEN N'EST ENREGISTRÉ. On colle un message pour le comprendre, pas pour le
 * garder : le texte se lit, se devine et s'explique sans rejoindre « Mes
 * textes ». S'il est gardé, c'est POST /api/reading/mine qui l'enregistre —
 * d'où le titre français et le résumé renvoyés à part.
 *
 * DÉCOMPTÉ COMME UN TEXTE GÉNÉRÉ, sur le poste `reading`. C'est la même
 * dépense et le même usage ; un poste à part aurait ouvert un second plafond
 * à côté du premier. L'appel coûte pourtant moins cher : le modèle ne rend
 * que les gloses, pas le texte (voir lib/reading/manual.ts).
 *
 * Le plafond d'exécution est celui de la génération, pour la même raison —
 * voir app/api/ai/reading/route.ts.
 */
export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  // Le texte est jugé AVANT le quota : une saisie refusée ne coûte rien.
  const checked = checkManualText(typeof body.text === "string" ? body.text : "");
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const titleInput =
    typeof body.title === "string" ? body.title.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  // Un titre en latin est celui d'un texte écrit en français : affiché tel
  // quel, il resterait seul en français au-dessus du russe. Le modèle le
  // traduit, et le français devient le titre français.
  const titleIsFrench = detectTextLanguage(titleInput) === "fr";
  const givenTitle = titleIsFrench ? "" : titleInput;
  const givenTitleFr = titleIsFrench ? titleInput : "";

  const { data: profile } = await supabase
    .from("profiles")
    .select("level")
    .eq("id", user.id)
    .single();
  const profileLevel: CefrLevel = profile?.level ?? "A1";

  const quota = await consumeQuota(supabase, "reading");
  if (!quota.allowed) return quotaDeniedResponse(quota);

  try {
    const msg = await getAnthropic().messages.create({
      model: MODEL_FAST,
      // Mesuré sur un vrai texte : quatorze jetons par mot recopié avec sa
      // glose et son cas. Quinze cents caractères font jusqu'à deux cent
      // cinquante mots, soit trois mille cinq cents jetons — 4096 aurait
      // coupé un texte au maximum en plein milieu.
      max_tokens: 6000,
      system: readingAnnotationPrompt(profileLevel),
      messages: [
        {
          role: "user",
          content: `${
            givenTitle
              ? `Titre : ${givenTitle}\n\n`
              : givenTitleFr
                ? `Titre, en français : ${givenTitleFr}\n\n`
                : ""
          }${annotationLines(checked.sentences)}`,
        },
      ],
    });
    if (msg.stop_reason === "max_tokens") {
      console.error("reading annotate: réponse tronquée par max_tokens");
    }
    await recordTokens(supabase, "reading", msg.usage);

    const raw = parseJsonResponse<Record<string, unknown>>(textFromMessage(msg));
    const applied = applyAnnotations(checked.sentences, raw?.sentences);
    // Plus d'un mot sur quatre sans glose : ce qui reste ne vaut pas le
    // crédit consommé. On le rend plutôt que d'enregistrer un texte muet.
    if (!applied || applied.missed > applied.words / 4) {
      console.error(
        `reading annotate: annotation inutilisable (${applied?.missed ?? "?"} mot(s) sans glose sur ${checked.words})`
      );
      await refundQuota(supabase, "reading");
      return NextResponse.json({ error: "Annotation indisponible pour le moment." }, { status: 502 });
    }

    // Le même filet que pour un texte généré : les cas que la banque de
    // déclinaisons contredit sont retirés avant l'enregistrement.
    const verified = verifyCaseTags(applied.sentences);
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const level: CefrLevel = READING_LEVELS.includes(raw.level as CefrLevel)
      ? (raw.level as CefrLevel)
      : profileLevel;
    const text: ReadingText = {
      id: "ai-generated",
      title: givenTitle || str(raw.title)?.slice(0, 80) || fallbackTitle(checked.sentences),
      level,
      sentences: verified.sentences,
      caseCheck: verified.report,
    };

    return NextResponse.json({
      text,
      id: null,
      titleFr: givenTitleFr || str(raw.title_fr),
      summaryFr: str(raw.summary_fr),
    });
  } catch (err) {
    console.error("reading annotate route error", err);
    await refundQuota(supabase, "reading");
    return NextResponse.json({ error: "Annotation indisponible pour le moment." }, { status: 502 });
  }
}
