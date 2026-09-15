import { notFound } from "next/navigation";
import SkillPageShell from "@/components/exercises/SkillPageShell";
import NumbersPractice from "@/components/numbers/NumbersPractice";
import { lessonForPractice } from "@/lib/courses/practice-lessons";
import { getNumberSkill, NUMBER_SKILLS } from "@/lib/numbers/exercises";
import { skillColor } from "@/lib/exercises/colors";

/** La leçon du cours qui explique chaque compétence. */
const LESSONS: Record<string, { href: string; label: string }> = {
  agreement: {
    href: "/cours/accord-apres-les-nombres",
    label: "Leçon : le nom après un nombre",
  },
  time: { href: "/cours/dire-l-heure", label: "Leçon : dire l'heure" },
  date: { href: "/cours/dates-et-jours", label: "Leçon : les dates et les jours" },
  age: { href: "/cours/age-et-duree", label: "Leçon : l'âge et la durée" },
  duration: { href: "/cours/age-et-duree", label: "Leçon : l'âge et la durée" },
  listening: { href: "/cours/nombres-cardinaux", label: "Leçon : les nombres cardinaux" },
};

export function generateStaticParams() {
  return NUMBER_SKILLS.map((skill) => ({ skill: skill.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ skill: string }> }) {
  const { skill } = await params;
  const info = getNumberSkill(skill);
  // Sans « — Privetik » : le gabarit du layout l'ajoute, et l'écrire ici
  // donnait « Lecture — Privetik — Privetik » dans l'onglet.
  return { title: info ? info.title : "Exercice introuvable" };
}

export default async function NumberSkillPage({
  params,
}: {
  params: Promise<{ skill: string }>;
}) {
  const { skill } = await params;
  const info = getNumberSkill(skill);
  if (!info) notFound();

  return (
    <SkillPageShell
      skill={info}
      skills={NUMBER_SKILLS}
      basePath="/numbers"
      backLabel="Nombres, heure et dates"
      lesson={LESSONS[info.id]}
    >
      <NumbersPractice
        skill={info.id}
        color={skillColor("numbers", info.id)}
        lesson={lessonForPractice(`/numbers/${info.id}`)}
      />
    </SkillPageShell>
  );
}
