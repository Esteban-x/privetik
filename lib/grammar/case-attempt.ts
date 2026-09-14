import { CASES } from "./cases";
import { caseExerciseIds } from "./case-draw";
import type { CaseExercise } from "./exercise-generator";

/**
 * Ce que l'écran envoie à /api/cases/attempt pour un exercice de cas.
 *
 * UNE SEULE FORME, plusieurs écrans : la page d'un cas, « Cas mélangés »,
 * « Mes erreurs ». Le serveur ne reçoit que des IDENTIFIANTS — le nom,
 * l'adjectif, le déclencheur — et recalcule lui-même la forme attendue.
 *
 * `exerciseKind` et `numeral` ne servent PAS à juger. Ils sont gardés dans le
 * journal d'activité pour qu'une erreur puisse revenir telle quelle dans
 * « Mes erreurs » ; le serveur les valide avant de les écrire.
 */
export function caseAttemptBody(
  exercise: CaseExercise,
  userAnswer: string,
  options: { revealed?: boolean; multipleChoice?: boolean } = {}
): Record<string, unknown> {
  return {
    targetCase: exercise.targetCase,
    nounId: exercise.noun.id,
    // L'ADJECTIF EST ENVOYÉ PAR SON IDENTIFIANT, comme le nom, et le serveur
    // recompose le groupe lui-même. Envoyer la forme attendue reviendrait à
    // laisser le client dicter la bonne réponse.
    adjectiveId: exercise.adjective?.id,
    triggerId: exercise.trigger?.id,
    plural: exercise.plural,
    userAnswer,
    revealed: options.revealed ?? false,
    // Contexte de la seconde lecture IA : le verdict, lui, est recalculé
    // côté serveur à partir du nom, du cas et du nombre.
    sentence: exercise.sentenceTemplate,
    // En QCM, la réponse est une des formes proposées : inutile de payer une
    // vérification IA pour un choix qu'on sait faux.
    multipleChoice: options.multipleChoice ?? false,
    exerciseKind: exercise.kind,
    numeral: exercise.numeral,
  };
}

/** L'identité d'un exercice de cas pour la file des rattrapages et le bilan. */
export function caseItemKey(exercise: CaseExercise): string {
  return `${exercise.kind}:${caseExerciseIds(exercise)[0]}`;
}

const NAME = Object.fromEntries(CASES.map((c) => [c.id, c.nameFr.toLowerCase()]));

/** L'énoncé d'un exercice de cas en une ligne, sans la réponse — pour le bilan. */
export function describeCaseExercise(exercise: CaseExercise): string {
  if (exercise.sentenceTemplate) {
    return [exercise.sentenceTemplate.replace("___", "…"), exercise.sentenceFr]
      .filter(Boolean)
      .join(" — ");
  }
  const word = exercise.promptRu ?? exercise.noun.forms.singular[0];
  if (exercise.kind === "numeral") return `${exercise.numeral} + ${word}`;
  if (exercise.targetCase === "nominative") return `${word} → pluriel`;
  return `${word} → ${NAME[exercise.targetCase]} ${exercise.plural ? "pluriel" : "singulier"}`;
}
