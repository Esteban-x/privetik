import { notFound } from "next/navigation";
import SkillPageShell from "@/components/exercises/SkillPageShell";
import ConjugationPractice from "@/components/conjugation/ConjugationPractice";
import { lessonForPractice } from "@/lib/courses/practice-lessons";
import { CONJUGATION_SKILLS, getConjugationSkill } from "@/lib/conjugation/exercises";
import { skillColor } from "@/lib/exercises/colors";

const LESSONS: Record<string, { href: string; label: string }> = {
  present1: {
    href: "/cours/present-premiere-conjugaison",
    label: "Leçon : la première conjugaison",
  },
  present2: {
    href: "/cours/present-deuxieme-conjugaison",
    label: "Leçon : la deuxième conjugaison",
  },
  mutation: {
    href: "/cours/alternances-consonantiques",
    label: "Leçon : les alternances de consonnes",
  },
  past: { href: "/cours/passe", label: "Leçon : le passé" },
  imperative: { href: "/cours/imperatif", label: "Leçon : l'impératif" },
};

export function generateStaticParams() {
  return CONJUGATION_SKILLS.map((skill) => ({ skill: skill.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ skill: string }> }) {
  const { skill } = await params;
  const info = getConjugationSkill(skill);
  // Sans « — Privetik » : le gabarit du layout l'ajoute, et l'écrire ici
  // donnait « Lecture — Privetik — Privetik » dans l'onglet.
  return { title: info ? info.title : "Exercice introuvable" };
}

export default async function ConjugationSkillPage({
  params,
}: {
  params: Promise<{ skill: string }>;
}) {
  const { skill } = await params;
  const info = getConjugationSkill(skill);
  if (!info) notFound();

  return (
    <SkillPageShell
      skill={info}
      skills={CONJUGATION_SKILLS}
      basePath="/conjugation"
      backLabel="Conjugaison"
      lesson={LESSONS[info.id]}
    >
      <ConjugationPractice
        skill={info.id}
        color={skillColor("conjugation", info.id)}
        lesson={lessonForPractice(`/conjugation/${info.id}`)}
      />
    </SkillPageShell>
  );
}
