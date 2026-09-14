import type { SupabaseClient } from "@supabase/supabase-js";
import { CEFR_LEVELS, type CefrLevel } from "@/lib/supabase/types";
import type { CaseId } from "@/lib/grammar/types";
import { CASES } from "@/lib/grammar/cases";
import { TRIGGERS, type TriggerTier } from "@/lib/grammar/triggers";
import { MASTERY_ACCURACY, MASTERY_MIN_ATTEMPTS_EACH } from "@/lib/grammar/exercise-selector";
import { MOTION_SKILLS } from "@/lib/motion/exercises";
import { ASPECT_SKILLS } from "@/lib/aspect/exercises";
import { PARTICIPLE_SKILLS } from "@/lib/participles/exercises";
import { CONJUGATION_SKILLS } from "@/lib/conjugation/exercises";
import { ALPHABET_SKILLS } from "@/lib/alphabet/exercises";
import { NUMBER_SKILLS } from "@/lib/numbers/exercises";
import { ADJECTIVE_SKILLS } from "@/lib/adjectives/exercises";

/**
 * Niveau de PRATIQUE : ce que la progression réelle démontre, par opposition
 * au niveau TESTÉ (profiles.level), qui est une photo prise une fois.
 *
 * Pourquoi les deux coexistent :
 * - le test mesure en une douzaine de QCM, donc en reconnaissance ;
 * - la pratique mesure sur des centaines de réponses produites.
 *
 * DEUX SIGNAUX, ET LE PLUS FAIBLE L'EMPORTE.
 *
 * 1. La PROFONDEUR sur les cas : part des déclencheurs maîtrisés par palier.
 *    C'est le signal le plus riche (136 déclencheurs gradués).
 * 2. La COUVERTURE du programme : les cas ne sont pas toute la grammaire.
 *    La conjugaison, l'aspect et les verbes de mouvement sont du A2-B1, les
 *    participes du B2-C1. Quelqu'un qui n'a jamais touché à l'aspect n'a pas
 *    démontré un niveau B1, quelle que soit sa virtuosité sur le génitif.
 *
 * Le niveau retenu est donc le MINIMUM des deux. Le plafond est expliqué à
 * l'apprenant plutôt que subi : « plafonné à A2 — l'aspect n'a pas encore
 * été travaillé » indique quoi faire, là où un simple chiffre ne dirait rien.
 */

export interface TriggerProgressRow {
  trigger_id: string;
  attempts: number;
  correct: number;
  /** Dernière pratique. Absente, la ligne est tenue pour récente. */
  last_seen?: string | null;
}

export interface CaseProgressRow {
  case_id: string;
  attempts: number;
  correct: number;
}

export interface SkillProgressRow {
  skill_id: string;
  attempts: number;
  correct: number;
  /** Dernière pratique. Absente, la ligne est tenue pour récente. */
  last_seen?: string | null;
}

export type CaseState = "untouched" | "started" | "solid";

export interface CaseMastery {
  caseId: CaseId;
  attempts: number;
  accuracy: number | null;
  masteredTriggers: number;
  totalTriggers: number;
  state: CaseState;
}

export interface TierMastery {
  tier: TriggerTier;
  mastered: number;
  total: number;
}

/** Un module de grammaire et ce que la pratique y démontre. */
export interface ModuleMastery {
  id: ModuleId;
  label: string;
  href: string;
  solidSkills: number;
  totalSkills: number;
  attempts: number;
  state: CaseState;
}

export interface LevelEstimate {
  level: CefrLevel;
  /** Niveau que la seule maîtrise des cas justifierait. */
  depthLevel: CefrLevel;
  /** Plafond imposé par les modules pas encore travaillés. */
  coverageCeiling: CefrLevel;
  /** Module qui bloque la progression, s'il y en a un. */
  blockedBy: ModuleMastery | null;
  masteredTriggers: number;
  totalTriggers: number;
  tiers: TierMastery[];
  cases: CaseMastery[];
  modules: ModuleMastery[];
  vocabKnown: number;
  meaningful: boolean;
}

