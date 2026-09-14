"use client";

import { drawFresh } from "@/lib/practice/recent";
import { spokenSentence } from "@/lib/practice/retry";
import { usePracticeSession } from "@/lib/practice/use-practice-session";
import PracticeCard, { describeSentence } from "@/components/exercises/PracticeCard";
import TrajectoryDiagram, { SCHEMA_LABEL } from "./TrajectoryDiagram";
import {
  generateMotionExercise,
  type MotionExercise,
  type MotionSkillId,
} from "@/lib/motion/exercises";

export default function MotionPractice({
  skill,
  color,
}: {
  skill: MotionSkillId;
  color: string;
}) {
  const key = `motion:${skill}`;
  const session = usePracticeSession<MotionExercise>({
    sessionKey: key,
    endpoint: "/api/motion/attempt",
    draw: () => drawFresh(key, () => generateMotionExercise(skill), (ex) => [ex.itemId]),
    request: (ex, answer) => ({
      endpoint: "/api/motion/attempt",
      body: { skill, itemId: ex.itemId, answer },
    }),
    describe: (ex) => describeSentence(ex.sentence, ex.sentenceFr),
  });

  return (
    <PracticeCard
      title="Verbes de mouvement"
      color={color}
      session={session}
      paywallWhat="les exercices de mouvement"
      spoken={(ex) => spokenSentence(ex.sentence, ex.options[ex.correctIndex])}
      skeleton={
        <div className="animate-fade-in space-y-4">
          <div className="skeleton h-4 w-48 rounded-full" />
          <div className="skeleton mx-auto h-[90px] w-full max-w-[240px] rounded-xl" />
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

          {ex.schema && (
            <figure className="mt-4 flex flex-col items-center rounded-[14px] border border-border bg-bg px-4 py-5">
              <TrajectoryDiagram schema={ex.schema} mode={ex.mode} />
              <figcaption className="mt-2 font-display text-xs text-muted">
                {SCHEMA_LABEL[ex.schema]}
              </figcaption>
            </figure>
          )}

          {ex.sentence && (
            <p className="mt-5 font-display text-2xl font-bold">
              {ex.sentence.split("___")[0]}
              <span className="inline-block min-w-[80px] border-b-2 border-accent">&nbsp;</span>
              {ex.sentence.split("___")[1]}
            </p>
          )}
          <p className="mt-1 font-display text-sm italic text-muted">{ex.sentenceFr}</p>
        </>
      )}
    />
  );
}
