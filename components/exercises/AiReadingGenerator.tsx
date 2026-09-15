"use client";

import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import { ReadingText } from "@/lib/reading/texts";
import CaseReader from "./CaseReader";
import { LoadingDots, SkeletonLines } from "@/components/ui/Skeleton";
import Select from "@/components/ui/Select";
import {
  annotateReadingText,
  generateReadingText,
  saveReadingText,
  translateReadingText,
  withExplanation,
  type GenerateReadingOptions,
  type SentenceCases,
} from "@/lib/reading/client";
import {
  checkFrenchText,
  checkManualText,
  detectTextLanguage,
  MANUAL_TEXT_MAX_CHARS,
} from "@/lib/reading/manual";
import { CASES_BY_LEARNING_ORDER } from "@/lib/grammar/cases";
import { READING_LEVELS, type CefrLevel } from "@/lib/supabase/types";
import type { ReadingLength, ReadingStyle } from "@/lib/ai/prompts";
import type { CaseId } from "@/lib/grammar/types";
import PaywallNotice from "@/components/ui/PaywallNotice";
import { isQuotaError, type QuotaInfo } from "@/lib/billing/quota-client";

const LENGTH_OPTIONS: { value: ReadingLength; label: string }[] = [
  { value: "short", label: "Court" },
  { value: "medium", label: "Moyen" },
  { value: "long", label: "Long" },
];

const STYLE_OPTIONS: { value: ReadingStyle; label: string }[] = [
  { value: "narrative", label: "Récit" },
  { value: "dialogue", label: "Dialogue" },
  { value: "description", label: "Description" },
];

type Source = "paste" | "generate";

const ICON = "h-5 w-5";

const SOURCES: { value: Source; label: string; hint: string; icon: ReactNode }[] = [
  {
    value: "paste",
    label: "Mon texte",
    hint: "Écris en français, ou colle un texte russe",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={ICON}>
        <path d="M12 20h9" strokeLinecap="round" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    value: "generate",
    label: "Générer un texte",
    hint: "Écrit par l'IA pour travailler un cas",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={ICON}>
        <path d="M11 3l1.8 4.9L17.7 9.7l-4.9 1.8L11 16.4l-1.8-4.9L4.3 9.7l4.9-1.8Z" strokeLinejoin="round" />
        <path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" strokeLinejoin="round" />
      </svg>
    ),
  },
];

const FIELD =
  "w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 font-display text-text field-focus focus:outline-none";

const GHOST =
  "rounded-[10px] cursor-pointer border border-border px-3.5 py-2 font-display text-sm font-semibold text-muted transition-colors hover:text-text";

/**
 * La pause de frappe qui déclenche la traduction. Plus longue que celle du
 * vocabulaire (650 ms) : chaque appel retraduit le texte entier, et chacun
 * se décompte.
 */
const TRANSLATE_DEBOUNCE_MS = 1200;

/**
 * Un collage qui fait au moins cette part du champ est un texte entier — fini,
 * donc à annoter. En deçà, c'est un mot glissé dans un texte qu'on écrit.
 */
const WHOLE_PASTE_SHARE = 0.6;

/** Un clic dans le panneau fait perdre le focus au champ sans quitter le texte. */
const POINTER_INSIDE_MS = 800;

/** Ce qui décide de retraduire : un espace de plus ou une ligne vide en fin de texte ne changent rien. */
function normalizeDraft(text: string): string {
  return text.trim().replace(/[^\S\n]+/g, " ");
}

interface PastedReading {
  text: ReadingText;
  /** Le russe annoté, normalisé : ressortir du champ sans l'avoir changé ne relance rien. */
  from: string;
  titleFr: string | null;
  summaryFr: string | null;
}