/**
 * UNE MAÎTRISE S'USE.
 *
 * Réussir un déclencheur à 90 % en janvier ne démontre rien en avril s'il n'a
 * pas été pratiqué entre-temps : c'est justement ce qui s'oublie sans qu'on
 * le remarque. La précision cumulée, elle, ne bougeait jamais, et le niveau
 * de pratique restait figé au plus haut. Au-delà de `STALE_AFTER_DAYS` sans
 * pratique, une maîtrise ne compte plus — la reprendre suffit à la rendre.
 *
 * Deux mois, et non trois semaines comme la pastille « à rafraîchir » des
 * modules (lib/exercises/progress.ts) : la pastille invite à revenir, le
 * niveau, lui, ne doit pas chuter pour des vacances.
 */
export const STALE_AFTER_DAYS = 60;

function isMastered(
  row: { attempts: number; correct: number; last_seen?: string | null } | undefined,
  now: number
): boolean {
  if (!row || row.attempts < MASTERY_MIN_ATTEMPTS_EACH) return false;
  if (row.last_seen && now - Date.parse(row.last_seen) > STALE_AFTER_DAYS * 864e5) return false;
  return row.correct / row.attempts >= MASTERY_ACCURACY;
}

const THRESHOLDS: { level: CefrLevel; basic: number; intermediate: number; advanced: number }[] = [
  { level: "C1", basic: 0.8, intermediate: 0.7, advanced: 0.55 },
  { level: "B2", basic: 0.8, intermediate: 0.55, advanced: 0.2 },
  { level: "B1", basic: 0.7, intermediate: 0.25, advanced: 0 },
  { level: "A2", basic: 0.45, intermediate: 0, advanced: 0 },
  { level: "A1", basic: 0.15, intermediate: 0, advanced: 0 },
];

const MIN_ATTEMPTS_FOR_ESTIMATE = 30;

// ─── Couverture du programme ───────────────────────────────────────
export type ModuleId =
  | "alphabet"
  | "conjugation"
  | "adjectives"
  | "motion"
  | "aspect"
  | "numbers"
  | "participles";

/**
 * Chaque module ouvre un plafond. Tant qu'il n'est pas SOLIDE, la pratique
 * ne peut pas justifier un niveau au-delà de `unlocks`.
 *
 * Les niveaux viennent des compétences du module : les verbes de mouvement,
 * l'aspect et la conjugaison sont introduits en A1-A2 et consolidés en B1,
 * les participes relèvent du B2. Un apprenant qui n'a jamais quitté le
 * module Cas plafonne donc à A2 — ce qui est exact : il n'a rien démontré
 * au-delà.
 *
 * `unlocks: null` — UN MODULE QUI COMPTE SANS PLAFONNER. Lire le cyrillique
 * et manier les nombres sont indispensables, mais leur maîtrise se démontre
 * ailleurs : tous les autres modules affichent du russe accentué, et on ne
 * peut pas y répondre juste sans savoir lire. Leur imposer un plafond
 * ferait retomber à A1 un apprenant solide sur les cas au seul motif qu'il
 * n'a pas ouvert un onglet A0. Ces deux modules alimentent donc l'affichage
 * et le seuil de significativité, sans jamais rabattre le niveau.
 */
const MODULE_SPECS: {
  id: ModuleId;
  label: string;
  href: string;
  unlocks: CefrLevel | null;
  skills: readonly { id: string }[];
}[] = [
  {
    id: "alphabet",
    label: "Lire et écrire",
    href: "/alphabet",
    unlocks: null,
    skills: ALPHABET_SKILLS,
  },
  {
    id: "conjugation",
    label: "Conjugaison",
    href: "/conjugation",
    unlocks: "B1",
    skills: CONJUGATION_SKILLS,
  },
  // L'ACCORD DE L'ADJECTIF MANQUAIT. Le module existe, sa progression est
  // enregistrée, mais l'estimation ne la lisait pas : un apprenant qui ne
  // l'avait jamais ouvert pouvait être estimé B2, et un autre qui y excellait
  // n'en tirait rien. Ses compétences vont de A1 à B1 — comme la conjugaison.
  {
    id: "adjectives",
    label: "Accord de l'adjectif",
    href: "/adjectives",
    unlocks: "B1",
    skills: ADJECTIVE_SKILLS,
  },
  { id: "motion", label: "Verbes de mouvement", href: "/motion", unlocks: "B1", skills: MOTION_SKILLS },
  { id: "aspect", label: "Aspect verbal", href: "/aspect", unlocks: "B1", skills: ASPECT_SKILLS },
  {
    id: "numbers",
    label: "Nombres, heure et dates",
    href: "/numbers",
    unlocks: null,
    skills: NUMBER_SKILLS,
  },
  {
    id: "participles",
    label: "Participes et gérondifs",
    href: "/participles",
    unlocks: "C1",
    skills: PARTICIPLE_SKILLS,
  },
];

