import { shuffle, type Rng } from "@/lib/exercises/types";

/**
 * Ce qui revient pendant une séance : les exercices ratés.
 *
 * LE PROBLÈME QU'IL RÈGLE. Après une faute, « Suivant » tirait un nouvel
 * exercice, et la mémoire courte (lib/practice/recent.ts) ÉLOIGNAIT même
 * celui qu'on venait de rater — elle garde le moins récemment vu. On lisait
 * la correction, puis on ne retrouvait jamais l'exercice. Or c'est de
 * retrouver soi-même la réponse après l'erreur que naît la mémoire, pas de
 * la lire.
 *
 * CE QUI SE PASSE MAINTENANT. Un exercice raté est remis en file, et revient
 * `RETRY_GAP` exercices plus tard — assez loin pour que la réponse ne soit
 * plus sous les yeux, assez près pour que la correction soit encore fraîche.
 * Il ne quitte la file qu'une fois réussi ; raté de nouveau, il repart pour
 * le même écart.
 *
 * UN RATTRAPAGE N'EST NI ENREGISTRÉ NI DÉCOMPTÉ. La première réponse a déjà
 * écrit la progression ; compter la seconde gonflerait une précision que
 * l'apprenant n'a pas démontrée du premier coup, et consommerait sur le plan
 * gratuit un exercice qu'il ne fait que refaire. La correction est locale —
 * la bonne réponse est connue, elle vient d'être affichée.
 *
 * Fonctions pures : le composant garde l'état, ce fichier ne fait que dire
 * quoi en faire. C'est ce qui permet à scripts/check-exercises.mjs de les
 * rejouer.
 */

/** Exercices neufs par série, avant le bilan. */
export const SERIES_LENGTH = 10;

/** Exercices servis entre une erreur et son retour. */
export const RETRY_GAP = 3;

/**
 * Rattrapages d'un même exercice par séance, au plus.
 *
 * SANS PLAFOND, LA SÉANCE S'ENLISAIT. Quatre erreurs d'affilée, chacune
 * reprogrammée trois exercices plus loin à chaque nouvel échec, se
 * relayaient indéfiniment : le contrôle à l'écran a servi douze rattrapages
 * de suite sans un seul exercice neuf ni aucun bilan. Au-delà de deux
 * tentatives, l'exercice n'a plus rien à gagner à revenir tout de suite — il
 * reste « à revoir » dans le bilan, et dans « Mes erreurs » pour un autre
 * jour.
 */
export const MAX_RETRIES = 2;

export interface RetryEntry<T> {
  id: string;
  item: T;
  /** Rang de service à partir duquel l'exercice peut revenir. */
  due: number;
  /** Rattrapages déjà servis pour cet exercice. */
  attempts: number;
}

/**
 * Remet un exercice en file. Un exercice déjà en attente n'y figure qu'une
 * fois : son échéance est simplement repoussée.
 */
export function scheduleRetry<T>(
  queue: readonly RetryEntry<T>[],
  id: string,
  item: T,
  position: number,
  attempts = 0,
  gap: number = RETRY_GAP
): RetryEntry<T>[] {
  return [...queue.filter((entry) => entry.id !== id), { id, item, due: position + gap, attempts }];
}

/** Un rattrapage raté mérite-t-il de revenir encore ? */
export function retriesLeft(attemptsServed: number): boolean {
  return attemptsServed < MAX_RETRIES;
}

/** L'exercice échu le plus ancien, et la file sans lui — ou `null`. */
export function takeDueRetry<T>(
  queue: readonly RetryEntry<T>[],
  position: number
): { entry: RetryEntry<T>; rest: RetryEntry<T>[] } | null {
  const due = queue.filter((entry) => entry.due <= position).sort((a, b) => a.due - b.due)[0];
  return due ? { entry: due, rest: queue.filter((entry) => entry !== due) } : null;
}

/**
 * Le plus ancien, échu ou non. Pour « Refaire mes erreurs », où l'apprenant
 * demande justement à ne pas attendre, et pour une source épuisée.
 */
export function takeAnyRetry<T>(
  queue: readonly RetryEntry<T>[]
): { entry: RetryEntry<T>; rest: RetryEntry<T>[] } | null {
  const first = [...queue].sort((a, b) => a.due - b.due)[0];
  return first ? { entry: first, rest: queue.filter((entry) => entry !== first) } : null;
}

/**
 * Le même exercice, options remélangées. Sans ça, le rattrapage se
 * réussirait à la position du bouton — « c'était celui en bas à droite » —
 * sans avoir rien retenu du russe.
 */
export function reshuffleChoice<T extends { options: string[]; correctIndex: number }>(
  exercise: T,
  random: Rng = Math.random
): T {
  const correct = exercise.options[exercise.correctIndex];
  const options = shuffle(exercise.options, random);
  return { ...exercise, options, correctIndex: options.indexOf(correct) };
}

// ─── Ce qu'on fait entendre après une réponse ──────────────────────

const CYRILLIC = /[а-яё]/i;

/** La synthèse ne prononce qu'une phrase courte (voir app/api/tts). */
export const SPOKEN_MAX = 120;

/**
 * La phrase russe complète, trou rempli, telle qu'on la fait écouter une
 * fois la réponse donnée — ou `null` s'il n'y a rien de russe à dire.
 *
 * Entendre la forme juste DANS sa phrase, au moment où on vient de la
 * chercher, attache le son à la règle. La phrase n'est jamais prononcée
 * avant la réponse : elle la contiendrait.
 */
export function spokenSentence(text: string | undefined, answer: string): string | null {
  const sentence =
    CYRILLIC.test(answer)
      ? text && text.includes("___")
        ? text.replace("___", answer)
        : answer
      : text && CYRILLIC.test(text) && !text.includes("___")
        ? text
        : null;
  return sentence && sentence.length <= SPOKEN_MAX ? sentence : null;
}

/**
 * La phrase à trou telle qu'on la fait écouter AVANT de répondre : le trou
 * devient une pause, le mot manquant n'est jamais prononcé.
 *
 * SEULEMENT UNE PHRASE À TROU. Un énoncé sans trou est souvent la question
 * elle-même — une lettre dont on cherche le son, un mot dont on cherche
 * l'accent : le prononcer donnerait la réponse. `null` aussi quand il n'y a
 * pas de russe autour du trou (« ___! »), ou que la phrase dépasse ce que la
 * synthèse prononce.
 */
export function spokenGap(text: string | undefined): string | null {
  if (!text || !text.includes("___") || !CYRILLIC.test(text.replace(/_{3,}/g, ""))) return null;
  const sentence = text.replace(/_{3,}/g, "…").replace(/\s+/g, " ").trim();
  return sentence.length <= SPOKEN_MAX ? sentence : null;
}