/**
 * Un texte à lire, écrit par l'apprenant ou par l'IA.
 *
 * SON PROPRE TEXTE D'ABORD. Il vivait derrière une petite pastille, à côté
 * d'un gros bouton « Générer un texte » : on ne voyait que la génération.
 * Les deux chemins sont deux cartes de même taille, et « Mon texte » est
 * ouvert par défaut, son champ déjà sous les yeux.
 *
 * ÉCRIT EN FRANÇAIS, LU EN RUSSE. Le champ reconnaît la langue à l'alphabet :
 * du russe collé part tel quel ; du français est traduit à chaque pause de
 * frappe, dans un second champ qui se retouche, et c'est cette traduction qui
 * est annotée.
 *
 * ANNOTÉ SANS BOUTON, LÀ OÙ IL A ÉTÉ ÉCRIT. Le texte s'annote dès qu'il est
 * fini : collé en entier, tout de suite ; écrit, quand on quitte le champ (ou
 * Ctrl+Entrée). Le lecteur prend alors la place du champ — rien à faire
 * défiler — et « Modifier » y ramène.
 *
 * PAS À CHAQUE PAUSE DE FRAPPE. C'était le signal le plus naturel, et le plus
 * cher : chaque pause aurait réannoté le texte entier — un texte du quota
 * `reading` et jusqu'à 0,02 $ à chaque fois — pour un texte encore en train
 * de s'écrire. La traduction, elle, suit la frappe : elle coûte cinq fois
 * moins et se décompte ailleurs. Les déclencheurs retenus tombent là où l'on
 * aurait cliqué le bouton qu'ils remplacent, et ne coûtent jamais plus que lui.
 *
 * LU SANS ÊTRE ENREGISTRÉ. Un texte à soi se lit, se devine et s'explique
 * sans rejoindre « Mes textes » ; « Enregistrer » le garde, avec les
 * explications déjà obtenues. Un texte généré, lui, l'est d'office.
 *
 * LE CAS EST LA PREMIÈRE QUESTION DE LA GÉNÉRATION, PLUS UNE OPTION CACHÉE.
 * Il vivait dans le panneau « Options », sous le niveau, la longueur et la
 * forme : le réglage qui fait l'intérêt du module était le dernier qu'on
 * voyait. Il est à découvert ; le reste, qu'on règle une fois, reste replié.
 */
