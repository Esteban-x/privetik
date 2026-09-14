import type { SupabaseClient } from "@supabase/supabase-js";
import { createNewCard, reviewCard, type Quality, type SrsCard } from "@/lib/srs/sm2";
import { bumpStreakAndXp } from "@/lib/progress/streak";

/**
 * Enregistrement d'une révision SRS — partagé par les deux entrées :
 * /api/vocab/srs (cartes retournées, auto-évaluation) et /api/vocab/answer
 * (frappe et QCM, où c'est le serveur qui juge). Une seule copie de la
 * logique, donc une seule façon de mettre à jour la carte, le journal
 * d'activité, la série et l'XP.
 */
export async function recordVocabReview(
  supabase: SupabaseClient,
  userId: string,
  params: { cardId: string; quality: Quality; wordRu?: string | null; wordFr?: string | null }
): Promise<{ card: SrsCard } | { error: string }> {
  const { cardId, quality } = params;

  const { data: existing } = await supabase
    .from("srs_cards")
    .select("ease_factor, interval_days, repetitions, due_at, last_reviewed")
    .eq("user_id", userId)
    .eq("card_id", cardId)
    .single();

  const current = existing
    ? {
        id: cardId,
        easeFactor: existing.ease_factor,
        intervalDays: existing.interval_days,
        repetitions: existing.repetitions,
        dueAt: new Date(existing.due_at).getTime(),
        lastReviewedAt: existing.last_reviewed ? new Date(existing.last_reviewed).getTime() : null,
      }
    : createNewCard(cardId);

  const updated = reviewCard(current, quality);

  const { error } = await supabase.from("srs_cards").upsert(
    {
      user_id: userId,
      card_id: cardId,
      word_ru: params.wordRu ?? null,
      word_fr: params.wordFr ?? null,
      ease_factor: updated.easeFactor,
      interval_days: updated.intervalDays,
      repetitions: updated.repetitions,
      due_at: new Date(updated.dueAt).toISOString(),
      last_reviewed: new Date(updated.lastReviewedAt ?? Date.now()).toISOString(),
    },
    { onConflict: "user_id,card_id" }
  );
  if (error) return { error: error.message };

  // Une révision de vocabulaire alimente le journal d'activité et la
  // série/XP au même titre qu'un exercice de cas — sans quoi le tableau de
  // bord resterait à zéro pour qui ne pratique QUE le vocabulaire.
  const correct = quality >= 3;
  await supabase.from("activity_log").insert({
    user_id: userId,
    kind: "vocab",
    correct,
    // `first` : le tout premier passage de ce mot — c'est ce que compte la
    // limite de nouveaux mots par jour (lib/vocabulary/new-words.ts).
    meta: existing ? { cardId } : { cardId, first: true },
  });
  await bumpStreakAndXp(supabase, userId, correct ? 5 : 1);

  return { card: updated };
}
