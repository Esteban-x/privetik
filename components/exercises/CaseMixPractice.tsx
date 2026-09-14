"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CefrLevel } from "@/lib/supabase/types";
import type { CaseId } from "@/lib/grammar/types";
import { CASES } from "@/lib/grammar/cases";
import { nounsForLevel } from "@/lib/grammar/nouns-data";
import { checkAnswer, type CaseExercise } from "@/lib/grammar/exercise-generator";
import {
  caseExerciseIds,
  MIXED_RECENT_KEY,
  mixableCases,
  pickMixedCaseExercise,
} from "@/lib/grammar/case-draw";
import { caseAttemptBody, caseItemKey, describeCaseExercise } from "@/lib/grammar/case-attempt";
import { diagnoseCaseAnswer } from "@/lib/grammar/diagnose";
import type { TriggerProgressMap } from "@/lib/grammar/exercise-selector";
import { CASE_MIX_GRADIENT, CASE_MIX_VARS } from "@/lib/grammar/case-mix-style";
import { rememberDraw } from "@/lib/practice/recent";
import { spokenSentence } from "@/lib/practice/retry";
import { usePracticeSession, type ChoiceExercise } from "@/lib/practice/use-practice-session";
import PracticeCard from "@/components/exercises/PracticeCard";
import { BulbIcon } from "@/components/ui/icons";

/**
 * « Cas mélangés » : trouver le cas avant la terminaison.
 *
 * Voir le commentaire de `mixableCases` (lib/grammar/case-draw.ts) pour ce
 * que ce mode entraîne et que les pages de cas n'entraînent pas. Il tourne
 * sur la séance commune — série, rattrapage, bilan — en réponse tapée : un
 * choix entre quatre formes dirait déjà quels cas sont en jeu.
 */

interface MixedItem extends ChoiceExercise {
  exercise: CaseExercise;
}

const CASE_BY_ID = Object.fromEntries(CASES.map((c) => [c.id, c])) as Record<
  CaseId,
  (typeof CASES)[number]
>;

function theCase(caseId: CaseId): string {
  const name = CASE_BY_ID[caseId].nameFr.toLowerCase();
  return /^[aeiouy]/.test(name) ? `l'${name}` : `le ${name}`;
}

function toItem(exercise: CaseExercise): MixedItem {
  // Le sens du déclencheur est écrit comme une phrase, point compris : dans
  // la parenthèse, ce point ferait « (… vœux).). ».
  const trigger = exercise.trigger
    ? ` — imposé par « ${exercise.trigger.ru} » (${exercise.trigger.meaningFr.replace(/\.\s*$/, "")})`
    : "";
  const variant = exercise.variantForm ? ` Juste aussi : ${exercise.variantForm}.` : "";
  return {
    itemId: caseItemKey(exercise),
    options: [exercise.accentedForm ?? exercise.correctForm],
    correctIndex: 0,
    explain: `C'était ${theCase(exercise.targetCase)}${trigger}. ${exercise.ruleApplied}.${variant}`,
    exercise,
  };
}

