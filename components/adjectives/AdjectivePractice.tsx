"use client";

import { drawFresh } from "@/lib/practice/recent";
import { spokenSentence } from "@/lib/practice/retry";
import { usePracticeSession } from "@/lib/practice/use-practice-session";
import PracticeCard, {
  AnswerModeToggle,
  describeSentence,
  useAnswerMode,
} from "@/components/exercises/PracticeCard";
import {
  generateAdjectiveExercise,
  type AdjectiveExercise,
  type AdjectiveSkillId,
} from "@/lib/adjectives/exercises";

export default function AdjectivePractice({
  skill,
  color,
}: {
  skill: AdjectiveSkillId;
  color: string;
}) {
  const key = `adjectives:${skill}`;
  // Toutes les compétences s'écrivent : les formes d'un adjectif diffèrent
  // par leur désinence, jamais par leur seul accent (voir checkAdjectiveAnswer).
  const [mode, setMode] = useAnswerMode("adjectives");

  const session = usePracticeSession<AdjectiveExercise>({
    sessionKey: key,
    endpoint: "/api/adjectives/attempt",
    draw: () => drawFresh(key, () => generateAdjectiveExercise(skill), (ex) => [ex.itemId]),
    request: (ex, answer) => ({
      endpoint: "/api/adjectives/attempt",
      body: { skill, itemId: ex.itemId, answer },
    }),
    describe: (ex) => describeSentence(ex.sentence, ex.sentenceFr),
  });

  return (
    <PracticeCard
      title="Accord de l'adjectif"
      color={color}
      session={session}
      paywallWhat="les exercices d'accord"
      answerMode={mode}
      toolbar={<AnswerModeToggle mode={mode} onChange={setMode} />}
      spoken={(ex) => spokenSentence(ex.sentence, ex.options[ex.correctIndex])}
      renderQuestion={(ex) => (
        <>
          {/* Ce sur quoi on accorde, énoncé avant la phrase : genre, nombre
              et animacité sont les trois seules informations qui décident de
              la désinence. Les donner n'affaiblit pas l'exercice, ça le
              recentre — reconnaître le genre de « письмо́ » est le travail du
              module Cas, pas de celui-ci. `max-w-full flex-wrap` : sans eux,
              un nom long pousse la pastille hors du cadre. */}
          <p className="mb-4 inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-2xl bg-bg3 px-3 py-1 font-display text-xs font-semibold text-muted sm:rounded-full">
            Accorde avec :<span style={{ color }}>{ex.nounLabel}</span>
          </p>

          <p className="font-display text-2xl font-bold">
            {ex.sentence.split("___")[0]}
            <span className="blank inline-block min-w-[80px] border-b-2 border-accent">&nbsp;</span>
            {ex.sentence.split("___")[1]}
          </p>
          {/* L'adjectif à la forme du dictionnaire, comme le nom à décliner
              sur les pages de cas : en mode « Écrire », rien d'autre ne le
              nommait. */}
          <p className="mt-1 font-display text-sm italic text-muted">
            {ex.sentenceFr}
            <span className="ml-2 not-italic text-accent2">({ex.lemma})</span>
          </p>
        </>
      )}
    />
  );
}
