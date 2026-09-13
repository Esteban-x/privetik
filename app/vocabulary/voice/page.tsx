"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import DirectionToggle from "@/components/exercises/DirectionToggle";
import SessionSummary from "@/components/exercises/SessionSummary";
import { loadDirection, saveDirection, type VocabDirection } from "@/lib/storage";
import {
  ANSWER_LANG,
  onSpeechBusy,
  prefetchRu,
  PROMPT_LANG,
  speakFr,
  speakIn,
  speakRu,
  stopSpeaking,
  useSpeechRecognition,
} from "@/lib/vocabulary/speech";
import { fetchDailyProgress } from "@/lib/vocabulary/custom";
import { judgeSpoken, type SpokenVerdict } from "@/lib/vocabulary/answer-check";
import { useReviewQueue } from "@/lib/vocabulary/useReviewQueue";
import type { VocabItem } from "@/lib/vocabulary/data";
import type { Focus } from "@/lib/vocabulary/focus";
import type { Quality } from "@/lib/srs/sm2";
import PaywallNotice from "@/components/ui/PaywallNotice";
import AllKnownState from "@/components/vocabulary/AllKnownState";
import FocusControl from "@/components/vocabulary/FocusControl";
import NoWordsState from "@/components/vocabulary/NoWordsState";
import ReviewExplanation from "@/components/vocabulary/ReviewExplanation";
import { ReviewSessionSkeleton } from "@/components/vocabulary/VocabularySkeletons";
import { MicIcon, SpeakerIcon } from "@/components/ui/icons";

export default function VoicePage() {
  return (
    <Suspense fallback={<ReviewSessionSkeleton mode="voice" />}>
      <VoiceInner />
    </Suspense>
  );
}

function VoiceInner() {
  const searchParams = useSearchParams();
  const listId = searchParams.get("list");

  const [direction, setDirection] = useState<VocabDirection>(() =>
    loadDirection("voice", "ru-first")
  );
  function changeDirection(d: VocabDirection) {
    setDirection(d);
    saveDirection("voice", d);
  }

  const {
    blocked,
    current,
    review,
    reload,
    loading,
    loadError,
    listName,
    sessionIndex,
    sessionCorrect,
    remaining,
    noWordsAtAll,
    allKnown,
    currentFocus,
    setFocus,
  } = useReviewQueue(listId);

  const [daily, setDaily] = useState<{ reviewedToday: number; goal: number } | null>(null);
  useEffect(() => {
    fetchDailyProgress().then(setDaily).catch(() => {});
  }, []);

  const backHref = listId ? `/vocabulary?list=${listId}` : "/vocabulary/review";
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

  if (loading) return <ReviewSessionSkeleton mode="voice" />;

  if (noWordsAtAll) return <NoWordsState listId={listId} />;

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

  return (
    <VoiceSession
      word={current}
      direction={direction}
      onDirectionChange={changeDirection}
      focus={currentFocus}
      onFocusChange={setFocus}
      onReview={review}
      position={sessionIndex + 1}
      remaining={remaining}
      backHref={backHref}
      backLabel={backLabel}
    />
  );
}

/** Les quatre notes, dans l'ordre des boutons et des touches 1 à 4. */
const QUALITIES: { value: Quality; label: string; color: string }[] = [
  { value: 1, label: "À revoir", color: "var(--color-accent2-deep)" },
  { value: 3, label: "Difficile", color: "var(--color-accent2)" },
  { value: 4, label: "Bien", color: "var(--color-accent-ink)" },
  { value: 5, label: "Facile", color: "var(--color-success)" },
];

/**
 * La note qu'on propose d'après ce qui a été entendu. Une PROPOSITION : le
 * bouton est cerclé, rien n'est enregistré sans le geste de l'apprenant.
 */
const SUGGESTED: Record<SpokenVerdict, Quality> = { match: 4, close: 3, miss: 1 };

/**
 * La session proprement dite, une fois les mots chargés.
 *
 * SÉPARÉE DE LA PAGE pour que ses effets — lecture de la consigne, micro,
 * raccourcis clavier — n'existent que lorsqu'il y a un mot à travailler :
 * posés au-dessus des retours anticipés (chargement, fin de session), ils
 * auraient dû se protéger chacun de l'absence de mot.
 */
