"use client";

import { useEffect, useState } from "react";
import { normalizeTyped, typedMatches } from "@/lib/exercises/types";
import { usePracticeAttempt, type PracticeBlock } from "./attempt-client";
import {
  SERIES_LENGTH,
  reshuffleChoice,
  retriesLeft,
  scheduleRetry,
  takeAnyRetry,
  takeDueRetry,
  type RetryEntry,
} from "./retry";

/**
 * La mécanique d'une séance d'entraînement, commune à tous les modules à
 * choix.
 *
 * ELLE EXISTAIT EN CINQ COPIES. Aspect, Mouvement, Participes, Adjectif et le
 * moteur partagé (PracticeRunner) portaient chacun le même état — l'exercice,
 * le verdict, la série, la précision — et la même fonction `answer`, à trois
 * lignes près. Y ajouter le rattrapage des erreurs, le bilan de série et la
 * réponse tapée aurait donné cinq variantes au bout d'un mois.
 *
 * Ce hook porte donc tout ce qui ne dépend pas du russe :
 *   - le tirage, APRÈS le montage : au rendu initial, serveur et client
 *     tireraient deux exercices différents et l'hydratation casserait ;
 *   - la correction par le serveur, jamais par l'écran — sauf panne, et sauf
 *     rattrapage, qui n'est pas enregistré (voir lib/practice/retry.ts) ;
 *   - la file des erreurs, qui fait revenir un exercice raté quelques
 *     exercices plus tard ;
 *   - la série de dix, et son bilan.
 * Le module garde ce qui le distingue : sa banque, et la façon de montrer la
 * question.
 */

export interface ChoiceExercise {
  itemId: string;
  options: string[];
  correctIndex: number;
  explain: string;
  whyNot?: Record<string, string>;
}

export interface SessionFeedback {
  correct: boolean;
  reason: string;
  /** Ce que la réponse donnée représente, quand la banque le sait. */
  note: string | null;
  /** Un rattrapage : corrigé à l'écran, ni enregistré ni décompté. */
  retry: boolean;
  /** Raté, et programmé pour revenir pendant la séance. */
  willReturn: boolean;
}

export interface SeriesMiss {
  itemId: string;
  /** L'énoncé, sans la réponse. */
  label: string;
  answer: string;
  /** Réussi depuis, lors d'un rattrapage. */
  recovered: boolean;
}

export interface SessionOptions<T extends ChoiceExercise> {
  /** Identifie la séance : le changer repart de zéro (autre compétence). */
  sessionKey: string;
  /** La route du péage — celle des exercices neufs, sauf mention contraire de `request`. */
  endpoint: string;
  /**
   * Le n-ième exercice neuf, ou `null` quand la source est épuisée. Doit
   * rester sans effet de bord au-delà de la mémoire courte : React rejoue
   * les effets en développement.
   */
  draw: (index: number) => T | null;
  /** Où, et quoi, envoyer pour faire corriger et enregistrer une réponse. */
  request: (
    exercise: T,
    answer: string,
    typed: boolean
  ) => { endpoint: string; body: Record<string, unknown> };
  /** Une ligne pour le bilan : l'énoncé, sans la réponse. */
  describe: (exercise: T) => string;
  seriesLength?: number;
  /** Juge localement une réponse tapée. Par défaut : la bonne option, accent et ё mis à part. */
  judgeTyped?: (exercise: T, answer: string) => boolean;
  /**
   * Ce qu'une réponse tapée fausse représente. Par défaut : la note du
   * leurre qu'elle reproduit, s'il y en a un. Le module Cas y branche son
   * diagnostic, qui connaît les douze formes du mot.
   */
  noteTyped?: (exercise: T, answer: string) => string | null;
}

export interface PracticeSession<T extends ChoiceExercise> {
  blocked: PracticeBlock | null;
  exercise: T | null;
  /** La source n'a plus rien à servir. */
  exhausted: boolean;
  isRetry: boolean;
  /** Change à chaque exercice servi : sert de clé pour l'animation d'entrée. */
  round: number;
  feedback: SessionFeedback | null;
  picked: string | null;
  checking: boolean;
  streak: number;
  accuracy: number | null;
  /** Exercices neufs répondus dans la série en cours. */
  answered: number;
  firstTryCorrect: number;
  misses: SeriesMiss[];
  seriesLength: number;
  showRecap: boolean;
  pendingRetries: number;
  answer: (value: string, typed?: boolean) => void;
  /** « Je ne sais pas » : compte comme une erreur, sans le ton d'une faute. */
  reveal: () => void;
  next: () => void;
  continueSeries: () => void;
  redoMisses: () => void;
}

