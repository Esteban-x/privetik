import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  ERROR_KINDS,
  ERROR_WINDOW_DAYS,
  isDueError,
  pendingErrors,
} from "@/lib/practice/errors";

/**
 * Les erreurs en attente de l'apprenant (voir lib/practice/errors.ts).
 *
 * Lecture seule, et aucun décompte de quota : c'est la correction de chaque
 * exercice refait, par sa propre route, qui compte comme pratique.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const since = new Date(Date.now() - ERROR_WINDOW_DAYS * 864e5).toISOString();
  const { data, error } = await supabase
    .from("activity_log")
    .select("kind, correct, created_at, meta")
    .eq("user_id", user.id)
    .in("kind", Object.keys(ERROR_KINDS))
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(3000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const errors = pendingErrors(data ?? []);
  // Les échues d'abord : ce sont elles qui profitent d'être refaites.
  const due = errors.filter((e) => isDueError(e));
  const recent = errors.filter((e) => !isDueError(e));
  return NextResponse.json({ errors: [...due, ...recent], due: due.length });
}
