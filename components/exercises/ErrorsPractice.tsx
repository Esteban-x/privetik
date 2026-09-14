"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PendingError } from "@/lib/practice/errors";
import { usePracticeSession, type ChoiceExercise } from "@/lib/practice/use-practice-session";
import { spokenSentence } from "@/lib/practice/retry";
import type { PracticeExercise } from "@/lib/exercises/types";
import { rebuildAspectExercise, type AspectExercise } from "@/lib/aspect/exercises";
import { rebuildMotionExercise, type MotionExercise } from "@/lib/motion/exercises";
import { rebuildParticipleExercise, type ParticipleExercise } from "@/lib/participles/exercises";
import { rebuildAdjectiveExercise, type AdjectiveExercise } from "@/lib/adjectives/exercises";
import { rebuildNumberExercise } from "@/lib/numbers/exercises";
import { rebuildConjugationExercise } from "@/lib/conjugation/exercises";
import { rebuildAlphabetExercise } from "@/lib/alphabet/exercises";
import {
  checkAnswer,
  rebuildCaseExercise,
  type CaseExercise,
} from "@/lib/grammar/exercise-generator";
import { caseAttemptBody, describeCaseExercise } from "@/lib/grammar/case-attempt";
import { diagnoseCaseAnswer } from "@/lib/grammar/diagnose";
import { CASES } from "@/lib/grammar/cases";
import { TIMELINE_LABEL } from "@/lib/aspect/verbs";
import TimelineDiagram from "@/components/aspect/TimelineDiagram";
import TrajectoryDiagram, { SCHEMA_LABEL } from "@/components/motion/TrajectoryDiagram";
import PracticeCard, { describeSentence } from "@/components/exercises/PracticeCard";
import SpeakButton from "@/components/vocabulary/SpeakButton";
import { speakRu } from "@/lib/vocabulary/speech";

/**
 * « Mes erreurs » : refaire, un autre jour, ce qui a été raté.
 *
 * Chaque erreur est reconstruite à partir du journal (lib/practice/errors.ts)
 * par la banque de son module — le même exercice, options remélangées — puis
 * corrigée par la route de ce module. Une réponse juste ici lève l'erreur ;
 * fausse, elle la garde pour la fois suivante.
 *
 * Les exercices de cas reviennent en saisie, même ceux qui étaient à choix :
 * retrouver une forme ratée, c'est la produire.
 */

type Source =
  | { module: "aspect"; exercise: AspectExercise }
  | { module: "motion"; exercise: MotionExercise }
  | { module: "participles"; exercise: ParticipleExercise }
  | { module: "adjectives"; exercise: AdjectiveExercise }
  | { module: "numbers" | "conjugation" | "alphabet"; exercise: PracticeExercise }
  | { module: "cases"; exercise: CaseExercise };

interface ErrorItem extends ChoiceExercise {
  source: Source;
  misses: number;
}

const MODULE_TITLE: Record<Source["module"], string> = {
  cases: "Cas",
  adjectives: "Accord de l'adjectif",
  aspect: "Aspect",
  motion: "Verbes de mouvement",
  participles: "Participes",
  numbers: "Nombres",
  conjugation: "Conjugaison",
  alphabet: "Lire et écrire",
};

const CASE_NAME = Object.fromEntries(CASES.map((c) => [c.id, c.nameFr.toLowerCase()]));

function choice(exercise: {
  itemId: string;
  options: string[];
  correctIndex: number;
  explain: string;
  whyNot?: Record<string, string>;
}) {
  return {
    itemId: exercise.itemId,
    options: exercise.options,
    correctIndex: exercise.correctIndex,
    explain: exercise.explain,
    whyNot: exercise.whyNot,
  };
}

