"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import DirectionToggle from "@/components/exercises/DirectionToggle";
import SessionSummary from "@/components/exercises/SessionSummary";
import { loadDirection, saveDirection, type VocabDirection } from "@/lib/storage";
import { fetchDailyProgress } from "@/lib/vocabulary/custom";
import { useReviewQueue } from "@/lib/vocabulary/useReviewQueue";
import PaywallNotice from "@/components/ui/PaywallNotice";
import AllKnownState from "@/components/vocabulary/AllKnownState";
import FocusControl from "@/components/vocabulary/FocusControl";
import PronunciationRow from "@/components/vocabulary/PronunciationRow";
import ReviewExplanation from "@/components/vocabulary/ReviewExplanation";
import { ReviewCardSkeleton } from "@/components/ui/Skeleton";

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function QcmPage() {
  return (
    <Suspense fallback={null}>
      <QcmInner />
    </Suspense>
  );
}

function QcmInner() {
  const searchParams = useSearchParams();
  const listId = searchParams.get("list");

  const [direction, setDirection] = useState<VocabDirection>(() => loadDirection("qcm", "ru-first"));
  function changeDirection(d: VocabDirection) {
    setDirection(d);
    saveDirection("qcm", d);
  }

  const [picked, setPicked] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState(false);
  const {
    blocked,
    current,
    submitAnswer,
    advance,
    reload,
    pool,
    loading,
    loadError,
    listName,
    sessionIndex,
    sessionCorrect,
    noWordsAtAll,
    allKnown,
    currentFocus,
    setFocus,
  } = useReviewQueue(listId);

  const [daily, setDaily] = useState<{ reviewedToday: number; goal: number } | null>(null);
  useEffect(() => {
    fetchDailyProgress().then(setDaily).catch(() => {});
  }, []);

  // Nouveau mot : efface le choix précédent. Ajusté pendant le rendu
  // (comparaison à l'id précédemment vu) plutôt que dans un effet.
  const [seenQuestionId, setSeenQuestionId] = useState(current?.id);
  if (current?.id !== seenQuestionId) {
    setSeenQuestionId(current?.id);
    setPicked(null);
    setSubmitError(false);
  }

  const expectedIsRussian = direction !== "ru-first";
  const correctAnswer = current ? (expectedIsRussian ? current.ru : current.fr) : "";

  const options = useMemo(() => {
    if (!current) return [];
    const others = pool.filter((w) => w.id !== current.id);
    const shuffledOthers = shuffle(others);
    const seen = new Set([correctAnswer]);
    const distractors: string[] = [];
    for (const w of shuffledOthers) {
      const text = expectedIsRussian ? w.ru : w.fr;
      if (seen.has(text)) continue;
      seen.add(text);
      distractors.push(text);
      if (distractors.length >= 3) break;
    }
    return shuffle([correctAnswer, ...distractors]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, pool, direction]);

  const backHref = listId ? `/vocabulary/lists/${listId}` : "/vocabulary/review";
  const backLabel = listId ? `← ${listName || "Liste"}` : "← Révision";

  // Le plafond de révisions du plan gratuit passe AVANT tout le reste :
  // une fois atteint, il n'y a plus ni carte à charger ni file à résumer.
  if (blocked) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8 sm:py-16">
        <PaywallNotice
          quota={blocked.quota}
          message={blocked.message}
          what="la révision du vocabulaire"
        />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-14 sm:py-24 text-center">
        <p className="font-display text-lg text-danger">{loadError}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8 sm:py-16">
        <ReviewCardSkeleton />
      </div>
    );
  }

  if (noWordsAtAll) {
    return <EmptyState />;
  }

  if (allKnown) {
    return <AllKnownState backHref={backHref} backLabel={backLabel} />;
  }

  if (!current) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-14 sm:py-24">
        <SessionSummary
          reviewed={sessionIndex}
          correct={sessionCorrect}
          goal={daily?.goal ?? 15}
          reviewedTodayTotal={(daily?.reviewedToday ?? 0) + sessionIndex}
          backHref={backHref}
          backLabel={backLabel}
          onRestart={reload}
        />
      </div>
    );
  }

  if (options.length < 2) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-14 sm:py-24 text-center">
        <p className="font-display text-lg font-semibold">Pas assez de mots pour un QCM ici</p>
        <p className="mt-2 font-display text-sm text-muted">
          Ajoute d&apos;autres mots à cette liste, ou essaie la révision globale.
        </p>
        <Link
          href={backHref}
          className="btn btn-primary btn-sheen mt-5 inline-block rounded-[10px] px-5 py-2.5 font-display text-sm"
        >
          {backLabel}
        </Link>
      </div>
    );
  }

  const clue = expectedIsRussian ? current.fr : current.ru;
  const instruction = expectedIsRussian
    ? "Quelle est la traduction en russe ?"
    : "Quelle est la traduction en français ?";

  // L'option choisie part au serveur, qui relit le mot en base et décide.
  // Le surlignage vert/rouge affiché ici reste local — la bonne option est
  // connue du client, c'est ce qui construit le QCM — mais la note SRS, la
  // série et l'XP ne dépendent plus de ce que le client affirme.
  async function selectOption(opt: string) {
    if (picked) return;
    setPicked(opt);
    setSubmitError(false);
    const verdict = await submitAnswer({
      userAnswer: opt,
      expectedLanguage: expectedIsRussian ? "ru" : "fr",
      mode: "qcm",
    });
    if (!verdict) setSubmitError(true);
  }

  function next() {
    if (!picked) return;
    advance();
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 sm:py-16">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={backHref}
          className="font-display text-xs font-semibold uppercase tracking-wide text-muted hover:text-accent-ink"
        >
          {backLabel}
        </Link>
        <DirectionToggle direction={direction} onChange={changeDirection} />
      </div>

      <div className="mb-6 flex items-center justify-between">
        <p className="font-display text-xs font-semibold uppercase tracking-wide text-muted">
          {current.theme} · mot {sessionIndex + 1}
        </p>
        <p className="font-display text-xs font-semibold text-muted">
          {sessionCorrect}/{sessionIndex} correct
        </p>
      </div>

      {/* Le même sélecteur que sur la carte d'une liste, à la même place
          dans le geste : ce que l'apprenant décide ici vaut pour toutes les
          révisions à venir. */}
      <div className="mb-4 flex justify-center">
        <FocusControl value={currentFocus} word={current.ru} onChange={setFocus} />
      </div>

      <div className="rounded-[20px] surface p-8 text-center shadow-float">
        <p className="font-display text-sm text-muted">{instruction}</p>
        <p className="mt-2 font-display text-3xl font-bold text-accent2">{clue}</p>

        <div className="mt-7 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {options.map((opt) => {
            const isCorrectOpt = picked && opt === correctAnswer;
            const isPickedWrong = picked === opt && opt !== correctAnswer;
            return (
              <button
                key={opt}
                onClick={() => selectOption(opt)}
                disabled={!!picked}
                className={`rounded-[10px] border px-4 py-3 font-display text-lg font-semibold transition-colors ${
                  isCorrectOpt
                    ? "border-success bg-success/10 text-success"
                    : isPickedWrong
                      ? "border-danger bg-danger/10 text-danger"
                      : "border-border bg-bg text-text hover:bg-accent/10 hover:border-accent/35"
                } disabled:cursor-default`}
              >
                {opt}
              </button>
            );
          })}
        </div>

        {submitError && (
          <p className="mt-4 font-display text-sm text-danger">
            Enregistrement impossible — cette révision n&apos;a pas été comptée.
          </p>
        )}

        {/* Avant le choix, seule la consigne se prononce : les quatre
            propositions sont à l'écran, en entendre une désignerait la
            bonne. */}
        <PronunciationRow
          ru={current.ru}
          fr={current.fr}
          only={picked ? undefined : expectedIsRussian ? "fr" : "ru"}
          className="mt-5"
        />

        {/* Une option choisie vaut réponse vue : le vert et le rouge sont
            déjà posés sur la grille, la fiche ne peut plus rien souffler. */}
        {picked && <ReviewExplanation wordId={current.id} />}

        {picked && (
          <button
            onClick={next}
            className="btn btn-primary btn-sheen mt-6 w-full rounded-[10px] py-3 font-display text-sm"
          >
            Suivant →
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-md px-6 py-14 sm:py-24 text-center">
      <p className="font-display text-lg font-semibold">Aucun mot à réviser pour l&apos;instant</p>
      <p className="mt-2 font-display text-sm text-muted">
        Choisis des thèmes dans ton{" "}
        <Link href="/account" className="text-accent-ink hover:underline">
          profil
        </Link>{" "}
        pour obtenir des mots tout faits, ou crée ta propre liste.
      </p>
      <Link
        href="/vocabulary"
        className="btn btn-primary btn-sheen mt-5 inline-block rounded-[10px] px-5 py-2.5 font-display text-sm"
      >
        Aller à mes listes
      </Link>
    </div>
  );
}
