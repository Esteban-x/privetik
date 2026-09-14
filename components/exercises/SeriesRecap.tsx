import type { SeriesMiss } from "@/lib/practice/use-practice-session";

/**
 * Le bilan d'une série de dix.
 *
 * POURQUOI UNE FIN. L'entraînement était un fil sans bout : « Série : 4 »
 * compte des réponses justes d'affilée, et une erreur le remettait à zéro
 * sans rien laisser derrière. Personne ne voyait ce qu'il venait de rater —
 * donc ce qu'il fallait retravailler.
 *
 * Le bilan dit trois choses : combien du premier coup, lesquelles ont
 * échoué, et si elles ont été rattrapées depuis. « Refaire les erreurs »
 * sert tout de suite ce qui reste en file ; « Nouvelle série » les laisse
 * revenir d'elles-mêmes au fil des exercices.
 */
export default function SeriesRecap({
  correct,
  total,
  misses,
  pending,
  exhausted,
  onContinue,
  onRedo,
  footer,
}: {
  correct: number;
  total: number;
  misses: SeriesMiss[];
  pending: number;
  /** La source est épuisée : pas de série suivante à proposer. */
  exhausted: boolean;
  onContinue: () => void;
  onRedo: () => void;
  footer?: React.ReactNode;
}) {
  return (
    <div className="animate-fade-in" role="status">
      <p className="font-display text-xs font-semibold uppercase tracking-wide text-muted">
        {exhausted ? "Terminé" : "Bilan de la série"}
      </p>
      <p className="mt-1 font-display text-3xl font-extrabold">
        {correct} / {total}{" "}
        <span className="font-display text-base font-semibold text-muted">du premier coup</span>
      </p>

      {misses.length === 0 ? (
        <p className="mt-3 font-display text-sm text-muted">Aucune erreur sur cette série.</p>
      ) : (
        <>
          <p className="mt-6 font-display text-xs font-semibold uppercase tracking-wide text-muted">
            Tes erreurs
          </p>
          <ul className="mt-2 space-y-2">
            {misses.map((miss) => (
              <li
                key={miss.itemId}
                className="flex items-start justify-between gap-3 rounded-xl border border-border bg-bg px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-display text-sm leading-relaxed text-muted">{miss.label}</p>
                  <p className="mt-0.5 font-display text-base font-bold">{miss.answer}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 font-display text-[11px] font-bold ${
                    miss.recovered ? "bg-success/15 text-success" : "bg-danger/10 text-danger"
                  }`}
                >
                  {miss.recovered ? "rattrapée" : "à revoir"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        {pending > 0 && (
          <button
            type="button"
            onClick={onRedo}
            className="btn btn-primary btn-sheen rounded-[10px] px-5 py-2.5 font-display text-sm"
          >
            {pending === 1 ? "Refaire l'erreur restante" : `Refaire les ${pending} erreurs restantes`}
          </button>
        )}
        {!exhausted && (
          <button
            type="button"
            onClick={onContinue}
            autoFocus={pending === 0}
            className={`btn rounded-[10px] px-5 py-2.5 font-display text-sm ${
              pending > 0 ? "btn-outline" : "btn-primary btn-sheen"
            }`}
          >
            Nouvelle série →
          </button>
        )}
      </div>
      {footer}
    </div>
  );
}
