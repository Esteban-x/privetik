"use client";

import { drawFresh } from "@/lib/practice/recent";
import { spokenSentence } from "@/lib/practice/retry";
import { usePracticeSession } from "@/lib/practice/use-practice-session";
import PracticeCard, { describeSentence } from "@/components/exercises/PracticeCard";
import {
  generateParticipleExercise,
  type ParticipleExercise,
  type ParticipleSkillId,
} from "@/lib/participles/exercises";

export default function ParticiplePractice({
  skill,
  color,
}: {
  skill: ParticipleSkillId;
  color: string;
}) {
  const key = `participles:${skill}`;
  const session = usePracticeSession<ParticipleExercise>({
    sessionKey: key,
    endpoint: "/api/participles/attempt",
    draw: () => drawFresh(key, () => generateParticipleExercise(skill), (ex) => [ex.itemId]),
    request: (ex, answer) => ({
      endpoint: "/api/participles/attempt",
      body: { skill, itemId: ex.itemId, answer },
    }),
    describe: (ex) => describeSentence(ex.compressed || undefined, ex.sentenceFr),
  });

  // La règle du sujet unique se juge sur des phrases entières : une colonne,
  // alignées à gauche, en plus petit.
  const wholeSentences = skill === "subject";

  return (
    <PracticeCard
      title="Participes et gérondifs"
      color={color}
      session={session}
      paywallWhat="les exercices de participes"
      singleColumn={wholeSentences}
      compactOptions={wholeSentences}
      spoken={(ex) => spokenSentence(ex.compressed || undefined, ex.options[ex.correctIndex])}
      skeleton={
        <div className="animate-fade-in space-y-4">
          <div className="skeleton h-4 w-48 rounded-full" />
          <div className="skeleton h-[92px] w-full rounded-xl" />
          <div className="skeleton h-6 w-2/3 rounded-lg" />
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-[50px] rounded-[10px]" />
            ))}
          </div>
        </div>
      }
      renderQuestion={(ex) => (
        <>
          <p className="font-display text-sm text-muted">{ex.prompt}</p>

          {/* La visualisation de ce module, c'est la transformation
              elle-même : la subordonnée dépliée au-dessus, sa version
              comprimée en dessous. Un participe ne se dessine pas, il se
              manipule — montrer les deux états côte à côte est ce qui rend
              l'opération lisible. */}
          {ex.expanded && (
            <div className="mt-4 rounded-[14px] border border-border bg-bg px-5 py-4">
              <p className="font-display text-xs font-semibold uppercase tracking-wide text-muted">
                Proposition dépliée
              </p>
              <p className="mt-1 font-display text-lg text-muted">{ex.expanded}</p>
              <p className="mt-2 text-center font-display text-xl text-accent-ink">↓</p>
            </div>
          )}

          {ex.compressed && (
            <p className="mt-4 font-display text-2xl font-bold">
              {ex.compressed.split("___")[0]}
              <span className="inline-block min-w-[80px] border-b-2 border-accent">&nbsp;</span>
              {ex.compressed.split("___")[1]}
            </p>
          )}
          <p className="mt-1 font-display text-sm italic text-muted">{ex.sentenceFr}</p>
        </>
      )}
    />
  );
}
