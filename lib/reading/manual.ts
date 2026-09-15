import type { CaseId } from "@/lib/grammar/types";
import type { GlossedWord } from "./texts";

/**
 * Un texte collé par l'apprenant, annoté comme un texte généré.
 *
 * LE DÉCOUPAGE SE FAIT ICI, PAS PAR LE MODÈLE. Le russe affiché est
 * exactement celui qui a été collé : le modèle ne peut ni le « corriger » ni
 * en perdre un morceau. Il reçoit les mots numérotés et rend, pour chacun,
 * le mot recopié, sa glose et son cas.
 *
 * POURQUOI IL RECOPIE LE MOT. La première version ne lui demandait que
 * « glose|cas », dans l'ordre, pour économiser la sortie. Essayée sur un
 * vrai texte, elle perdait le fil : sans le mot sous les yeux, le modèle
 * écrivait « старом » à l'accusatif derrière « в » et « молоком » à
 * l'accusatif derrière « за ». Le mot recopié coûte quelques jetons, rend le
 * cas juste, et sert d'ancre : chaque glose est posée sur le mot qu'elle
 * nomme, jamais sur son voisin.
 */

/** Un texte long du générateur, à peu près : de quoi lire un article court sans ouvrir la dépense. */
export const MANUAL_TEXT_MAX_CHARS = 1500;
const MIN_WORDS = 3;

/** Les trois premières lettres du nom anglais : « nom », « gen », « ins »… */
const CASE_BY_CODE: Record<string, CaseId> = {
  nom: "nominative",
  gen: "genitive",
  dat: "dative",
  acc: "accusative",
  ins: "instrumental",
  pre: "prepositional",
};

const LETTER = /\p{L}/u;
const CYRILLIC = /[Ѐ-ӿ]/u;
const DASH = /^[—–-]$/u;

/**
 * La fin d'une phrase : ponctuation finale, guillemet ou parenthèse fermants
 * compris (« …сказал он. » ou « Иди!» »).
 */
const SENTENCE_END = /[.!?…]+[»"”')\]]*$/u;

/**
 * Ce qui finit par un point sans finir une phrase : une initiale (« А. С.
 * Пушкин ») et les abréviations courantes. « Я. » n'en est pas une — c'est
 * une réponse entière.
 */
const NOT_A_SENTENCE_END = /^(?:[А-ЮЁ]\.|[A-Z]\.|т\.|см\.|ул\.|им\.|напр\.|т\.е\.|т\.д\.|т\.п\.)$/iu;

/** Un mot à annoter contient une lettre. « — », « 1799 » ou « … » restent tels quels, sans glose. */
export function isWordToken(token: string): boolean {
  return LETTER.test(token);
}

/** La forme qui sert à reconnaître un mot recopié : sans accent, sans ponctuation, ё = е. */
function fold(word: string): string {
  return word
    .normalize("NFD")
    .replace(/́/g, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}-]/gu, "");
}

/**
 * Phrases, puis mots — la ponctuation reste collée au mot, comme dans les
 * textes générés (« Москве. »). Un retour à la ligne finit toujours une
 * phrase : un titre, une réplique ou un vers n'ont pas forcément de point.
 *
 * « — Вы надолго? — спросила она. » est UNE phrase : après le point
 * d'interrogation, le tiret et la minuscule disent que la réplique continue.
 */
export function tokenizeText(raw: string): string[][] {
  const clean = raw
    .normalize("NFC")
    .replace(/[​-‍﻿]/g, "")
    .replace(/\r\n?/g, "\n");

  const sentences: string[][] = [];
  const close = (tokens: string[]) => {
    if (tokens.length === 0) return;
    // Rien que de la ponctuation (un tiret seul sur sa ligne) : rattachée à
    // la phrase d'avant plutôt qu'une phrase vide à l'écran.
    if (!tokens.some(isWordToken)) {
      sentences[sentences.length - 1]?.push(...tokens);
      return;
    }
    sentences.push(tokens);
  };

  for (const paragraph of clean.split(/\n+/)) {
    const tokens = paragraph.split(/\s+/).filter(Boolean);
    let current: string[] = [];
    tokens.forEach((token, j) => {
      current.push(token);
      const continues = DASH.test(tokens[j + 1] ?? "") && /^\p{Ll}/u.test(tokens[j + 2] ?? "");
      if (SENTENCE_END.test(token) && !NOT_A_SENTENCE_END.test(token) && !continues) {
        close(current);
        current = [];
      }
    });
    close(current);
  }
  return sentences;
}

/**
 * La langue d'une saisie, lue sur son alphabet — le champ accepte le russe
 * collé comme le français écrit. Au moins sept lettres sur dix d'un côté :
 * un texte russe qui cite « Louvre » reste russe, un texte français qui cite
 * « борщ » reste français. Entre les deux, ou sans aucune lettre, rien n'est
 * décidé.
 */
export function detectTextLanguage(raw: string): "ru" | "fr" | null {
  const letters = [...raw].filter((ch) => LETTER.test(ch));
  if (letters.length === 0) return null;
  const share = letters.filter((ch) => CYRILLIC.test(ch)).length / letters.length;
  if (share >= 0.7) return "ru";
  if (share <= 0.3) return "fr";
  return null;
}

export type ManualTextCheck =
  | { ok: true; sentences: string[][]; words: number }
  | { ok: false; error: string };