/** L'erreur, refaite par la banque de son module — ou `null` si la banque a changé depuis. */
export function toErrorItem(error: PendingError): ErrorItem | null {
  const misses = error.misses;
  const id = error.itemId ?? "";
  switch (error.module) {
    case "aspect": {
      const exercise = rebuildAspectExercise(id);
      return exercise ? { ...choice(exercise), source: { module: "aspect", exercise }, misses } : null;
    }
    case "motion": {
      const exercise = rebuildMotionExercise(id);
      return exercise ? { ...choice(exercise), source: { module: "motion", exercise }, misses } : null;
    }
    case "participles": {
      const exercise = rebuildParticipleExercise(id);
      return exercise ? { ...choice(exercise), source: { module: "participles", exercise }, misses } : null;
    }
    case "adjectives": {
      const exercise = rebuildAdjectiveExercise(id);
      return exercise ? { ...choice(exercise), source: { module: "adjectives", exercise }, misses } : null;
    }
    case "numbers":
    case "conjugation":
    case "alphabet": {
      const rebuild =
        error.module === "numbers"
          ? rebuildNumberExercise
          : error.module === "conjugation"
            ? rebuildConjugationExercise
            : rebuildAlphabetExercise;
      const exercise = rebuild(id);
      return exercise
        ? { ...choice(exercise), source: { module: error.module, exercise }, misses }
        : null;
    }
    case "cases": {
      const exercise = error.case ? rebuildCaseExercise(error.case) : null;
      if (!exercise) return null;
      return {
        itemId: error.key,
        options: [exercise.accentedForm ?? exercise.correctForm],
        correctIndex: 0,
        explain: `${exercise.ruleApplied}.${exercise.variantForm ? ` Juste aussi : ${exercise.variantForm}.` : ""}`,
        source: { module: "cases", exercise },
        misses,
      };
    }
  }
}

type Load =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; items: ErrorItem[]; due: number };

