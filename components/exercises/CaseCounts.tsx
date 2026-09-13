import { CASES } from "@/lib/grammar/cases";
import type { CaseId } from "@/lib/grammar/types";

const SHORT: Record<CaseId, string> = {
  nominative: "Nom.",
  genitive: "Gén.",
  dative: "Dat.",
  accusative: "Acc.",
  instrumental: "Instr.",
  prepositional: "Prép.",
};

/**
 * Les cas qu'un texte travaille, comptés, sur sa carte.
 *
 * Six pastilles de couleur sans chiffre disaient seulement « ce texte est
 * annoté ». Le compte dit ce qu'on vient y chercher : un texte à neuf
 * génitifs et un texte à un seul ne s'ouvrent pas pour la même raison.
 */
export default function CaseCounts({
  counts,
  className = "mt-3",
}: {
  counts: Partial<Record<CaseId, number>>;
  className?: string;
}) {
  const present = CASES.filter((c) => counts[c.id]);
  if (present.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-x-3 gap-y-1 ${className}`}>
      {present.map((c) => (
        <span
          key={c.id}
          title={`${counts[c.id]} ${/^[aeiouy]/i.test(c.nameFr) ? "à l'" : "au "}${c.nameFr.toLowerCase()}`}
          className="inline-flex items-center gap-1 font-display text-[11px] text-muted"
        >
          <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
          <span aria-hidden>{SHORT[c.id]}</span>
          <span className="sr-only">{c.nameFr}</span>
          <span className="font-semibold text-text/80">{counts[c.id]}</span>
        </span>
      ))}
    </div>
  );
}
