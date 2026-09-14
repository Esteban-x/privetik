"use client";

import { useRef, useState } from "react";
import { ReadingText } from "@/lib/reading/texts";
import CaseReader from "./CaseReader";
import { LoadingDots, SkeletonLines } from "@/components/ui/Skeleton";
import Select from "@/components/ui/Select";
import {
  annotateReadingText,
  generateReadingText,
  type GenerateReadingOptions,
} from "@/lib/reading/client";
import { checkManualText, MANUAL_TEXT_MAX_CHARS } from "@/lib/reading/manual";
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

type Source = "generate" | "paste";

const SOURCES: { value: Source; label: string }[] = [
  { value: "generate", label: "Générer un texte" },
  { value: "paste", label: "Coller mon texte" },
];

const FIELD =
  "w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 font-display text-text field-focus focus:outline-none";

/**
 * Un texte à lire, écrit par l'IA ou collé par l'apprenant.
 *
 * LE CAS EST LA PREMIÈRE QUESTION, PLUS UNE OPTION CACHÉE. Il vivait dans le
 * panneau « Options », sous le niveau, la longueur et la forme : le réglage
 * qui fait l'intérêt du module était le dernier qu'on voyait, et le plus
 * souvent jamais. Il est maintenant à découvert ; le reste, qu'on règle une
 * fois, reste replié.
 *
 * UN TEXTE À SOI. Ce qu'on a envie de lire — un article, une chanson, le
 * message d'un ami — ne sort pas d'un générateur. Collé ici, il est annoté mot
 * à mot, puis lu, deviné et expliqué exactement comme les autres. Les deux
 * chemins partagent la suite : chargement, plafond, lecture et « Mes textes ».
 */
export default function AiReadingGenerator({
  onGenerated,
}: {
  onGenerated?: (id: string) => void;
}) {
  const [source, setSource] = useState<Source>("generate");
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
  // Jugé à la frappe, avec la règle du serveur : un texte trop long ou en
  // latin se voit avant d'envoyer, pas après un aller-retour.
  const pasteCheck = pasted.trim() ? checkManualText(pasted) : null;

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
    if (!pasteCheck?.ok) return;
    const done = await run(
      () => annotateReadingText({ text: pasted, title: pastedTitle.trim() || undefined }),
      // Les refus du serveur sont écrits pour l'apprenant (« Le texte doit
      // être en russe… ») : on les montre tels quels.
      (err) =>
        err instanceof Error && err.message !== "Erreur réseau"
          ? err.message
          : "Annotation indisponible pour le moment.",
    );
    // Le texte est enregistré dans « Mes textes » : le champ se vide pour le suivant.
    if (done) {
      setPasted("");
      setPastedTitle("");
    }
  }

  function chooseSource(next: Source) {
    setSource(next);
    setError(null);
    setBlocked(null);
  }

  const pasting = source === "paste";

  return (
    <div className="rounded-[20px] border border-dashed border-accent/50 bg-accent/5 p-6">
      <div
        role="radiogroup"
        aria-label="Origine du texte"
        className="mb-5 inline-flex rounded-full border border-border bg-bg p-1"
      >
        {SOURCES.map((s) => (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={source === s.value}
            onClick={() => chooseSource(s.value)}
            className={`rounded-full px-3.5 py-1.5 font-display text-xs font-semibold transition-colors ${
              source === s.value ? "bg-accent text-white" : "text-muted hover:text-text"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-bold">
            {pasting ? "Ton propre texte" : "Un texte pour travailler un cas"}
          </h3>
          <p className="mt-0.5 font-display text-sm text-muted">
            {pasting
              ? "Un article, une chanson, un message : chaque mot est annoté, comme dans les autres textes."
              : "Écrit à ton niveau et annoté mot à mot : chaque phrase s'explique d'un geste."}
          </p>
        </div>
        {pasting ? (
          <button
            onClick={annotate}
            disabled={loading || !pasteCheck?.ok}
            className="btn btn-primary btn-sheen rounded-[10px] cursor-pointer px-5 py-3 font-display text-sm disabled:cursor-default disabled:opacity-60"
          >
            {loading ? "Annotation…" : "Annoter le texte"}
          </button>
        ) : (
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
        )}
      </div>

      {pasting ? (
        <div className="mt-4 space-y-2.5">
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
            lang="ru"
            spellCheck={false}
            placeholder="Вставь сюда текст на русском…"
            aria-label="Texte russe à annoter"
            aria-describedby="paste-status"
            className={`${FIELD} block resize-y text-base leading-relaxed`}
          />
          <div
            id="paste-status"
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 font-display text-xs"
          >
            {pasteCheck && !pasteCheck.ok ? (
              <span className="text-danger">{pasteCheck.error}</span>
            ) : (
              <span className="text-muted">
                {pasteCheck?.ok
                  ? `${pasteCheck.words} mots, ${pasteCheck.sentences.length} phrase${pasteCheck.sentences.length > 1 ? "s" : ""}. `
                  : ""}
                Compte comme un texte généré.
              </span>
            )}
            <span
              className={`tabular-nums ${pasted.trim().length > MANUAL_TEXT_MAX_CHARS ? "text-danger" : "text-muted"}`}
            >
              {pasted.trim().length} / {MANUAL_TEXT_MAX_CHARS}
            </span>
          </div>
        </div>
      ) : (
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
      )}

      {!pasting && optionsOpen && (
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

      {blocked && (
        <div className="mt-5">
          <PaywallNotice
            quota={blocked.quota}
            message={blocked.message}
            what="les textes générés"
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
            {pasting ? "Coller un autre texte" : "Un autre texte"}
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
