"use client";

import PracticeRunner from "@/components/exercises/PracticeRunner";
import {
  generateConjugationExercise,
  TYPABLE_CONJUGATION_SKILLS,
} from "@/lib/conjugation/exercises";
import type { LessonLink } from "@/lib/courses/practice-lessons";

/** Attache le générateur du module au moteur partagé (voir NumbersPractice). */
export default function ConjugationPractice({
  skill,
  color,
  lesson = null,
}: {
  skill: string;
  color: string;
  lesson?: LessonLink | null;
}) {
  return (
    <PracticeRunner
      module="conjugation"
      moduleTitle="Conjugaison"
      skill={skill}
      color={color}
      generate={generateConjugationExercise}
      typingSkills={TYPABLE_CONJUGATION_SKILLS}
      lesson={lesson}
    />
  );
}
