import type { CefrLevel } from "@/lib/supabase/types";
import type { CaseNumberMode } from "@/lib/storage";
import { pickFresh } from "@/lib/practice/recent";
import { CaseId, Noun } from "./types";
import {
  CaseExercise,
  generateIsolatedExercise,
  generateMcqExercise,
  generateNumeralExercise,
  generateSentenceExercise,
} from "./exercise-generator";
import { resolveNumber, triggerAllows, triggersForCase } from "./triggers";
import { pickWeightedTrigger, type TriggerProgressMap } from "./exercise-selector";

/**
 * Le tirage du module Cas, hors composant.
 *
 * POURQUOI PAS DANS CaseDeclension.tsx, D'OÙ IL VIENT. Le contrôle de
 * variété (scripts/check-variety.mjs) doit rejouer une vraie session : s'il
 * recopiait le tirage, il vérifierait sa propre copie, et resterait vert le
 * jour où l'écran ferait autre chose. Le composant garde ce qui le regarde
 * — l'état, l'appel réseau, l'affichage.
 */

export type CaseTab = "isolated" | "sentence" | "mcq" | "numeral";

/**
 * Part des exercices qui portent sur le GROUPE NOMINAL — « но́вой доро́ги »
 * — plutôt que sur le nom nu.
 *
 * POURQUOI MÉLANGÉ, ET PAS UN ONGLET DE PLUS. Un adjectif devant un nom
 * n'est pas un autre exercice : c'est la phrase russe ordinaire. Le sortir
 * dans son propre onglet, c'est réapprendre à décliner « доро́га » d'un
 * côté et « но́вая доро́га » de l'autre, comme si la seconde était une
 * matière avancée — alors qu'on ne rencontre presque jamais la première en
 * lisant.
 *
 * UN TIERS, ET PAS DAVANTAGE. Le groupe demande deux désinences au lieu
 * d'une : à moitié-moitié, le nom seul — qui reste la brique — devient
 * l'exception. Un tiers suffit à ce que le groupe ne surprenne plus, et
 * laisse la majorité des passages sur ce que la page annonce.
 *
 * JAMAIS SUR L'ONGLET DES CHIFFRES. « два но́вых до́ма » met l'adjectif au
 * génitif PLURIEL pendant que le nom reste au génitif singulier : une règle
 * à part entière, que cet onglet n'enseigne pas et que le moteur ne
 * calcule pas. L'y mêler produirait des réponses fausses présentées comme
 * justes.
 */
const GROUP_SHARE = 1 / 3;

/** La mémoire courte est tenue par onglet : un mot vu « isolé » n'est pas une phrase vue. */
export function caseRecentKey(caseId: CaseId, tab: CaseTab): string {
  return `cases:${caseId}:${tab}`;
}

/**
 * Ce qui identifie un exercice pour la mémoire courte (voir
 * lib/practice/recent.ts) : l'exercice exact, puis la phrase, puis le mot.
 *
 * LE DÉCLENCHEUR N'EN FAIT PAS PARTIE, et c'est une décision. Il en faisait
 * partie tant qu'il n'avait qu'une phrase : la reprendre, c'était forcément
 * remontrer la même page. Maintenant qu'il en a six, le compter revenait à
 * choisir l'exercice sur le déclencheur — un candidat dont le déclencheur
 * était plus ancien gagnait même si sa PHRASE venait de passer, et le
 * doublon arrivait au quinzième exercice au lieu du vingtième. Deux phrases
 * différentes du même déclencheur ne sont pas une répétition : « Я живу́ у
 * ___ » puis « Она́ рабо́тает у ___ », c'est le déclencheur travaillé deux
 * fois, pas la même page servie deux fois.
 */
export function caseExerciseIds(exercise: CaseExercise): string[] {
  const context = exercise.sentenceTemplate ?? exercise.countForm ?? "seul";
  // L'ADJECTIF FAIT PARTIE DE L'IDENTITÉ DE L'EXERCICE, pas de celle du
  // nom. « но́вая доро́га » et « ста́рая доро́га » sont deux exercices — la
  // désinence à trouver n'est pas la même — mais c'est bien le même nom
  // travaillé, et l'espacement du nom doit continuer de compter les deux.
  const group = exercise.adjective ? `${exercise.adjective.id}+${exercise.noun.id}` : exercise.noun.id;
  const ids = [
    `${context}:${group}:${exercise.plural ? "pl" : "sg"}`,
    `noun:${exercise.noun.id}`,
  ];
  if (exercise.sentenceTemplate) ids.push(`phrase:${exercise.sentenceTemplate}`);
  return ids;
}

export interface CaseDrawOptions {
  tab: CaseTab;
  caseId: CaseId;
  /** Progression serveur par déclencheur : ce qui est mal réussi revient plus souvent. */
  triggerStats: TriggerProgressMap;
  level?: CefrLevel;
  pool: Noun[];
  numberMode: CaseNumberMode;
}

/**
 * Un candidat, tiré sans mémoire : le tirage historique, inchangé (part du
 * palier selon le niveau, priorité aux déclencheurs les moins réussis).
 * `pickCaseExercise` en demande plusieurs et garde le moins récent.
 */
export function drawCaseCandidate({
  tab,
  caseId,
  triggerStats,
  level,
  pool,
  numberMode,
}: CaseDrawOptions): CaseExercise {
  // « Mélange » tire à chaque exercice, pas une fois pour la session : le
  // contraste ne s'apprend qu'en alternant.
  const wantPlural = numberMode === "plural" || (numberMode === "mixed" && Math.random() < 0.5);
  // Tiré à chaque exercice, comme le nombre : c'est l'alternance qui
  // apprend, pas une session entière d'un seul format.
  const withAdjective = tab !== "numeral" && Math.random() < GROUP_SHARE;

  if (tab === "isolated") return generateIsolatedExercise(caseId, wantPlural, pool, withAdjective);
  if (tab === "numeral") return generateNumeralExercise(pool);

  // Le nombre demandé restreint le tirage aux gabarits qui l'acceptent. En
  // « Mélange » on ne restreint rien : chaque gabarit servira le nombre
  // qu'il supporte, ce qui vaut mieux que d'écarter la moitié de la banque.
  const eligible = triggersForCase(caseId).filter(
    (t) => numberMode === "mixed" || triggerAllows(t, wantPlural),
  );
  const trigger = pickWeightedTrigger(
    eligible.length > 0 ? eligible : triggersForCase(caseId),
    triggerStats,
    level,
  );
  const plural = resolveNumber(trigger, wantPlural);

  if (tab === "mcq") return generateMcqExercise(caseId, trigger, pool, plural, withAdjective);
  return generateSentenceExercise(caseId, trigger, pool, plural, withAdjective);
}

/**
 * Le tirage tel que l'apprenant le reçoit : plusieurs candidats, celui vu le
 * moins récemment l'emporte.
 *
 * Ne mémorise PAS : sur l'onglet « Phrase », le mot finalement montré peut
 * encore venir d'une phrase rédigée à la volée. C'est l'appelant qui
 * enregistre, une fois l'exercice arrêté.
 */
export function pickCaseExercise(options: CaseDrawOptions): CaseExercise {
  return pickFresh(
    caseRecentKey(options.caseId, options.tab),
    () => drawCaseCandidate(options),
    caseExerciseIds,
  );
}
