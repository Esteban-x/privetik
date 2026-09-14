import { notFound } from "next/navigation";
import SkillPageShell from "@/components/exercises/SkillPageShell";
import AlphabetPractice from "@/components/alphabet/AlphabetPractice";
import { ALPHABET_SKILLS, getAlphabetSkill } from "@/lib/alphabet/exercises";
import { skillColor } from "@/lib/exercises/colors";

const LESSONS: Record<string, { href: string; label: string }> = {
  letters: { href: "/cours/alphabet-cyrillique", label: "Leçon : l'alphabet cyrillique" },
  traps: { href: "/cours/faux-amis-de-l-alphabet", label: "Leçon : les lettres qui trompent" },
  stress: { href: "/cours/accent-tonique", label: "Leçon : l'accent tonique" },
  spelling: { href: "/cours/regles-orthographiques", label: "Leçon : les règles orthographiques" },
  sounds: { href: "/cours/reduction-des-voyelles", label: "Leçon : la réduction des voyelles" },
  dictation: { href: "/cours/reduction-des-voyelles", label: "Leçon : la réduction des voyelles" },
};

export function generateStaticParams() {
  return ALPHABET_SKILLS.map((skill) => ({ skill: skill.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ skill: string }> }) {
  const { skill } = await params;
  const info = getAlphabetSkill(skill);
  // Sans « — Privetik » : le gabarit du layout l'ajoute, et l'écrire ici
  // donnait « Lecture — Privetik — Privetik » dans l'onglet.
  return { title: info ? info.title : "Exercice introuvable" };
}

export default async function AlphabetSkillPage({
  params,
}: {
  params: Promise<{ skill: string }>;
}) {
  const { skill } = await params;
  const info = getAlphabetSkill(skill);
  if (!info) notFound();

  return (
    <SkillPageShell
      skill={info}
      skills={ALPHABET_SKILLS}
      basePath="/alphabet"
      backLabel="Lire et écrire"
      lesson={LESSONS[info.id]}
    >
      <AlphabetPractice skill={info.id} color={skillColor("alphabet", info.id)} />
    </SkillPageShell>
  );
}