/** Un module est solide quand la majorité de ses compétences le sont. */
const MODULE_SOLID_RATIO = 0.6;

function moduleMastery(
  spec: (typeof MODULE_SPECS)[number],
  rows: SkillProgressRow[],
  now: number
): ModuleMastery {
  const bySkill = new Map(rows.map((r) => [r.skill_id, r]));
  const solidSkills = spec.skills.filter((s) => isMastered(bySkill.get(s.id), now)).length;
  const attempts = rows.reduce((sum, r) => sum + r.attempts, 0);
  const ratio = spec.skills.length ? solidSkills / spec.skills.length : 0;
  return {
    id: spec.id,
    label: spec.label,
    href: spec.href,
    solidSkills,
    totalSkills: spec.skills.length,
    attempts,
    state: attempts === 0 ? "untouched" : ratio >= MODULE_SOLID_RATIO ? "solid" : "started",
  };
}

const lower = (a: CefrLevel, b: CefrLevel): CefrLevel =>
  CEFR_LEVELS.indexOf(a) <= CEFR_LEVELS.indexOf(b) ? a : b;

/** Le niveau juste en dessous de celui qu'un module débloque. */
function ceilingWithout(unlocks: CefrLevel): CefrLevel {
  const index = CEFR_LEVELS.indexOf(unlocks);
  return CEFR_LEVELS[Math.max(0, index - 1)];
}

export function computeLevelEstimate(
  triggerRows: TriggerProgressRow[],
  caseRows: CaseProgressRow[],
  moduleRows: Record<ModuleId, SkillProgressRow[]>,
  vocabKnown: number,
  now: number = Date.now()
): LevelEstimate {
  const byTrigger = new Map(triggerRows.map((r) => [r.trigger_id, r]));

  const tierOrder: TriggerTier[] = ["basic", "intermediate", "advanced"];
  const tiers: TierMastery[] = tierOrder.map((tier) => {
    const all = TRIGGERS.filter((t) => t.tier === tier);
    return {
      tier,
      total: all.length,
      mastered: all.filter((t) => isMastered(byTrigger.get(t.id), now)).length,
    };
  });
  const ratio = (tier: TriggerTier) => {
    const t = tiers.find((x) => x.tier === tier)!;
    return t.total === 0 ? 0 : t.mastered / t.total;
  };

  const caseTotals = new Map<string, { attempts: number; correct: number }>();
  for (const row of caseRows) {
    const cur = caseTotals.get(row.case_id) ?? { attempts: 0, correct: 0 };
    cur.attempts += row.attempts;
    cur.correct += row.correct;
    caseTotals.set(row.case_id, cur);
  }

  const cases: CaseMastery[] = CASES.map((c) => {
    const totals = caseTotals.get(c.id) ?? { attempts: 0, correct: 0 };
    const caseTriggers = TRIGGERS.filter((t) => t.caseId === c.id);
    const masteredTriggers = caseTriggers.filter((t) => isMastered(byTrigger.get(t.id), now)).length;
    const accuracy = totals.attempts > 0 ? totals.correct / totals.attempts : null;
    const solid =
      masteredTriggers >= Math.min(3, caseTriggers.length) && accuracy !== null && accuracy >= 0.75;
    return {
      caseId: c.id,
      attempts: totals.attempts,
      accuracy,
      masteredTriggers,
      totalTriggers: caseTriggers.length,
      state: totals.attempts === 0 ? "untouched" : solid ? "solid" : "started",
    };
  });

  const modules = MODULE_SPECS.map((spec) => moduleMastery(spec, moduleRows[spec.id] ?? [], now));

  // Profondeur : ce que la maîtrise des cas justifierait à elle seule.
  const matched = THRESHOLDS.find(
    (t) =>
      ratio("basic") >= t.basic &&
      ratio("intermediate") >= t.intermediate &&
      ratio("advanced") >= t.advanced
  );
  const depthLevel: CefrLevel = matched?.level ?? "A0";

  // Couverture : chaque module non solide rabat le plafond.
  let coverageCeiling: CefrLevel = "C2";
  let blockedBy: ModuleMastery | null = null;
  for (const spec of MODULE_SPECS) {
    if (spec.unlocks === null) continue;
    const mastery = modules.find((m) => m.id === spec.id)!;
    if (mastery.state === "solid") continue;
    const ceiling = ceilingWithout(spec.unlocks);
    if (CEFR_LEVELS.indexOf(ceiling) < CEFR_LEVELS.indexOf(coverageCeiling)) {
      coverageCeiling = ceiling;
      blockedBy = mastery;
    }
  }

  const level = lower(depthLevel, coverageCeiling);
  const totalAttempts =
    cases.reduce((sum, c) => sum + c.attempts, 0) +
    modules.reduce((sum, m) => sum + m.attempts, 0);

  return {
    level,
    depthLevel,
    coverageCeiling,
    // Le module bloquant n'a d'intérêt que s'il rabat réellement le niveau.
    blockedBy:
      blockedBy && CEFR_LEVELS.indexOf(coverageCeiling) < CEFR_LEVELS.indexOf(depthLevel)
        ? blockedBy
        : null,
    masteredTriggers: tiers.reduce((sum, t) => sum + t.mastered, 0),
    totalTriggers: TRIGGERS.length,
    tiers,
    cases,
    modules,
    vocabKnown,
    meaningful: totalAttempts >= MIN_ATTEMPTS_FOR_ESTIMATE,
  };
}

