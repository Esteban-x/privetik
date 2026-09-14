"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { COURSES_READ_KEY, saveReadLessons } from "@/lib/storage";

/**
 * Les leçons déjà lues, partagées entre la page catalogue et la page leçon.
 *
 * POURQUOI useSyncExternalStore ET PAS UN useEffect. Lire localStorage dans
 * un effet impose un setState au montage : le rendu serveur et le premier
 * rendu client diffèrent, et la règle react-hooks/set-state-in-effect du
 * projet l'interdit à juste titre. Ici React appelle `getServerSnapshot`
 * pour l'hydratation puis se resynchronise tout seul — pas d'effet, pas de
 * clignotement, et deux composants montés en même temps voient la même
 * valeur au même instant.
 */

const listeners = new Set<() => void>();

// ─── Sur le compte ─────────────────────────────────────────────────
//
// localStorage reste la source immédiate : la coche répond sans réseau, et
// un visiteur sans compte garde la sienne. Pour un membre, le compte
// (app/api/lessons) la suit : au premier montage, ce que le compte sait est
// ajouté ici ; ce que ce navigateur savait avant la synchronisation part une
// seule fois vers le compte — pas à chaque visite, sans quoi une leçon
// décochée ailleurs reviendrait cochée depuis ce navigateur.

const PUSHED_KEY = "ru-app:courses-read-pushed";
let signedIn: Promise<boolean> | null = null;
let synced = false;

function isSignedIn(): Promise<boolean> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return Promise.resolve(false);
  signedIn ??= import("@/lib/supabase/client")
    .then(({ createClient }) => createClient().auth.getSession())
    .then(({ data }) => Boolean(data.session))
    .catch(() => false);
  return signedIn;
}

function post(body: unknown) {
  return fetch("/api/lessons", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

async function syncWithAccount() {
  if (synced) return;
  synced = true;
  if (!(await isSignedIn())) return;
  try {
    const res = await fetch("/api/lessons");
    if (!res.ok) return;
    const { read } = (await res.json()) as { read: string[] };
    const local = parse(getSnapshot());
    const merged = new Set([...local, ...read]);
    if (merged.size !== local.length) {
      saveReadLessons([...merged]);
      for (const listener of listeners) listener();
    }
    let pushed = false;
    try {
      pushed = localStorage.getItem(PUSHED_KEY) === "1";
    } catch {
      pushed = true;
    }
    const missing = local.filter((slug) => !read.includes(slug));
    if (!pushed) {
      if (missing.length > 0) await post({ slugs: missing, read: true });
      try {
        localStorage.setItem(PUSHED_KEY, "1");
      } catch {
        // Stockage refusé : on retentera à la prochaine visite, sans conséquence.
      }
    }
  } catch {
    // Hors ligne : la coche locale suffit.
  }
}

/** Un quiz terminé : une trace sur le compte, pour un membre. */
export function recordLessonQuiz(slug: string, score: number, total: number) {
  void isSignedIn().then((yes) => (yes ? post({ slug, quiz: { score, total } }) : undefined));
}

function subscribe(callback: () => void): () => void {
  void syncWithAccount();
  listeners.add(callback);
  // Un autre onglet qui coche une leçon : `storage` prévient celui-ci.
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

/** Snapshot = la chaîne brute stockée. Une primitive, donc comparable telle quelle. */
function getSnapshot(): string {
  try {
    return localStorage.getItem(COURSES_READ_KEY) ?? "[]";
  } catch {
    return "[]";
  }
}

function getServerSnapshot(): string {
  return "[]";
}

function parse(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function useReadLessons() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const read = useMemo(() => new Set(parse(raw)), [raw]);

  const setRead = useCallback((slug: string, value: boolean) => {
    const next = new Set(parse(getSnapshot()));
    if (value) next.add(slug);
    else next.delete(slug);
    saveReadLessons([...next]);
    for (const listener of listeners) listener();
    void isSignedIn().then((yes) => (yes ? post({ slugs: [slug], read: value }) : undefined));
  }, []);

  const toggle = useCallback(
    (slug: string) => setRead(slug, !new Set(parse(getSnapshot())).has(slug)),
    [setRead]
  );

  return { read, setRead, toggle };
}
