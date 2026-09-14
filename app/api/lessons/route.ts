import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { findLesson } from "@/lib/courses/catalog";

/**
 * Les leçons lues, sur le compte.
 *
 * LA COCHE VIVAIT DANS LE NAVIGATEUR. Lire le cours sur son téléphone dans le
 * métro puis s'entraîner sur l'ordinateur, et le catalogue repartait de zéro
 * — sans qu'aucune leçon lue ne compte nulle part. Sans table nouvelle : un
 * événement `lesson` par coche, décoche ou quiz, dans le journal. L'état
 * d'une leçon est celui de son dernier événement `read`.
 *
 * Aucun XP : cocher puis décocher ne doit rien rapporter.
 */

const MAX_SLUGS = 200;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { data, error } = await supabase
    .from("activity_log")
    .select("meta, created_at")
    .eq("user_id", user.id)
    .eq("kind", "lesson")
    .order("created_at", { ascending: true })
    .limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const state = new Map<string, boolean>();
  for (const row of data ?? []) {
    const meta = row.meta as { slug?: unknown; read?: unknown } | null;
    if (typeof meta?.slug === "string" && typeof meta.read === "boolean") state.set(meta.slug, meta.read);
  }
  return NextResponse.json({ read: [...state].filter(([, value]) => value).map(([slug]) => slug) });
}

/**
 * POST { slugs: string[], read: boolean } — coche ou décoche.
 * POST { slug, quiz: { score, total } } — un quiz terminé (trace, sans effet sur la coche).
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const known = (slug: unknown): slug is string => typeof slug === "string" && Boolean(findLesson(slug));

  const rows: { user_id: string; kind: string; correct: null; meta: Record<string, unknown> }[] = [];
  if (Array.isArray(body.slugs) && typeof body.read === "boolean") {
    for (const slug of new Set((body.slugs as unknown[]).slice(0, MAX_SLUGS))) {
      if (known(slug)) rows.push({ user_id: user.id, kind: "lesson", correct: null, meta: { slug, read: body.read } });
    }
  } else if (known(body.slug) && body.quiz && typeof body.quiz === "object") {
    const { score, total } = body.quiz as { score?: unknown; total?: unknown };
    const valid =
      Number.isInteger(score) && Number.isInteger(total) && (total as number) > 0 && (total as number) <= 20 &&
      (score as number) >= 0 && (score as number) <= (total as number);
    if (valid) rows.push({ user_id: user.id, kind: "lesson", correct: null, meta: { slug: body.slug, score, total } });
  }
  if (rows.length === 0) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });

  const { error } = await supabase.from("activity_log").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, saved: rows.length });
}
