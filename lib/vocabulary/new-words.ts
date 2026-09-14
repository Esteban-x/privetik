import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Combien de mots NOUVEAUX la révision peut présenter aujourd'hui.
 *
 * LE PROBLÈME. La file servait les mots jamais vus en premier, sans limite :
 * ajouter cinquante mots d'un coup — ce qu'un paquet de départ fait en un
 * clic — les mettait tous devant les révisions échues. Le lendemain, les
 * cinquante revenaient ensemble, et les mots appris la veille passaient
 * derrière. C'est la façon la plus sûre d'abandonner une app de vocabulaire
 * au bout d'une semaine.
 *
 * LA RÈGLE. Les révisions échues d'abord ; puis au plus `DAILY_NEW_WORDS`
 * mots nouveaux par jour, les autres attendent. L'apprenant peut en demander
 * davantage — c'est lui qui décide, la limite ne fait que protéger par
 * défaut.
 *
 * SANS MIGRATION. Le premier passage d'un mot est marqué `first: true` dans
 * le journal d'activité (voir lib/vocabulary/record-review.ts) : les compter
 * sur la journée suffit. Le jour est celui du serveur, en UTC — le même que
 * la série (lib/progress/streak.ts).
 */

export const DAILY_NEW_WORDS = 10;

export function startOfUtcDay(now: number = Date.now()): string {
  const day = new Date(now);
  day.setUTCHours(0, 0, 0, 0);
  return day.toISOString();
}

/**
 * Les nouveaux mots encore permis aujourd'hui. En cas d'échec de lecture, la
 * limite pleine : mieux vaut proposer dix mots de trop qu'une file vide sans
 * raison.
 */
export async function newWordsAllowance(
  supabase: SupabaseClient,
  userId: string,
  now: number = Date.now()
): Promise<number> {
  const { count, error } = await supabase
    .from("activity_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", "vocab")
    .gte("created_at", startOfUtcDay(now))
    .contains("meta", { first: true });
  if (error) return DAILY_NEW_WORDS;
  return Math.max(0, DAILY_NEW_WORDS - (count ?? 0));
}
