"use client";

import PracticeRunner from "@/components/exercises/PracticeRunner";
import { generateAlphabetExercise, TYPABLE_ALPHABET_SKILLS } from "@/lib/alphabet/exercises";

/** Attache le générateur du module au moteur partagé (voir NumbersPractice). */
export default function AlphabetPractice({ skill, color }: { skill: string; color: string }) {
  return (
    <PracticeRunner
      module="alphabet"
      moduleTitle="Lire et écrire"
      skill={skill}
      color={color}
      generate={generateAlphabetExercise}
      typingSkills={TYPABLE_ALPHABET_SKILLS}
    />
  );
}
