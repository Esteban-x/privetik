"use client";

import PracticeRunner from "@/components/exercises/PracticeRunner";
import {
  generateConjugationExercise,
  TYPABLE_CONJUGATION_SKILLS,
} from "@/lib/conjugation/exercises";

/** Attache le générateur du module au moteur partagé (voir NumbersPractice). */
export default function ConjugationPractice({ skill, color }: { skill: string; color: string }) {
  return (
    <PracticeRunner
      module="conjugation"
      moduleTitle="Conjugaison"
      skill={skill}
      color={color}
      generate={generateConjugationExercise}
      typingSkills={TYPABLE_CONJUGATION_SKILLS}
    />
  );
}
