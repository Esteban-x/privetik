import { Adjective } from "./types";

/**
 * Banque d'adjectifs, forme du dictionnaire uniquement.
 *
 * Elle ne dit plus RIEN de ce qu'un adjectif peut qualifier. Elle l'a fait,
 * via `appliesTo` / `onlyNouns`, tant que l'exercice d'accord tirait le nom
 * au hasard dans la banque des 451 noms : il fallait bien empêcher
 * « вку́сная сосе́дка ». L'approximation reposait sur l'animacité
 * grammaticale et laissait passer une phrase sur trois.
 *
 * Le couple adjectif + nom est désormais écrit, contexte par contexte, dans
 * lib/adjectives/exercises.ts : la question « qui va avec quoi » se règle
 * une fois à l'écriture, plus à chaque tirage. C'est cette relation-là,
 * repliée en index, que le module Cas consulte pour composer un groupe
 * nominal (voir noun-adjectives.generated.ts).
 *
 * `fr` PORTE LES QUATRE FORMES FRANÇAISES ET LA PLACE. Il en faut autant
 * pour écrire « près de la nouvelle route » : le genre vient du nom
 * FRANÇAIS — indépendant du genre russe — et la place de l'adjectif
 * lui-même, « une nouvelle route » contre « une route bleue ». Rien de
 * tout cela ne se dérive ; les dix-huit lignes sont écrites, et
 * check:grammar les tient.
 */

export const ADJECTIVES: Adjective[] = [
  // Dur
  { id: "krasivyy", lemmaM: "краси́вый", translation: "beau / belle", stemType: "hard",
    fr: { m: "beau", f: "belle", mp: "beaux", fp: "belles", before: true, mVowel: "bel" } },
  { id: "novyy", lemmaM: "но́вый", translation: "nouveau", stemType: "hard",
    fr: { m: "nouveau", f: "nouvelle", mp: "nouveaux", fp: "nouvelles", before: true, mVowel: "nouvel" } },
  { id: "staryy", lemmaM: "ста́рый", translation: "vieux", stemType: "hard",
    fr: { m: "vieux", f: "vieille", mp: "vieux", fp: "vieilles", before: true, mVowel: "vieil" } },
  { id: "interesnyy", lemmaM: "интере́сный", translation: "intéressant", stemType: "hard",
    fr: { m: "intéressant", f: "intéressante", mp: "intéressants", fp: "intéressantes", before: false } },
  { id: "tyoplyy", lemmaM: "тёплый", translation: "chaud (temps)", stemType: "hard",
    fr: { m: "chaud", f: "chaude", mp: "chauds", fp: "chaudes", before: false } },
  { id: "kholodnyy", lemmaM: "холо́дный", translation: "froid", stemType: "hard",
    fr: { m: "froid", f: "froide", mp: "froids", fp: "froides", before: false } },
  { id: "vkusnyy", lemmaM: "вку́сный", translation: "délicieux", stemType: "hard",
    fr: { m: "délicieux", f: "délicieuse", mp: "délicieux", fp: "délicieuses", before: false } },
  { id: "umnyy", lemmaM: "у́мный", translation: "intelligent", stemType: "hard",
    fr: { m: "intelligent", f: "intelligente", mp: "intelligents", fp: "intelligentes", before: false } },

  // Dur, accent sur la désinence (-ой)
  { id: "molodoy", lemmaM: "молодо́й", translation: "jeune", stemType: "hard", stressedEnding: true,
    fr: { m: "jeune", f: "jeune", mp: "jeunes", fp: "jeunes", before: true } },

  // Mixte (radical en г к х ж ч ш щ)
  { id: "russkiy", lemmaM: "ру́сский", translation: "russe", stemType: "mixed",
    fr: { m: "russe", f: "russe", mp: "russes", fp: "russes", before: false } },
  { id: "malenkiy", lemmaM: "ма́ленький", translation: "petit", stemType: "mixed",
    fr: { m: "petit", f: "petite", mp: "petits", fp: "petites", before: true } },
  { id: "khoroshiy", lemmaM: "хоро́ший", translation: "bon", stemType: "mixed",
    fr: { m: "bon", f: "bonne", mp: "bons", fp: "bonnes", before: true } },
  { id: "yarkiy", lemmaM: "я́ркий", translation: "brillant", stemType: "mixed",
    fr: { m: "brillant", f: "brillante", mp: "brillants", fp: "brillantes", before: false } },

  // Mixte, accent sur la désinence (-ой)
  { id: "bolshoy", lemmaM: "большо́й", translation: "grand", stemType: "mixed", stressedEnding: true,
    fr: { m: "grand", f: "grande", mp: "grands", fp: "grandes", before: true } },
  { id: "plokhoy", lemmaM: "плохо́й", translation: "mauvais", stemType: "mixed", stressedEnding: true,
    fr: { m: "mauvais", f: "mauvaise", mp: "mauvais", fp: "mauvaises", before: true } },
  { id: "dorogoy", lemmaM: "дорого́й", translation: "cher, précieux", stemType: "mixed", stressedEnding: true,
    fr: { m: "cher", f: "chère", mp: "chers", fp: "chères", before: true } },

  // Mou véritable (radical en н suivi de -ий mou)
  { id: "siniy", lemmaM: "си́ний", translation: "bleu (foncé)", stemType: "soft",
    fr: { m: "bleu", f: "bleue", mp: "bleus", fp: "bleues", before: false } },
  { id: "domashniy", lemmaM: "дома́шний", translation: "domestique, familial", stemType: "soft",
    fr: { m: "domestique", f: "domestique", mp: "domestiques", fp: "domestiques", before: false } },
];

export function getAdjective(id: string): Adjective | undefined {
  return ADJECTIVES.find((a) => a.id === id);
}
