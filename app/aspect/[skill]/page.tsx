import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import AspectPractice from "@/components/aspect/AspectPractice";
import { lessonForPractice } from "@/lib/courses/practice-lessons";
import { getSkill, ASPECT_SKILLS, type AspectSkillId } from "@/lib/aspect/exercises";

const SKILL_COLOR: Record<string, string> = {
  past: "#1C6E5C",
  markers: "#B5762A",
  future: "#8B2FA0",
  imperative: "#2456A6",
  pairs: "#6F4A2E",
};

/**
 * Le titre de l'onglet, pris à la compétence.
 *
 * SANS LUI, LA PAGE PORTE CELUI DE L'ACCUEIL : le layout racine définit un
 * `title.default`, que Next donne à toute page qui n'en déclare pas. Les
 * cinq compétences de ce module affichaient donc le même onglet, et le même
 * que l'accueil.
 *
 * Sans « — Privetik » : le gabarit du layout l'ajoute.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ skill: string }>;
}): Promise<Metadata> {
  const { skill } = await params;
  const info = getSkill(skill);
  return { title: info ? info.title : "Exercice introuvable" };
}

export default async function AspectSkillPage({
  params,
}: {
  params: Promise<{ skill: string }>;
}) {
  const { skill } = await params;
  const info = getSkill(skill);
  if (!info) notFound();

  const index = ASPECT_SKILLS.findIndex((s) => s.id === info.id);
  const next = ASPECT_SKILLS[index + 1];

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 sm:py-16">
      <Link
        href="/aspect"
        className="mb-6 inline-block font-display text-xs font-semibold uppercase tracking-wide text-muted hover:text-accent-ink"
      >
        ← Aspect verbal
      </Link>

      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="font-display text-3xl font-extrabold sm:text-4xl tracking-tight">{info.title}</h1>
        <span className="font-display text-sm font-bold text-accent-ink">{info.level}</span>
      </div>
      <p className="mb-7 sm:mb-10 max-w-2xl font-display leading-relaxed text-muted">{info.summary}</p>

      <AspectPractice
        skill={info.id as AspectSkillId}
        color={SKILL_COLOR[info.id]}
        lesson={lessonForPractice(`/aspect/${info.id}`)}
      />

      {next && (
        <div className="mt-10 rounded-[20px] surface p-6">
          <p className="font-display text-xs font-semibold uppercase tracking-wide text-muted">
            Étape suivante
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-display text-lg font-bold">{next.title}</p>
              <p className="mt-0.5 font-display text-sm text-muted">{next.summary}</p>
            </div>
            <Link
              href={`/aspect/${next.id}`}
              className="btn btn-primary btn-sheen shrink-0 rounded-[10px] px-5 py-2.5 font-display text-sm"
            >
              Continuer →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
