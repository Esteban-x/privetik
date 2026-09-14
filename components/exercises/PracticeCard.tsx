"use client";

import { useEffect, useState } from "react";
import PaywallNotice from "@/components/ui/PaywallNotice";
import SpeakButton from "@/components/vocabulary/SpeakButton";
import { BulbIcon } from "@/components/ui/icons";
import { speakRu } from "@/lib/vocabulary/speech";
import { RETRY_GAP } from "@/lib/practice/retry";
import { loadAnswerMode, saveAnswerMode, type AnswerMode } from "@/lib/storage";
import type {
  ChoiceExercise,
  PracticeSession,
  SessionFeedback,
} from "@/lib/practice/use-practice-session";
import SeriesRecap from "./SeriesRecap";

/**
 * La carte d'entraînement des modules à choix : l'en-tête, la question que le
 * module dessine, les options ou le champ, le verdict, le bilan.
 *
 * Tout ce qui s'y affiche vient de `usePracticeSession`. Le module ne fournit
 * que `renderQuestion` — un schéma de trajectoire, une timeline, une
 * proposition dépliée — c'est-à-dire ce qui relève de sa matière.
 */
export default function PracticeCard<T extends ChoiceExercise>({
  title,
  color,
  session,
  paywallWhat,
  renderQuestion,
  spoken,
  answerMode = "choice",
  toolbar,
  singleColumn = false,
  compactOptions = false,
  skeleton,
  empty,
  recapFooter,
  showErrorsLink = true,
  tint,
}: {
  title: string;
  /** Couleur du bandeau — ou un dégradé CSS complet (« Cas mélangés »). */
  color: string;
  /**
   * « mix » : le champ et le bouton prennent le dégradé des six cas
   * (`.field-mix`, `.btn-mix`), sous un parent `.mix-tint` qui pose les
   * variables — voir lib/grammar/case-mix-style.ts.
   */
  tint?: "mix";
  session: PracticeSession<T>;
  /** « les exercices d'aspect » : ce que l'écran d'abonnement dit bloqué. */
  paywallWhat: string;
  renderQuestion: (exercise: T) => React.ReactNode;
  /** La phrase russe à faire écouter une fois la réponse donnée. */
  spoken?: (exercise: T) => string | null;
  /** Un mode pour toute la carte, ou exercice par exercice (« Mes erreurs » mêle les deux). */
  answerMode?: AnswerMode | ((exercise: T) => AnswerMode);
  toolbar?: React.ReactNode;
  /** Options sur une colonne, alignées à gauche : des phrases entières. */
  singleColumn?: boolean;
  compactOptions?: boolean;
  skeleton?: React.ReactNode;
  /** Ce qu'on montre quand la source n'a rien à servir. */
  empty?: React.ReactNode;
  recapFooter?: React.ReactNode;
  /** Faux sur « Mes erreurs », qui ne renvoie pas vers elle-même. */
  showErrorsLink?: boolean;
}) {
  if (session.blocked) {
    return (
      <PaywallNotice quota={session.blocked.quota} message={session.blocked.message} what={paywallWhat} />
    );
  }

  const { exercise, feedback } = session;
  const mode: AnswerMode =
    typeof answerMode === "function" ? (exercise ? answerMode(exercise) : "choice") : answerMode;
  const progress = Math.min(session.answered, session.seriesLength);
  const endOfSeries = !session.isRetry && session.answered >= session.seriesLength;

  return (
    <div className="overflow-hidden rounded-[20px] surface shadow-float">
      <div
        className="relative flex items-center justify-between gap-3 px-5 py-3 text-white sm:px-6 sm:py-3.5"
        style={{ background: color }}
      >
        <span className="min-w-0 truncate font-display text-[13px] font-semibold uppercase tracking-wide sm:text-sm">
          {title}
        </span>
        <span className="shrink-0 font-display text-xs font-bold">
          {progress}/{session.seriesLength} · Série : {session.streak}
          {session.accuracy !== null ? ` · ${session.accuracy}%` : ""}
        </span>
        {/* L'avancement dans la série de dix : un trait, pas un chiffre de
            plus à lire. */}
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[3px] origin-left bg-white/60 transition-transform duration-300"
          style={{ transform: `scaleX(${progress / session.seriesLength})` }}
        />
      </div>

      <div className="p-5 sm:p-7">
        {toolbar}

        {session.showRecap ? (
          <SeriesRecap
            correct={session.firstTryCorrect}
            total={session.answered}
            misses={session.misses}
            pending={session.pendingRetries}
            exhausted={session.exhausted}
            onContinue={session.continueSeries}
            onRedo={session.redoMisses}
            footer={recapFooter}
            showErrorsLink={showErrorsLink}
          />
        ) : !exercise ? (
          session.exhausted ? (
            empty
          ) : (
            (skeleton ?? <DefaultSkeleton />)
          )
        ) : (
          <div key={session.round} className="animate-fade-in">
            {session.isRetry && (
              <p className="mb-3 inline-flex items-center rounded-full border border-accent2/40 bg-accent2/10 px-3 py-1 font-display text-xs font-semibold text-accent2">
                À refaire — tu l&apos;as manqué il y a quelques exercices
              </p>
            )}

            {renderQuestion(exercise)}

            {mode === "typing" ? (
              <TypedAnswer
                done={Boolean(feedback)}
                checking={session.checking}
                verdict={feedback ? (feedback.correct ? "correct" : "wrong") : null}
                onSubmit={(value) => session.answer(value, true)}
                onReveal={session.reveal}
                numeric={session.exercise?.options.every((option) => /^\d+$/.test(option)) ?? false}
                tint={tint}
              />
            ) : (
              <ChoiceOptions
                options={exercise.options}
                correctIndex={exercise.correctIndex}
                picked={session.picked}
                revealed={Boolean(feedback)}
                disabled={Boolean(feedback) || session.checking}
                onPick={(option) => session.answer(option)}
                singleColumn={singleColumn}
                compact={compactOptions}
              />
            )}

            {feedback && (
              <PracticeFeedback
                feedback={feedback}
                picked={session.picked}
                answer={exercise.options[exercise.correctIndex]}
                typed={mode === "typing"}
                spoken={spoken?.(exercise) ?? null}
                onNext={session.next}
                nextLabel={endOfSeries ? "Voir le bilan →" : "Suivant →"}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DefaultSkeleton() {
  return (
    <div className="animate-fade-in space-y-4">
      <div className="skeleton h-4 w-40 rounded-full" />
      <div className="skeleton h-8 w-4/5 rounded-lg" />
      <div className="skeleton h-5 w-2/3 rounded-lg" />
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-[50px] rounded-[10px]" />
        ))}
      </div>
    </div>
  );
}

export function ChoiceOptions({
  options,
  correctIndex,
  picked,
  revealed,
  disabled,
  onPick,
  singleColumn = false,
  compact = false,
}: {
  options: string[];
  correctIndex: number;
  picked: string | null;
  revealed: boolean;
  disabled: boolean;
  onPick: (option: string) => void;
  singleColumn?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`mt-6 grid gap-2.5 ${singleColumn ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
      {options.map((option) => {
        const isAnswer = revealed && option === options[correctIndex];
        const isWrongPick = revealed && option === picked && option !== options[correctIndex];
        return (
          <button
            key={option}
            type="button"
            onClick={() => onPick(option)}
            disabled={disabled}
            className={`rounded-[10px] border px-4 py-3 font-display font-semibold transition-colors duration-200 ${
              singleColumn ? "text-left" : ""
            } ${compact ? "text-base" : "text-lg"} ${
              isAnswer
                ? "border-success bg-success/10 text-success"
                : isWrongPick
                  ? "border-danger bg-danger/10 text-danger"
                  : "border-border bg-bg text-text hover:border-accent/35 hover:bg-accent/10"
            } disabled:cursor-default`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Écrire la forme au lieu de la reconnaître.
 *
 * Reconnaître « чита́ешь » parmi quatre boutons et le produire sont deux
 * compétences : la première se contente d'un souvenir vague, la seconde
 * exige la forme entière — et c'est elle qu'on emploie en parlant.
 */
function TypedAnswer({
  done,
  checking,
  verdict,
  onSubmit,
  onReveal,
  numeric = false,
  tint,
}: {
  done: boolean;
  checking: boolean;
  verdict: "correct" | "wrong" | null;
  onSubmit: (value: string) => void;
  onReveal: () => void;
  /** La réponse est un nombre en chiffres (nombres à l'oreille), pas du russe. */
  numeric?: boolean;
  tint?: "mix";
}) {
  const [value, setValue] = useState("");
  const ready = value.trim().length > 0 && !checking && !done;

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && ready) onSubmit(value);
          }}
          readOnly={done || checking}
          placeholder={numeric ? "Écris le nombre en chiffres…" : "Écris la réponse en russe…"}
          aria-label={numeric ? "Ta réponse, en chiffres" : "Ta réponse, en russe"}
          lang={numeric ? undefined : "ru"}
          inputMode={numeric ? "numeric" : undefined}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          autoFocus
          // Le dégradé du mélange s'efface devant le verdict : `.field-mix`
          // peint sa bordure, et le vert ou le rouge de la correction ne se
          // verraient plus.
          className={`field-focus flex-1 rounded-[10px] border bg-bg px-4 py-3 font-display text-lg text-text outline-none placeholder:text-muted/60 ${
            verdict === "correct"
              ? "border-success"
              : verdict === "wrong"
                ? "border-danger"
                : tint === "mix"
                  ? "field-mix"
                  : "border-border"
          }`}
        />
        {!done && (
          <button
            type="button"
            onClick={() => onSubmit(value)}
            disabled={!ready}
            className={`btn btn-primary ${tint === "mix" ? "btn-mix" : ""} btn-sheen rounded-[10px] px-6 py-3 font-display text-sm disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {checking ? "Vérification…" : "Vérifier"}
          </button>
        )}
      </div>
      {!done && (
        <button
          type="button"
          onClick={onReveal}
          disabled={checking}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-[10px] border border-border py-2.5 font-display text-sm font-semibold text-muted transition-colors hover:border-accent2/35 hover:bg-accent2/10 hover:text-accent2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <BulbIcon className="h-4 w-4 shrink-0" />
          Je ne sais pas — voir la réponse
        </button>
      )}
    </div>
  );
}

function PracticeFeedback({
  feedback,
  picked,
  answer,
  typed,
  spoken,
  onNext,
  nextLabel,
}: {
  feedback: SessionFeedback;
  picked: string | null;
  answer: string;
  typed: boolean;
  spoken: string | null;
  onNext: () => void;
  nextLabel: string;
}) {
  // « Je ne sais pas » : la réponse est montrée sans le rouge d'une faute.
  const revealedOnly = !feedback.correct && !picked;
  const tone = feedback.correct
    ? "border-success bg-success/10"
    : revealedOnly
      ? "border-border bg-bg3"
      : "border-danger bg-danger/10";

  return (
    <>
      <div className={`mt-5 animate-fade-in rounded-xl border p-4 ${tone}`} role="status">
        <p className="font-display text-sm font-bold uppercase tracking-wide">
          {feedback.correct ? "✓ Correct" : revealedOnly ? "Réponse" : "✗ Pas tout à fait"}
        </p>
        {typed && !feedback.correct && (
          <p className="mt-1 font-display text-xl font-bold">{answer}</p>
        )}
        {/* CE QUE LA RÉPONSE CHOISIE EST. La correction disait la bonne
            réponse et sa règle ; elle dit maintenant aussi ce qu'on vient de
            choisir — la forme d'une autre personne, l'heure d'avant — parce
            que c'est la confusion qu'il faut défaire. */}
        {feedback.note &&
          picked &&
          // Deux formes de note : le fragment d'un leurre (« forme de
          // « ты » »), qu'on accroche à la réponse choisie, et la phrase
          // entière d'un diagnostic, qui nomme déjà la réponse elle-même.
          (/[.!?]$/.test(feedback.note) ? (
            <p className="mt-2 font-display text-sm leading-relaxed text-text">{feedback.note}</p>
          ) : (
            <p className="mt-2 font-display text-sm leading-relaxed text-text">
              <span className="font-semibold">« {picked} »</span> : {feedback.note}.
            </p>
          ))}
        <p className="mt-1 font-display text-sm leading-relaxed text-muted">{feedback.reason}</p>
        {feedback.retry && feedback.correct && (
          <p className="mt-2 font-display text-xs leading-relaxed text-muted">
            Rattrapé. Un rattrapage est corrigé ici, sans compter dans ta progression.
          </p>
        )}
        {!feedback.correct && (
          <p className="mt-2 font-display text-xs leading-relaxed text-muted">
            {feedback.willReturn
              ? feedback.retry
                ? `Encore manqué : il reviendra dans ${RETRY_GAP} exercices.`
                : `Il reviendra dans ${RETRY_GAP} exercices, pour que tu retrouves la réponse toi-même.`
              : "Encore manqué : il reste dans le bilan de la série, pour y revenir à tête reposée."}
          </p>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onNext}
          autoFocus
          className="btn btn-primary btn-sheen rounded-[10px] px-6 py-3 font-display text-sm"
        >
          {nextLabel}
        </button>
        {spoken && (
          <SpeakButton
            text="Écouter"
            label="Écouter la phrase en russe"
            title="Écouter la phrase"
            onSpeak={() => speakRu(spoken)}
          />
        )}
      </div>
    </>
  );
}

/**
 * Choisir ou écrire. La préférence est gardée par module sur l'appareil, et
 * lue APRÈS le montage : lue au rendu initial, elle donnerait au serveur et
 * au client deux écrans différents.
 */
export function useAnswerMode(scope: string): [AnswerMode, (mode: AnswerMode) => void] {
  const [mode, setMode] = useState<AnswerMode>("choice");
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setMode(loadAnswerMode(scope));
    });
    return () => {
      cancelled = true;
    };
  }, [scope]);
  return [
    mode,
    (next) => {
      setMode(next);
      saveAnswerMode(scope, next);
    },
  ];
}

export function AnswerModeToggle({
  mode,
  onChange,
}: {
  mode: AnswerMode;
  onChange: (mode: AnswerMode) => void;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <div
        role="radiogroup"
        aria-label="Façon de répondre"
        className="inline-flex rounded-full border border-border bg-bg p-1"
      >
        {(["choice", "typing"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => onChange(m)}
            className={`rounded-full px-3.5 py-1.5 font-display text-xs font-semibold transition-colors ${
              mode === m ? "bg-accent text-white" : "text-muted hover:text-text"
            }`}
          >
            {m === "choice" ? "Choisir" : "Écrire"}
          </button>
        ))}
      </div>
      <span className="font-display text-xs text-muted">
        {mode === "typing"
          ? "Tu écris la forme entière — l'accent et le ё ne sont pas exigés."
          : "Écrire la forme la retient mieux que la reconnaître."}
      </span>
    </div>
  );
}

/** L'énoncé d'un exercice pour le bilan, trou marqué d'une ellipse. */
export function describeSentence(sentence: string | undefined, gloss?: string): string {
  const text = sentence ? sentence.replace("___", "…") : "";
  return [text, gloss].filter(Boolean).join(" — ");
}
