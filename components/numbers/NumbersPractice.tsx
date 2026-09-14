"use client";

import PracticeRunner from "@/components/exercises/PracticeRunner";
import { generateNumberExercise, TYPABLE_NUMBER_SKILLS } from "@/lib/numbers/exercises";

/**
 * Le pont entre la page (serveur) et le moteur (client) : une fonction ne
 * traverse pas la frontière serveur → client, c'est donc ici, en composant
 * client, que le générateur du module est attaché au moteur partagé.
 */
export default function NumbersPractice({ skill, color }: { skill: string; color: string }) {
  return (
    <PracticeRunner
      module="numbers"
      moduleTitle="Nombres et temps"
      skill={skill}
      color={color}
      generate={generateNumberExercise}
      typingSkills={TYPABLE_NUMBER_SKILLS}
    />
  );
}
