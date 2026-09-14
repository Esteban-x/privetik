import { EXERCISE_MODULES, type ExerciseModuleEntry } from "@/lib/exercises/catalog";
import type { Skill } from "@/lib/exercises/types";
import type { SkillProgress } from "@/components/exercises/ModuleHub";
import { CEFR_LEVELS, type CefrLevel } from "@/lib/supabase/types";
import { READING_TEXTS, type ReadingText } from "@/lib/reading/texts";
import { ERROR_KINDS, type LoggedAttempt } from "@/lib/practice/errors";

/**
 * La séance du jour : quoi faire aujourd'hui, et dans quel ordre.
 *
 * TOUT EXISTAIT, RIEN NE DISAIT PAR OÙ COMMENCER. Huit modules, quarante
 * compétences, une révision de vocabulaire, une page d'erreurs, une
 * bibliothèque : un apprenant qui ouvre l'app avec vingt minutes devant lui
 * choisit au hasard — le plus souvent ce qu'il réussit déjà. La séance
 * choisit pour lui, à partir de ce que sa progression montre :
 *
 *   1. le vocabulaire échu — la répétition espacée ne marche que si l'on
 *      révise le jour dit ;
 *   2. les erreurs des jours précédents — les retrouver le lendemain ;
 *   3. UNE compétence ciblée — la plus faible, sinon une maîtrise qui
 *      s'use, sinon la prochaine à portée ;
 *   4. un texte à lire — les formes en contexte, là où elles servent.
 *
 * Fonctions pures : la page lit la base, ce fichier décide.
 */

/** Une série : ce qu'il faut avoir répondu aujourd'hui pour qu'une étape d'exercices compte comme faite. */
export const SERIES_ATTEMPTS = 10;

/** En dessous, une précision ne dit pas encore qu'une compétence est faible. */
export const WEAK_MIN_ATTEMPTS = 10;

/** Sous ce taux, une compétence travaillée est à consolider. */
export const WEAK_ACCURACY = 0.75;

export type FocusReason = "weak" | "stale" | "next";

export interface FocusSkill {
  module: ExerciseModuleEntry;
  skill: Skill;
  reason: FocusReason;
  /** Précision en %, quand la compétence a été travaillée. */
  accuracy: number | null;
  href: string;
}

type Progress = Record<string, Record<string, SkillProgress>>;

/**
 * La compétence à travailler aujourd'hui.
 *
 * LA PLUS FAIBLE D'ABORD : c'est là que chaque série rapporte le plus. Puis
 * une maîtrise délaissée, avant qu'elle ne s'efface. Puis la prochaine à
 * portée — du niveau de l'apprenant, ou du suivant quand tout le sien est
 * travaillé —, la plus facile en premier.
 */
export function pickFocusSkill(progress: Progress, level: CefrLevel): FocusSkill | null {
  const entries = EXERCISE_MODULES.flatMap((module) =>
    module.skills.map((skill) => ({ module, skill, stat: progress[module.id]?.[skill.id] }))
  );
  const rate = (stat: SkillProgress | undefined) =>
    stat && stat.attempts > 0 ? stat.correct / stat.attempts : null;
  const focus = (entry: (typeof entries)[number], reason: FocusReason): FocusSkill => {
    const r = rate(entry.stat);
    return {
      module: entry.module,
      skill: entry.skill,
      reason,
      accuracy: r === null ? null : Math.round(r * 100),
      href: `${entry.module.href}/${entry.skill.id}`,
    };
  };

  const weak = entries
    .filter((e) => e.stat && e.stat.attempts >= WEAK_MIN_ATTEMPTS && (rate(e.stat) ?? 1) < WEAK_ACCURACY)
    .sort((a, b) => (rate(a.stat) ?? 0) - (rate(b.stat) ?? 0));
  if (weak.length > 0) return focus(weak[0], "weak");

  const stale = entries.find((e) => e.stat?.stale && e.stat.attempts >= WEAK_MIN_ATTEMPTS);
  if (stale) return focus(stale, "stale");

  const reach = Math.max(CEFR_LEVELS.indexOf(level), 0) + 1;
  const next = entries
    .map((e, order) => ({ ...e, order, rank: CEFR_LEVELS.indexOf(e.skill.level as CefrLevel) }))
    .filter((e) => (e.stat?.attempts ?? 0) < WEAK_MIN_ATTEMPTS && e.rank >= 0 && e.rank <= reach)
    .sort((a, b) => a.rank - b.rank || a.order - b.order);
  return next.length > 0 ? focus(next[0], "next") : null;
}

/** Le `kind` du journal d'un module d'exercices. */
export function activityKindOf(moduleId: string): string | null {
  return Object.entries(ERROR_KINDS).find(([, module]) => module === moduleId)?.[0] ?? null;
}

/** Réponses données aujourd'hui (depuis `todayStart`) à cette compétence. */
export function answeredToday(
  attempts: LoggedAttempt[],
  focus: Pick<FocusSkill, "module" | "skill">,
  todayStart: string
): number {
  const kind = activityKindOf(focus.module.id);
  return attempts.filter((a) => {
    if (a.kind !== kind || a.correct === null || a.created_at < todayStart) return false;
    const meta = a.meta ?? {};
    return meta.skill === focus.skill.id || meta.caseId === focus.skill.id;
  }).length;
}

/**
 * Le texte à lire : un texte de la bibliothèque pas encore terminé, de son
 * niveau d'abord, puis plus facile, puis du niveau suivant.
 */
export function pickReadingText(level: CefrLevel, finished: Set<string>): ReadingText | null {
  const mine = Math.max(CEFR_LEVELS.indexOf(level), 1);
  const unread = READING_TEXTS.filter((t) => !finished.has(t.id));
  const at = (pick: (rank: number) => boolean) =>
    unread.find((t) => pick(CEFR_LEVELS.indexOf(t.level)));
  return (
    at((rank) => rank === mine) ??
    [...unread].reverse().find((t) => CEFR_LEVELS.indexOf(t.level) < mine) ??
    at((rank) => rank === mine + 1) ??
    null
  );
}
