import { FrenchGender, type Adjective } from "./types";

// Mode d'article à appliquer devant la traduction française insérée dans
// un gabarit de phrase (lib/grammar/triggers.ts) :
// - "none"         : le gabarit gère déjà l'article lui-même (ex. "des ___"
//                    déjà écrit en dur) ou l'usage français est idiomatiquement
//                    sans article (partitif après une expression de quantité :
//                    "beaucoup de ___", "un morceau de ___", "au lieu de ___").
// - "indefinite"    : un/une — identification/classification ("C'est ___.").
// - "demonstrative" : ce/cet/cette/ces — cas par défaut pour tout le reste
//                     (complément d'objet, complément prépositionnel...) ;
//                     ne se contracte jamais avec une préposition précédente
//                     (de/à + ce/cette reste "de ce", jamais "du"), ce qui
//                     évite d'avoir à gérer les contractions au cas par cas.
export type ArticleMode = "none" | "indefinite" | "demonstrative";

// Le h muet compte comme une voyelle pour l'élision ("cet homme", "cet
// hôtel", "cette heure").
const VOWEL_SOUND = /^[aeiouyàâäéèêëîïôöùûüh]/i;

/**
 * Les h ASPIRÉS de la banque, qui refusent l'élision : « ce héros », jamais
 * « cet héros ».
 *
 * Un commentaire affirmait ici qu'il n'y en avait aucun. C'était faux, et
 * ça se lisait à l'écran — « J'admire cet héros ». L'aspiration n'est pas
 * dérivable de l'orthographe : elle s'écrit, mot par mot, comme le schéma
 * accentuel des noms russes.
 *
 * Exportée avec H_REVIEWED : check:grammar vérifie que tout mot de la banque
 * commençant par h figure dans l'une des deux listes, pour qu'un « hasard »
 * ou une « hache » ajoutés plus tard forcent la décision au lieu de prendre
 * l'élision par défaut.
 */
export const ASPIRATED_H = new Set(["héros"]);

/** Les h de la banque déjà tranchés — aspirés ou muets. */
export const H_REVIEWED = new Set([
  "héros",
  "homme",
  "heure",
  "hiver",
  "hôpital",
  "hôtel",
  "histoire",
  "humeur",
]);

// ─── Le pluriel français ───────────────────────────────────────────
//
// L'ANCIENNE RÈGLE AJOUTAIT UN S AU PREMIER MOT. Elle suffisait tant que le
// pluriel ne servait qu'aux phrases de quelques déclencheurs ; elle écrivait
// pourtant déjà « œils », « chevals », « journals », « jeune filles » et
// « grand-mères ». Et le jour où la traduction affichée à côté d'un mot à
// mettre au pluriel a dû suivre le nombre, ces formes-là seraient passées
// sous les yeux de tout le monde. Les règles du français, donc — et, pour
// les mots composés, la forme écrite en entier.

/** Les pluriels qu'aucune règle ne donne, mot par mot. */
const IRREGULAR_WORD_PLURALS: Record<string, string> = {
  œil: "yeux",
  oeil: "yeux",
  ciel: "cieux",
  aïeul: "aïeux",
  travail: "travaux",
  bail: "baux",
  corail: "coraux",
  émail: "émaux",
  vitrail: "vitraux",
  soupirail: "soupiraux",
  monsieur: "messieurs",
  madame: "mesdames",
  mademoiselle: "mesdemoiselles",
};

/** Les -al qui font -als. */
const AL_TAKES_S = new Set(["bal", "carnaval", "chacal", "festival", "récital", "régal", "narval", "cal"]);
/** Les -eu et -au qui font -s. */
const EU_TAKES_S = new Set(["pneu", "bleu", "émeu", "landau", "sarrau"]);
/** Les sept -ou qui font -oux. */
const OU_TAKES_X = new Set(["bijou", "caillou", "chou", "genou", "hibou", "joujou", "pou"]);

