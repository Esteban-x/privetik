/**
 * Le contrat commun des modules d'exercices ajoutés après les cinq
 * premiers.
 *
 * Cas, Mouvement, Aspect, Participes et Adjectif ont chacun leur générateur,
 * leur composant d'entraînement, leur route d'API et leur table — cinq
 * copies d'une même mécanique, qui ne diffèrent que par ce qu'elles
 * demandent. Les modules suivants partagent tout ce qui ne les distingue
 * pas : un exercice est un QCM avec sa consigne, sa phrase, ses options et
 * son explication, et cela suffit à Nombres comme à Conjugaison.
 *
 * Ce qui reste propre à chaque module : la banque, le tirage et la
 * correction. C'est-à-dire exactement ce qui relève du russe.
 */

export interface PracticeExercise {
  /** `skill:item` — le serveur rejoue la correction à partir de lui. */
  itemId: string;
  /** Ce qu'on demande, en une ligne : « Complète », « Quelle heure est-il ? ». */
  prompt: string;
  /** Le corps de la question. `___` marque le trou, s'il y en a un. */
  question: string;
  /** Traduction ou contexte, sous la question. */
  hint?: string;
  /** Étiquette optionnelle : l'information donnée d'avance (genre, personne…). */
  badge?: string;
  options: string[];
  correctIndex: number;
  /** Pourquoi c'est cette réponse — affiché après le choix, jamais avant. */
  explain: string;
  /**
   * Ce que représente chaque mauvaise option : « forme de « ты » »,
   * « terminaison de la 2ᵉ conjugaison ». Voir `whyNotFor`.
   */
  whyNot?: Record<string, string>;
}

/**
 * Les notes « pourquoi pas celle-là » d'un QCM, réduites aux options
 * réellement affichées.
 *
 * POURQUOI ELLES EXISTENT. La correction disait la bonne réponse et la
 * règle, jamais ce que l'apprenant venait de choisir. Or un leurre n'est pas
 * pris au hasard : c'est la forme d'une autre personne, la terminaison de
 * l'autre conjugaison, l'accord d'un autre cas. Nommer la confusion corrige
 * la façon de raisonner ; la seule bonne réponse ne corrige que l'exercice.
 *
 * CALCULÉES APRÈS LE TIRAGE DES OPTIONS. `buildOptions` écarte et
 * dédoublonne des leurres : une note sur une forme absente ne sert à rien,
 * et une note posée sur la bonne réponse — quand un leurre coïncide avec
 * elle, ce que le syncrétisme russe produit souvent — affirmerait une faute
 * là où il n'y en a pas.
 *
 * Une note est un FRAGMENT, sans majuscule ni point : l'écran l'affiche
 * derrière la forme choisie. Deux notes qui visent la même forme sont
 * jointes, parce qu'elles sont toutes deux vraies — « кни́ги » est un
 * génitif singulier ET un nominatif pluriel.
 */
export function whyNotFor(
  options: readonly string[],
  correct: string,
  labels: [form: string | null | undefined, note: string][]
): Record<string, string> | undefined {
  const byForm = new Map<string, string[]>();
  for (const [form, note] of labels) {
    if (!form || form === correct || !options.includes(form)) continue;
    const notes = byForm.get(form) ?? [];
    if (!notes.includes(note)) notes.push(note);
    byForm.set(form, notes);
  }
  if (byForm.size === 0) return undefined;
  return Object.fromEntries([...byForm].map(([form, notes]) => [form, notes.join(" ; ")]));
}

/**
 * Une réponse TAPÉE ramenée à ce qui compte : ni la casse, ni les espaces,
 * ni l'accent tonique, ni la différence ё / е. Personne ne tape l'accent, et
 * le russe courant n'écrit pas le ё — les exiger compterait faux quelqu'un
 * qui connaît la forme.
 */
export function normalizeTyped(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/́/g, "")
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
}

/** Une réponse tapée correspond-elle à la forme attendue ? */
export function typedMatches(answer: string, expected: string): boolean {
  const given = normalizeTyped(answer);
  return given.length > 0 && given === normalizeTyped(expected);
}

/** Une compétence, c'est-à-dire un onglet du module. */
export interface Skill {
  id: string;
  title: string;
  level: string;
  summary: string;
}

/** Générateur pseudo-aléatoire injectable, pour que les tests soient reproductibles. */
export type Rng = () => number;

/** Tire un élément d'une liste non vide. */
export function pick<T>(items: readonly T[], random: Rng): T {
  return items[Math.floor(random() * items.length)];
}

/** Mélange une copie de la liste (Fisher-Yates). */
export function shuffle<T>(items: T[], random: Rng): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Assemble les options d'un QCM : la bonne réponse, puis des leurres, sans
 * doublon, mélangés.
 *
 * Le dédoublonnage n'est pas cosmétique : deux options identiques rendraient
 * l'exercice insoluble (deux boutons justes, un seul reconnu), et cela
 * arrive dès qu'un leurre coïncide avec la réponse — ce que la déclinaison
 * russe produit régulièrement, le génitif et l'accusatif ayant souvent la
 * même forme.
 */
export function buildOptions(
  correct: string,
  candidates: string[],
  random: Rng,
  count = 4
): { options: string[]; correctIndex: number } {
  const unique: string[] = [];
  for (const candidate of candidates) {
    if (candidate !== correct && !unique.includes(candidate)) unique.push(candidate);
  }
  const options = shuffle([correct, ...unique.slice(0, count - 1)], random);
  return { options, correctIndex: options.indexOf(correct) };
}
