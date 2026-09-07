"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import DirectionToggle from "@/components/exercises/DirectionToggle";
import SessionSummary from "@/components/exercises/SessionSummary";
import { loadDirection, saveDirection, type VocabDirection } from "@/lib/storage";
import { fetchDailyProgress } from "@/lib/vocabulary/custom";
import { matchesAnswer } from "@/lib/vocabulary/answer-check";
import { useReviewQueue } from "@/lib/vocabulary/useReviewQueue";
import PaywallNotice from "@/components/ui/PaywallNotice";
import AllKnownState from "@/components/vocabulary/AllKnownState";
import FocusControl from "@/components/vocabulary/FocusControl";
import PronunciationRow from "@/components/vocabulary/PronunciationRow";
import ReviewExplanation from "@/components/vocabulary/ReviewExplanation";
import { ReviewCardSkeleton } from "@/components/ui/Skeleton";
import { BulbIcon } from "@/components/ui/icons";

// La comparaison locale ne sert qu'à afficher un retour IMMÉDIAT sur le
// chemin heureux : le verdict qui compte, celui qui alimente le SRS et la
// série, est rendu par /api/vocab/answer, qui relit le mot en base. Même
// fonction des deux côtés (lib/vocabulary/answer-check.ts), donc pas de
// divergence possible entre ce qui est montré et ce qui est enregistré.

export default function TypingPage() {
  return (
    <Suspense fallback={null}>
      <TypingInner />
    </Suspense>
  );
}