export default function AiReadingGenerator({
  onGenerated,
}: {
  onGenerated?: (id: string) => void;
}) {
  const [source, setSource] = useState<Source>("paste");
  // Séparé des erreurs : un plafond atteint n'est pas une panne et ne doit
  // pas s'afficher en rouge avec « réessayer » — rien ne passera avant
  // demain, ou avant l'abonnement.
  const [blocked, setBlocked] = useState<{ quota: QuotaInfo; message: string; what: string } | null>(null);

  // ─── Générer un texte ───────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<ReadingText | null>(null);
  const [completedTitle, setCompletedTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  // ""= laisser le serveur prendre le niveau du profil, ce qui évite au
  // client d'aller le chercher juste pour préremplir un menu.
  const [level, setLevel] = useState<CefrLevel | "">("");
  const [length, setLength] = useState<ReadingLength>("medium");
  const [style, setStyle] = useState<ReadingStyle>("narrative");
  const [focusCase, setFocusCase] = useState<CaseId | "">("");

  // ─── Mon texte ──────────────────────────────────────────────────
  const [pasted, setPasted] = useState("");
  const [pastedTitle, setPastedTitle] = useState("");
  // La traduction du français, et le français exact dont elle vient : c'est
  // ce couple qui dit si le russe affiché correspond encore à ce qui est écrit.
  const [translation, setTranslation] = useState("");
  const [translatedFrom, setTranslatedFrom] = useState<string | null>(null);
  const [translateError, setTranslateError] = useState<{ draft: string; message: string } | null>(null);
  const [reading, setReading] = useState<PastedReading | null>(null);
  const [editing, setEditing] = useState(true);
  const [annotating, setAnnotating] = useState(false);
  const [annotateError, setAnnotateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const pasteRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const sourcesRef = useRef<HTMLDivElement>(null);
  // Lus au moment d'annoter, qui peut venir d'une réponse de traduction : un
  // état capturé plus tôt y serait périmé.
  const titleRef = useRef("");
  const annotatedFrom = useRef<string | null>(null);
  const annotatingNow = useRef(false);
  // L'annotation attend la traduction : demandée en quittant le champ, ou
  // par un texte français collé en entier.
  const annotateWhenTranslated = useRef(false);
  const wholePaste = useRef(false);
  const pointerInsideAt = useRef(0);
  const translateTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const requestId = useRef(0);

  useEffect(() => {
    const timer = translateTimer;
    return () => clearTimeout(timer.current);
  }, []);

  const language = detectTextLanguage(pasted);
  const writingFrench = language === "fr";
  const draft = normalizeDraft(pasted);
  // Jugés à la frappe, avec les règles du serveur : un texte trop long ou
  // illisible se voit avant d'envoyer, pas après un aller-retour.
  const frenchCheck = draft && language !== "ru" ? checkFrenchText(draft) : null;
  const frenchReady = writingFrench && frenchCheck?.ok === true;
  // Une traduction attendue : la pause de frappe court, ou la réponse est en route.
  const translationPending =
    frenchReady && draft !== translatedFrom && translateError?.draft !== draft;
  // Ce qui part à l'annotation : le russe collé, ou la traduction du français.
  const russian = writingFrench ? translation : pasted;
  const pasteCheck = russian.trim() ? checkManualText(russian) : null;
  const canAnnotate =
    pasteCheck?.ok === true && (!writingFrench || (frenchReady && draft === translatedFrom));

  // ─── Générer ────────────────────────────────────────────────────

  async function generate() {
    const options: GenerateReadingOptions = { length, style };
    if (level) options.level = level;
    if (focusCase) options.focusCase = focusCase;
    setGenerating(true);
    setError(null);
    setBlocked(null);
    setCompletedTitle(null);
    try {
      const { text: received, id } = await generateReadingText(options);
      // L'id validé côté client vaut toujours "ai-generated" (placeholder) —
      // remplacé par le vrai id sauvegardé en base dès qu'on l'a : c'est lui
      // que la fin de texte et les explications de l'IA transmettent.
      setGenerated(id ? { ...received, id } : received);
      if (id) onGenerated?.(id);
    } catch (err) {
      if (isQuotaError(err)) {
        setBlocked({ quota: err.quota, message: err.message, what: "les textes générés" });
      } else if (err instanceof Error && err.message === "Non authentifié") {
        setError("Connecte-toi pour lire un texte personnalisé.");
      } else {
        setError("Génération indisponible pour le moment.");
      }
    } finally {
      setGenerating(false);
    }
  }

  // ─── Mon texte ──────────────────────────────────────────────────

  async function annotate(text: string) {
    const from = normalizeDraft(text);
    if (annotatingNow.current || !checkManualText(text).ok) return;
    // Le russe n'a pas changé depuis la dernière annotation : on y revient, sans appel.
    if (from === annotatedFrom.current) {
      setEditing(false);
      return;
    }
    annotatingNow.current = true;
    setAnnotating(true);
    setAnnotateError(null);
    setBlocked(null);
    try {
      const result = await annotateReadingText({ text, title: titleRef.current.trim() || undefined });
      annotatedFrom.current = from;
      setReading({ text: result.text, from, titleFr: result.titleFr, summaryFr: result.summaryFr });
      setSaveError(null);
      setEditing(false);
    } catch (err) {
      if (isQuotaError(err)) {
        setBlocked({ quota: err.quota, message: err.message, what: "les textes à toi" });
      } else if (err instanceof Error && err.message === "Non authentifié") {
        setAnnotateError("Connecte-toi pour lire un texte à toi.");
      } else {
        // Les refus du serveur sont écrits pour l'apprenant (« Le texte doit
        // être en russe… ») : on les montre tels quels.
        setAnnotateError(
          err instanceof Error && err.message !== "Erreur réseau"
            ? err.message
            : "Annotation indisponible pour le moment.",
        );
      }
    } finally {
      annotatingNow.current = false;
      setAnnotating(false);
    }
  }

  /**
   * NUMÉROTÉE, PAS ANNULÉE — voir components/vocabulary/AddWordForm.tsx, où
   * `AbortController` laissait fuir un `AbortError` jusqu'à l'écran. Une
   * réponse qui n'est plus la dernière attendue est simplement jetée.
   */
  async function translate(french: string) {
    const id = ++requestId.current;
    try {
      const { ru } = await translateReadingText(french);
      if (id !== requestId.current) return;
      setTranslation(ru);
      setTranslatedFrom(french);
      setTranslateError(null);
      setBlocked(null);
      if (annotateWhenTranslated.current) {
        annotateWhenTranslated.current = false;
        void annotate(ru);
      }
    } catch (err) {
      if (id !== requestId.current) return;
      annotateWhenTranslated.current = false;
      if (isQuotaError(err)) {
        setBlocked({ quota: err.quota, message: err.message, what: "la traduction automatique" });
      }
      // Retenu pour CE français : le prochain mot tapé, ou « Réessayer », la relancent.
      setTranslateError({
        draft: french,
        message: isQuotaError(err)
          ? "Traduction automatique en pause."
          : err instanceof Error && err.message !== "Erreur réseau"
            ? err.message
            : "Traduction indisponible pour le moment.",
      });
    }
  }

  function changeDraft(value: string) {
    const whole = wholePaste.current;
    wholePaste.current = false;
    setPasted(value);
    const next = normalizeDraft(value);
    if (next === draft && !whole) return;

    setAnnotateError(null);
    clearTimeout(translateTimer.current);
    requestId.current += 1;
    annotateWhenTranslated.current = false;

    const lang = detectTextLanguage(value);
    if (lang === "ru") {
      // Un texte russe collé en entier est fini : il s'annote tout de suite.
      if (whole) void annotate(value);
      return;
    }
    if (lang !== "fr" || !checkFrenchText(next).ok) return;
    // Un texte français collé en entier est fini aussi : traduit sans
    // attendre la pause, puis annoté dès que la traduction arrive.
    if (whole) annotateWhenTranslated.current = true;
    if (next === translatedFrom) {
      if (whole) {
        annotateWhenTranslated.current = false;
        void annotate(translation);
      }
      return;
    }
    translateTimer.current = setTimeout(() => void translate(next), whole ? 0 : TRANSLATE_DEBOUNCE_MS);
  }

  /** Le texte est fini : champ quitté, ou Ctrl+Entrée. */
  function requestAnnotation() {
    if (writingFrench) {
      if (canAnnotate) void annotate(translation);
      // La traduction n'est pas encore là : l'annotation la suivra.
      else if (translationPending) annotateWhenTranslated.current = true;
      return;
    }
    if (pasteCheck?.ok) void annotate(pasted);
  }

  function leaveText(e: FocusEvent<HTMLDivElement>) {
    const next = e.relatedTarget as Node | null;
    // Vers un autre champ du texte (titre, traduction), vers les cartes, ou
    // un clic ailleurs dans le panneau : on n'a pas quitté le texte.
    if (next && (panelRef.current?.contains(next) || sourcesRef.current?.contains(next))) return;
    if (Date.now() - pointerInsideAt.current < POINTER_INSIDE_MS) return;
    // Changer d'onglet fait aussi perdre le focus : ce n'est pas avoir fini.
    setTimeout(() => {
      if (document.hasFocus()) requestAnnotation();
    }, 0);
  }

  function submitOnCtrlEnter(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      requestAnnotation();
    }
  }

  function editText() {
    setEditing(true);
    requestAnimationFrame(() => pasteRef.current?.focus());
  }

  function newText() {
    clearTimeout(translateTimer.current);
    requestId.current += 1;
    annotateWhenTranslated.current = false;
    annotatedFrom.current = null;
    titleRef.current = "";
    setPasted("");
    setPastedTitle("");
    setTranslation("");
    setTranslatedFrom(null);
    setTranslateError(null);
    setReading(null);
    setAnnotateError(null);
    setSaveError(null);
    setEditing(true);
    requestAnimationFrame(() => pasteRef.current?.focus());
  }

  // Posée sur le texte affiché : enregistré ensuite, il garde l'explication.
  function keepExplanation(sentenceIndex: number, explained: SentenceCases) {
    setReading(
      (current) =>
        current && {
          ...current,
          text: {
            ...current.text,
            sentences: current.text.sentences.map((sentence, i) =>
              i === sentenceIndex ? withExplanation(sentence, explained) : sentence,
            ),
          },
        },
    );
  }

  const pastedSaved = reading !== null && reading.text.id !== "ai-generated";

  async function save() {
    if (!reading || pastedSaved || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { id } = await saveReadingText({
        title: reading.text.title,
        titleFr: reading.titleFr,
        summaryFr: reading.summaryFr,
        level: reading.text.level,
        sentences: reading.text.sentences,
      });
      // L'identifiant change, pas le russe : le lecteur garde ses réponses
      // et ses explications (voir CaseReader), et les suivantes iront en base.
      setReading((current) => current && { ...current, text: { ...current.text, id } });
      onGenerated?.(id);
    } catch (err) {
      setSaveError(
        err instanceof Error && err.message !== "Erreur réseau"
          ? err.message
          : "L'enregistrement a échoué. Réessaie.",
      );
    } finally {
      setSaving(false);
    }
  }

  function chooseSource(next: Source) {
    setSource(next);
    setError(null);
    setBlocked(null);
  }

  const pasting = source === "paste";
  const showTranslation = writingFrench && (translation !== "" || translationPending || !!translateError);

  return (
    <div className="rounded-[20px] border border-dashed border-accent/50 bg-accent/5 p-6">
      <div
        ref={sourcesRef}
        role="radiogroup"
        aria-label="Origine du texte"
        className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        {SOURCES.map((s) => {
          const active = source === s.value;
          return (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => chooseSource(s.value)}
              className={`flex cursor-pointer items-center gap-3.5 rounded-[14px] border p-4 text-left transition-colors ${
                active
                  ? "border-accent bg-bg shadow-float ring-1 ring-accent"
                  : "border-border bg-bg/60 hover:border-accent/50"
              }`}
            >
              <span
                aria-hidden
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] transition-colors ${
                  active ? "bg-accent text-white" : "bg-accent/10 text-accent-ink"
                }`}
              >
                {s.icon}
              </span>
              <span className="min-w-0">
                <span className="block font-display text-base font-bold text-text">{s.label}</span>
                <span className="block font-display text-sm text-muted">{s.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {pasting && reading && !editing && (
        <div className="animate-fade-in">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="rounded-full border border-border px-2.5 py-0.5 font-display text-xs font-semibold text-muted">
                {reading.text.level}
              </span>
              <h4 className="font-display text-xl font-bold">{reading.text.title}</h4>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={editText} className={GHOST}>
                Modifier
              </button>
              <button type="button" onClick={newText} className={GHOST}>
                Nouveau texte
              </button>
              {pastedSaved ? (
                <span className="font-display text-sm font-semibold text-accent-ink">✓ Dans « Mes textes »</span>
              ) : (
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="btn btn-outline rounded-[10px] px-4 py-2 font-display text-sm font-semibold text-text disabled:opacity-60"
                >
                  {saving ? "Enregistrement…" : "Enregistrer dans Mes textes"}
                </button>
              )}
            </div>
          </div>
          {!pastedSaved && (
            <p
              role={saveError ? "alert" : undefined}
              className={`mb-3 font-display text-xs ${saveError ? "text-danger" : "text-muted"}`}
            >
              {saveError ?? "Pas enregistré : ce texte disparaît si tu en annotes un autre ou quittes la page."}
            </p>
          )}
          {/* Jamais refermé à la fin : il est ici à la place du champ, et
              le refermer perdrait un texte peut-être pas enregistré. */}
          <CaseReader text={reading.text} onExplained={keepExplanation} />
        </div>
      )}

      {pasting && (!reading || editing) && (
        <div
          ref={panelRef}
          className="space-y-2.5"
          onBlur={leaveText}
          onFocus={() => {
            // De retour dans le champ : l'annotation qui attendait la traduction n'a plus lieu d'être.
            annotateWhenTranslated.current = false;
          }}
          onPointerDownCapture={() => {
            pointerInsideAt.current = Date.now();
          }}
        >
          <input
            type="text"
            value={pastedTitle}
            onChange={(e) => {
              setPastedTitle(e.target.value);
              titleRef.current = e.target.value;
            }}
            maxLength={80}
            placeholder="Titre (facultatif)"
            aria-label="Titre du texte (facultatif)"
            className={`${FIELD} text-sm`}
          />
          <textarea
            ref={pasteRef}
            value={pasted}
            onChange={(e) => changeDraft(e.target.value)}
            onPaste={(e) => {
              const clip = e.clipboardData.getData("text").trim().length;
              const field = e.currentTarget;
              const kept = field.value.trim().length - (field.selectionEnd - field.selectionStart);
              wholePaste.current = clip > 0 && clip >= (Math.max(kept, 0) + clip) * WHOLE_PASTE_SHARE;
            }}
            onKeyDown={submitOnCtrlEnter}
            readOnly={annotating}
            aria-busy={annotating}
            rows={7}
            lang={language === "ru" ? "ru" : "fr"}
            spellCheck={language !== "ru"}
            placeholder="Écris ici en français — la traduction russe arrive toute seule. Ou colle directement un texte russe."
            aria-label="Ton texte, en français ou en russe"
            aria-describedby="paste-status"
            className={`${FIELD} block resize-y text-base leading-relaxed transition-opacity ${annotating ? "opacity-60" : ""}`}
          />
          <div
            id="paste-status"
            className="flex min-h-5 flex-wrap items-center justify-between gap-x-4 gap-y-1 font-display text-xs"
          >
            {annotating ? (
              <LoadingDots label="Annotation mot à mot…" />
            ) : annotateError ? (
              <span role="alert" className="text-danger">
                {annotateError}
              </span>
            ) : !draft ? (
              <span className="text-muted">
                Colle un texte : il s&apos;annote aussitôt. Écrit, il s&apos;annote quand tu quittes le champ.
              </span>
            ) : language === "ru" ? (
              pasteCheck && !pasteCheck.ok ? (
                <span className="text-danger">{pasteCheck.error}</span>
              ) : (
                <span className="text-muted">
                  {pasteCheck?.ok
                    ? `Russe : ${pasteCheck.words} mots, ${pasteCheck.sentences.length} phrase${pasteCheck.sentences.length > 1 ? "s" : ""}. `
                    : ""}
                  Fini&nbsp;? Quitte le champ (ou Ctrl+Entrée) : il s&apos;annote ici.
                </span>
              )
            ) : frenchCheck && !frenchCheck.ok ? (
              <span className="text-danger">{frenchCheck.error}</span>
            ) : (
              <span className="text-muted">
                Français : traduit en russe ci-dessous. Fini&nbsp;? Quitte le champ : il s&apos;annote ici.
              </span>
            )}
            <span
              className={`tabular-nums ${pasted.trim().length > MANUAL_TEXT_MAX_CHARS ? "text-danger" : "text-muted"}`}
            >
              {pasted.trim().length} / {MANUAL_TEXT_MAX_CHARS}
            </span>
          </div>

          {showTranslation && (
            <div className="animate-fade-in rounded-[14px] surface p-4">
              <div className="mb-2 flex min-h-5 flex-wrap items-center justify-between gap-2">
                <p className="font-display text-xs font-semibold uppercase tracking-wide text-muted">
                  Traduction russe
                </p>
                {translationPending && <LoadingDots label="Traduction…" />}
              </div>
              {translateError && !translationPending && (
                <p role="alert" className="mb-2 font-display text-sm text-danger">
                  {translateError.message}{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setTranslateError(null);
                      void translate(draft);
                    }}
                    className="font-semibold underline underline-offset-2"
                  >
                    Réessayer
                  </button>
                </p>
              )}
              {translation ? (
                <>
                  <textarea
                    value={translation}
                    onChange={(e) => setTranslation(e.target.value)}
                    onKeyDown={submitOnCtrlEnter}
                    readOnly={annotating}
                    rows={6}
                    lang="ru"
                    spellCheck={false}
                    aria-label="Traduction russe, à retoucher si besoin"
                    aria-describedby="translation-status"
                    className={`${FIELD} block resize-y text-base leading-relaxed transition-opacity ${
                      translationPending || annotating ? "opacity-60" : ""
                    }`}
                  />
                  <div
                    id="translation-status"
                    className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 font-display text-xs"
                  >
                    {pasteCheck && !pasteCheck.ok ? (
                      <span className="text-danger">{pasteCheck.error}</span>
                    ) : (
                      <span className="text-muted">
                        {pasteCheck?.ok
                          ? `${pasteCheck.words} mots, ${pasteCheck.sentences.length} phrase${pasteCheck.sentences.length > 1 ? "s" : ""}. `
                          : ""}
                        Tu peux la retoucher avant qu&apos;elle s&apos;annote.
                      </span>
                    )}
                    <span
                      className={`tabular-nums ${translation.trim().length > MANUAL_TEXT_MAX_CHARS ? "text-danger" : "text-muted"}`}
                    >
                      {translation.trim().length} / {MANUAL_TEXT_MAX_CHARS}
                    </span>
                  </div>
                </>
              ) : (
                translationPending && <SkeletonLines lines={3} />
              )}
            </div>
          )}
        </div>
      )}

      {!pasting && (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="font-display text-lg font-bold">Un texte pour travailler un cas</h3>
              <p className="mt-0.5 font-display text-sm text-muted">
                Écrit à ton niveau et annoté mot à mot : chaque phrase s&apos;explique d&apos;un geste.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setOptionsOpen((v) => !v)}
                aria-expanded={optionsOpen}
                className={`rounded-[10px] cursor-pointer border px-4 py-3 font-display text-sm font-semibold transition-colors ${
                  optionsOpen
                    ? "border-accent bg-accent/10 text-accent-ink"
                    : "border-border text-muted hover:text-text"
                }`}
              >
                Options {optionsOpen ? "▲" : "▼"}
              </button>
              <button
                onClick={() => void generate()}
                disabled={generating}
                className="btn btn-primary btn-sheen rounded-[10px] cursor-pointer px-5 py-3 font-display text-sm disabled:opacity-60"
              >
                {generating ? "Génération…" : "Générer un texte"}
              </button>
            </div>
          </div>

          <div className="mt-4">
            <p className="mb-2 font-display text-xs font-semibold uppercase tracking-wide text-muted">
              Cas à travailler
            </p>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Cas à travailler">
              <button
                type="button"
                role="radio"
                aria-checked={focusCase === ""}
                onClick={() => setFocusCase("")}
                className={`rounded-full border px-3 py-1.5 font-display text-xs font-semibold transition-colors ${
                  focusCase === ""
                    ? "border-accent bg-accent/10 text-accent-ink"
                    : "border-border text-muted hover:text-text"
                }`}
              >
                Tous (varié)
              </button>
              {CASES_BY_LEARNING_ORDER.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={focusCase === c.id}
                  onClick={() => setFocusCase(c.id)}
                  className={`rounded-full border px-3 py-1.5 font-display text-xs font-semibold transition-colors ${
                    focusCase === c.id ? "text-white" : "border-border text-muted hover:text-text"
                  }`}
                  style={
                    focusCase === c.id ? { backgroundColor: c.color, borderColor: c.color } : undefined
                  }
                >
                  {c.nameFr}
                </button>
              ))}
            </div>
          </div>

          {optionsOpen && (
            <div className="animate-fade-in mt-5 grid grid-cols-1 gap-4 rounded-[14px] surface p-5 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block font-display text-xs font-semibold uppercase tracking-wide text-muted">
                  Niveau
                </label>
                <Select
                  value={level}
                  onChange={(v) => setLevel(v as CefrLevel | "")}
                  wrapperClassName="w-full"
                  className={`${FIELD} text-sm`}
                  options={[
                    { value: "", label: "Mon niveau" },
                    ...READING_LEVELS.map((l) => ({ value: l, label: l })),
                  ]}
                />
              </div>

              <div>
                <label className="mb-1.5 block font-display text-xs font-semibold uppercase tracking-wide text-muted">
                  Longueur
                </label>
                <div className="flex gap-1.5">
                  {LENGTH_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setLength(opt.value)}
                      className={`flex-1 rounded-[10px] border px-2 py-2.5 font-display text-sm font-semibold transition-colors ${
                        length === opt.value
                          ? "border-accent bg-accent/10 text-accent-ink"
                          : "border-border text-muted hover:text-text"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block font-display text-xs font-semibold uppercase tracking-wide text-muted">
                  Forme
                </label>
                <Select
                  value={style}
                  onChange={(v) => setStyle(v as ReadingStyle)}
                  wrapperClassName="w-full"
                  className={`${FIELD} text-sm`}
                  options={STYLE_OPTIONS}
                />
              </div>
            </div>
          )}
        </>
      )}

      {blocked && (
        <div className="mt-5">
          <PaywallNotice quota={blocked.quota} message={blocked.message} what={blocked.what} />
        </div>
      )}
      {!pasting && error && <p className="mt-4 font-display text-sm text-danger">{error}</p>}

      {!pasting && generating && (
        <div className="mt-6 animate-fade-in">
          <div className="mb-4">
            <LoadingDots label="Rédaction et annotation du texte…" />
          </div>
          <div className="mb-3 flex items-center gap-2">
            <div className="skeleton h-5 w-12 rounded-full" />
            <div className="skeleton h-6 w-48 rounded-lg" />
          </div>
          <div className="rounded-[20px] surface p-8">
            <SkeletonLines lines={6} />
          </div>
        </div>
      )}

      {/* Texte terminé : on referme la lecture au lieu de laisser le pavé
          ouvert sous le générateur. Le texte n'est pas perdu pour autant —
          il a été enregistré à la génération et reste accessible dans
          « Mes textes », ce que la confirmation dit explicitement pour que
          la fermeture ne ressemble pas à une perte. */}
      {!pasting && !generating && !generated && completedTitle && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-accent/40 bg-accent/10 px-5 py-4 animate-fade-in">
          <p className="font-display text-sm text-text">
            <span className="font-semibold text-accent-ink">✓ Texte terminé</span> — «&nbsp;
            {completedTitle}&nbsp;» reste dans « Mes textes » ci-dessous.
          </p>
          <button
            onClick={() => void generate()}
            className="btn btn-primary btn-sheen rounded-[10px] px-4 py-2 font-display text-sm"
          >
            Un autre texte
          </button>
        </div>
      )}

      {!pasting && !generating && generated && (
        <div className="mt-6 animate-fade-in">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="rounded-full border border-border px-2.5 py-0.5 font-display text-xs font-semibold text-muted">
                {generated.level}
              </span>
              <h4 className="font-display text-xl font-bold">{generated.title}</h4>
            </div>
            {generated.id !== "ai-generated" && (
              <span className="font-display text-sm font-semibold text-accent-ink">✓ Dans « Mes textes »</span>
            )}
          </div>
          <CaseReader
            text={generated}
            onCompleted={
              generated.id !== "ai-generated"
                ? () => {
                    setCompletedTitle(generated.title);
                    setGenerated(null);
                  }
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
}
