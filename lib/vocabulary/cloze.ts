/**
 * La phrase à trous d'un mot : l'exemple de la carte, le mot retiré à la
 * forme où la phrase l'emploie.
 *
 * RETROUVER UNE TRADUCTION N'EST PAS SAVOIR S'EN SERVIR. La carte demande
 * « maison → дом » ; la phrase demande « Мы до́ма » — le mot ET sa forme.
 * C'est le passage du vocabulaire à la grammaire, et l'exemple que
 * l'apprenant a gardé (ou la phrase du texte d'où vient le mot) le permet
 * sans rien écrire de plus.
 *
 * LA PRÉCISION AVANT LE RAPPEL. Retrouver la forme dans la phrase se fait
 * sans analyseur : un mot de la phrase est retenu s'il commence par le
 * radical du mot et finit par une terminaison de nom ou d'adjectif. Les
 * alternances (день → дня, оте́ц → отца́, друг → друзья́) ne sont pas
 * devinées : mieux vaut pas de trou qu'un trou sur le mauvais mot. La carte
 * se révise alors comme en frappe. Isomorphe : le serveur juge avec la même
 * fonction (app/api/vocab/answer).
 */

export interface Cloze {
  before: string;
  /** Le mot tel qu'écrit dans la phrase, accent compris. */
  answer: string;
  after: string;
}

const ACCENT = /́/g;
const WORD = /[а-яё́]+(?:-[а-яё́]+)*/gi;

function fold(value: string): string {
  return value.toLowerCase().replace(ACCENT, "").replace(/ё/g, "е");
}

/** Terminaisons de nom et d'adjectif, tous cas et nombres — rien au-delà. */
const ENDINGS = new Set([
  "", "а", "я", "о", "е", "у", "ю", "ы", "и", "ь",
  "ой", "ей", "ом", "ем", "ам", "ям", "ах", "ях", "ами", "ями", "ов", "ев", "ью",
  "ия", "ии", "ию", "ие", "ий", "ье", "ья", "ьи", "ьев", "ьям", "ьями", "ьях",
  "ый", "ая", "ое", "ые", "ого", "его", "ому", "ему", "ым", "им", "ую", "юю",
  "ых", "их", "ыми", "ими", "ою", "ею", "ее", "яя",
]);

function radical(lemma: string): string {
  if (/(ый|ий|ой|ая|яя|ое|ее)$/.test(lemma)) return lemma.slice(0, -2);
  if (/(ие|ия|ье|ья)$/.test(lemma)) return lemma.slice(0, -2);
  if (/[аяоеьйиыу]$/.test(lemma)) return lemma.slice(0, -1);
  return lemma;
}

function score(lemma: string, form: string): number {
  if (form === lemma) return 1000;
  const stem = radical(lemma);
  if (stem.length < 3 || !form.startsWith(stem)) return 0;
  const ending = form.slice(stem.length);
  return ENDINGS.has(ending) ? 100 + stem.length - ending.length : 0;
}

export function clozeOf(word: string, sentence: string | null | undefined): Cloze | null {
  if (!sentence) return null;
  const lemma = fold(word.trim());
  if (!/^[а-я-]+$/.test(lemma)) return null;

  let best: { index: number; text: string; score: number } | null = null;
  for (const match of sentence.matchAll(WORD)) {
    const value = score(lemma, fold(match[0]));
    if (value > 0 && (!best || value > best.score)) {
      best = { index: match.index ?? 0, text: match[0], score: value };
    }
  }
  if (!best) return null;
  return {
    before: sentence.slice(0, best.index),
    answer: best.text,
    after: sentence.slice(best.index + best.text.length),
  };
}
