"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteMyReadingText } from "@/lib/reading/client";

/**
 * Supprimer le texte ouvert — EN DEUX TEMPS.
 *
 * Un seul clic l'effaçait, avec ses explications, et un texte généré ne se
 * régénère pas à l'identique : sur le plan gratuit, qui en compte deux à
 * vie, c'était la moitié de l'essai perdue sur un clic de travers.
 */
export default function DeleteReadingTextButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      await deleteMyReadingText(id);
      router.push("/reading");
      router.refresh();
    } catch {
      setError("La suppression a échoué. Réessaie.");
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {confirming ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="font-display text-xs text-muted">Supprimer ce texte&nbsp;?</span>
          <button
            onClick={remove}
            disabled={deleting}
            autoFocus
            className="rounded-lg bg-danger px-2.5 py-1 font-display text-[11px] font-bold text-on-tint disabled:opacity-60"
          >
            {deleting ? "Suppression…" : "Supprimer"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={deleting}
            className="font-display text-[11px] font-semibold text-muted hover:text-text disabled:opacity-60"
          >
            Annuler
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="font-display text-xs font-semibold text-danger transition-colors hover:underline"
        >
          Supprimer ce texte
        </button>
      )}
      {error && <p className="font-display text-xs text-danger">{error}</p>}
    </div>
  );
}
