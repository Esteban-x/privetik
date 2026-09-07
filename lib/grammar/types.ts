export type Gender = "masculine" | "feminine" | "neuter";
export type CaseId =
  | "nominative"
  | "genitive"
  | "dative"
  | "accusative"
  | "instrumental"
  | "prepositional";
export type Animacy = "animate" | "inanimate";
export type StemType = "hard" | "soft" | "mixed"; // mixed = radical en г,к,х,ж,ч,ш,щ

/** Ordre canonique des formes dans `NounForms` et dans toute l'app. */
export const CASE_ORDER: CaseId[] = [
  "nominative",
  "genitive",
  "dative",
  "accusative",
  "instrumental",
  "prepositional",
];

export interface CaseInfo {
  id: CaseId;
  number: number; // ordre traditionnel russe 1-6
  nameRu: string;
  nameFr: string;
  question: string; // "кто? что?" etc.
  usage: string; // explication courte
  color: string; // accent couleur pour l'UI
}

// Genre français de la traduction — INDÉPENDANT du genre russe (ex. "стол"
// est masculin en russe ET en français, mais "книга" livre/féminin en russe
// est masculin en français : "un livre"). Sert à choisir le bon article
// (un/une, ce/cet/cette) quand la traduction est insérée dans une phrase
// française — voir lib/grammar/french-article.ts.
export type FrenchGender = "m" | "f";

/**
 * Paradigme complet, accents toniques compris : 6 formes au singulier, 6 au
 * pluriel, dans l'ordre de CASE_ORDER. C'est la RÉFÉRENCE — le moteur de
 * règles (lib/grammar/decline.ts) ne sert plus à produire la forme, mais à
 * expliquer la règle et à repérer ce qui y échappe.
 */
export interface NounForms {
  singular: string[];
  plural: string[];
  /**
   * Secondes formes, également correctes, indexées par cas (0 = nominatif).
   *
   * Le dictionnaire en donne 148 : « дочерьми́ » ou « дочеря́ми », « тёть »
   * ou « тёте́й », « ма́мой » ou « ма́мою ». L'import n'en gardait qu'une, si
   * bien qu'un apprenant qui tapait l'autre était compté faux. Le rattrapage
   * existait — une relecture par le modèle, côté serveur — mais il coûte un
   * appel, ne se déclenche qu'après un verdict négatif, et n'est pas offert
   * au plan gratuit : la réponse juste y restait une faute.
   */
  variants?: {
    singular?: Record<number, string>;
    plural?: Record<number, string>;
  };
}

export interface Noun {
  id: string;
  lemma: string; // nominatif singulier, sans accent
  translation: string;
  frenchGender: FrenchGender;
  gender: Gender;
  animacy: Animacy;
  /**
   * Rang d'usage (1 = le plus fréquent, 50000 = hors liste de fréquence).
   * Sert à servir du vocabulaire courant à un débutant et des mots plus
   * rares à un avancé — voir `nounsForLevel` dans nouns-data.ts.
   */
  rank: number;
  forms: NounForms;
}

/** Forme des entrées de lib/grammar/nouns-data.generated.ts. */
export type GeneratedNoun = Noun;

export interface DeclensionResult {
  case: CaseId;
  /** Forme attendue, sans accent tonique — c'est elle qu'on compare à la saisie. */
  form: string;
  /** Même forme avec l'accent tonique, pour l'affichage. */
  accented: string;
  ruleApplied: string;
  /** Vrai quand le moteur de règles ne retombe pas sur la forme du dictionnaire. */
  isIrregular: boolean;
  /**
   * Seconde forme correcte, s'il y en a une (« дочеря́ми » à côté de
   * « дочерьми́ »). Accentuée : elle est faite pour être montrée.
   */
  variant?: string;
}

/**
 * L'adjectif en français : les quatre formes, et de quel côté du nom il se
 * place.
 *
 * ÉCRIT, PAS DÉRIVÉ. « beau / belle / beaux / belles » ne se déduit pas de
 * « beau » par règle, et la place non plus — « une nouvelle route » mais
 * « une route bleue ». Dix-huit adjectifs, quatre formes chacun : les
 * écrire coûte moins qu'un générateur qui aurait tort une fois sur cinq.
 */
export interface FrenchAdjective {
  /** Masculin singulier — « nouveau ». */
  m: string;
  /** Féminin singulier — « nouvelle ». */
  f: string;
  /** Masculin pluriel — « nouveaux », parfois identique au singulier (« vieux »). */
  mp: string;
  /** Féminin pluriel — « nouvelles ». */
  fp: string;
  /** Devant le nom (« une nouvelle route ») plutôt que derrière (« une route bleue »). */
  before: boolean;
  /**
   * Masculin devant une voyelle — « un bel hôtel », « un nouvel an ».
   * Trois adjectifs français ont cette forme ; les autres n'en ont pas
   * besoin et laissent ce champ vide.
   */
  mVowel?: string;
}

export interface Adjective {
  id: string;
  lemmaM: string; // masculin nominatif singulier, forme du dictionnaire (ex. "красивый")
  translation: string;
  stemType: StemType; // "mixed" = radical en г,к,х,ж,ч,ш,щ (règle -ий/-ие)
  stressedEnding?: boolean; // accent sur la désinence -> -ой au masc./neutre au lieu de -ый/-ий
  /**
   * Les formes françaises, pour écrire la traduction d'une phrase où le
   * groupe entier est demandé — voir `fr` ci-dessous et frenchNounPhrase.
   */
  fr: FrenchAdjective;
}

/**
 * `appliesTo` ET `onlyNouns` RESTENT RETIRÉS, `fr` REVIENT.
 *
 * Les deux premiers disaient ce qu'un adjectif peut qualifier, pour
 * empêcher une voisine « savoureuse » quand l'exercice d'accord tirait le
 * nom au hasard. L'approximation ne tenait pas : elle passait par
 * l'animacité GRAMMATICALE, qui n'est pas une propriété sémantique, et
 * laissait passer une phrase sur trois. Ils ne reviendront pas : le couple
 * adjectif + nom n'est plus deviné nulle part, il est ÉCRIT contexte par
 * contexte dans lib/adjectives/exercises.ts, et c'est de là que le module
 * Cas tire désormais les siens (voir noun-adjectives.generated.ts).
 *
 * `fr`, lui, revient — parce que sa cause revient aussi. Il écrivait la
 * traduction française des phrases assemblées ; le module Cas en assemble
 * de nouveau, mais sur des couples curés cette fois, et il lui faut bien
 * dire « près de la nouvelle route » quand la réponse attendue est
 * « но́вой доро́ги ». Ce qui avait disparu, c'est le tirage au hasard, pas
 * le besoin de traduire.
 */
