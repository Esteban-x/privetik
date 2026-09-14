"use client";

import type { PracticeExercise } from "@/lib/exercises/types";
import { drawFresh } from "@/lib/practice/recent";
import { spokenSentence } from "@/lib/practice/retry";
import { usePracticeSession } from "@/lib/practice/use-practice-session";
import PracticeCard, { AnswerModeToggle, describeSentence, useAnswerMode } from "./PracticeCard";
import SpeakButton from "@/components/vocabulary/SpeakButton";
import { speakRu } from "@/lib/vocabulary/speech";
import { useEffect } from "react";

/**
 * Le moteur d'entraînement partagé par les modules récents.
 *
 * Il ne sait rien du russe : il reçoit une fonction qui tire un exercice et
 * l'identifiant du module. La séance — tirage, correction par le serveur,
 * rattrapage des erreurs, série de dix — vit dans `usePracticeSession` ;
 * l'affichage dans `PracticeCard`. Ce fichier ne dessine que la question.
 */
export default function PracticeRunner({
  module: moduleId,
  moduleTitle,
  skill,
  color,
  generate,
  typingSkills = [],
}: {
  module: string;
  moduleTitle: string;
  skill: string;
  color: string;
  generate: (skill: string) => PracticeExercise;
  /** Les compétences qu'on peut aussi écrire plutôt que choisir. */
  typingSkills?: readonly string[];
}) {
  const typable = typingSkills.includes(skill);
  const [mode, setMode] = useAnswerMode(moduleId);
  const key = `${moduleId}:${skill}`;

  const session = usePracticeSession<PracticeExercise>({
    sessionKey: key,
    endpoint: "/api/exercises/attempt",
    // Le tirage passe par la mémoire courte : le générateur du module reste
    // seul maître de ce qu'il produit, on lui demande plusieurs candidats et
    // on garde celui vu le moins récemment. Voir lib/practice/recent.ts.
    draw: () => drawFresh(key, () => generate(skill), (ex) => [ex.itemId]),
    request: (ex, answer, typed) => ({
      endpoint: "/api/exercises/attempt",
      body: { module: moduleId, skill, itemId: ex.itemId, answer, typed },
    }),
    describe: (ex) => describeSentence(ex.question, ex.audio ?? ex.hint),
  });

  // Un exercice à écouter se fait entendre dès qu'il arrive. Le premier peut
  // rester muet si le navigateur attend un geste : le bouton est là pour ça.
  const audio = session.exercise?.audio;
  const itemId = session.exercise?.itemId;
  useEffect(() => {
    if (audio) void speakRu(audio);
  }, [audio, itemId]);

  return (
    <PracticeCard
      title={moduleTitle}
      color={color}
      session={session}
      paywallWhat="les exercices"
      answerMode={typable ? mode : "choice"}
      toolbar={typable ? <AnswerModeToggle mode={mode} onChange={setMode} /> : null}
      spoken={(ex) => spokenSentence(ex.question, ex.options[ex.correctIndex])}
      renderQuestion={(ex) => {
        const [before, after] = splitQuestion(ex.question);
        return (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="font-display text-xs font-semibold uppercase tracking-wide text-muted">
                {ex.prompt}
              </span>
              {ex.badge && (
                <span
                  className="inline-flex items-center rounded-full bg-bg3 px-3 py-1 font-display text-xs font-semibold"
                  style={{ color }}
                >
                  {ex.badge}
                </span>
              )}
            </div>
            {ex.audio && (
              <SpeakButton
                text="Écouter"
                label="Écouter le russe"
                title="Écouter (autant de fois que nécessaire)"
                onSpeak={() => speakRu(ex.audio as string)}
                className="mb-4"
              />
            )}
            <p className={`font-display leading-snug ${ex.audio ? "text-lg font-semibold" : "text-2xl font-bold"}`}>
              {before}
              {after !== null && (
                <span className="inline-block min-w-[80px] border-b-2 border-accent">&nbsp;</span>
              )}
              {after}
            </p>
            {ex.hint && <p className="mt-1.5 font-display text-sm italic text-muted">{ex.hint}</p>}
          </>
        );
      }}
    />
  );
}

/**
 * Coupe la question autour du trou. Sans `___`, la question s'affiche
 * entière et aucun blanc n'est dessiné — les modules où l'on choisit une
 * traduction ou une lecture n'ont rien à trouer.
 */
function splitQuestion(question: string): [string, string | null] {
  const index = question.indexOf("___");
  if (index === -1) return [question, null];
  return [question.slice(0, index), question.slice(index + 3)];
}
