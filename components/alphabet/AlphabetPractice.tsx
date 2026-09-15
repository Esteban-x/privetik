"use client";

import PracticeRunner from "@/components/exercises/PracticeRunner";
import { generateAlphabetExercise, TYPABLE_ALPHABET_SKILLS } from "@/lib/alphabet/exercises";
import type { LessonLink } from "@/lib/courses/practice-lessons";

/** Attache le générateur du module au moteur partagé (voir NumbersPractice). */
export default function AlphabetPractice({
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
      module="alphabet"
      moduleTitle="Lire et écrire"
      skill={skill}
      color={color}
      generate={generateAlphabetExercise}
      typingSkills={TYPABLE_ALPHABET_SKILLS}
      lesson={lesson}
    />
  );
}