/** Validé des deux côtés : le client pour répondre tout de suite, le serveur avant de dépenser. */
export function checkManualText(raw: string): ManualTextCheck {
  const text = raw.trim();
  if (!text) return { ok: false, error: "Colle d'abord un texte russe." };
  if (text.length > MANUAL_TEXT_MAX_CHARS) {
    return { ok: false, error: `Texte trop long : ${MANUAL_TEXT_MAX_CHARS} caractères au plus.` };
  }
  if (detectTextLanguage(text) !== "ru") {
    return { ok: false, error: "Le texte doit être en russe, écrit en cyrillique." };
  }
  const sentences = tokenizeText(text);
  const words = sentences.reduce((n, s) => n + s.filter(isWordToken).length, 0);
  if (words < MIN_WORDS) {
    return { ok: false, error: `Il faut au moins ${MIN_WORDS} mots pour y lire des cas.` };
  }
  return { ok: true, sentences, words };
}

/**
 * Un texte écrit en français, avant de partir en traduction. Les bornes du
 * russe, pour que la traduction puisse ensuite être annotée : trop court, il
 * n'y aurait pas de cas à lire ; trop long, sa traduction ne passerait pas.
 */
export function checkFrenchText(raw: string): { ok: true; words: number } | { ok: false; error: string } {
  const text = raw.trim();
  if (!text) return { ok: false, error: "Écris d'abord un texte en français." };
  if (text.length > MANUAL_TEXT_MAX_CHARS) {
    return { ok: false, error: `Texte trop long : ${MANUAL_TEXT_MAX_CHARS} caractères au plus.` };
  }
  const language = detectTextLanguage(text);
  if (language === "ru") return { ok: false, error: "Ce texte est déjà en russe." };
  if (language === null) {
    return {
      ok: false,
      error: /\p{L}/u.test(text)
        ? "Écris en français ou en russe, pas un mélange des deux."
        : "Écris un texte en français ou en russe.",
    };
  }
  const words = text.split(/\s+/).filter(isWordToken).length;
  if (words < MIN_WORDS) {
    return { ok: false, error: `Encore quelques mots : ${MIN_WORDS} au moins pour traduire.` };
  }
  return { ok: true, words };
}

/**
 * Ce que le modèle reçoit : une ligne par phrase, les seuls mots séparés par
 * « | ». « 1. Я | живу | в | Москве. »
 */
export function annotationLines(sentences: string[][]): string {
  return sentences
    .map((s, i) => `${i + 1}. ${s.filter(isWordToken).map((w) => w.replace(/\|/g, "/")).join(" | ")}`)
    .join("\n");
}

interface Entry {
  key: string;
  gloss: string;
  case?: CaseId;
}

/** `["Москве", "Moscou", "pre"]` → le mot reconnu, sa glose et son cas. Un code inconnu ne donne pas de cas. */
function parseEntry(entry: unknown): Entry | null {
  if (!Array.isArray(entry) || typeof entry[0] !== "string" || typeof entry[1] !== "string") return null;
  const key = fold(entry[0]);
  const gloss = entry[1].trim().slice(0, 80);
  if (!key || !gloss) return null;
  const kase =
    typeof entry[2] === "string" ? CASE_BY_CODE[entry[2].trim().toLowerCase().slice(0, 3)] : undefined;
  return kase ? { key, gloss, case: kase } : { key, gloss };
}

export interface AppliedAnnotations {
  sentences: GlossedWord[][];
  /** Mots du texte, ponctuation seule exclue. */
  words: number;
  /** Mots restés sans glose : le modèle ne les a pas rendus, ou pas à leur place. */
  missed: number;
}

/** Jusqu'où chercher le mot suivant quand le modèle en a inséré un de trop. */
const LOOKAHEAD = 3;

/**
 * Pose les gloses sur les mots collés, en suivant LES MOTS et non les
 * tableaux : un modèle qui fusionne deux phrases, ou en coupe une, ne décale
 * rien. Une glose n'est posée que sur le mot qu'elle recopie ; un mot oublié
 * reste lisible, simplement sans rien à toucher. L'appelant décide si le
 * texte vaut encore la peine d'être gardé.
 */
export function applyAnnotations(sentences: string[][], raw: unknown): AppliedAnnotations | null {
  if (!Array.isArray(raw)) return null;
  const entries = raw.flatMap((s) => (Array.isArray(s) ? s : [])).map(parseEntry);
  let next = 0;
  let words = 0;
  let missed = 0;

  const annotated = sentences.map((tokens) =>
    tokens.map((ru): GlossedWord => {
      if (!isWordToken(ru)) return { ru };
      words += 1;
      const key = fold(ru);
      for (let k = next; k < Math.min(entries.length, next + LOOKAHEAD); k += 1) {
        const entry = entries[k];
        if (entry?.key !== key) continue;
        next = k + 1;
        return entry.case ? { ru, gloss: entry.gloss, case: entry.case } : { ru, gloss: entry.gloss };
      }
      missed += 1;
      return { ru };
    })
  );
  return { sentences: annotated, words, missed };
}

/** Quand ni l'apprenant ni le modèle n'ont donné de titre : les premiers mots du texte. */
export function fallbackTitle(sentences: string[][]): string {
  const words = sentences
    .flat()
    .filter(isWordToken)
    .slice(0, 4)
    .map((w) => w.replace(/[^\p{L}\p{M}-]/gu, ""));
  return `${words.join(" ")}…`;
}
