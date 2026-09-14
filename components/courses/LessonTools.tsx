"use client";

import { useEffect, useState } from "react";
import { useReadLessons } from "@/lib/courses/use-read-lessons";

/**
 * Le fil de lecture : une barre fine, tout en haut, qui avance avec le
 * défilement de la leçon.
 *
 * Sur un cours de grammaire, « combien il en reste » est une vraie question
 * — c'est ce qui décide de commencer ou de remettre à plus tard. La barre
 * répond sans occuper de place, et n'apparaît qu'une fois la lecture
 * commencée pour ne pas décorer un écran encore immobile.
 *
 * Le calcul se fait dans le gestionnaire de défilement, pas dans un effet :
 * une seule mesure par frame, et aucun rendu en cascade au montage.
 */
export function ReadingProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    function measure() {
      frame = 0;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(scrollable > 0 ? Math.min(1, window.scrollY / scrollable) : 0);
    }
    function onScroll() {
      if (frame === 0) frame = requestAnimationFrame(measure);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    // PAS LA CLASSE `.btn`. Elle servait à emprunter le dégradé du bouton
    // principal, mais `.btn` pose `position: relative` et `inline-flex`, qui
    // l'emportaient sur `fixed` : la barre ne restait pas en haut de l'écran,
    // elle s'insérait dans la page et décalait toute la leçon de 24 px. Le
    // dégradé est repris directement.
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 origin-left transition-opacity duration-300"
      style={{
        backgroundImage: "var(--grad-accent)",
        transform: `scaleX(${progress})`,
        opacity: progress > 0.005 ? 1 : 0,
      }}
    />
  );
}

/** « J'ai lu cette leçon » — la coche que le catalogue relira. */
export function LessonReadToggle({ slug }: { slug: string }) {
  const { read, setRead } = useReadLessons();
  const done = read.has(slug);

  return (
    <button
      type="button"
      onClick={() => setRead(slug, !done)}
      aria-pressed={done}
      className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 font-display text-sm font-semibold transition-colors duration-200 ${
        done
          ? "border-success bg-success/15 text-success"
          : "border-border bg-bg2 text-muted hover:border-success hover:text-text"
      }`}
    >
      <span
        aria-hidden
        className={`flex h-5 w-5 items-center justify-center rounded-full border transition-colors duration-200 ${
          done ? "border-success bg-success text-on-tint" : "border-border text-transparent"
        }`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3 w-3">
          <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {done ? "Leçon lue" : "Marquer comme lue"}
    </button>
  );
}