function TypingInner() {
  const searchParams = useSearchParams();
  const listId = searchParams.get("list");

  const [direction, setDirection] = useState<VocabDirection>(() =>
    loadDirection("typing", "fr-first"),
  );
  function changeDirection(d: VocabDirection) {
    setDirection(d);
    saveDirection("typing", d);
  }

  const [input, setInput] = useState("");
  const [result, setResult] = useState<"correct" | "incorrect" | "revealed" | null>(null);
  const [submitError, setSubmitError] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const {
    blocked,
    current,
    submitAnswer,
    advance,
    reload,
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
    fetchDailyProgress()
      .then(setDaily)
      .catch(() => {});
  }, []);

  // Deuxième Entrée (passer au mot suivant) : déplace le focus clavier sur
  // le bouton "Suivant"une fois le résultat affiché, pour qu'Entrée
  // l'active nativement (comportement natif du navigateur pour un bouton
  // focus). Le déplacement se fait au keyUp du champ (voir plus bas), PAS
  // dans un effet déclenché par `result` : le focus bougerait alors DANS le
  // même appui de touche que celui qui vient de valider — le navigateur
  // active un bouton fraîchement focus à son keyUp, donc ce même relâchement
  // de touche cliquait aussitôt "Suivant"et sautait le mot sans jamais
  // laisser voir le résultat. Attendre le keyUp du champ garantit que la
  // touche qui a validé est bien relâchée avant que "Suivant"ne devienne
  // actif au clavier.
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Nouveau mot : efface la saisie précédente. Ajusté pendant le rendu
  // (comparaison à l'id précédemment vu) plutôt que dans un effet.
  const [seenQuestionId, setSeenQuestionId] = useState(current?.id);
  if (current?.id !== seenQuestionId) {
    setSeenQuestionId(current?.id);
    setInput("");
    setResult(null);
    setVerifying(false);
    setSubmitError(false);
  }

  // Ramène le focus sur le champ de saisie pour le nouveau mot — le focus
  // était sur le bouton "Suivant"(voir l'effet ci-dessus) juste avant.
  useEffect(() => {
    inputRef.current?.focus();
  }, [current?.id]);

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

  // Le sens détermine ce qui est montré (l'indice) et ce qui est attendu :
  // "ru-first"montre le russe et attend le français, et inversement.
  const expectedIsRussian = direction !== "ru-first";
  const clue = expectedIsRussian ? current.fr : current.ru;
  const instruction = expectedIsRussian ? "Écris ce mot en russe :" : "Écris ce mot en français :";
  const answer = expectedIsRussian ? current.ru : current.fr;

  async function submit() {
    if (!current || !input.trim() || result || verifying) return;

    // Affichage optimiste quand la comparaison locale reconnaît la réponse :
    // le serveur applique la même fonction, il dira la même chose. Sur un
    // écart, on attend son verdict — c'est là qu'intervient la seconde
    // vérification IA (synonyme, variante orthographique).
    const looksRight = matchesAnswer(input, answer);
    if (looksRight) setResult("correct");
    else setVerifying(true);
    setSubmitError(false);

    const verdict = await submitAnswer({
      userAnswer: input,
      expectedLanguage: expectedIsRussian ? "ru" : "fr",
      mode: "typing",
    });
    setVerifying(false);

    if (!verdict) {
      // Panne réseau : on ne fabrique pas de verdict. Rien n'a été
      // enregistré, l'apprenant peut réessayer.
      setResult(null);
      setSubmitError(true);
      return;
    }
    setResult(verdict.correct ? "correct" : "incorrect");
  }

  // Pour quelqu'un qui ne sait vraiment pas — évite de taper n'importe quoi
  // juste pour débloquer "Vérifier"et voir la réponse. Compte comme un
  // échec côté SRS (la mémoire a clairement besoin de retravailler ce mot),
  // mais affiché sans le ton "faute"du rouge : ce n'est pas une erreur,
  // juste un aveu honnête plutôt qu'une réponse bidon.
  async function reveal() {
    if (!current || result || verifying) return;
    setResult("revealed");
    setSubmitError(false);
    const verdict = await submitAnswer({
      userAnswer: "",
      expectedLanguage: expectedIsRussian ? "ru" : "fr",
      mode: "typing",
      revealed: true,
    });
    if (!verdict) setSubmitError(true);
  }

  function next() {
    if (!result) return;
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
          {sessionCorrect}/{sessionIndex} correct{sessionCorrect > 1 ? "s" : ""}
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

        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !result && submit()}
          onKeyUp={(e) => {
            // Voir le commentaire sur `nextButtonRef` plus haut : ce
            // déplacement de focus attend exprès le relâchement de la
            // touche Entrée qui vient de valider, pour ne pas déclencher
            // "Suivant"sur ce même appui.
            if (e.key === "Enter" && result) nextButtonRef.current?.focus();
          }}
          placeholder="Тапи здесь…"
          ref={inputRef}
          // `readOnly` plutôt que `disabled` : un champ désactivé arrête de
          // recevoir les événements clavier/perd le focus. Le focus est
          // ramené ici au mot suivant (effet plus haut), donc plus besoin de
          // `autoFocus` (qui ne s'appliquerait qu'au tout premier rendu).
          readOnly={!!result || verifying}
          className={`field-focus mt-6 w-full rounded-[10px] border border-border bg-bg px-4 py-3 text-center font-display text-2xl text-text outline-none placeholder:text-muted/60 ${
            result || verifying ? "opacity-60" : ""
          }`}
        />

        {result && (
          <div
            className={`mt-4 rounded-xl border p-3 ${
              result === "correct"
                ? "border-success bg-success/10"
                : result === "revealed"
                  ? "border-border bg-bg3"
                  : "border-danger bg-danger/10"
            }`}
          >
            <p className="font-display text-sm font-bold uppercase">
              {result === "correct" ? "✓ Correct" : result === "revealed" ? "Réponse" : "✗ Presque"}
            </p>
            <p className="font-display text-xl font-bold">{answer}</p>
            {expectedIsRussian && (
              <p className="font-display text-sm text-muted">{current.transliteration}</p>
            )}
          </div>
        )}

        {submitError && (
          <p className="mt-4 font-display text-sm text-danger">
            Enregistrement impossible — vérifie ta connexion et réessaie.
          </p>
        )}

        {/* TANT QU'ON N'A PAS RÉPONDU, SEULE LA CONSIGNE SE PRONONCE. Le
            mot attendu est ce qu'on demande d'écrire : l'entendre avant
            reviendrait à le dicter. La règle est celle du mode Voix, où
            « Écouter » soufflait la réponse (voir PROMPT_LANG). */}
        <PronunciationRow
          ru={current.ru}
          fr={current.fr}
          only={result ? undefined : expectedIsRussian ? "fr" : "ru"}
          className="mt-5"
        />

        {/* Entre la correction et « Suivant » : on vient de lire ce qu'il
            fallait écrire, la question suivante est de savoir pourquoi.
            Placer la fiche après « Suivant » l'aurait mise derrière le
            geste qui la fait disparaître. */}
        {result && <ReviewExplanation wordId={current.id} />}

        <button
          ref={nextButtonRef}
          onClick={result ? next : submit}
          disabled={verifying}
          className="btn btn-primary btn-sheen mt-6 h-12 w-full rounded-xl font-display text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {verifying ? "Vérification…" : result ? "Suivant →" : "Vérifier"}
        </button>

        {!result && (
          <button
            onClick={reveal}
            disabled={verifying}
            className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-[10px] border border-border py-2.5 font-display text-sm font-semibold text-muted transition-colors hover:bg-accent2/10 hover:border-accent2/35 hover:text-accent2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <BulbIcon className="h-4 w-4 shrink-0" />
            Je ne sais pas — voir la réponse
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
        </Link>
        {" "}
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
