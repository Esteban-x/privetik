import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnthropic, MODEL_FAST, parseJsonResponse, textFromMessage } from "@/lib/ai/client";
import { consumeQuota, recordTokens } from "@/lib/ai/quota";
import { sentenceTranslationPrompt } from "@/lib/ai/prompts";
import { allowPractice } from "@/lib/practice/quota";
import { bumpStreakAndXp } from "@/lib/progress/streak";
import { findTranslationItem } from "@/lib/translation/items";
import { matchesTranslation } from "@/lib/translation/judge";

/**
 * La correction d'une traduction français → russe.
 *
 * DEUX JUGES, DANS CET ORDRE. D'abord la référence, à la lettre près
 * (lib/translation/judge.ts) : c'est gratuit, immédiat et sans appel. Puis,
 * seulement si la phrase diffère, un second avis du modèle — parce qu'en
 * russe l'ordre des mots est libre et qu'une autre tournure peut être juste.
 * Il coûte une vérification du quota « verify », comme le second avis des
 * cas et du vocabulaire ; hors quota, la référence seule tranche, et la
 * réponse le dit.
 *
 * Progression dans exercise_progress (module « translation », une
 * compétence par niveau) et journal `translation` : aucune table nouvelle.
 */

interface Verdict {
  acceptable?: unknown;
  reason?: unknown;
  corrected?: unknown;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const itemId = typeof body.itemId === "string" ? body.itemId.slice(0, 200) : "";
  const answer = typeof body.answer === "string" ? body.answer.slice(0, 300).trim() : "";
  const revealed = body.revealed === true;

  const item = findTranslationItem(itemId);
  if (!item) return NextResponse.json({ error: "Phrase inconnue" }, { status: 400 });
  if (!revealed && !answer) return NextResponse.json({ error: "Réponse vide" }, { status: 400 });

  // Le péage de pratique, avant tout appel au modèle et toute écriture.
  const gate = await allowPractice(supabase, "practice");
  if (!gate.ok) return gate.response;

  let correct = false;
  let exact = false;
  let reason: string | null = null;
  let corrected: string | null = null;
  let aiUnavailable = false;

  if (!revealed) {
    exact = matchesTranslation(answer, item.ru);
    correct = exact;
    if (!exact) {
      const quota = await consumeQuota(supabase, "verify");
      if (!quota.allowed) {
        aiUnavailable = true;
      } else {
        try {
          const msg = await getAnthropic().messages.create({
            model: MODEL_FAST,
            max_tokens: 300,
            system: sentenceTranslationPrompt({ fr: item.fr, reference: item.ru, answer }),
            messages: [{ role: "user", content: "Juge cette traduction." }],
          });
          await recordTokens(supabase, "verify", msg.usage);
          const verdict = parseJsonResponse<Verdict>(textFromMessage(msg));
          correct = verdict.acceptable === true;
          reason = typeof verdict.reason === "string" && verdict.reason.trim() ? verdict.reason.slice(0, 300) : null;
          corrected =
            !correct && typeof verdict.corrected === "string" && verdict.corrected.trim()
              ? verdict.corrected.slice(0, 300)
              : null;
        } catch (err) {
          // Jamais « juste » par défaut : la référence seule a tranché.
          console.error("translation attempt: échec du second avis", err);
          aiUnavailable = true;
        }
      }
    }
  }

  const { data: existing } = await supabase
    .from("exercise_progress")
    .select("attempts, correct")
    .eq("user_id", user.id)
    .eq("module_id", "translation")
    .eq("skill_id", item.level)
    .maybeSingle();
  const attempts = (existing?.attempts ?? 0) + 1;
  const correctTotal = (existing?.correct ?? 0) + (correct ? 1 : 0);
  const { error } = await supabase.from("exercise_progress").upsert(
    {
      user_id: user.id,
      module_id: "translation",
      skill_id: item.level,
      attempts,
      correct: correctTotal,
      last_seen: new Date().toISOString(),
    },
    { onConflict: "user_id,module_id,skill_id" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("activity_log").insert({
    user_id: user.id,
    kind: "translation",
    correct,
    meta: { skill: item.level, itemId: item.id, exact, revealed, ai: !exact && !revealed && !aiUnavailable },
  });
  await bumpStreakAndXp(supabase, user.id, correct ? 12 : 2);

  return NextResponse.json({
    correct,
    revealed,
    exact,
    reference: item.ru,
    reason,
    corrected,
    aiUnavailable,
    accuracy: Math.round((correctTotal / attempts) * 100),
    quota: gate.allowance,
  });
}
