import Link from "next/link";

interface Props {
  reviewed: number;
  correct: number;
  goal: number;
  reviewedTodayTotal: number;
  backHref: string;
  backLabel: string;
  onRestart?: () => void;
  /** Ce qu'il y a encore à dire sous l'objectif — la limite de nouveaux mots atteinte. */
  extra?: React.ReactNode;
}

// Écran de fin de session (façon Duolingo) : ce qui vient d'être fait +
// où en est l'objectif quotidien global — affiché à la fin des 4 modes de
// révision (cartes, frappe, QCM, voix), qu'elle porte sur une liste ou sur
// la file globale.
export default function SessionSummary({
  reviewed,
  correct,
  goal,
  reviewedTodayTotal,
  backHref,
  backLabel,
  onRestart,
  extra,
}: Props) {
  const accuracy = reviewed > 0 ? Math.round((correct / reviewed) * 100) : 0;
  const goalPct = goal > 0 ? Math.min(100, Math.round((reviewedTodayTotal / goal) * 100)) : 0;
  const goalReached = reviewedTodayTotal >= goal;

  return (
    <div className="mx-auto max-w-md text-center">
      <p className="font-display text-3xl font-bold">
        {reviewed === 0 ? "Rien à réviser ici" : "Session terminée"}
      </p>

      {reviewed > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl surface p-4">
            <p className="font-display text-2xl font-extrabold text-accent-ink">{reviewed}</p>
            <p className="font-display text-xs text-muted">mot{reviewed > 1 ? "s" : ""} revu{reviewed > 1 ? "s" : ""}</p>
          </div>
          <div className="rounded-2xl surface p-4">
            <p className="font-display text-2xl font-extrabold text-accent-ink">{accuracy}%</p>
            <p className="font-display text-xs text-muted">de réussite</p>
          </div>
        </div>
      )}

      <div className="mt-6 rounded-2xl surface p-5 text-left">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-display text-sm font-semibold text-muted">Objectif du jour</p>
          <p className="font-display text-sm font-bold">
            {reviewedTodayTotal} / {goal}
          </p>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-border">
          <div
            className={`h-full rounded-full transition-all ${goalReached ? "bg-success" : "bg-accent"}`}
            style={{ width: `${goalPct}%` }}
          />
        </div>
        {goalReached && (
          <p className="mt-2 font-display text-xs font-semibold text-success">
            Objectif atteint aujourd&apos;hui ✓
          </p>
        )}
      </div>

      {extra}

      <div className="mt-6 flex justify-center gap-2.5">
        {onRestart && (
          <button
            onClick={onRestart}
            className="btn btn-primary btn-sheen rounded-[10px] px-6 py-3 font-display text-sm"
          >
            Encore →
          </button>
        )}
        <Link
          href={backHref}
          className="rounded-[10px] border border-border px-6 py-3 font-display text-sm font-semibold text-text transition-colors hover:bg-accent/10 hover:border-accent/35"
        >
          {backLabel}
        </Link>
      </div>
    </div>
  );
}
