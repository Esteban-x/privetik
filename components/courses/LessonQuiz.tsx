"use client";

import { useState } from "react";
import type { QuizQuestion } from "@/lib/courses/quiz";
import { reshuffleChoice } from "@/lib/practice/retry";
import { recordLessonQuiz, useReadLessons } from "@/lib/courses/use-read-lessons";

/**
 * Le quiz de fin de leçon (voir lib/courses/quiz.ts).
 *
 * Réussi à 80 %, il coche la leçon comme lue : c'est la coche qui a un sens,
 * celle d'une règle retrouvée, pas celle d'une page parcourue.
 */

/** Même seuil que QUIZ_PASS — recopié pour ne pas embarquer les banques dans le bundle. */
const PASS = 0.8;

function Blank() {
  return <span className="inline-block min-w-[64px] border-b-2 border-accent align-baseline">&nbsp;</span>;
}

function Question({ text }: { text: string }) {
  const parts = text.split("___");
  return (
    <p lang="ru" className="font-display text-xl font-bold leading-snug sm:text-2xl">
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && <Blank />}
        </span>
      ))}
    </p>
  );
}

export default function LessonQuiz({ slug, questions }: { slug: string; questions: QuizQuestion[] }) {
  const { read, setRead } = useReadLessons();
  const [items, setItems] = useState(questions);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const current = items[index];
  const total = items.length;
  const correctOption = current?.options[current.correctIndex];

  function choose(option: string) {
    if (picked) return;
    setPicked(option);
    if (option === correctOption) setScore((s) => s + 1);
  }

  function next() {
    if (index + 1 < total) {
      setIndex(index + 1);
      setPicked(null);
      return;
    }
    setFinished(true);
    const passed = score >= Math.ceil(total * PASS);
    if (passed && !read.has(slug)) setRead(slug, true);
    recordLessonQuiz(slug, score, total);
  }

  function restart() {
    setItems(questions.map((q) => reshuffleChoice(q)));
    setIndex(0);
    setPicked(null);
    setScore(0);
    setFinished(false);
  }

  const passed = score >= Math.ceil(total * PASS);

  return (
    <section aria-labelledby="lesson-quiz" className="mt-12 overflow-hidden rounded-3xl surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-6 py-4">
        <div>
          <h2 id="lesson-quiz" className="font-display text-base font-bold">
            As-tu retenu l&apos;essentiel ?
          </h2>
          <p className="font-display text-xs text-muted">
            {total} questions — chercher la réponse fixe la règle mieux que la relire.
          </p>
        </div>
        {!finished && (
          <span className="font-display text-xs font-semibold text-muted">
            {index + 1}/{total}
          </span>
        )}
      </div>

      {finished ? (
        <div className="px-6 py-7">
          <p className="font-display text-3xl font-extrabold">
            {score} / {total}
          </p>
          <p className="mt-2 max-w-xl font-display text-sm leading-relaxed text-muted">
            {passed
              ? "C'est retenu. La leçon est cochée comme lue — reste à l'appliquer vingt fois dans les exercices."
              : "Pas encore tout à fait. Relis les passages concernés, puis refais le quiz : les réponses auront changé de place."}
          </p>
          <button
            type="button"
            onClick={restart}
            className="btn btn-outline mt-5 rounded-[10px] px-5 py-2.5 font-display text-sm font-semibold"
          >
            Refaire le quiz
          </button>
        </div>
      ) : (
        current && (
          <div className="px-6 py-6">
            <p className="mb-2 font-display text-xs font-semibold uppercase tracking-wide text-muted">
              {current.prompt}
            </p>
            {current.context && (
              <p className="mb-3 font-display text-sm text-muted" lang="ru">
                {current.context}
              </p>
            )}
            <Question text={current.question} />
            {current.hint && <p className="mt-1.5 font-display text-sm italic text-muted">{current.hint}</p>}

            <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {current.options.map((option) => {
                const isCorrect = option === correctOption;
                const isPicked = option === picked;
                const state = !picked
                  ? "border-border bg-bg hover:border-accent"
                  : isCorrect
                    ? "border-success bg-success/10 text-success"
                    : isPicked
                      ? "border-danger bg-danger/10 text-danger"
                      : "border-border bg-bg opacity-60";
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => choose(option)}
                    disabled={picked !== null}
                    className={`rounded-[10px] border px-4 py-3 text-left font-display text-sm font-semibold leading-snug transition-colors duration-200 ${state}`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>

            {picked && (
              <div
                role="status"
                className={`mt-4 rounded-[12px] border px-4 py-3 ${
                  picked === correctOption ? "border-success/40 bg-success/5" : "border-danger/40 bg-danger/5"
                }`}
              >
                <p className={`font-display text-sm font-bold ${picked === correctOption ? "text-success" : "text-danger"}`}>
                  {picked === correctOption ? "Juste" : `Pas tout à fait — c'était « ${correctOption} »`}
                </p>
                {picked !== correctOption && current.whyNot?.[picked] && (
                  <p className="mt-1 font-display text-sm text-text">
                    « {picked} » : {current.whyNot[picked]}.
                  </p>
                )}
                {current.explain && (
                  <p className="mt-1 font-display text-sm leading-relaxed text-muted">{current.explain}</p>
                )}
              </div>
            )}

            {picked && (
              <button
                type="button"
                onClick={next}
                className="btn btn-primary btn-sheen mt-4 rounded-[10px] px-5 py-2.5 font-display text-sm"
              >
                {index + 1 < total ? "Question suivante →" : "Voir le résultat →"}
              </button>
            )}
          </div>
        )
      )}
    </section>
  );
}
