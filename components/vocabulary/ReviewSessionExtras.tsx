import { DAILY_NEW_WORDS } from "@/lib/vocabulary/new-words";

/**
 * Deux mentions communes aux quatre modes de révision.
 */

/** La carte affichée est un mot manqué qui revient. */
export function RelearnBadge() {
  return (
    <p className="mb-4 flex justify-center">
      <span className="inline-flex items-center rounded-full border border-accent2/40 bg-accent2/10 px-3 py-1 font-display text-xs font-semibold text-accent2">
        À revoir — manqué il y a quelques mots
      </span>
    </p>
  );
}

/**
 * Les nouveaux mots du jour sont passés, d'autres attendent.
 *
 * La limite protège les révisions par défaut ; elle ne décide pas à la place
 * de l'apprenant. Quelqu'un qui a le temps et l'envie en découvre dix de plus
 * d'un geste.
 */
export function NewWordsLimit({ waiting, onMore }: { waiting: number; onMore: () => void }) {
  if (waiting <= 0) return null;
  return (
    <div className="mt-6 rounded-2xl surface p-5 text-left">
      <p className="font-display text-sm font-semibold">
        {waiting} nouveau{waiting > 1 ? "x" : ""} mot{waiting > 1 ? "s" : ""} attend
        {waiting > 1 ? "ent" : ""} demain
      </p>
      <p className="mt-1 font-display text-xs leading-relaxed text-muted">
        Dix nouveaux mots par jour : au-delà, ils repousseraient les révisions de ceux que tu viens
        d&apos;apprendre.
      </p>
      <button
        type="button"
        onClick={onMore}
        className="btn btn-outline mt-3 rounded-[10px] px-4 py-2 font-display text-sm font-semibold"
      >
        En découvrir {Math.min(waiting, DAILY_NEW_WORDS)} de plus
      </button>
    </div>
  );
}
