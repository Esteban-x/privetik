"use client";

import { useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { CASES } from "@/lib/grammar/cases";
import type { CaseId } from "@/lib/grammar/types";
import { BookIcon, CheckIcon, FlameIcon, SpeakerIcon } from "@/components/ui/icons";

/**
 * La vitrine de l'accueil : ce que fait l'app, en cinq écrans qui défilent.
 *
 * DES MAQUETTES, PAS DES CAPTURES. Chaque diapositive redessine un écran de
 * l'app avec ses vraies classes : elle suit le thème clair ou sombre, reste
 * nette à toutes les tailles et ne pèse rien. Ce qui peut être vrai l'est —
 * la forme déclinée sort du moteur, les leçons du catalogue — et arrive
 * calculé par la page.
 *
 * LE DÉFILEMENT SUIT LA BARRE DE PROGRESSION, PAS UN MINUTEUR. La diapositive
 * change à la fin de l'animation CSS de la barre : mettre en pause gèle
 * l'animation, et la reprise repart d'où elle s'était arrêtée, sans rien à
 * resynchroniser. Avec « réduire les animations », la barre ne s'anime pas —
 * et rien ne défile tout seul.
 *
 * PAUSE AU SURVOL, AU FOCUS, ET SUR DEMANDE. Un contenu qui bouge seul plus
 * de cinq secondes doit pouvoir s'arrêter (WCAG 2.2.2) : le bouton est là
 * pour ça, et on ne change pas l'écran sous les yeux de quelqu'un qui le lit.
 */

export interface ShowcaseData {
  /** « кни́ги » — la forme sort du moteur de déclinaison au rendu de la page. */
  genitiveForm: string;
  totalLessons: number;
  /** Le rang de l'unité montrée dans le parcours — « Unité 3 ». */
  unitNumber: number;
  unitTitle: string;
  unitLessonCount: number;
  lessons: { title: string; minutes: number }[];
}

const CASE_COLOR = Object.fromEntries(CASES.map((c) => [c.id, c.color])) as Record<CaseId, string>;

interface Slide {
  id: string;
  tab: string;
  /** Le libellé d'un écran de téléphone : les cinq onglets complets n'y tiennent pas. */
  short: string;
  title: string;
  caption: (data: ShowcaseData) => string;
  render: (data: ShowcaseData) => ReactNode;
}

const SLIDES: Slide[] = [
  {
    id: "cas",
    tab: "Les cas",
    short: "Cas",
    title: "Chaque réponse corrigée, chaque erreur expliquée",
    caption: () =>
      "Tu sais ce que tu as écrit, pourquoi la phrase demandait autre chose, et la leçon qui l'explique est à un clic.",
    render: (data) => <CasesSlide data={data} />,
  },
  {
    id: "textes",
    tab: "Tes textes",
    short: "Textes",
    title: "Écris en français, lis en russe",
    caption: () =>
      "Ton texte est traduit, puis chaque mot décliné porte la couleur de son cas — et te dit pourquoi il y est.",
    render: () => <TextsSlide />,
  },
  {
    id: "voix",
    tab: "La voix",
    short: "Voix",
    title: "Entendre le russe tel qu'il se parle",
    caption: () =>
      "Chaque mot et chaque phrase lus par une voix russe naturelle, et tes mots remis devant toi juste avant de les oublier.",
    render: () => <VoiceSlide />,
  },
  {
    id: "verbes",
    tab: "Les verbes",
    short: "Verbes",
    title: "L'aspect et le mouvement, enfin clairs",
    caption: () =>
      "Les points qui font abandonner le russe, travaillés avec des schémas et des phrases qui veulent dire quelque chose.",
    render: () => <VerbsSlide />,
  },
  {
    id: "parcours",
    tab: "Le parcours",
    short: "Parcours",
    title: "Un parcours clair, leçon après leçon",
    caption: (data) =>
      `${data.totalLessons} leçons dans l'ordre, du cyrillique au russe littéraire : tu sais toujours quoi faire ensuite.`,
    render: (data) => <PathSlide data={data} />,
  },
];

export default function FeatureShowcase({ data }: { data: ShowcaseData }) {
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [stopped, setStopped] = useState(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const swipeFrom = useRef<number | null>(null);
  const paused = hovered || focused || stopped;
  const slide = SLIDES[index];

  function go(next: number, focusTab = false) {
    const target = (next + SLIDES.length) % SLIDES.length;
    setIndex(target);
    if (focusTab) tabs.current[target]?.focus();
  }

  function onTabKey(e: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: SLIDES.length - 1,
    };
    if (!(e.key in moves)) return;
    e.preventDefault();
    go(moves[e.key], true);
  }

  function onBlur(e: FocusEvent<HTMLElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (swipeFrom.current === null) return;
    const dx = e.clientX - swipeFrom.current;
    swipeFrom.current = null;
    if (Math.abs(dx) > 48) go(index + (dx < 0 ? 1 : -1));
  }

  return (
    <section
      aria-roledescription="carrousel"
      aria-label="Ce que fait Privetik"
      className={`relative ${paused ? "showcase-paused" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={onBlur}
      // UN TÉLÉPHONE N'A PAS DE SURVOL. Toucher la vitrine — un onglet, un
      // balayage, la lecture d'une maquette — la fige donc pour de bon, et le
      // bouton passe sur « lecture » : on voit qu'elle est arrêtée, et comment
      // la relancer. Le bouton lui-même garde sa bascule.
      onPointerDownCapture={(e) => {
        if (e.pointerType === "mouse") return;
        if ((e.target as Element).closest("[data-showcase-toggle]")) return;
        setStopped(true);
      }}
    >
      <div className="surface gradient-border relative overflow-hidden rounded-[24px] shadow-float">
        {/* Mesuré à 360 px : cinq onglets courts, leur marge et le bouton de
            pause tiennent sur une ligne à condition de ces marges-là. */}
        <div className="flex items-center gap-1.5 border-b border-border px-2 py-2 sm:px-2.5">
          <div
            role="tablist"
            aria-label="Fonctionnalités"
            onKeyDown={onTabKey}
            className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto [scrollbar-width:none]"
          >
            {SLIDES.map((s, i) => {
              const active = i === index;
              return (
                <button
                  key={s.id}
                  ref={(el) => {
                    tabs.current[i] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`showcase-tab-${s.id}`}
                  aria-selected={active}
                  aria-controls="showcase-panel"
                  tabIndex={active ? 0 : -1}
                  onClick={() => go(i)}
                  className={`relative shrink-0 cursor-pointer rounded-lg px-1.5 py-2 font-display text-xs font-semibold transition-colors sm:px-3 ${
                    active ? "bg-[var(--surface-active)] text-text" : "text-muted hover:text-text"
                  }`}
                >
                  <span className="sm:hidden">{s.short}</span>
                  <span className="hidden sm:inline">{s.tab}</span>
                  {active && (
                    <span aria-hidden className="absolute inset-x-2 bottom-0.5 h-0.5 overflow-hidden rounded-full bg-border">
                      <span
                        key={index}
                        className="showcase-progress block h-full rounded-full"
                        style={{ backgroundImage: "var(--grad-accent)" }}
                        onAnimationEnd={() => go(index + 1)}
                      />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            data-showcase-toggle
            onClick={() => setStopped((v) => !v)}
            aria-label={stopped ? "Relancer le défilement" : "Mettre le défilement en pause"}
            className="hover-surface flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted"
          >
            {stopped ? (
              <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                <path d="M8 5.5v13l10.5-6.5z" />
              </svg>
            ) : (
              <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                <rect x="6.5" y="5" width="3.8" height="14" rx="1" />
                <rect x="13.7" y="5" width="3.8" height="14" rx="1" />
              </svg>
            )}
          </button>
        </div>

        <div
          id="showcase-panel"
          role="tabpanel"
          aria-labelledby={`showcase-tab-${slide.id}`}
          className="relative h-[372px] touch-pan-y select-none px-5 py-5 sm:h-[356px] sm:px-6"
          onPointerDown={(e) => {
            swipeFrom.current = e.clientX;
          }}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            swipeFrom.current = null;
          }}
        >
          <div key={slide.id} className="animate-fade-in h-full">
            {slide.render(data)}
          </div>
        </div>
      </div>

      <div key={`legende-${slide.id}`} className="animate-fade-in mt-4 min-h-[76px] px-1" aria-live="polite">
        <p className="font-display text-base font-bold">{slide.title}</p>
        <p className="mt-1 font-display text-sm leading-relaxed text-muted">{slide.caption(data)}</p>
      </div>
    </section>
  );
}

/** Un élément qui entre un temps après le reste de la diapositive. */
function Later({ delay, className = "", children }: { delay: number; className?: string; children: ReactNode }) {
  return (
    <div
      className={`animate-fade-in ${className}`}
      // En style : `.animate-fade-in` pose le raccourci `animation` hors des
      // couches de Tailwind, qui l'emporterait sur un utilitaire de délai.
      style={{ animationDelay: `${delay}ms`, animationFillMode: "backwards" }}
    >
      {children}
    </div>
  );
}

function CasesSlide({ data }: { data: ShowcaseData }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-bg3 px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-wide text-muted">
          Cas mélangés
        </span>
        <span className="font-display text-[11px] font-semibold text-muted">4/10 · Série : 3</span>
      </div>
      <p className="mt-4 font-display text-xs text-muted">Quel cas la phrase demande-t-elle ?</p>
      <p className="mt-1.5 font-display text-2xl font-bold leading-snug">
        У меня нет{" "}
        <span className="border-b-2 px-0.5" style={{ borderColor: CASE_COLOR.genitive }}>
          {data.genitiveForm}
        </span>
        .
      </p>
      <p className="mt-1 font-display text-sm italic text-muted">
        Je n&apos;ai pas de livre. <span className="not-italic text-accent2">(кни́га)</span>
      </p>
      <Later delay={260} className="mt-4 rounded-xl border border-success/50 bg-success/10 px-3.5 py-3">
        <p className="flex items-center gap-1.5 font-display text-xs font-bold uppercase tracking-wide text-success">
          <CheckIcon className="h-3.5 w-3.5" /> Correct
        </p>
        <p className="mt-1 font-display text-sm leading-relaxed text-text">
          Génitif singulier, imposé par « нет » : on dit ce qui manque.
        </p>
      </Later>
      <Later delay={520} className="mt-auto">
        <div className="flex items-center gap-2 rounded-[10px] border border-border bg-bg px-3 py-2.5 font-display text-[13px] font-semibold">
          <BookIcon className="h-4 w-4 shrink-0 text-accent-ink" />
          <span className="min-w-0 truncate">Revoir la leçon : Le génitif</span>
          <span aria-hidden className="ml-auto text-muted">
            →
          </span>
        </div>
      </Later>
    </div>
  );
}

const TEXT_WORDS: { ru: string; case?: CaseId }[] = [
  { ru: "Я", case: "nominative" },
  { ru: "живу́" },
  { ru: "в" },
  { ru: "Москве́", case: "prepositional" },
  { ru: "с" },
  { ru: "сестро́й.", case: "instrumental" },
];

function TextsSlide() {
  return (
    <div className="flex h-full flex-col">
      <p className="font-display text-[11px] font-bold uppercase tracking-wide text-muted">Ton texte, en français</p>
      <div className="mt-1.5 rounded-xl border border-border bg-bg px-3.5 py-2.5 font-display text-[15px]">
        J&apos;habite à Moscou avec ma sœur.
      </div>
      <div className="my-3 flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-wide text-muted">
        <span className="h-px flex-1 bg-border" />
        Traduit et annoté
        <span className="h-px flex-1 bg-border" />
      </div>
      <Later delay={180}>
        <p className="font-display text-[26px] leading-[1.6]">
          {TEXT_WORDS.map((word, i) => (
            <span key={i}>
              <span
                className="border-b-[3px] pb-0.5"
                style={{ borderColor: word.case ? CASE_COLOR[word.case] : "transparent" }}
              >
                {word.ru}
              </span>{" "}
            </span>
          ))}
        </p>
      </Later>
      <Later delay={480} className="mt-auto rounded-2xl border border-border bg-bg p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-lg font-bold">сестро́й</span>
          <span
            className="rounded-full px-2.5 py-0.5 font-display text-[11px] font-bold text-white"
            style={{ background: CASE_COLOR.instrumental }}
          >
            Instrumental · singulier
          </span>
        </div>
        <p className="mt-1.5 font-display text-[13px] leading-relaxed text-muted">
          Imposé par « с » : avec quelqu&apos;un. Forme du dictionnaire : сестра́.
        </p>
      </Later>
    </div>
  );
}

const BARS = [0.35, 0.7, 0.5, 0.95, 0.6, 0.85, 0.45, 0.75, 0.4, 0.65, 0.3];

function VoiceSlide() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-bg3 px-2.5 py-1 font-display text-[11px] font-bold uppercase tracking-wide text-muted">
          Révision espacée
        </span>
        <span className="font-display text-[11px] font-semibold text-muted">Carte 3 / 12</span>
      </div>
      <div className="mt-4 flex flex-1 flex-col items-center justify-center rounded-2xl border border-border bg-bg px-4 py-5 text-center">
        <p className="font-display text-4xl font-extrabold tracking-tight">спаси́бо</p>
        <p className="mt-1.5 font-display text-sm text-muted">
          merci · <span className="italic">spassiba</span>
        </p>
        <div aria-hidden className="mt-5 flex h-10 items-end gap-1">
          {BARS.map((height, i) => (
            <span
              key={i}
              className="showcase-bar w-1.5 rounded-full"
              style={{
                height: `${height * 100}%`,
                animationDelay: `${i * 85}ms`,
                backgroundImage: "var(--grad-accent)",
              }}
            />
          ))}
        </div>
        <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 font-display text-xs font-semibold text-accent-ink">
          <SpeakerIcon className="h-3.5 w-3.5" /> Voix russe naturelle
        </span>
      </div>
      <Later delay={300} className="mt-3 flex items-center justify-between gap-2 rounded-[10px] border border-border bg-bg px-3 py-2.5">
        <span className="font-display text-[13px] font-semibold">Écouter la phrase</span>
        <span className="font-display text-[13px] text-muted">Большо́е спаси́бо!</span>
      </Later>
    </div>
  );
}

function VerbsSlide() {
  return (
    <div className="flex h-full flex-col">
      <p className="font-display text-xs text-muted">Action menée à son terme, ou en cours ? Choisis l&apos;aspect.</p>
      <figure className="mt-3 rounded-xl border border-border bg-bg px-4 py-2.5">
        <svg viewBox="0 0 260 46" className="h-11 w-full" aria-hidden>
          <line x1="6" y1="28" x2="254" y2="28" strokeWidth="2" style={{ stroke: "var(--color-border)" }} />
          <line x1="58" y1="28" x2="186" y2="28" strokeWidth="5" strokeLinecap="round" style={{ stroke: "var(--color-accent)" }} />
          <circle cx="186" cy="28" r="8" style={{ fill: "var(--color-success)" }} />
          <path d="m182 28 3 3 5-6" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--color-on-tint)" }} />
          <text x="58" y="12" style={{ fill: "var(--color-muted)" }} fontSize="11" fontFamily="inherit">
            вчера́
          </text>
          <text x="232" y="12" textAnchor="end" style={{ fill: "var(--color-muted)" }} fontSize="11" fontFamily="inherit">
            c&apos;est fait
          </text>
        </svg>
      </figure>
      <p className="mt-3 font-display text-2xl font-bold leading-snug">
        Вчера́ я{" "}
        <span className="inline-block min-w-[70px] border-b-2 border-success text-center text-success">написа́л</span>{" "}
        письмо́.
      </p>
      <p className="mt-1 font-display text-sm italic text-muted">Hier, j&apos;ai écrit une lettre — et je l&apos;ai finie.</p>
      <Later delay={280} className="mt-auto grid grid-cols-2 gap-2">
        <div className="rounded-[10px] border border-border bg-bg px-3 py-2.5 text-center font-display text-base font-semibold text-muted">
          писа́л
        </div>
        <div className="flex items-center justify-center gap-1.5 rounded-[10px] border border-success bg-success/10 px-3 py-2.5 font-display text-base font-semibold text-success">
          написа́л <CheckIcon className="h-4 w-4" />
        </div>
      </Later>
    </div>
  );
}

function PathSlide({ data }: { data: ShowcaseData }) {
  const done = 3;
  const lessons = data.lessons.slice(0, 5);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-[11px] font-bold uppercase tracking-wide text-muted">
            Unité {data.unitNumber}
          </p>
          <p className="truncate font-display text-base font-bold">{data.unitTitle}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-1 font-display text-xs font-bold text-accent2-deep">
          <FlameIcon className="h-3.5 w-3.5" /> 6 jours
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg3">
        <div
          className="h-full rounded-full"
          style={{ width: `${(done / data.unitLessonCount) * 100}%`, backgroundImage: "var(--grad-accent)" }}
        />
      </div>
      <p className="mt-1.5 font-display text-[11px] text-muted">
        {done} / {data.unitLessonCount} leçons lues
      </p>
      <ul className="mt-3 space-y-1.5">
        {lessons.map((lesson, i) => (
          <li key={lesson.title}>
            <Later
              delay={i * 70}
              className={`flex items-center gap-2.5 rounded-[10px] border px-3 py-2 ${
                i === done ? "border-accent/45 bg-accent/10" : "border-border bg-bg"
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  i < done ? "border-success bg-success text-on-tint" : i === done ? "border-accent" : "border-border"
                }`}
              >
                {i < done && <CheckIcon className="h-3 w-3" />}
              </span>
              <span className={`min-w-0 flex-1 truncate font-display text-[13px] font-semibold ${i > done ? "text-muted" : ""}`}>
                {lesson.title}
              </span>
              <span className="shrink-0 font-display text-[11px] text-muted">
                {i === done ? "En cours" : `${lesson.minutes} min`}
              </span>
            </Later>
          </li>
        ))}
      </ul>
    </div>
  );
}