/** La note d'une réponse fausse — y compris tapée, si elle coïncide avec un leurre connu. */
function noteFor(exercise: ChoiceExercise, given: string, typed: boolean): string | null {
  if (!exercise.whyNot || !given) return null;
  if (!typed) return exercise.whyNot[given] ?? null;
  const key = normalizeTyped(given);
  const option = exercise.options.find((o) => normalizeTyped(o) === key);
  return option ? (exercise.whyNot[option] ?? null) : null;
}

export function usePracticeSession<T extends ChoiceExercise>({
  sessionKey,
  endpoint,
  draw,
  request,
  describe,
  seriesLength = SERIES_LENGTH,
  judgeTyped,
  noteTyped,
}: SessionOptions<T>): PracticeSession<T> {
  // Le plafond de pratique du plan gratuit. `blocked` remplace la carte par
  // l'écran d'abonnement ; `stopHere` l'anticipe d'un exercice pour ne pas
  // faire répondre à un exercice qui allait être refusé.
  const { blocked, submit, stopHere } = usePracticeAttempt(endpoint);

  const [exercise, setExercise] = useState<T | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [isRetry, setIsRetry] = useState(false);
  /** Rattrapages déjà servis pour l'exercice affiché, celui-ci compris. */
  const [retryAttempts, setRetryAttempts] = useState(0);
  const [round, setRound] = useState(0);
  const [served, setServed] = useState(0);
  const [freshDrawn, setFreshDrawn] = useState(0);
  const [feedback, setFeedback] = useState<SessionFeedback | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [streak, setStreak] = useState(0);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [queue, setQueue] = useState<RetryEntry<T>[]>([]);
  const [answered, setAnswered] = useState(0);
  const [firstTryCorrect, setFirstTryCorrect] = useState(0);
  const [misses, setMisses] = useState<SeriesMiss[]>([]);
  const [showRecap, setShowRecap] = useState(false);
  const [redo, setRedo] = useState(false);

  // Une autre compétence repart de zéro — comparaison pendant le rendu
  // plutôt qu'un effet (même motif que CaseReader).
  const [seenKey, setSeenKey] = useState(sessionKey);
  if (seenKey !== sessionKey) {
    setSeenKey(sessionKey);
    setExercise(null);
    setExhausted(false);
    setIsRetry(false);
    setRetryAttempts(0);
    setServed(0);
    setFreshDrawn(0);
    setFeedback(null);
    setPicked(null);
    setChecking(false);
    setStreak(0);
    setAccuracy(null);
    setQueue([]);
    setAnswered(0);
    setFirstTryCorrect(0);
    setMisses([]);
    setShowRecap(false);
    setRedo(false);
  }

  useEffect(() => {
    let cancelled = false;
    // Le tirage a lieu dans le `then`, et seulement si l'effet est toujours
    // vivant : React rejoue les effets en développement, et un tirage fait
    // dans le corps de l'effet aurait été consommé deux fois.
    Promise.resolve().then(() => {
      if (cancelled) return;
      const first = draw(0);
      if (first) {
        setExercise(first);
        setServed(1);
        setFreshDrawn(1);
        setRound((r) => r + 1);
      } else {
        setExhausted(true);
      }
    });
    return () => {
      cancelled = true;
    };
    // `draw` change à chaque rendu du parent ; seule la séance compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  function show(next: T, retryOf: RetryEntry<T> | null) {
    setFeedback(null);
    setPicked(null);
    setChecking(false);
    setExercise(next);
    setIsRetry(retryOf !== null);
    setRetryAttempts(retryOf ? retryOf.attempts + 1 : 0);
    setServed((n) => n + 1);
    setRound((r) => r + 1);
  }

  /**
   * Sert l'exercice suivant : un rattrapage échu d'abord, sinon un neuf.
   * `redoMode` sert tous les rattrapages d'affilée, échus ou non.
   *
   * JAMAIS DEUX RATTRAPAGES DE SUITE hors de ce mode : après un rattrapage
   * vient toujours un exercice neuf. Sans cette règle, quelques erreurs
   * reprogrammées se relayaient et affamaient la série — elle n'avançait plus.
   */
  function serve(pending: RetryEntry<T>[], redoMode: boolean, answeredSoFar: number) {
    const retry = redoMode
      ? takeAnyRetry(pending)
      : isRetry
        ? null
        : takeDueRetry(pending, served);
    if (retry) {
      setQueue(retry.rest);
      show(reshuffleChoice(retry.entry.item), retry.entry);
      return;
    }
    if (redoMode) {
      // Plus rien à refaire : la série suivante commence.
      setRedo(false);
      setAnswered(0);
      setFirstTryCorrect(0);
      setMisses([]);
      answeredSoFar = 0;
    }

    // Le péage ne regarde que les exercices neufs : un rattrapage n'est
    // jamais décompté, il ne peut donc pas non plus être refusé.
    if (stopHere()) return;

    const fresh = draw(freshDrawn);
    if (fresh) {
      setFreshDrawn((n) => n + 1);
      show(fresh, null);
      return;
    }

    // Source épuisée — une liste d'erreurs est finie : ce qui reste à
    // rattraper passe sans attendre son tour, puis le bilan.
    const leftover = takeAnyRetry(pending);
    if (leftover) {
      setQueue(leftover.rest);
      show(reshuffleChoice(leftover.entry.item), leftover.entry);
      return;
    }
    setExercise(null);
    setFeedback(null);
    setExhausted(true);
    setShowRecap(answeredSoFar > 0);
  }

  function next() {
    if (!exercise || !feedback) return;
    if (!redo && answered >= seriesLength) {
      setShowRecap(true);
      return;
    }
    serve(queue, redo, answered);
  }

  function continueSeries() {
    setShowRecap(false);
    setAnswered(0);
    setFirstTryCorrect(0);
    setMisses([]);
    serve(queue, false, 0);
  }

  function redoMisses() {
    setShowRecap(false);
    setRedo(true);
    serve(queue, true, answered);
  }

  function conclude(current: T, given: string, typed: boolean, correct: boolean, retry: boolean) {
    const again = !correct && (!retry || retriesLeft(retryAttempts));
    setFeedback({
      correct,
      reason: current.explain,
      note: correct
        ? null
        : typed && noteTyped
          ? noteTyped(current, given)
          : noteFor(current, given, typed),
      retry,
      willReturn: again,
    });
    setStreak((s) => (correct ? s + 1 : 0));

    if (retry) {
      if (correct) {
        setMisses((list) =>
          list.map((m) => (m.itemId === current.itemId ? { ...m, recovered: true } : m))
        );
      } else if (again) {
        setQueue((q) => scheduleRetry(q, current.itemId, current, served, retryAttempts));
      }
      return;
    }

    setAnswered((n) => n + 1);
    if (correct) {
      setFirstTryCorrect((n) => n + 1);
      return;
    }
    setMisses((list) =>
      list.some((m) => m.itemId === current.itemId)
        ? list
        : [
            ...list,
            {
              itemId: current.itemId,
              label: describe(current),
              answer: current.options[current.correctIndex],
              recovered: false,
            },
          ]
    );
    setQueue((q) => scheduleRetry(q, current.itemId, current, served));
  }

  async function answer(value: string, typed = false) {
    if (!exercise || feedback || checking) return;
    const current = exercise;
    const given = typed ? value.trim() : value;
    const correctOption = current.options[current.correctIndex];
    const local = typed
      ? judgeTyped
        ? judgeTyped(current, given)
        : typedMatches(given, correctOption)
      : given === correctOption;
    setPicked(given);

    // Un rattrapage se corrige ici : la bonne réponse vient d'être montrée,
    // et l'enregistrer compterait deux fois le même exercice.
    if (isRetry) {
      conclude(current, given, typed, local, true);
      return;
    }

    setChecking(true);
    // Le client n'annonce jamais s'il a juste : il envoie l'item et sa
    // réponse, le serveur rejuge depuis la banque.
    const { endpoint: target, body } = request(current, given, typed);
    const outcome = await submit(body, target);
    setChecking(false);

    // Plafond atteint : l'écran bascule sur l'abonnement. Surtout ne rien
    // corriger ici — ce serait laisser la pratique continuer malgré le refus.
    if (outcome.kind === "blocked") return;

    if (outcome.kind === "verdict") {
      if (typeof outcome.data.accuracy === "number") setAccuracy(outcome.data.accuracy);
      conclude(current, given, typed, outcome.data.correct === true, false);
      return;
    }

    // Serveur indisponible : la correction locale prend le relais pour ne pas
    // bloquer l'exercice. La tentative n'est simplement pas comptée.
    conclude(current, given, typed, local, false);
  }

  return {
    blocked,
    exercise,
    exhausted,
    isRetry,
    round,
    feedback,
    picked,
    checking,
    streak,
    accuracy,
    answered,
    firstTryCorrect,
    misses,
    seriesLength,
    showRecap,
    pendingRetries: queue.length,
    answer: (value, typed) => void answer(value, typed),
    reveal: () => void answer("", true),
    next,
    continueSeries,
    redoMisses,
  };
}
