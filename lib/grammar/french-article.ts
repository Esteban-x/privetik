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

// Pluriels français irréguliers présents dans la banque (le -eau -> -eaux
// est traité par la règle ci-dessous ; "travail" ne suit aucune des deux).
const IRREGULAR_PLURALS: Record<string, string> = { travail: "travaux" };

// Pluralise juste le premier "mot" de la traduction (avant un espace ou une
// parenthèse) — suffisant pour la petite banque de noms de ce projet, pas
// un pluralisateur français général. Couvre les cas réellement présents
// dans les données : -s/-x/-z déjà invariants (temps), -eau -> -eaux
// (couteau), sinon +s (livre, nom de famille -> noms de famille).
function pluralizeFirstWord(translation: string): string {
  const match = /^(\S+)(.*)$/.exec(translation);
  if (!match) return translation;
  const [, first, rest] = match;
  const irregular = IRREGULAR_PLURALS[first.toLowerCase()];
  if (irregular) return `${irregular}${rest}`;
  if (/[sxz]$/i.test(first)) return translation;
  if (/eau$/i.test(first)) return `${first}x${rest}`;
  return `${first}s${rest}`;
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
  const noun = plural ? pluralizeFirstWord(translation) : translation;
  const core = adjective
    ? adjective.fr.before
      ? `${agree(adjective, gender, plural, noun)} ${noun}`
      : `${noun} ${agree(adjective, gender, plural, noun)}`
    : noun;

  if (article === "none") return core;
  if (plural) return `${article === "indefinite" ? "des" : "ces"} ${core}`;
  if (article === "indefinite") return `${gender === "f" ? "une" : "un"} ${core}`;

  // demonstrative — élision devant voyelle ou h MUET, jamais devant un h
  // aspiré : « ce héros ».
  const aspirated = ASPIRATED_H.has(core.toLowerCase().split(/[\s(]/)[0]);
  if (gender === "m" && !aspirated && VOWEL_SOUND.test(core)) return `cet ${core}`;
  return `${gender === "f" ? "cette" : "ce"} ${core}`;
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
