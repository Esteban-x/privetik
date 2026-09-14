"use client";

import { useEffect, useState } from "react";
import type { VocabListSummary } from "@/lib/vocabulary/custom";
import type { PackSummary } from "@/lib/vocabulary/packs";

/**
 * Les paquets de départ, prêts à ajouter.
 *
 * Montrés là où l'on se demande par quoi commencer : quand on n'a encore
 * aucune liste, et à côté de « Nouvelle liste ». Chaque carte montre ses
 * premiers mots — c'est ce qui dit, mieux qu'un titre, si le paquet est pour
 * soi.
 */
export default function StarterPacks({
  onImported,
}: {
  onImported: (list: VocabListSummary, added: number) => void;
}) {
  const [packs, setPacks] = useState<PackSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/vocab/packs")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("indisponible"))))
      .then((data: { packs: PackSummary[] }) => {
        if (!cancelled) setPacks(data.packs);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function importPack(packId: string) {
    if (busy) return;
    setBusy(packId);
    setError(null);
    try {
      const res = await fetch("/api/vocab/packs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Ajout impossible pour le moment.");
      onImported(data.list as VocabListSummary, data.added as number);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ajout impossible pour le moment.");
    } finally {
      setBusy(null);
    }
  }

  if (failed) {
    return (
      <p className="font-display text-sm text-muted">
        Les paquets de départ ne sont pas disponibles pour le moment.
      </p>
    );
  }

  return (
    <div>
      <p className="font-display text-sm leading-relaxed text-muted">
        Des noms tirés de la banque de l&apos;app, accent et traduction relus, du plus courant au
        plus rare. Dix nouveaux arrivent en révision chaque jour : le paquet entier ne passe pas
        devant tes révisions.
      </p>
      {error && (
        <p role="alert" className="mt-3 font-display text-sm text-danger">
          {error}
        </p>
      )}
      <div className="@container mt-4">
        <div className="grid grid-cols-1 gap-3 @min-[34rem]:grid-cols-2">
          {packs === null
            ? [0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[118px] rounded-2xl" />)
            : packs.map((pack) => (
                <div key={pack.id} className="flex flex-col rounded-2xl border border-border bg-bg p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display text-base font-bold">{pack.title}</p>
                    <span className="shrink-0 rounded-full border border-border px-2 py-0.5 font-display text-[10px] font-bold text-muted">
                      {pack.level}
                    </span>
                  </div>
                  <p className="mt-1 font-display text-xs leading-relaxed text-muted">{pack.description}</p>
                  <p className="mt-2 font-display text-sm text-text" lang="ru">
                    {pack.preview.join(" · ")}…
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="font-display text-xs text-muted">{pack.count} mots</span>
                    <button
                      type="button"
                      onClick={() => importPack(pack.id)}
                      disabled={busy !== null}
                      className="btn btn-primary btn-sheen rounded-lg px-3.5 py-1.5 font-display text-xs disabled:opacity-60"
                    >
                      {busy === pack.id ? "Ajout…" : "Ajouter"}
                    </button>
                  </div>
                </div>
              ))}
        </div>
      </div>
    </div>
  );
}