export default function CaseMixPractice({
  userLevel,
  signedIn,
}: {
  userLevel?: CefrLevel;
  signedIn: boolean;
}) {
  const [triggerStats, setTriggerStats] = useState<TriggerProgressMap>({});
  const pool = useMemo(() => nounsForLevel(userLevel), [userLevel]);
  const cases = useMemo(() => mixableCases(userLevel), [userLevel]);

  // La progression par déclencheur biaise le tirage vers ce qui est mal
  // réussi, comme sur les pages de cas.
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    fetch("/api/cases/progress")
      .then((r) => r.json())
      .then((data: { triggerProgress?: { trigger_id: string; attempts: number; correct: number }[] }) => {
        if (cancelled) return;
        const stats: TriggerProgressMap = {};
        for (const row of data.triggerProgress ?? []) {
          stats[row.trigger_id] = { attempts: row.attempts, correct: row.correct };
        }
        setTriggerStats(stats);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const session = usePracticeSession<MixedItem>({
    sessionKey: MIXED_RECENT_KEY,
    endpoint: "/api/cases/attempt",
    draw: () => {
      const exercise = pickMixedCaseExercise(
        { triggerStats, level: userLevel, pool, numberMode: "mixed" },
        cases
      );
      rememberDraw(MIXED_RECENT_KEY, caseExerciseIds(exercise));
      return toItem(exercise);
    },
    request: (item, answer) => ({
      endpoint: "/api/cases/attempt",
      body: caseAttemptBody(item.exercise, answer, { revealed: answer === "" }),
    }),
    describe: (item) => describeCaseExercise(item.exercise),
    judgeTyped: (item, answer) => checkAnswer(item.exercise, answer),
    noteTyped: (item, answer) => diagnoseCaseAnswer(item.exercise, answer),
  });

  if (!signedIn) return <MixVisitorCard />;

  // Les six couleurs des cas, du bandeau au bouton : voir lib/grammar/case-mix-style.ts.
  return (
    <div className="mix-tint" style={CASE_MIX_VARS}>
      <PracticeCard
        title="Cas mélangés"
        color={CASE_MIX_GRADIENT}
        tint="mix"
        session={session}
        paywallWhat="les exercices de déclinaison"
        answerMode="typing"
        spoken={(item) => spokenSentence(item.exercise.sentenceTemplate, item.options[0])}
        renderQuestion={(item) => (
          <MixedQuestion exercise={item.exercise} answered={Boolean(session.feedback)} />
        )}
      />
    </div>
  );
}

function MixedQuestion({ exercise, answered }: { exercise: CaseExercise; answered: boolean }) {
  const [hint, setHint] = useState(false);
  const info = CASE_BY_ID[exercise.targetCase];
  const [before, after] = (exercise.sentenceTemplate ?? "___").split("___");
  const lemma = exercise.promptRu ?? exercise.noun.forms.singular[0];

  return (
    <>
      <p className="font-display text-sm text-muted">
        Quel cas la phrase demande-t-elle ? Écris le mot à la bonne forme.
      </p>
      <p className="mt-2 font-display text-2xl font-bold leading-snug">
        {before}
        <span className="relative inline-block min-w-[80px]">
          &nbsp;
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-0.5 rounded-full"
            style={{ backgroundImage: CASE_MIX_GRADIENT }}
          />
        </span>
        {after}
      </p>
      <p className="mt-1 font-display text-sm italic text-muted">
        {exercise.sentenceFr}
        <span className="ml-2 not-italic text-accent2">({lemma})</span>
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {answered ? (
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1 font-display text-xs font-bold text-white"
            style={{ background: info.color }}
          >
            {info.nameFr} · {exercise.plural ? "pluriel" : "singulier"}
          </span>
        ) : (
          exercise.trigger &&
          (hint ? (
            <span className="inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-2xl bg-bg3 px-3 py-1 font-display text-xs font-semibold text-muted sm:rounded-full">
              Regarde :<span className="text-text">{exercise.trigger.ru}</span>
              <span className="font-normal">— {exercise.trigger.meaningFr}</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setHint(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1 font-display text-xs font-semibold text-muted transition-colors hover:border-accent2/40 hover:text-accent2"
            >
              <BulbIcon className="h-3.5 w-3.5" />
              Indice : le mot qui décide
            </button>
          ))
        )}
      </div>
    </>
  );
}

function MixVisitorCard() {
  return (
    <div className="mix-tint overflow-hidden rounded-[20px] surface shadow-float" style={CASE_MIX_VARS}>
      <div
        className="px-5 py-3 font-display text-[13px] font-semibold uppercase tracking-wide text-white sm:px-6 sm:py-3.5 sm:text-sm"
        style={{ backgroundImage: CASE_MIX_GRADIENT }}
      >
        Cas mélangés
      </div>
      <div className="p-5 sm:p-7">
        <p className="font-display text-lg font-bold">Trouver le cas, puis la forme</p>
        <p className="mt-2 max-w-xl font-display text-sm leading-relaxed text-muted">
          Une phrase à trou, un mot au dictionnaire, et rien qui dise quel cas employer : c&apos;est
          le geste qu&apos;on fait en lisant. Corrigé à chaque réponse, avec ce que ta forme était
          vraiment quand elle est fausse. Le compte est gratuit.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/signup"
            className="btn btn-primary btn-mix btn-sheen rounded-[10px] px-6 py-3 font-display text-sm"
          >
            Créer un compte gratuit
          </Link>
          <Link
            href="/login"
            className="btn btn-outline rounded-[10px] px-6 py-3 font-display text-sm font-semibold text-text"
          >
            J&apos;ai déjà un compte
          </Link>
        </div>
      </div>
    </div>
  );
}
