import Link from "next/link";
import { CardsIcon, CheckIcon, ListIcon, MicIcon } from "@/components/ui/icons";

/**
 * Les quatre façons de réviser, décrites à un seul endroit.
 *
 * La grille apparaît sur /vocabulary/review (tous les mots dus) et sur le
 * détail d'une liste (les mots de cette liste). Les deux copies avaient
 * divergé — libellés, descriptions et styles n'étaient déjà plus tout à
 * fait les mêmes, et rien ne le signalait.
 */
export const REVIEW_MODES = [
  {
    mode: "flashcards",
    icon: "flashcards",
    label: "Cartes",
    desc: "Retourne la carte et évalue-toi. C'est ce mode qui pilote la répétition espacée.",
  },
  {
    mode: "typing",
    icon: "typing",
    label: "Frappe",
    desc: "Écris la traduction. Le plus exigeant, et celui qui fixe l'orthographe.",
  },
  {
    mode: "qcm",
    icon: "qcm",
    label: "QCM",
    desc: "Quatre propositions. Rapide, idéal pour un premier passage sur des mots neufs.",
  },
  {
    mode: "cloze",
    icon: "cloze",
    label: "Phrases à trous",
    desc: "Retrouve le mot à la forme que sa phrase exige. Pour les mots qui ont un exemple.",
  },
  {
    mode: "voice",
    icon: "voice",
    label: "Voix",
    desc: "Écoute le mot et prononce-le à voix haute.",
  },
] as const;

export default function ReviewModeGrid({
  listId,
  recommended,
}: {
  listId?: string;
  /** Le mode conseillé pour la file du jour (lib/vocabulary/guided.ts). */
  recommended?: { mode: string; reason: string } | null;
}) {
  const query = listId ? `?list=${listId}` : "";
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {REVIEW_MODES.map((m) => (
        <Link
          key={m.mode}
          href={`/vocabulary/${m.mode}${query}`}
          className={`group flex gap-4 rounded-2xl surface-interactive p-5 hover:-translate-y-0.5 ${
            recommended?.mode === m.mode ? "ring-2 ring-accent/50" : ""
          }`}
        >
          {/* Le pictogramme prend la couleur d'accent au survol EN MÊME
              TEMPS que son fond : deux propriétés, une seule transition, et
              la pastille se lit comme un objet plutôt que comme un carré
              qui change de fond derrière un dessin figé. */}
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-bg3 text-muted transition-colors duration-200 group-hover:bg-accent/15 group-hover:text-accent-ink"
            style={{ transitionTimingFunction: "var(--ease)" }}
          >
            <ModeIcon name={m.icon} />
          </span>
          <div className="min-w-0">
            <h3 className="flex flex-wrap items-center gap-2 font-display text-base font-bold transition-colors group-hover:text-accent-ink">
              {m.label}
              {recommended?.mode === m.mode && (
                <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-bold text-accent-ink">
                  Conseillé aujourd&apos;hui
                </span>
              )}
            </h3>
            <p className="mt-0.5 font-display text-sm leading-snug text-muted">
              {recommended?.mode === m.mode ? recommended.reason : m.desc}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}

/** Une icône par mode. La table vit ici plutôt que dans REVIEW_MODES, qui
    est exporté et lu ailleurs comme une donnée — y mettre du JSX
    l'obligerait à devenir un module client. */
export function ModeIcon({ name }: { name: (typeof REVIEW_MODES)[number]["icon"] }) {
  const className = "h-[22px] w-[22px]";
  if (name === "flashcards") return <CardsIcon className={className} />;
  if (name === "typing") return <ListIcon className={className} />;
  if (name === "qcm") return <CheckIcon className={className} />;
  if (name === "cloze") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} aria-hidden>
        <path d="M3 8h4M17 8h4M3 16h7M14 16h7" />
        <path d="M9 9.5h6" strokeDasharray="2 2" />
      </svg>
    );
  }
  return <MicIcon className={className} />;
}