const KNOWN_INTERVAL_DAYS = 21;

export async function loadLevelEstimate(
  supabase: SupabaseClient,
  userId: string
): Promise<LevelEstimate> {
  const [
    { data: triggerRows },
    { data: caseRows },
    { data: motionRows },
    { data: aspectRows },
    { data: participleRows },
    { data: adjectiveRows },
    { data: sharedRows },
    { count: vocabKnown },
  ] = await Promise.all([
    supabase
      .from("case_trigger_progress")
      .select("trigger_id, attempts, correct, last_seen")
      .eq("user_id", userId),
    supabase.from("case_progress").select("case_id, attempts, correct").eq("user_id", userId),
    supabase
      .from("motion_progress")
      .select("skill_id, attempts, correct, last_seen")
      .eq("user_id", userId),
    supabase
      .from("aspect_progress")
      .select("skill_id, attempts, correct, last_seen")
      .eq("user_id", userId),
    supabase
      .from("participle_progress")
      .select("skill_id, attempts, correct, last_seen")
      .eq("user_id", userId),
    supabase
      .from("adjective_progress")
      .select("skill_id, attempts, correct, last_seen")
      .eq("user_id", userId),
    // Les modules récents partagent une table : une seule lecture pour les
    // trois, filtrée ensuite par `module_id`.
    supabase
      .from("exercise_progress")
      .select("module_id, skill_id, attempts, correct, last_seen")
      .eq("user_id", userId),
    supabase
      .from("srs_cards")
      .select("card_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("interval_days", KNOWN_INTERVAL_DAYS),
  ]);

  const shared = (module: string): SkillProgressRow[] =>
    (sharedRows ?? [])
      .filter((row) => row.module_id === module)
      .map((row) => ({
        skill_id: row.skill_id,
        attempts: row.attempts,
        correct: row.correct,
        last_seen: row.last_seen,
      }));

  return computeLevelEstimate(
    triggerRows ?? [],
    caseRows ?? [],
    {
      alphabet: shared("alphabet"),
      conjugation: shared("conjugation"),
      adjectives: adjectiveRows ?? [],
      motion: motionRows ?? [],
      aspect: aspectRows ?? [],
      numbers: shared("numbers"),
      participles: participleRows ?? [],
    },
    vocabKnown ?? 0
  );
}
