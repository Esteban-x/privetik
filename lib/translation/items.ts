import { LESSONS } from "@/lib/courses/catalog";
import { READING_TEXTS } from "@/lib/reading/texts";
import type { CefrLevel } from "@/lib/supabase/types";

/**
 * Les phrases à traduire du français vers le russe.
 *
 * TOUS LES MODULES ISOLENT UNE DIFFICULTÉ. Le cas ici, l'aspect là, l'accord
 * ailleurs — c'est ce qui les rend efficaces, et ce qui laisse un manque :
 * personne ne demande jamais de construire une phrase entière, où il faut
 * tout décider à la fois. C'est pourtant ce que demande parler.
 *
 * AUCUNE PHRASE ÉCRITE POUR L'OCCASION. Elles viennent des exemples du cours
 * et des textes relus de la bibliothèque : russe et français y ont déjà été
 * écrits ensemble et vérifiés. Seules sont gardées les phrases courtes,
 * complètes et sans notation de tableau (flèches, barres, trous).
 *
 * LE RUSSE NE QUITTE PAS LE SERVEUR avant la réponse : la page n'envoie au
 * navigateur que le français et l'identifiant.
 */

export const TRANSLATION_LEVELS = ["A1", "A2", "B1", "B2"] as const;
export type TranslationLevel = (typeof TRANSLATION_LEVELS)[number];

export interface TranslationItem {
  id: string;
  fr: string;
  ru: string;
  level: TranslationLevel;
  source: { label: string; href: string };
}

export type PublicTranslationItem = Omit<TranslationItem, "ru">;

export function isTranslationLevel(value: unknown): value is TranslationLevel {
  return typeof value === "string" && (TRANSLATION_LEVELS as readonly string[]).includes(value);
}

/** A0 rejoint A1, C1 et C2 rejoignent B2 : trop peu de phrases pour une série à part. */
export function translationLevelFor(level: CefrLevel | string | null | undefined): TranslationLevel {
  if (level === "A2" || level === "B1") return level;
  if (level === "B2" || level === "C1" || level === "C2") return "B2";
  return "A1";
}

const CYRILLIC = /[а-яё]/i;
const LATIN = /[a-z]/i;
const TABLE_NOTATION = /[→/…_[\]]/;

function usable(ru: string, fr: string): boolean {
  const words = ru.trim().split(/\s+/);
  return (
    CYRILLIC.test(ru) &&
    !LATIN.test(ru) &&
    /[.!?]$/.test(ru.trim()) &&
    words.length >= 2 &&
    words.length <= 9 &&
    !TABLE_NOTATION.test(ru) &&
    !/[()]/.test(ru) &&
    !TABLE_NOTATION.test(fr) &&
    /[.!?»]$/.test(fr.trim()) &&
    fr.length <= 120
  );
}

let cache: TranslationItem[] | null = null;

export function translationItems(): TranslationItem[] {
  if (cache) return cache;
  const items: TranslationItem[] = [];
  const seen = new Set<string>();
  const add = (item: TranslationItem) => {
    const key = item.ru.replace(/́/g, "").toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };

  for (const { lesson } of LESSONS) {
    const examples = lesson.sections.flatMap((s) => (s.kind === "examples" ? s.items : []));
    examples.forEach((example, index) => {
      if (!usable(example.ru, example.fr)) return;
      add({
        id: `l:${lesson.slug}:${index}`,
        fr: example.fr,
        ru: example.ru,
        level: translationLevelFor(lesson.level),
        source: { label: `Leçon : ${lesson.title}`, href: `/cours/${lesson.slug}` },
      });
    });
  }

  for (const text of READING_TEXTS) {
    text.sentences.forEach((sentence, index) => {
      const ru = sentence.map((w) => w.ru).join(" ");
      const fr = sentence[0]?.sentenceFr;
      if (!fr || !usable(ru, fr)) return;
      add({
        id: `r:${text.id}:${index}`,
        fr,
        ru,
        level: translationLevelFor(text.level),
        source: { label: `Texte : ${text.title}`, href: `/reading/${text.id}` },
      });
    });
  }

  cache = items;
  return items;
}

export function findTranslationItem(id: string): TranslationItem | undefined {
  return translationItems().find((item) => item.id === id);
}

export function itemsForLevel(level: TranslationLevel): TranslationItem[] {
  return translationItems().filter((item) => item.level === level);
}

/** Un ordre stable pour une même graine — la page le tire côté serveur, sans hasard au rendu. */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