/**
 * Les traductions en plusieurs mots dont le pluriel ne touche pas que le
 * premier : un adjectif qui s'accorde, un composé à trait d'union dont les
 * deux moitiés varient. Les autres — « ticket de caisse », « nom de famille »
 * — ne pluralisent que leur tête. check:grammar exige qu'une traduction
 * nouvelle en plusieurs mots soit rangée ici ou construite avec « de ».
 */
export const PHRASE_PLURALS: Record<string, string> = {
  "grand-mère": "grands-mères",
  "grand-père": "grands-pères",
  "petit-déjeuner": "petits-déjeuners",
  "jeune fille": "jeunes filles",
  "journal intime": "journaux intimes",
};

/** Le pluriel d'un mot français. */
export function pluralizeWord(word: string): string {
  const lower = word.toLowerCase();
  const irregular = IRREGULAR_WORD_PLURALS[lower];
  if (irregular) return irregular;
  if (/[sxz]$/.test(lower)) return word;
  if (/(au|eu)$/.test(lower) && !EU_TAKES_S.has(lower)) return `${word}x`;
  if (/al$/.test(lower) && !AL_TAKES_S.has(lower)) return `${word.slice(0, -2)}aux`;
  if (OU_TAKES_X.has(lower)) return `${word}x`;
  return `${word}s`;
}

/**
 * Le pluriel d'une traduction de la banque. Une précision entre parenthèses
 * (« bureau (pièce) ») reste telle quelle ; un composé connu prend sa forme
 * écrite ; sinon seul le premier mot varie (« tickets de caisse »).
 */
export function pluralizeTranslation(translation: string): string {
  const match = /^(.*?)(\s*\(.*\))?$/.exec(translation);
  const core = (match?.[1] ?? translation).trim();
  const note = match?.[2] ?? "";
  const known = PHRASE_PLURALS[core.toLowerCase()];
  if (known) return `${known}${note}`;
  const head = /^(\S+)(.*)$/.exec(core);
  if (!head) return translation;
  return `${pluralizeWord(head[1])}${head[2]}${note}`;
}

/**
 * L'adjectif accordé au nom FRANÇAIS, et placé du bon côté.
 *
 * LE GENRE VIENT DU FRANÇAIS, PAS DU RUSSE — c'est le piège de cette
 * fonction. « кни́га » est féminin en russe, sa traduction « livre » est
 * masculine : le groupe s'écrit « ce vieux livre », pas « cette vieille ».
 * D'où `FrenchGender`, porté par le nom, et jamais le genre russe qui sert
 * à décliner.
 *
 * « bel », « nouvel », « vieil » : la forme masculine devant voyelle, que
 * seuls trois adjectifs français possèdent. Elle ne s'applique que devant
 * le nom — « un bel hôtel », mais « un hôtel beau » ne se dit pas de toute
 * façon.
 */
