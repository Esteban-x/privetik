import Link from "next/link";
import SectionLabel from "@/components/ui/SectionLabel";
import type { Skill } from "@/lib/exercises/types";
import { BookIcon } from "@/components/ui/icons";

/**
 * La page d'accueil d'un module d'exercices : le même squelette pour tous
 * les modules récents.
 *
 * Les cinq premiers modules ont chacun leur accueil écrit à la main, avec
 * son tableau de démonstration propre. Ce qui se répétait d'un fichier à
 * l'autre — l'en-tête, la grille de compétences, la précision par
 * compétence, le lien vers le cours — vit ici ; ce qui distingue un module
 * — sa démonstration — reste chez lui, passé en `children`.
 */

export interface SkillProgress {
  attempts: number;
  correct: number;
  /** Travaillée, puis délaissée depuis trois semaines (voir lib/exercises/progress.ts). */
  stale?: boolean;
}

export default function ModuleHub({
  labelRu,
  title,
  intro,
  skills,
  basePath,
  colors,
  progress,
  lesson,
  children,
}: {
  labelRu: string;
  title: string;
  intro: React.ReactNode;
  skills: Skill[];
  basePath: string;
  colors: Record<string, string>;
  progress: Record<string, SkillProgress>;
  /** La leçon du cours qui explique ce que le module fait pratiquer. */
  lesson?: { href: string; label: string };
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8 sm:py-16">
      <SectionLabel color="accent2">{labelRu}</SectionLabel>
      <h1 className="mb-3 font-display text-3xl font-extrabold sm:text-4xl tracking-tight">{title}</h1>
      <div className="mb-7 sm:mb-10 max-w-2xl font-display leading-relaxed text-muted">{intro}</div>

      {children}

      {lesson && (
        <Link
          href={lesson.href}
          className="mb-7 sm:mb-10 inline-flex items-center gap-2 rounded-xl border border-accent2/40 bg-accent2/10 px-4 py-2.5 font-display text-sm font-semibold text-accent2 transition-colors hover:bg-accent2/10 hover:border-accent2/35"
        >
          <BookIcon className="h-3.5 w-3.5" />
          {lesson.label}
          <span aria-hidden>→</span>
        </Link>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {skills.map((skill) => {
          const stat = progress[skill.id];
          const accuracy =
            stat && stat.attempts > 0 ? Math.round((stat.correct / stat.attempts) * 100) : null;
          const color = colors[skill.id] ?? "#4a63d6";
          return (
            <Link
              key={skill.id}
              href={`${basePath}/${skill.id}`}
              className="group flex flex-col overflow-hidden rounded-[20px] surface-interactive"
            >
              <span className="h-1.5 w-full" style={{ background: color }} />
              <span className="flex flex-1 flex-col p-6">
                <span className="mb-2 flex items-center justify-between gap-3">
                  <span className="font-display text-lg font-bold tracking-tight transition-colors group-hover:text-accent-ink">
                    {skill.title}
                  </span>
                  <span className="shrink-0 rounded-full border border-border px-2 py-0.5 font-display text-[10px] font-bold text-muted">
                    {skill.level}
                  </span>
                </span>
                <span className="flex-1 font-display text-sm leading-relaxed text-muted">
                  {skill.summary}
                </span>
                <span className="mt-4 flex items-center justify-between">
                  <span className="flex flex-wrap items-center gap-1.5 font-display text-xs font-semibold text-muted">
                    {accuracy === null
                      ? "Jamais travaillé"
                      : `${accuracy}% · ${stat!.attempts} réponse${stat!.attempts > 1 ? "s" : ""}`}
                    {stat?.stale && (
                      <span className="rounded-full border border-accent2/40 bg-accent2/10 px-2 py-0.5 text-[10px] font-bold text-accent2">
                        à rafraîchir
                      </span>
                    )}
                  </span>
                  {accuracy !== null && (
                    <span className="h-1.5 w-20 overflow-hidden rounded-full bg-border">
                      <span
                        className="block h-full rounded-full transition-all"
                        style={{ width: `${accuracy}%`, background: color }}
                      />
                    </span>
                  )}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
