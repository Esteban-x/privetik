// Petits blocs de chargement réutilisables (voir .skeleton/.dot-pulse dans
// app/globals.css) — un texte "Chargement…" statique casse le rythme d'une
// UI par ailleurs animée ; ces primitives donnent un repère visuel qui
// épouse la forme du contenu à venir plutôt qu'un simple message.

/** Puces qui pulsent en cascade + libellé, façon "en train de générer". */
export function LoadingDots({ label }: { label: string }) {
  return (
    <p className="inline-flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-wide text-muted">
      <span className="flex gap-1">
        <span className="dot-pulse h-1.5 w-1.5 rounded-full bg-accent [animation-delay:0ms]" />
        <span className="dot-pulse h-1.5 w-1.5 rounded-full bg-accent [animation-delay:160ms]" />
        <span className="dot-pulse h-1.5 w-1.5 rounded-full bg-accent [animation-delay:320ms]" />
      </span>
      {label}
    </p>
  );
}

/** Lignes de texte factices à largeurs variables (paragraphe en cours de génération). */
export function SkeletonLines({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  const widths = ["100%", "94%", "88%", "97%", "82%", "91%"];
  return (
    <div className={`space-y-2.5 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton h-4 rounded-lg"
          style={{ width: widths[i % widths.length] }}
        />
      ))}
    </div>
  );
}
