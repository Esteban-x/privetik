import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { countCases } from "@/lib/reading/stats";

// Liste des textes de lecture générés par l'IA et sauvegardés par
// l'utilisateur (voir POST /api/ai/reading) — pour la section "Mes textes"
// de /reading, même logique que GET /api/vocab/lists.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ texts: [] });

  const { data, error } = await supabase
    .from("reading_texts")
    .select("id, title, title_fr, level, sentences, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const texts = (data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    titleFr: t.title_fr,
    level: t.level,
    sentenceCount: Array.isArray(t.sentences) ? t.sentences.length : 0,
    // Les cas que le texte travaille, comptés ici : les phrases sont déjà
    // lues, et les renvoyer entières pour une carte serait les faire voyager
    // pour rien.
    caseCounts: countCases(t.sentences),
    createdAt: t.created_at,
  }));

  return NextResponse.json({ texts });
}
