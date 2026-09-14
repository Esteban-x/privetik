import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createNewCard, reviewCard, type Quality } from "@/lib/srs/sm2";
import { bumpStreakAndXp } from "@/lib/progress/streak";
import { allowPractice } from "@/lib/practice/quota";

// Enregistre une révision de carte SRS pour un mot d'une liste personnelle
// (le catalogue intégré, lui, reste sur localStorage — voir lib/storage.ts).
// `card_id` = l'id du mot (vocab_words.id) ; pas de clé étrangère stricte
// puisque cette table sert aussi, en local, au vocabulaire intégré.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const cardId = typeof body.cardId === "string" ? body.cardId : "";
  const quality = Number(body.quality) as Quality;
  const wordRu = typeof body.wordRu === "string" ? body.wordRu : null;
  const wordFr = typeof body.wordFr === "string" ? body.wordFr : null;

  if (!cardId || ![0, 1, 2, 3, 4, 5].includes(quality)) {
    return NextResponse.json({ error: "cardId et quality (0-5) requis" }, { status: 400 });
  }

  // Le péage de révision : vingt cartes par jour au plan gratuit, tous modes
  // confondus (cartes retournées, oral, QCM, frappe). Après la validation,
  // pour qu'une requête malformée ne grignote la journée de personne ; avant
  // l'écriture, pour qu'un refus ne déplace aucun intervalle de révision.
  const gate = await allowPractice(supabase, "vocab_review");
  if (!gate.ok) return gate.response;

  const { data: existing } = await supabase
    .from("srs_cards")
    .select("ease_factor, interval_days, repetitions, due_at, last_reviewed")
    .eq("user_id", user.id)
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
      user_id: user.id,
      card_id: cardId,
      word_ru: wordRu,
      word_fr: wordFr,
      ease_factor: updated.easeFactor,
      interval_days: updated.intervalDays,
      repetitions: updated.repetitions,
      due_at: new Date(updated.dueAt).toISOString(),
      last_reviewed: new Date(updated.lastReviewedAt ?? Date.now()).toISOString(),
    },
    { onConflict: "user_id,card_id" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Jusqu'ici une révision de vocabulaire n'alimentait ni le journal
  // d'activité ni la série/XP (contrairement au module Cas) — le streak du
  // tableau de bord restait à 0 pour un utilisateur qui ne pratique QUE le
  // vocabulaire. On aligne sur le même comportement que /api/cases/attempt.
  const correct = quality >= 3;
  await supabase.from("activity_log").insert({
    user_id: user.id,
    kind: "vocab",
    correct,
    // `first` : le tout premier passage de ce mot — c'est ce que compte la
    // limite de nouveaux mots par jour (lib/vocabulary/new-words.ts).
    meta: existing ? { cardId } : { cardId, first: true },
  });
  await bumpStreakAndXp(supabase, user.id, correct ? 5 : 1);

  // Ce qu'il reste APRÈS celle-ci : la file sait donc qu'elle vient de
  // servir la dernière carte, et propose l'abonnement plutôt qu'une carte
  // de plus qu'il faudrait refuser une fois répondue.
  return NextResponse.json({ card: updated, quota: gate.allowance });
}
