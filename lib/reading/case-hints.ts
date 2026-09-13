import type { CaseId } from "@/lib/grammar/types";
import type { GlossedWord } from "./texts";

/**
 * « Pourquoi ce cas ? », quand la réponse est écrite dans la phrase.
 *
 * UNE RÈGLE AVANT LE MODÈLE. Dans « в шко́ле », le prépositionnel est imposé
 * par « в » employé pour un lieu ; dans « мно́го люде́й », le génitif pluriel
 * par « мно́го ». Aucun appel n'est nécessaire pour le dire : le mot qui
 * gouverne le cas est juste devant, et ce qu'il exprime avec ce cas est une
 * donnée de grammaire, pas une opinion. L'explication rédigée par l'IA reste
 * disponible pour le reste — la fonction d'un mot sans préposition, le
 * régime d'un verbe — mais elle n'a pas à payer ce qu'une table sait.
 *
 * CONSERVATEUR PAR CONSTRUCTION. Un indice n'est rendu que si le mot précédent
 * est une préposition (ou un mot de quantité) qui ADMET le cas annoncé :
 * « в » + accusatif donne la direction, « в » + prépositionnel le lieu, « в »
 * + datif ne donne rien. Les adjectifs et possessifs accordés — « в на́шей
 * шко́ле » — sont enjambés s'ils portent le même cas.
 *
 * LA TABLE EST ÉCRITE ICI, ET NON LUE DANS lib/grammar/triggers.ts : ce
 * module est chargé par le lecteur, un composant client, et triggers.ts
 * entraîne avec lui la banque de phrases générées. `npm run check:vocab`
 * vérifie que chaque préposition de la banque des déclencheurs y figure avec
 * le même cas — les deux ne peuvent pas diverger sans que ça se voie.
 */

/** Préposition repliée → ce qu'elle exprime avec chacun des cas qu'elle régit. */
export const PREPOSITION_CASES: Record<string, Partial<Record<CaseId, string>>> = {
  "у": { genitive: "la possession ou le lieu « chez quelqu'un »" },
  "из": { genitive: "la provenance : « de », « hors de »" },
  "от": { genitive: "la provenance depuis une personne ou un point de départ" },
  "с": {
    genitive: "le point de départ : « depuis », « du haut de »",
    instrumental: "l'accompagnement : « avec »",
  },
  "до": { genitive: "la limite : « jusqu'à », « avant »" },
  "после": { genitive: "ce qui précède : « après »" },
  "около": { genitive: "la proximité : « près de », « environ »" },
  "вокруг": { genitive: "« autour de »" },
  "вдоль": { genitive: "« le long de »" },
  "мимо": { genitive: "le passage « devant », sans s'arrêter" },
  "напротив": { genitive: "« en face de »" },
  "среди": { genitive: "« parmi », « au milieu de »" },
  "против": { genitive: "l'opposition : « contre »" },
  "кроме": { genitive: "l'exception : « sauf », « à part »" },
  "вместо": { genitive: "le remplacement : « au lieu de »" },
  "из-за": { genitive: "la cause : « à cause de »" },
  "из-под": { genitive: "« de dessous »" },
  "без": { genitive: "l'absence : « sans »" },
  "для": { genitive: "la destination : « pour »" },
  "внутри": { genitive: "« à l'intérieur de »" },
  "ради": { genitive: "« pour », « pour le bien de »" },
  "накануне": { genitive: "« la veille de »" },
  "вроде": { genitive: "la ressemblance : « une sorte de »" },
  "к": { dative: "la direction vers quelqu'un ou quelque chose : « vers », « chez »" },
  "по": { dative: "le déplacement sur une surface, le moyen ou le domaine : « par », « sur », « selon »" },
  "благодаря": { dative: "la cause heureuse : « grâce à »" },
  "вопреки": { dative: "« malgré », « contrairement à »" },
  "согласно": { dative: "« selon », « conformément à »" },
  "в": {
    accusative: "la direction — là où l'on va : « dans », « à »",
    prepositional: "le lieu — là où l'on est : « dans », « à »",
  },
  "на": {
    accusative: "la direction vers une surface, un lieu ouvert ou un événement — là où l'on va",
    prepositional: "le lieu sur une surface, dans un lieu ouvert ou à un événement — là où l'on est",
  },
  "за": {
    accusative: "« pour », « en échange de », ou le délai dans lequel on fait quelque chose",
    instrumental: "la position « derrière », ou ce qu'on va chercher",
  },
  "через": { accusative: "« à travers », ou le délai au bout duquel quelque chose arrive : « dans »" },
  "про": { accusative: "le sujet dont on parle : « à propos de » (registre oral)" },
  "сквозь": { accusative: "« à travers » (sens physique)" },
  "под": {
    accusative: "le mouvement vers le dessous : « sous »",
    instrumental: "la position « sous »",
  },
  "над": { instrumental: "la position « au-dessus de »" },
  "перед": { instrumental: "« devant », ou « juste avant »" },
  "между": { instrumental: "« entre »" },
  "о": { prepositional: "le sujet dont on parle : « de », « à propos de »" },
  "при": { prepositional: "« auprès de », « en présence de », « à l'époque de »" },
};

