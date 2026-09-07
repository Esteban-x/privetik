"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Le haut-parleur, adossé au mot qu'il prononce.
 *
 * POURQUOI UN ÉTAT D'ATTENTE. Un mot déjà synthétisé part instantanément —
 * c'est le cas de l'immense majorité, le cache étant global. Mais un mot
 * INÉDIT demande une seconde à une seconde et demie à ElevenLabs, et sans
 * rien à l'écran ce silence se lit comme un bouton cassé : l'apprenant
 * reclique, ce qui ne fait qu'attendre la même requête.
 *
 * L'attente est donc montrée DANS l'icône — les ondes se propagent — plutôt
 * que par une roulette qui remplacerait le pictogramme. Rien ne change de
 * taille, rien ne saute, et le geste animé dit déjà ce qu'on attend : du
 * son.
 *
 * DEUX FORMES, UN SEUL COMPORTEMENT. Sans `text`, le bouton est le
 * pictogramme seul, adossé au mot qu'il prononce — c'est la forme des
 * cartes de liste et des révisions écrites, où le mot est juste à côté.
 * Avec `text`, il devient une pastille nommée (« Russe », « Français ») :
 * la forme des cartes retournées, où le mot vit à l'intérieur d'un bouton
 * et ne peut donc pas en contenir un second. L'attente, la déduplication
 * et le pictogramme restent communs — deux composants auraient divergé sur
 * l'animation, qui est justement ce qui fait comprendre l'attente.
 */
export default function SpeakButton({
  label,
  title,
  onSpeak,
  text,
  className = "",
}: {
  label: string;
  title: string;
  onSpeak: () => Promise<void>;
  /** Libellé visible. Absent, le bouton se réduit à son pictogramme. */
  text?: string;
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  // Le composant peut disparaître pendant l'attente (mot suivant, liste
  // rechargée) : sans cette garde, React avertirait d'une mise à jour sur
  // un composant démonté.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function handle() {
    // Un second clic pendant l'attente ne relance rien : la requête est
    // déjà dédupliquée côté client (lib/vocabulary/speech.ts), mais autant
    // que le bouton le dise aussi.
    if (pending) return;
    setPending(true);
    try {
      await onSpeak();
    } finally {
      if (alive.current) setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handle}
      aria-label={label}
      title={title}
      aria-busy={pending}
      className={
        text
          ? `inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 font-display text-[13px] font-semibold transition-colors sm:text-sm ${
              pending
                ? "border-accent/35 bg-accent/10 text-accent-ink"
                : "border-border text-text hover:border-accent/35 hover:bg-accent/10"
            } ${className}`
          : `shrink-0 self-center rounded-lg p-1 text-muted/60 transition-colors hover:bg-bg hover:text-accent-ink ${
              pending ? "text-accent-ink" : ""
            } ${className}`
      }
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className={text ? "h-4 w-4" : "h-3.5 w-3.5"}
      >
        {/* Le cône ne bouge jamais : c'est lui qui donne au bouton sa
            silhouette reconnaissable. Seules les ondes s'animent. */}
        <path d="M11 5 6 9H3v6h3l5 4z" strokeLinejoin="round" />
        <path
          d="M15.5 8.5a5 5 0 0 1 0 7"
          strokeLinecap="round"
          className={pending ? "wave-pulse" : ""}
        />
        <path
          d="M18.5 5.5a9 9 0 0 1 0 13"
          strokeLinecap="round"
          className={pending ? "wave-pulse [animation-delay:180ms]" : ""}
        />
      </svg>
      {text}
    </button>
  );
}
