"use client";

import Link from "next/link";
import { useState } from "react";
import type { SavedReadingTextSummary } from "@/lib/reading/client";
import CaseCounts from "@/components/exercises/CaseCounts";
import { CrossIcon } from "@/components/ui/icons";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/**
 * Les textes générés par l'apprenant.
 *
 * LA CROIX DEMANDE CONFIRMATION. Elle supprimait au premier clic, posée dans
 * le coin d'une carte qui est elle-même un lien : un doigt qui visait
 * l'ouverture du texte pouvait l'effacer, explications comprises. La
 * suppression, elle, est confiée au parent, qui sait remettre la carte en
 * place si le serveur la refuse.
 */
export default function MyReadingTexts({
  texts,
  onDelete,
}: {
  texts: SavedReadingTextSummary[];
  onDelete: (id: string) => void;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  if (texts.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {texts.map((t) => (
        <div key={t.id} className="relative rounded-2xl surface-interactive p-6 hover:-translate-y-0.5">
          <Link href={`/reading/mine/${t.id}`} className="block pr-6">
            <div className="flex items-center gap-2">
              <span className="inline-block rounded-full border border-border px-2.5 py-0.5 font-display text-xs font-semibold text-muted">
                {t.level}
              </span>
              <span className="font-display text-xs text-muted">
                {formatDate(t.createdAt)} · {t.sentenceCount} phrases
              </span>
            </div>
            <h2 className="mt-3 font-display text-2xl font-bold">{t.title}</h2>
            {t.titleFr && <p className="mt-0.5 font-display text-sm text-muted">{t.titleFr}</p>}
            {t.caseCounts && <CaseCounts counts={t.caseCounts} />}
          </Link>

          {confirmingId === t.id ? (
            <div className="animate-fade-in absolute inset-x-3 bottom-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-danger/40 bg-bg px-3 py-2">
              <span className="font-display text-xs text-muted">Supprimer ce texte&nbsp;?</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  autoFocus
                  onClick={() => {
                    setConfirmingId(null);
                    onDelete(t.id);
                  }}
                  className="rounded-lg bg-danger px-2.5 py-1 font-display text-[11px] font-bold text-on-tint"
                >
                  Supprimer
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingId(null)}
                  className="font-display text-[11px] font-semibold text-muted hover:text-text"
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingId(t.id)}
              aria-label={`Supprimer le texte ${t.title}`}
              title="Supprimer"
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <CrossIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
