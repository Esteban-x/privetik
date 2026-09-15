import { findLesson, LESSONS, type LocatedLesson } from "./catalog";
import { EXERCISE_MODULES } from "@/lib/exercises/catalog";
import { CASES } from "@/lib/grammar/cases";
import type { CaseId } from "@/lib/grammar/types";

/** La leçon à revoir : son adresse et son titre, rien de plus. */
export interface LessonLink {
  href: string;
  title: string;
}

/**
 * La leçon à revoir quand on se trompe sur une page d'exercices.
 *
 * LUE DANS LES LEÇONS ELLES-MÊMES. Chaque leçon nomme déjà les exercices qui
 * la pratiquent (`lesson.practice`) : on lit ce lien à l'envers plutôt que
 * d'écrire une seconde table, qui divergerait de la première à la prochaine
 * leçon ajoutée.
 *
 * UNE SEULE LEÇON, CELLE DU MODULE. Plusieurs leçons renvoient parfois au
 * même exercice — « /cases/dative » est pratiqué par « Le datif » et par la
 * leçon sur к, у, от — : on garde celle de l'unité qui enseigne le module.
 * Un exercice qu'aucune leçon ne nomme (« /aspect/markers ») retombe sur la
 * page du module, puis sur l'unité du module.
 *
 * SERVEUR SEULEMENT. Le catalogue porte le texte de toutes les leçons : les
 * pages calculent le lien et le passent à l'exercice, qui ne reçoit qu'un
 * titre et une adresse.
 */
const BY_PRACTICE = new Map<string, LocatedLesson[]>();
for (const located of LESSONS) {
  for (const link of located.lesson.practice ?? []) {
    BY_PRACTICE.set(link.href, [...(BY_PRACTICE.get(link.href) ?? []), located]);
  }
}

function toLink(slug: string): LessonLink | null {
  const found = findLesson(slug);
  return found ? { href: `/cours/${found.lesson.slug}`, title: found.lesson.title } : null;
}

export function lessonForPractice(href: string): LessonLink | null {
  const moduleHref = `/${href.split("/")[1] ?? ""}`;
  const entry = EXERCISE_MODULES.find((m) => m.href === moduleHref);
  const unitLesson = entry ? findLesson(entry.lesson.href.replace(/^\/cours\//, "")) : undefined;

  for (const candidate of [href, moduleHref]) {
    const lessons = BY_PRACTICE.get(candidate);
    if (!lessons?.length) continue;
    const chosen = lessons.find((l) => l.unit.slug === unitLesson?.unit.slug) ?? lessons[0];
    return toLink(chosen.lesson.slug);
  }
  return unitLesson ? toLink(unitLesson.lesson.slug) : null;
}

/** Les six cas — pour « Cas mélangés », où chaque phrase demande le sien. */
export function caseLessons(): Partial<Record<CaseId, LessonLink>> {
  const links: Partial<Record<CaseId, LessonLink>> = {};
  for (const c of CASES) {
    const link = lessonForPractice(`/cases/${c.id}`);
    if (link) links[c.id] = link;
  }
  return links;
}

/** Tous les exercices de tous les modules — pour « Mes erreurs », qui les mêle. */
export function allPracticeLessons(): Record<string, LessonLink> {
  const links: Record<string, LessonLink> = {};
  for (const m of EXERCISE_MODULES) {
    for (const skill of m.skills) {
      const href = `${m.href}/${skill.id}`;
      const link = lessonForPractice(href);
      if (link) links[href] = link;
    }
  }
  return links;
}