export default function ErrorsPractice() {
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/errors")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("indisponible"))))
      .then((data: { errors: PendingError[]; due: number }) => {
        if (cancelled) return;
        const items = data.errors.map(toErrorItem).filter((item): item is ErrorItem => item !== null);
        setLoad({ status: "ready", items, due: data.due });
      })
      .catch(() => {
        if (!cancelled) setLoad({ status: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (load.status === "loading") {
    return <div className="skeleton h-[360px] w-full rounded-[20px]" />;
  }
  if (load.status === "failed") {
    return (
      <p role="alert" className="rounded-2xl border border-danger/40 bg-danger/5 px-5 py-6 font-display text-sm text-danger">
        Impossible de charger tes erreurs pour le moment.
      </p>
    );
  }
  if (load.items.length === 0) {
    return (
      <div className="rounded-[20px] surface p-8 text-center">
        <p className="font-display text-lg font-bold">Aucune erreur en attente</p>
        <p className="mx-auto mt-2 max-w-md font-display text-sm leading-relaxed text-muted">
          Tout ce que tu as raté ces trente derniers jours a été réussi depuis. Les prochaines
          erreurs arriveront ici d&apos;elles-mêmes.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Link href="/exercices" className="btn btn-primary btn-sheen rounded-[10px] px-5 py-2.5 font-display text-sm">
            S&apos;entraîner
          </Link>
          <Link href="/cases/melange" className="btn btn-outline rounded-[10px] px-5 py-2.5 font-display text-sm font-semibold">
            Cas mélangés
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <p className="mb-4 font-display text-sm text-muted">
        {load.items.length} erreur{load.items.length > 1 ? "s" : ""} à refaire
        {load.due > 0 && load.due < load.items.length
          ? `, dont ${load.due} d'avant aujourd'hui — elles passent en premier`
          : ""}
        .
      </p>
      <ErrorsSession items={load.items} />
    </>
  );
}

function ErrorsSession({ items }: { items: ErrorItem[] }) {
  const session = usePracticeSession<ErrorItem>({
    sessionKey: "errors",
    endpoint: "/api/exercises/attempt",
    seriesLength: items.length,
    draw: (index) => items[index] ?? null,
    request: (item, answer) => requestFor(item, answer),
    describe: (item) => describeItem(item),
    judgeTyped: (item, answer) =>
      item.source.module === "cases" ? checkAnswer(item.source.exercise, answer) : false,
    noteTyped: (item, answer) =>
      item.source.module === "cases" ? diagnoseCaseAnswer(item.source.exercise, answer) : null,
  });

  return (
    <PracticeCard
      title="Mes erreurs"
      color="#b4533b"
      session={session}
      paywallWhat="les exercices"
      showErrorsLink={false}
      answerMode={(item) => (item.source.module === "cases" ? "typing" : "choice")}
      spoken={(item) => spokenFor(item)}
      renderQuestion={(item) => <ErrorQuestion item={item} />}
      recapFooter={
        <p className="mt-4 font-display text-xs leading-relaxed text-muted">
          Ce qui reste raté t&apos;attendra à ta prochaine visite.
        </p>
      }
      // Après le bilan, « Nouvelle série » n'a plus rien à tirer : la liste
      // est celle du chargement, et ce qui a été raté ici n'y reviendra
      // qu'au prochain.
      empty={
        <div className="p-8 text-center">
          <p className="font-display text-lg font-bold">Toutes tes erreurs ont été refaites</p>
          <p className="mx-auto mt-2 max-w-md font-display text-sm leading-relaxed text-muted">
            Celles que tu as encore ratées reviendront à ta prochaine visite — c&apos;est le
            lendemain qu&apos;elles se fixent le mieux.
          </p>
          <Link
            href="/exercices"
            className="btn btn-primary btn-sheen mt-5 inline-flex rounded-[10px] px-5 py-2.5 font-display text-sm"
          >
            Retour aux exercices
          </Link>
        </div>
      }
    />
  );
}

function skillOf(itemId: string): string {
  return itemId.split(":")[0];
}

function requestFor(item: ErrorItem, answer: string) {
  const source = item.source;
  switch (source.module) {
    case "cases":
      return {
        endpoint: "/api/cases/attempt",
        body: caseAttemptBody(source.exercise, answer, { revealed: answer === "" }),
      };
    case "numbers":
    case "conjugation":
    case "alphabet":
      return {
        endpoint: "/api/exercises/attempt",
        body: { module: source.module, skill: skillOf(item.itemId), itemId: item.itemId, answer },
      };
    default:
      return {
        endpoint: `/api/${source.module}/attempt`,
        body: { skill: skillOf(item.itemId), itemId: item.itemId, answer },
      };
  }
}

function describeItem(item: ErrorItem): string {
  const source = item.source;
  switch (source.module) {
    case "cases":
      return describeCaseExercise(source.exercise);
    case "participles":
      return describeSentence(source.exercise.compressed || undefined, source.exercise.sentenceFr);
    case "numbers":
    case "conjugation":
    case "alphabet":
      return describeSentence(source.exercise.question, source.exercise.hint);
    default:
      return describeSentence(source.exercise.sentence, source.exercise.sentenceFr);
  }
}

function spokenFor(item: ErrorItem): string | null {
  const source = item.source;
  const answer = item.options[item.correctIndex];
  switch (source.module) {
    case "cases":
      return spokenSentence(source.exercise.sentenceTemplate, answer);
    case "participles":
      return spokenSentence(source.exercise.compressed || undefined, answer);
    case "numbers":
    case "conjugation":
    case "alphabet":
      return spokenSentence(source.exercise.question, answer);
    default:
      return spokenSentence(source.exercise.sentence, answer);
  }
}

function Blank() {
  return <span className="inline-block min-w-[80px] border-b-2 border-accent">&nbsp;</span>;
}

function WithBlank({ text }: { text: string }) {
  const [before, after] = text.split("___");
  return (
    <p className="mt-4 font-display text-2xl font-bold leading-snug">
      {before}
      {text.includes("___") && <Blank />}
      {after}
    </p>
  );
}

function ErrorQuestion({ item }: { item: ErrorItem }) {
  const source = item.source;
  return (
    <>
      <p className="mb-3 flex flex-wrap items-center gap-2 font-display text-xs font-semibold uppercase tracking-wide text-muted">
        <span className="rounded-full bg-bg3 px-2.5 py-1 normal-case tracking-normal">
          {MODULE_TITLE[source.module]}
        </span>
        {item.misses > 1 && (
          <span className="normal-case tracking-normal">raté {item.misses} fois</span>
        )}
      </p>

      {source.module === "cases" ? (
        <CaseQuestion exercise={source.exercise} />
      ) : source.module === "aspect" ? (
        <>
          <p className="font-display text-sm text-muted">{source.exercise.prompt}</p>
          {source.exercise.schema && (
            <figure className="mt-4 flex flex-col items-center rounded-[14px] border border-border bg-bg px-4 py-5">
              <TimelineDiagram schema={source.exercise.schema} />
              <figcaption className="mt-2 font-display text-xs text-muted">
                {TIMELINE_LABEL[source.exercise.schema]}
              </figcaption>
            </figure>
          )}
          {source.exercise.sentence && <WithBlank text={source.exercise.sentence} />}
          <p className="mt-1 font-display text-sm italic text-muted">{source.exercise.sentenceFr}</p>
        </>
      ) : source.module === "motion" ? (
        <>
          <p className="font-display text-sm text-muted">{source.exercise.prompt}</p>
          {source.exercise.schema && (
            <figure className="mt-4 flex flex-col items-center rounded-[14px] border border-border bg-bg px-4 py-5">
              <TrajectoryDiagram schema={source.exercise.schema} mode={source.exercise.mode} />
              <figcaption className="mt-2 font-display text-xs text-muted">
                {SCHEMA_LABEL[source.exercise.schema]}
              </figcaption>
            </figure>
          )}
          {source.exercise.sentence && <WithBlank text={source.exercise.sentence} />}
          <p className="mt-1 font-display text-sm italic text-muted">{source.exercise.sentenceFr}</p>
        </>
      ) : source.module === "participles" ? (
        <>
          <p className="font-display text-sm text-muted">{source.exercise.prompt}</p>
          {source.exercise.expanded && (
            <div className="mt-4 rounded-[14px] border border-border bg-bg px-5 py-4">
              <p className="font-display text-xs font-semibold uppercase tracking-wide text-muted">
                Proposition dépliée
              </p>
              <p className="mt-1 font-display text-lg text-muted">{source.exercise.expanded}</p>
            </div>
          )}
          {source.exercise.compressed && <WithBlank text={source.exercise.compressed} />}
          <p className="mt-1 font-display text-sm italic text-muted">{source.exercise.sentenceFr}</p>
        </>
      ) : source.module === "adjectives" ? (
        <>
          <p className="inline-flex max-w-full flex-wrap items-center gap-x-1.5 rounded-2xl bg-bg3 px-3 py-1 font-display text-xs font-semibold text-muted sm:rounded-full">
            Accorde avec :<span className="text-text">{source.exercise.nounLabel}</span>
          </p>
          <WithBlank text={source.exercise.sentence} />
          <p className="mt-1 font-display text-sm italic text-muted">{source.exercise.sentenceFr}</p>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-xs font-semibold uppercase tracking-wide text-muted">
              {source.exercise.prompt}
            </span>
            {source.exercise.badge && (
              <span className="rounded-full bg-bg3 px-3 py-1 font-display text-xs font-semibold">
                {source.exercise.badge}
              </span>
            )}
          </div>
          {source.exercise.audio && (
            <div className="mt-4">
              <SpeakButton
                text="Écouter"
                label="Écouter le russe"
                title="Écouter"
                onSpeak={() => speakRu(source.exercise.audio as string)}
              />
            </div>
          )}
          <WithBlank text={source.exercise.question} />
          {source.exercise.hint && (
            <p className="mt-1.5 font-display text-sm italic text-muted">{source.exercise.hint}</p>
          )}
        </>
      )}
    </>
  );
}

function CaseQuestion({ exercise }: { exercise: CaseExercise }) {
  const lemma = exercise.promptRu ?? exercise.noun.forms.singular[0];
  if (exercise.sentenceTemplate) {
    return (
      <>
        <p className="font-display text-sm text-muted">Complète la phrase :</p>
        <WithBlank text={exercise.sentenceTemplate} />
        <p className="mt-1 font-display text-sm italic text-muted">
          {exercise.sentenceFr}
          <span className="ml-2 not-italic text-accent2">({lemma})</span>
        </p>
      </>
    );
  }
  if (exercise.kind === "numeral") {
    return (
      <>
        <p className="font-display text-sm text-muted">Accorde le nom avec le chiffre :</p>
        <p className="mt-2 font-display text-3xl font-bold">
          {exercise.numeral} + {exercise.noun.forms.singular[0]}{" "}
          <span className="text-lg font-normal text-muted">({exercise.noun.translation})</span>
        </p>
      </>
    );
  }
  // Isolé : hors de la page d'un cas, il faut dire lequel est demandé.
  return (
    <>
      <p className="font-display text-sm text-muted">
        {exercise.targetCase === "nominative"
          ? "Mets au pluriel :"
          : `Mets ${exercise.adjective ? "ce groupe" : "ce mot"} au ${CASE_NAME[exercise.targetCase]} ${exercise.plural ? "pluriel" : "singulier"} :`}
      </p>
      <p className="mt-2 font-display text-3xl font-bold">
        {lemma}{" "}
        <span className="text-lg font-normal text-muted">
          ({exercise.promptFr ?? exercise.noun.translation})
        </span>
      </p>
    </>
  );
}