function agree(adjective: Adjective, gender: FrenchGender, plural: boolean, noun: string): string {
  const fr = adjective.fr;
  if (plural) return gender === "f" ? fr.fp : fr.mp;
  if (gender === "f") return fr.f;
  // Le h aspiré refuse l'élision comme il refuse « cet » : « ce vieux héros ».
  const aspirated = ASPIRATED_H.has(noun.toLowerCase().split(/[\s(]/)[0]);
  return fr.mVowel && !aspirated && VOWEL_SOUND.test(noun) ? fr.mVowel : fr.m;
}

/**
 * Insère l'article français adapté devant une traduction, avec élision
 * (ce -> cet) et accord pluriel (ces/des + "s").
 *
 * `adjective` REVIENT, ET AVEC LUI SA RAISON D'ÊTRE. Ce paramètre existait
 * pour écrire la traduction des phrases d'accord assemblées ; il est parti
 * quand ces phrases ont cessé d'être assemblées. Le module Cas en assemble
 * de nouveau — mais sur des couples adjectif + nom curés, jamais tirés au
 * hasard, ce qui était le vrai défaut. Il faut donc de nouveau savoir
 * écrire « près de cette nouvelle route ».
 *
 * L'ARTICLE REGARDE LE PREMIER MOT DU GROUPE, pas le nom. Un adjectif
 * antéposé s'intercale entre les deux : « ce nouvel hôtel » et non « cet
 * nouvel hôtel ». Composer le groupe AVANT de choisir l'article donne ce
 * comportement sans le coder — c'est `core` qui est testé, et `core`
 * commence par l'adjectif quand il précède.
 */
export function frenchNounPhrase(
  translation: string,
  gender: FrenchGender,
  article: ArticleMode,
  plural: boolean,
  adjective?: Adjective
): string {
  const noun = plural ? pluralizeTranslation(translation) : translation;
  const core = adjective
    ? adjective.fr.before
      ? `${agree(adjective, gender, plural, noun)} ${noun}`
      : `${noun} ${agree(adjective, gender, plural, noun)}`
    : noun;

  if (article === "none") return core;
  // « de bons amis », pas « des bons amis » : devant un adjectif antéposé au
  // pluriel, l'indéfini « des » devient « de » à l'écrit.
  if (plural) {
    if (article === "indefinite") return `${adjective?.fr.before ? "de" : "des"} ${core}`;
    return `ces ${core}`;
  }
  if (article === "indefinite") return `${gender === "f" ? "une" : "un"} ${core}`;

  // demonstrative — élision devant voyelle ou h MUET, jamais devant un h
  // aspiré : « ce héros ».
  const aspirated = ASPIRATED_H.has(core.toLowerCase().split(/[\s(]/)[0]);
  if (gender === "m" && !aspirated && VOWEL_SOUND.test(core)) return `cet ${core}`;
  return `${gender === "f" ? "cette" : "ce"} ${core}`;
}

/**
 * La traduction affichée à côté du mot à décliner, AU NOMBRE DEMANDÉ.
 *
 * « глаз (œil) » en regard d'un pluriel à produire, « хоро́ший друг (bon
 * ami) » quand on attend « хоро́ших друзья́х » : le russe montre le point de
 * départ, mais le français, lui, disait le singulier — et faisait décliner au
 * singulier. Au pluriel la traduction porte donc son article, qui rend le
 * nombre visible même quand le nom ne change pas à l'oral : « des yeux »,
 * « de bons amis », « des temps ». Au singulier, rien ne change : « œil »,
 * « bon ami ».
 */
export function frenchPromptPhrase(
  translation: string,
  gender: FrenchGender,
  plural: boolean,
  adjective?: Adjective
): string {
  return plural
    ? frenchNounPhrase(translation, gender, "indefinite", true, adjective)
    : frenchNounPhrase(translation, gender, "none", false, adjective);
}

/**
 * Insère `phrase` à la place de "___" dans un gabarit français, puis
 * corrige l'élision "de" -> "d'" quand elle se retrouve juste avant un mot
 * commençant par une voyelle (mode "none" : "J'ai peu de ___." + "endroit"
 * doit donner "J'ai peu d'endroit.", jamais "de endroit"). Sans effet sur
 * les autres articles (ce/cette/un/une ne s'élident jamais devant "de").
 */
export function fillFrenchBlank(templateFr: string, phrase: string): string {
  const filled = templateFr.replace("___", phrase);
  const elided = filled.replace(/\bde ([aeiouyàâäéèêëîïôöùûhAEIOUYÀÂÄÉÈÊËÎÏÔÖÙÛH])/, "d'$1");
  // Quelques gabarits commencent par le trou (« ___ a une voiture. ») :
  // la traduction sortait alors en minuscule — « ce directeur a une voiture. »
  return elided.charAt(0).toUpperCase() + elided.slice(1);
}
