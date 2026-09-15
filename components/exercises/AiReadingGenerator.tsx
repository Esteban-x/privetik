"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ReadingText } from "@/lib/reading/texts";
import CaseReader from "./CaseReader";
import { LoadingDots, SkeletonLines } from "@/components/ui/Skeleton";
import Select from "@/components/ui/Select";
import {
  annotateReadingText,
  generateReadingText,
  translateReadingText,
  type GenerateReadingOptions,
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

/**
 * La pause de frappe qui déclenche la traduction. Plus longue que celle du
 * vocabulaire (650 ms) : chaque appel retraduit le texte entier, et chacun
 * se décompte.
 */
const TRANSLATE_DEBOUNCE_MS = 1200;

/** Ce qui décide de retraduire : un espace de plus ou une ligne vide en fin de texte ne changent rien. */
function normalizeDraft(text: string): string {
  return text.trim().replace(/[^\S\n]+/g, " ");
}

/**
 * Un texte à lire, écrit par l'apprenant ou par l'IA.
 *
 * SON PROPRE TEXTE D'ABORD. Il vivait derrière une petite pastille, à côté
 * d'un gros bouton « Générer un texte » : on ne voyait que la génération.
 * Les deux chemins sont maintenant deux cartes de même taille, et « Mon
 * texte » est ouvert par défaut, son champ déjà sous les yeux.
 *
 * ÉCRIT EN FRANÇAIS, LU EN RUSSE. Ce qu'on a envie de lire — ce qu'on a fait
 * ce week-end, un message à écrire — on ne sait pas encore l'écrire en russe.
 * Le champ reconnaît la langue à l'alphabet : du russe collé part tel quel ;
 * du français est traduit à chaque pause de frappe, dans un second champ qui
 * se retouche, et c'est cette traduction qui est annotée.
 *
 * LE CAS EST LA PREMIÈRE QUESTION DE LA GÉNÉRATION, PLUS UNE OPTION CACHÉE.
 * Il vivait dans le panneau « Options », sous le niveau, la longueur et la
 * forme : le réglage qui fait l'intérêt du module était le dernier qu'on
 * voyait. Il est à découvert ; le reste, qu'on règle une fois, reste replié.
 *
 * Les deux chemins partagent la suite : chargement, plafond, lecture et
 * « Mes textes ».
 */
export default function AiReadingGenerator({
  onGenerated,
}: {
  onGenerated?: (id: string) => void;
}) {
  const [source, setSource] = useState<Source>("paste");
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<ReadingText | null>(null);
  const [completedTitle, setCompletedTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Séparé de `error` : un plafond atteint n'est pas une panne et ne doit
  // pas s'afficher en rouge avec « réessayer » — rien ne passera avant
  // demain, ou avant l'abonnement.
  const [blocked, setBlocked] = useState<{ quota: QuotaInfo; message: string } | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);

  // ""= laisser le serveur prendre le niveau du profil, ce qui évite au
  // client d'aller le chercher juste pour préremplir un menu.
  const [level, setLevel] = useState<CefrLevel | "">("");
  const [length, setLength] = useState<ReadingLength>("medium");
  const [style, setStyle] = useState<ReadingStyle>("narrative");
  const [focusCase, setFocusCase] = useState<CaseId | "">("");

  const [pasted, setPasted] = useState("");
  const [pastedTitle, setPastedTitle] = useState("");
  const pasteRef = useRef<HTMLTextAreaElement>(null);

  // La traduction du français, et le français exact dont elle vient : c'est
  // ce couple qui dit si le russe affiché correspond encore à ce qui est écrit.
  const [translation, setTranslation] = useState("");
  const [translatedFrom, setTranslatedFrom] = useState<string | null>(null);
  const [translateError, setTranslateError] = useState<{ draft: string; message: string } | null>(null);
  const requestId = useRef(0);

  const language = detectTextLanguage(pasted);
  const writingFrench = language === "fr";
  const draft = normalizeDraft(pasted);
  // Jugés à la frappe, avec les règles du serveur : un texte trop long ou
  // illisible se voit avant d'envoyer, pas après un aller-retour.
  const frenchCheck = draft && language !== "ru" ? checkFrenchText(draft) : null;
  const frenchReady = writingFrench && frenchCheck?.ok === true;
  const failedDraft = translateError?.draft ?? null;
  // Une traduction attendue : la pause de frappe court, ou la réponse est en route.
  const translationPending = frenchReady && draft !== translatedFrom && failedDraft !== draft;
  // Ce qui part à l'annotation : le russe collé, ou la traduction du français.
  const russian = writingFrench ? translation : pasted;
  const pasteCheck = russian.trim() ? checkManualText(russian) : null;
  const canAnnotate =
    pasteCheck?.ok === true && (!writingFrench || (frenchReady && draft === translatedFrom));

  useEffect(() => {
    if (!frenchReady || draft === translatedFrom || draft === failedDraft) return;

    // NUMÉROTÉE, PAS ANNULÉE — voir components/vocabulary/AddWordForm.tsx,
    // où `AbortController` laissait fuir un `AbortError` jusqu'à l'écran.
    // Une réponse qui n'est plus la dernière attendue est simplement jetée.
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      try {
        const { ru } = await translateReadingText(draft);
        if (id !== requestId.current) return;
        setTranslation(ru);
        setTranslatedFrom(draft);
        setTranslateError(null);
        setBlocked(null);
      } catch (err) {
        if (id !== requestId.current) return;
        if (isQuotaError(err)) {
          setBlocked({ quota: err.quota, message: err.message });
        }
        // Retenu pour CE français : sans cela, l'effet reprendrait aussitôt
        // et relancerait en boucle une demande qui vient d'échouer. Le
        // prochain mot tapé, ou « Réessayer », la relancent.
        setTranslateError({
          draft,
          message: isQuotaError(err)
            ? "Traduction automatique en pause."
            : err instanceof Error && err.message !== "Erreur réseau"
              ? err.message
              : "Traduction indisponible pour le moment.",
        });
      }
    }, TRANSLATE_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      requestId.current += 1;
    };
  }, [frenchReady, draft, translatedFrom, failedDraft]);

  async function run(
    request: () => Promise<{ text: ReadingText; id: string | null }>,
    describe: (err: unknown) => string,
  ): Promise<boolean> {
    setLoading(true);
    setError(null);
    setBlocked(null);
    setCompletedTitle(null);
    try {
      const { text: received, id } = await request();
      // L'id validé côté client vaut toujours "ai-generated" (placeholder) —
      // remplacé par le vrai id sauvegardé en base dès qu'on l'a : c'est lui
      // que la fin de texte et les explications de l'IA transmettent.
      setText(id ? { ...received, id } : received);
      if (id) onGenerated?.(id);
      return true;
    } catch (err) {
      if (isQuotaError(err)) {
        setBlocked({ quota: err.quota, message: err.message });
      } else if (err instanceof Error && err.message === "Non authentifié") {
        setError("Connecte-toi pour lire un texte personnalisé.");
      } else {
        setError(describe(err));
      }
      return false;
    } finally {
      setLoading(false);
    }
  }

  function generate() {
    const options: GenerateReadingOptions = { length, style };
    if (level) options.level = level;
    if (focusCase) options.focusCase = focusCase;
    void run(
      () => generateReadingText(options),
      () => "Génération indisponible pour le moment.",
    );
  }

  async function annotate() {
    if (!canAnnotate) return;
    const done = await run(
      () => annotateReadingText({ text: russian, title: pastedTitle.trim() || undefined }),
      // Les refus du serveur sont écrits pour l'apprenant (« Le texte doit
      // être en russe… ») : on les montre tels quels.
      (err) =>
        err instanceof Error && err.message !== "Erreur réseau"
          ? err.message
          : "Annotation indisponible pour le moment.",
    );
    // Le texte est enregistré dans « Mes textes » : les champs se vident pour le suivant.
    if (done) {
      setPasted("");
      setPastedTitle("");
      setTranslation("");
      setTranslatedFrom(null);
      setTranslateError(null);
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

      {pasting ? (
        <div className="space-y-2.5">
          <input
            type="text"
            value={pastedTitle}
            onChange={(e) => setPastedTitle(e.target.value)}
            maxLength={80}
            placeholder="Titre (facultatif)"
            aria-label="Titre du texte (facultatif)"
            className={`${FIELD} text-sm`}
          />
          <textarea
            ref={pasteRef}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={7}
            lang={language === "ru" ? "ru" : "fr"}
            spellCheck={language !== "ru"}
            placeholder="Écris ici en français — la traduction russe arrive toute seule. Ou colle directement un texte russe."
            aria-label="Ton texte, en français ou en russe"
            aria-describedby="paste-status"
            className={`${FIELD} block resize-y text-base leading-relaxed`}
          />
          <div
            id="paste-status"
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 font-display text-xs"
          >
            {!draft ? (
              <span className="text-muted">Compte comme un texte généré.</span>
            ) : language === "ru" ? (
              pasteCheck && !pasteCheck.ok ? (
                <span className="text-danger">{pasteCheck.error}</span>
              ) : (
                <span className="text-muted">
                  {pasteCheck?.ok
                    ? `Russe : ${pasteCheck.words} mots, ${pasteCheck.sentences.length} phrase${pasteCheck.sentences.length > 1 ? "s" : ""}. `
                    : ""}
                  Compte comme un texte généré.
                </span>
              )
            ) : frenchCheck && !frenchCheck.ok ? (
              <span className="text-danger">{frenchCheck.error}</span>
            ) : (
              <span className="text-muted">Français : traduit en russe ci-dessous.</span>
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
                    onClick={() => setTranslateError(null)}
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
                    rows={6}
                    lang="ru"
                    spellCheck={false}
                    aria-label="Traduction russe, à retoucher si besoin"
                    aria-describedby="translation-status"
                    className={`${FIELD} block resize-y text-base leading-relaxed transition-opacity ${
                      translationPending ? "opacity-60" : ""
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
                        Tu peux la retoucher avant d&apos;annoter.
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

          <div className="flex justify-end pt-1.5">
            <button
              onClick={annotate}
              disabled={loading || !canAnnotate}
              className="btn btn-primary btn-sheen rounded-[10px] cursor-pointer px-5 py-3 font-display text-sm disabled:cursor-default disabled:opacity-60"
            >
              {loading ? "Annotation…" : writingFrench ? "Annoter la traduction" : "Annoter le texte"}
            </button>
          </div>
        </div>
      ) : (
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
                onClick={generate}
                disabled={loading}
                className="btn btn-primary btn-sheen rounded-[10px] cursor-pointer px-5 py-3 font-display text-sm disabled:opacity-60"
              >
                {loading ? "Génération…" : "Générer un texte"}
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
          <PaywallNotice
            quota={blocked.quota}
            message={blocked.message}
            what={pasting ? "la traduction et les textes à toi" : "les textes générés"}
          />
        </div>
      )}
      {error && <p className="mt-4 font-display text-sm text-danger">{error}</p>}

      {loading && (
        <div className="mt-6 animate-fade-in">
          <div className="mb-4">
            <LoadingDots
              label={pasting ? "Annotation du texte, mot à mot…" : "Rédaction et annotation du texte…"}
            />
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
      {!loading && !text && completedTitle && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-accent/40 bg-accent/10 px-5 py-4 animate-fade-in">
          <p className="font-display text-sm text-text">
            <span className="font-semibold text-accent-ink">✓ Texte terminé</span> — «&nbsp;
            {completedTitle}&nbsp;» reste dans « Mes textes » ci-dessous.
          </p>
          <button
            onClick={() => {
              if (!pasting) return generate();
              setCompletedTitle(null);
              pasteRef.current?.focus();
            }}
            className="btn btn-primary btn-sheen rounded-[10px] px-4 py-2 font-display text-sm"
          >
            {pasting ? "Écrire un autre texte" : "Un autre texte"}
          </button>
        </div>
      )}

      {!loading && text && (
        <div className="mt-6 animate-fade-in">
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-full border border-border px-2.5 py-0.5 font-display text-xs font-semibold text-muted">
              {text.level}
            </span>
            <h4 className="font-display text-xl font-bold">{text.title}</h4>
          </div>
          <CaseReader
            text={text}
            onCompleted={() => {
              setCompletedTitle(text.title);
              setText(null);
            }}
          />
        </div>
      )}
    </div>
  );
}
