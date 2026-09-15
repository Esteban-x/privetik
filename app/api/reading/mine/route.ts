import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { countCases } from "@/lib/reading/stats";
import { sentencesFromClient } from "@/lib/reading/validate";
import { verifyCaseTags } from "@/lib/reading/verify-cases";
import { READING_LEVELS, type CefrLevel } from "@/lib/supabase/types";

/**
 * Garder un texte qu'on a lu sans l'enregistrer — un texte collé, écrit en
 * français, explications déjà obtenues comprises.
 *
 * AUCUN APPEL AU MODÈLE, DONC AUCUN QUOTA : l'annotation et les explications
 * ont été décomptées quand elles ont été faites. Le texte vient du
 * navigateur ; il passe par sentencesFromClient, et ses cas repassent devant
 * la banque de déclinaisons — un texte stocké est un texte vérifié ici, pas
 * sur la foi du client.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const sentences = sentencesFromClient(body.sentences);
  const title = typeof body.title === "string" ? body.title.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  const level = READING_LEVELS.includes(body.level) ? (body.level as CefrLevel) : null;
  if (!sentences || !title || !level) {
    return NextResponse.json({ error: "Ce texte ne peut pas être enregistré." }, { status: 400 });
  }
  const str = (v: unknown, max: number) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

  const { data, error } = await supabase
    .from("reading_texts")
    .insert({
      user_id: user.id,
      title,
      title_fr: str(body.titleFr, 80),
      level,
      sentences: verifyCaseTags(sentences).sentences,
      summary_fr: str(body.summaryFr, 300),
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("reading mine: échec de l'enregistrement", error);
    return NextResponse.json({ error: "L'enregistrement a échoué. Réessaie." }, { status: 500 });
  }
  return NextResponse.json({ id: data.id });
}

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
