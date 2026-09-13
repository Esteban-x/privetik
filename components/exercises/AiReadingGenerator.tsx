"use client";

import { useState } from "react";
import { ReadingText } from "@/lib/reading/texts";
import CaseReader from "./CaseReader";
import { LoadingDots, SkeletonLines } from "@/components/ui/Skeleton";
import Select from "@/components/ui/Select";
import { generateReadingText, type GenerateReadingOptions } from "@/lib/reading/client";
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

/**
 * Générer un texte pour travailler un cas.
 *
 * LE CAS EST LA PREMIÈRE QUESTION, PLUS UNE OPTION CACHÉE. Il vivait dans le
 * panneau « Options », sous le niveau, la longueur et la forme : le réglage
 * qui fait l'intérêt du module était le dernier qu'on voyait, et le plus
 * souvent jamais. Il est maintenant à découvert ; le reste, qu'on règle une
 * fois, reste replié.
 */
export default function AiReadingGenerator({
  onGenerated,
}: {
  onGenerated?: (id: string) => void;
}) {
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

  async function generate() {
    setLoading(true);
    setError(null);
    setBlocked(null);
    setCompletedTitle(null);
    try {
      const options: GenerateReadingOptions = { length, style };
      if (level) options.level = level;
      if (focusCase) options.focusCase = focusCase;
      const { text: generated, id } = await generateReadingText(options);
      // L'id validé côté client vaut toujours "ai-generated" (placeholder) —
      // remplacé par le vrai id sauvegardé en base dès qu'on l'a : c'est lui
      // que la fin de texte et les explications de l'IA transmettent.
      setText(id ? { ...generated, id } : generated);
      if (id) onGenerated?.(id);
    } catch (err) {
      if (isQuotaError(err)) {
        setBlocked({ quota: err.quota, message: err.message });
      } else {
        setError(
          err instanceof Error && err.message === "Non authentifié"
            ? "Connecte-toi pour générer un texte personnalisé."
            : "Génération indisponible pour le moment.",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-[20px] border border-dashed border-accent/50 bg-accent/5 p-6">
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
              className="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 font-display text-sm text-text field-focus focus:outline-none"
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
              className="w-full rounded-[10px] border border-border bg-bg px-3 py-2.5 font-display text-sm text-text field-focus focus:outline-none"
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
      {!loading && !text && completedTitle && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-accent/40 bg-accent/10 px-5 py-4 animate-fade-in">
          <p className="font-display text-sm text-text">
            <span className="font-semibold text-accent-ink">✓ Texte terminé</span> — «&nbsp;
            {completedTitle}&nbsp;» reste dans « Mes textes » ci-dessous.
          </p>
          <button
            onClick={generate}
            className="btn btn-primary btn-sheen rounded-[10px] px-4 py-2 font-display text-sm"
          >
            Un autre texte
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