function VoiceSession({
  word,
  direction,
  onDirectionChange,
  focus,
  onFocusChange,
  onReview,
  position,
  remaining,
  backHref,
  backLabel,
}: {
  word: VocabItem;
  direction: VocabDirection;
  onDirectionChange: (d: VocabDirection) => void;
  focus: Focus;
  onFocusChange: (f: Focus) => void;
  onReview: (quality: Quality) => void;
  position: number;
  remaining: number;
  backHref: string;
  backLabel: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const {
    supported: micSupported,
    listening,
    transcript,
    alternatives,
    error: micError,
    start,
    stop,
    reset: resetSpeech,
    abort: abortListening,
  } = useSpeechRecognition(ANSWER_LANG[direction]);

  // La synthèse d'un mot INÉDIT demande une seconde et demie : l'indicateur
  // vit dans la couche audio, à laquelle on s'abonne (voir onSpeechBusy).
  const [loadingAudio, setLoadingAudio] = useState(false);
  useEffect(() => onSpeechBusy(setLoadingAudio), []);

  // Quitter la page pendant une lecture la laissait se terminer sur la page
  // suivante.
  useEffect(() => () => stopSpeaking(), []);

  const listenAndRecall = direction === "ru-first";
  /** Ce que « Écouter » prononce : la consigne, jamais la réponse. */
  const promptText = listenAndRecall ? word.ru : word.fr;
  const answerText = listenAndRecall ? word.fr : word.ru;

  // UNE NOUVELLE QUESTION — un autre mot, OU le même dans l'autre sens.
  // Changer de sens en cours de mot gardait la réponse révélée et le
  // transcript de l'autre langue : on se retrouvait devant la solution d'une
  // question qu'on ne s'était pas encore posée. Ajusté pendant le rendu,
  // sans rendu intermédiaire périmé.
  const questionKey = `${word.id}|${direction}`;
  const [seenQuestion, setSeenQuestion] = useState(questionKey);
  if (questionKey !== seenQuestion) {
    setSeenQuestion(questionKey);
    setRevealed(false);
    resetSpeech();
  }

  // La consigne est ÉNONCÉE à chaque nouvelle question — c'est un effet de
  // bord audio, pas un ajustement d'état. L'écoute éventuellement restée
  // ouverte sur la question précédente est coupée d'abord : sinon elle
  // répondait pour celle-ci, et captait la consigne qu'on va lire.
  useEffect(() => {
    abortListening();
    void speakIn(PROMPT_LANG[direction], promptText);
    // Le mot russe sera proposé à la révélation : on le prépare pendant que
    // l'apprenant cherche, sinon le son arrive après coup.
    if (direction === "fr-first") prefetchRu(word.ru);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionKey]);

  /**
   * Ce qu'on a entendu, rapproché de la réponse — toutes les lectures du
   * moteur comprises. Un INDICE, jamais une note : la reconnaissance se
   * trompe sur un accent ou une syllabe avalée, et l'apprenant garde le
   * dernier mot sur sa carte.
   */
  const verdict: SpokenVerdict | null =
    alternatives.length > 0 ? judgeSpoken(alternatives, answerText) : null;

  // UNE BONNE RÉPONSE SE RÉVÈLE D'ELLE-MÊME. Il fallait dire le mot, lire
  // « ça correspond », cliquer « Valider », puis choisir une note : trois
  // gestes pour confirmer ce que l'app venait d'établir. Sur un doute ou un
  // écart, la réponse reste cachée — on peut vouloir redire avant de la voir.
  const shown = revealed || verdict === "match";
  const suggested = verdict ? SUGGESTED[verdict] : null;

  function handleReview(quality: Quality) {
    stopSpeaking();
    onReview(quality);
  }

  function replay(rate = 1) {
    void speakIn(PROMPT_LANG[direction], promptText, { rate });
  }

  /**
   * LE CLAVIER, POUR ENCHAÎNER SANS VISER. Une session vocale se fait les
   * yeux ailleurs que sur l'écran ; chercher quatre boutons à la souris entre
   * deux mots cassait le rythme de l'exercice. Ignoré quand le focus est sur
   * un champ ou un bouton, dont Espace et Entrée sont déjà le geste.
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const onControl = Boolean(target?.closest("button, a"));

      if (e.key === " " && !onControl) {
        e.preventDefault();
        if (micSupported) {
          if (listening) stop();
          else start();
        } else if (!shown) {
          setRevealed(true);
        }
        return;
      }
      if (e.key === "Enter" && !onControl && !shown) {
        e.preventDefault();
        setRevealed(true);
        return;
      }
      if (e.key === "e" || e.key === "E") {
        replay();
        return;
      }
      if (shown && ["1", "2", "3", "4"].includes(e.key)) {
        handleReview(QUALITIES[Number(e.key) - 1].value);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const left = remaining - 1;

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 sm:py-16">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={backHref}
          className="font-display text-xs font-semibold uppercase tracking-wide text-muted hover:text-accent-ink"
        >
          {backLabel}
        </Link>
        <DirectionToggle direction={direction} onChange={onDirectionChange} />
      </div>

      {/* OÙ L'ON EN EST. Le mode ne disait que le rang du mot : une session
          de trente mots et une de trois se ressemblaient jusqu'au résumé. */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="font-display text-xs font-semibold uppercase tracking-wide text-muted">
          {word.theme} · mot {position}
        </p>
        <p className="font-display text-xs font-semibold text-muted">
          {left > 0 ? `encore ${left}` : "dernier mot"}
        </p>
      </div>

      {/* Le même sélecteur que sur la carte d'une liste, à la même place
          dans le geste : ce que l'apprenant décide ici vaut pour toutes les
          révisions à venir. */}
      <div className="mb-4 flex justify-center">
        <FocusControl value={focus} word={word.ru} onChange={onFocusChange} />
      </div>

      <div className="rounded-[20px] surface p-6 text-center shadow-float sm:p-8">
        <p className="font-display text-sm text-muted">
          {listenAndRecall
            ? "Écoute le mot russe, et dis son sens en français :"
            : "Écoute le mot français, et dis-le en russe :"}
        </p>

        {/* RIEN N'EST ÉCRIT AVANT LA RÉPONSE, DANS AUCUN DES DEUX SENS : c'est
            ce qui fait de ce mode un exercice ORAL plutôt qu'une carte avec
            un micro à côté. La consigne se prononce ; le texte n'apparaît
            qu'avec la réponse. */}
        <p className="mt-2 font-display text-3xl font-bold text-muted/40" aria-hidden>
          ?
        </p>

        {/* Deux pastilles de même forme, même largeur, même rangée : écouter
            et parler sont deux gestes de même rang. « Écouter » dit la
            consigne, jamais la réponse (voir PROMPT_LANG). */}
        <div className={`mt-6 grid gap-2 sm:gap-2.5 ${micSupported ? "grid-cols-2" : "grid-cols-1"}`}>
          <button
            onClick={() => replay()}
            aria-busy={loadingAudio}
            aria-label={listenAndRecall ? "Écouter le mot russe" : "Écouter le mot français"}
            className="relative inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-border px-3 py-2.5 font-display text-[13px] font-semibold text-text transition-colors hover:border-accent/35 hover:bg-accent/10 sm:gap-2 sm:px-5 sm:text-sm"
          >
            {loadingAudio && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-accent/25"
              />
            )}
            <SpeakerIcon className="h-4 w-4 shrink-0" />
            <span className="min-[360px]:hidden">Écouter</span>
            <span className="hidden min-[360px]:inline">
              {loadingAudio ? "Préparation…" : "Écouter"}
            </span>
          </button>

          {micSupported && (
            <button
              onClick={listening ? stop : start}
              aria-pressed={listening}
              className={`inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-2.5 font-display text-[13px] font-semibold transition-colors sm:gap-2 sm:px-5 sm:text-sm ${
                listening
                  ? "border-accent2 bg-accent2/10 text-accent2"
                  : "border-border text-text hover:border-accent/35 hover:bg-accent/10"
              }`}
            >
              <MicIcon className={`h-4 w-4 shrink-0 ${listening ? "wave-pulse" : ""}`} />
              {listening ? (
                "J’écoute…"
              ) : (
                <>
                  <span className="min-[360px]:hidden">{listenAndRecall ? "Français" : "Russe"}</span>
                  <span className="hidden min-[360px]:inline">
                    {listenAndRecall ? "Dire en français" : "Dire en russe"}
                  </span>
                </>
              )}
            </button>
          )}
        </div>

        {/* RÉÉCOUTER PLUS LENTEMENT. Un mot russe inconnu dit à vitesse
            normale se perd en une syllabe ; le réentendre au même débit ne
            l'éclaire pas davantage. */}
        <button
          type="button"
          onClick={() => replay(0.7)}
          className="mt-3 font-display text-xs font-semibold text-muted underline-offset-2 transition-colors hover:text-accent-ink hover:underline"
        >
          Réécouter lentement
        </button>

        {/* UN ÉCART OU UN DOUTE : on montre ce qui a été entendu, et la main
            reste à l'apprenant — redire, ou voir la réponse. Une réponse
            reconnue, elle, passe directement à la révélation. */}
        {transcript && !shown && (
          <div role="status" className="mt-4 rounded-xl border border-border bg-bg p-4">
            <p className="font-display text-sm text-muted">
              J&apos;ai entendu : <span className="font-semibold text-text">« {transcript} »</span>
            </p>
            <p
              className={`mt-1 font-display text-xs font-semibold ${
                verdict === "close" ? "text-accent2" : "text-muted"
              }`}
            >
              {verdict === "close"
                ? "Presque — il manque peu de chose. Redis-le, ou vérifie la réponse."
                : "Ce n'est pas ce que j'attendais — mais j'ai pu mal entendre."}
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button
                onClick={start}
                className="btn btn-primary rounded-full px-5 py-2 font-display text-sm font-semibold"
              >
                Redire
              </button>
              <button
                onClick={() => setRevealed(true)}
                className="rounded-full border border-border px-5 py-2 font-display text-sm font-semibold text-text transition-colors hover:border-accent/35 hover:bg-accent/10"
              >
                Voir la réponse
              </button>
            </div>
          </div>
        )}

        {/* CE QUI A EMPÊCHÉ L'ÉCOUTE, ÉCRIT. */}
        {micError && <p className="mt-3 font-display text-sm text-danger">{micError}</p>}

        {!micSupported && (
          <p className="mt-4 font-display text-xs text-muted">
            L&apos;enregistrement vocal n&apos;est pas disponible sur ce navigateur (essaie Chrome
            ou Edge) — tu peux quand même écouter et t&apos;auto-évaluer.
          </p>
        )}

        {!shown ? (
          !transcript && (
            <button
              onClick={() => setRevealed(true)}
              className="btn btn-primary btn-sheen mt-6 w-full rounded-[10px] py-3 font-display text-sm"
            >
              Révéler la réponse
            </button>
          )
        ) : (
          <div className="animate-fade-in mt-6 rounded-xl border border-accent/40 bg-accent/10 p-4 text-left">
            {/* CE QU'ON A DIT RESTE À CÔTÉ DE LA RÉPONSE. Il disparaissait à la
                révélation : on comparait de mémoire ce qu'on venait de
                prononcer à ce qu'il fallait dire. */}
            {transcript && (
              <p
                className={`mb-3 flex items-start gap-2 font-display text-sm font-semibold ${
                  verdict === "match"
                    ? "text-success"
                    : verdict === "close"
                      ? "text-accent2"
                      : "text-muted"
                }`}
              >
                <span aria-hidden>{verdict === "match" ? "✓" : verdict === "close" ? "≈" : "✗"}</span>
                <span>
                  Tu as dit « {transcript} »
                  {verdict === "match" ? " — c'est bien ça." : verdict === "close" ? " — presque." : "."}
                </span>
              </p>
            )}
            <div className="flex items-center gap-2">
              <p className="font-display text-2xl font-bold text-accent-ink">{word.ru}</p>
              <button
                onClick={() => void speakRu(word.ru)}
                aria-busy={loadingAudio}
                aria-label="Écouter la prononciation russe"
                title="Écouter la prononciation"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-accent-ink transition-colors hover:bg-accent/15"
              >
                <SpeakerIcon className="h-4 w-4" />
              </button>
            </div>
            <p className="font-display text-sm text-muted">{word.transliteration}</p>
            <div className="mt-2 flex items-center gap-2">
              <p className="font-display text-base">{word.fr}</p>
              <button
                onClick={() => void speakFr(word.fr)}
                aria-busy={loadingAudio}
                aria-label="Écouter la prononciation française"
                title="Écouter la prononciation"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-accent-ink transition-colors hover:bg-accent/15"
              >
                <SpeakerIcon className="h-4 w-4" />
              </button>
            </div>
            {word.example && (
              <p className="mt-3 font-display text-sm text-muted">
                {word.example.ru} <span className="italic">— {word.example.fr}</span>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Sous la carte, comme en mode Cartes : une fois le mot dit et
          révélé, savoir ce qu'il porte vaut autant qu'ailleurs. */}
      {shown && <ReviewExplanation wordId={word.id} />}

      {shown && (
        <div className="mt-6 grid grid-cols-4 gap-1.5 sm:gap-2.5">
          {QUALITIES.map((q) => (
            <QualityButton
              key={q.value}
              label={q.label}
              color={q.color}
              suggested={suggested === q.value}
              onClick={() => handleReview(q.value)}
            />
          ))}
        </div>
      )}

      <p className="mt-5 hidden text-center font-display text-[11px] text-muted/70 sm:block">
        Clavier : {micSupported ? "Espace pour parler · Entrée pour révéler" : "Espace ou Entrée pour révéler"} · E
        pour réécouter · 1 à 4 pour noter
      </p>
    </div>
  );
}

function QualityButton({
  label,
  color,
  suggested,
  onClick,
}: {
  label: string;
  color: string;
  /** Cerclé : la note que ce qui a été entendu laisse attendre. */
  suggested: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-[10px] px-1 py-3 font-display text-[11px] font-semibold whitespace-nowrap text-on-tint transition-opacity hover:opacity-90 sm:text-xs"
      style={{
        background: color,
        boxShadow: suggested ? `0 0 0 2px var(--color-bg), 0 0 0 4px ${color}` : undefined,
      }}
    >
      {label}
      {suggested && <span className="sr-only"> (suggéré)</span>}
    </button>
  );
}