/** Les variantes vocalisées d'une même préposition : со, ко, во, обо… */
const PREPOSITION_ALIASES: Record<string, string> = {
  "со": "с",
  "ко": "к",
  "во": "в",
  "об": "о",
  "обо": "о",
  "подо": "под",
  "надо": "над",
  "передо": "перед",
  "изо": "из",
  "ото": "от",
};

/** Mots de quantité qui imposent le génitif au nom qui suit. */
const QUANTITY_WORDS: Record<string, string> = {
  "нет": "l'absence — « il n'y a pas de »",
  "много": "une grande quantité — « beaucoup de »",
  "мало": "une petite quantité — « peu de »",
  "немного": "une petite quantité — « un peu de »",
  "несколько": "« plusieurs », suivi du génitif pluriel",
  "сколько": "« combien de »",
  "два": "après 2, 3 et 4, le nom se met au génitif singulier",
  "две": "après 2, 3 et 4, le nom se met au génitif singulier",
  "три": "après 2, 3 et 4, le nom se met au génitif singulier",
  "четыре": "après 2, 3 et 4, le nom se met au génitif singulier",
  "пять": "à partir de 5, le nom se met au génitif pluriel",
  "шесть": "à partir de 5, le nom se met au génitif pluriel",
  "семь": "à partir de 5, le nom se met au génitif pluriel",
  "восемь": "à partir de 5, le nom se met au génitif pluriel",
  "девять": "à partir de 5, le nom se met au génitif pluriel",
  "десять": "à partir de 5, le nom se met au génitif pluriel",
};

export interface CaseHint {
  /** Le mot de la phrase qui impose le cas, tel qu'il y est écrit. */
  trigger: string;
  /** Ce que ce mot exprime avec ce cas. */
  meaning: string;
  kind: "preposition" | "quantity";
}

/** Minuscules, accent tonique et ponctuation ôtés, ё ramené à е. */
export function foldWord(word: string): string {
  return word
    .normalize("NFD")
    .replace(/́/g, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^а-яa-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
}

/** Le mot tel qu'il s'affiche, sans la ponctuation collée. */
function displayWord(word: string): string {
  return word.replace(/^[^\p{L}\d]+|[^\p{L}\d́]+$/gu, "");
}

/**
 * L'indice pour le mot `index` de la phrase, ou `null` s'il n'y a rien de
 * certain à dire.
 */
export function caseHint(sentence: GlossedWord[], index: number): CaseHint | null {
  const word = sentence[index];
  if (!word?.case) return null;

  // Enjambe les mots accordés au même cas : « в на́шей но́вой шко́ле ».
  let i = index - 1;
  while (i >= 0 && sentence[i].case === word.case) i -= 1;
  if (i < 0) return null;

  const previous = sentence[i].ru;
  const folded = foldWord(previous);

  if (word.case === "genitive") {
    const quantity = QUANTITY_WORDS[folded];
    if (quantity) return { trigger: displayWord(previous), meaning: quantity, kind: "quantity" };
    if (/^\d+$/.test(folded)) {
      return {
        trigger: displayWord(previous),
        meaning: "après un nombre, le nom se met au génitif",
        kind: "quantity",
      };
    }
  }

  const preposition = PREPOSITION_CASES[PREPOSITION_ALIASES[folded] ?? folded];
  const meaning = preposition?.[word.case];
  if (!meaning) return null;
  return { trigger: displayWord(previous), meaning, kind: "preposition" };
}
