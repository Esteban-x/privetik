import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { SkillProgress } from "@/components/exercises/ModuleHub";

/**
 * Une compétence travaillée puis délaissée depuis ce nombre de jours est
 * « à rafraîchir ».
 *
 * UNE PRÉCISION NE DIT PAS DEPUIS QUAND. « 92 % » affiché sur une compétence
 * travaillée il y a deux mois se lit comme un acquis, alors que c'est
 * précisément ce qui s'oublie sans qu'on le remarque. Trois semaines : assez
 * pour qu'une pause de quelques jours ne déclenche rien, assez tôt pour que
 * la reprise soit encore facile.
 */
export const REFRESH_AFTER_DAYS = 21;

function isStale(lastSeen: string | null | undefined, now: number): boolean {
  return Boolean(lastSeen) && now - Date.parse(lastSeen as string) > REFRESH_AFTER_DAYS * 864e5;
}

/**
 * La progression d'un module, lue côté serveur pour son accueil.
 *
 * Renvoie un objet vide dès qu'il n'y a pas de session : un visiteur non
 * connecté doit pouvoir parcourir les modules et s'entraîner, il ne verra
 * simplement aucune précision. C'est la même règle que les cinq premiers
 * modules — l'exercice n'exige pas de compte, seul l'enregistrement en
 * demande un.
 */
export async function loadModuleProgress(
  moduleId: string
): Promise<Record<string, SkillProgress>> {
  if (!isSupabaseConfigured()) return {};
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};

  const { data } = await supabase
    .from("exercise_progress")
    .select("skill_id, attempts, correct, last_seen")
    .eq("user_id", user.id)
    .eq("module_id", moduleId);

  const now = Date.now();
  const progress: Record<string, SkillProgress> = {};
  for (const row of data ?? []) {
    progress[row.skill_id] = {
      attempts: row.attempts,
      correct: row.correct,
      stale: isStale(row.last_seen, now),
    };
  }
  return progress;
}

/**
 * La progression de TOUS les modules, pour la page /exercices.
 *
 * Six lectures en parallèle : les cinq tables historiques, plus la table
 * partagée. Les lancer ensemble plutôt qu'en cascade évite d'additionner
 * six latences réseau au chargement d'une page qui n'affiche que des
 * pourcentages.
 */
export async function loadAllProgress(): Promise<
  Record<string, Record<string, SkillProgress>>
> {
  if (!isSupabaseConfigured()) return {};
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};

  const [cases, adjectives, aspect, motion, participles, shared] = await Promise.all([
    supabase.from("case_progress").select("case_id, attempts, correct, last_seen").eq("user_id", user.id),
    supabase
      .from("adjective_progress")
      .select("skill_id, attempts, correct, last_seen")
      .eq("user_id", user.id),
    supabase.from("aspect_progress").select("skill_id, attempts, correct, last_seen").eq("user_id", user.id),
    supabase.from("motion_progress").select("skill_id, attempts, correct, last_seen").eq("user_id", user.id),
    supabase
      .from("participle_progress")
      .select("skill_id, attempts, correct, last_seen")
      .eq("user_id", user.id),
    supabase
      .from("exercise_progress")
      .select("module_id, skill_id, attempts, correct, last_seen")
      .eq("user_id", user.id),
  ]);

  const now = Date.now();
  const all: Record<string, Record<string, SkillProgress>> = {};
  function put(
    moduleId: string,
    skillId: string,
    attempts: number,
    correct: number,
    lastSeen: string | null
  ) {
    (all[moduleId] ??= {})[skillId] = { attempts, correct, stale: isStale(lastSeen, now) };
  }

  // case_progress est la seule table à compter par cas × genre : deux lignes
  // peuvent porter le même cas, il faut donc les additionner — et c'est la
  // plus RÉCENTE qui dit si le cas a été délaissé.
  const caseLastSeen = new Map<string, string>();
  for (const row of cases.data ?? []) {
    const current = all.cases?.[row.case_id];
    const previous = caseLastSeen.get(row.case_id);
    const latest = previous && previous > (row.last_seen ?? "") ? previous : row.last_seen;
    if (latest) caseLastSeen.set(row.case_id, latest);
    put(
      "cases",
      row.case_id,
      (current?.attempts ?? 0) + (row.attempts ?? 0),
      (current?.correct ?? 0) + (row.correct ?? 0),
      latest ?? null
    );
  }
  for (const [moduleId, result] of [
    ["adjectives", adjectives],
    ["aspect", aspect],
    ["motion", motion],
    ["participles", participles],
  ] as const) {
    for (const row of result.data ?? []) {
      put(moduleId, row.skill_id, row.attempts, row.correct, row.last_seen);
    }
  }
  for (const row of shared.data ?? []) {
    put(row.module_id, row.skill_id, row.attempts, row.correct, row.last_seen);
  }

  return all;
}
