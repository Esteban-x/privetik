import { startOfUtcDay } from "@/lib/vocabulary/new-words";

/**
 * « Mes erreurs » : ce qui a été raté, et pas encore réussi depuis.
 *
 * LE RATTRAPAGE DE SÉANCE NE SUFFIT PAS. Il fait revenir une erreur trois
 * exercices plus tard ; mais retrouver une réponse vue il y a une minute
 * n'est pas s'en souvenir. Ce qui ancre la mémoire, c'est de la retrouver le
 * LENDEMAIN. Rien ne le permettait : une erreur disparaissait avec la séance.
 *
 * SANS TABLE NOUVELLE. Chaque réponse corrigée est déjà écrite dans le journal
 * d'activité avec de quoi retrouver l'exercice — l'`itemId` des banques,
 * et pour les cas le nom, le nombre, l'adjectif et la phrase. Une erreur est
 * « en attente » tant que la DERNIÈRE réponse enregistrée à cet exercice est
 * fausse. Les rattrapages de séance ne sont pas enregistrés : seule une
 * réponse qui compte peut lever une erreur.
 *
 * Fonctions pures : la route lit le journal, ce fichier décide.
 */

/** La fenêtre relue : au-delà, une erreur ancienne ne dit plus rien de précis. */
export const ERROR_WINDOW_DAYS = 30;

/** Une séance d'erreurs se fait d'une traite ; au-delà on n'en voit plus le bout. */
export const MAX_ERRORS = 30;

export type ErrorModule =
  | "cases"
  | "adjectives"
  | "aspect"
  | "motion"
  | "participles"
  | "numbers"
  | "conjugation"
  | "alphabet";

/** Le `kind` du journal → le module. Les kinds viennent des routes de correction. */
export const ERROR_KINDS: Record<string, ErrorModule> = {
  case: "cases",
  adjective: "adjectives",
  aspect: "aspect",
  motion: "motion",
  participle: "participles",
  numbers: "numbers",
  conjugation: "conjugation",
  alphabet: "alphabet",
};

export interface LoggedAttempt {
  kind: string;
  correct: boolean | null;
  created_at: string;
  meta: Record<string, unknown> | null;
}

/** De quoi refaire un exercice de cas — voir app/api/cases/attempt. */
export interface CaseErrorRef {
  caseId: string;
  nounId: string | null;
  plural: boolean;
  adjectiveId: string | null;
  triggerId: string | null;
  sentence: string | null;
  exerciseKind: string | null;
  numeral: number | null;
}

export interface PendingError {
  key: string;
  module: ErrorModule;
  /** Modules à banque : l'identifiant d'item, qui suffit à refaire l'exercice. */
  itemId?: string;
  case?: CaseErrorRef;
  lastWrongAt: string;
  /** Réponses fausses enregistrées depuis la dernière réussite. */
  misses: number;
}

const text = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

/** L'exercice qu'une réponse journalisée désigne, ou `null` si le journal ne permet pas de le retrouver. */
function locate(attempt: LoggedAttempt): Omit<PendingError, "lastWrongAt" | "misses"> | null {
  const errorModule = ERROR_KINDS[attempt.kind];
  if (!errorModule) return null;
  const meta = attempt.meta ?? {};

  if (errorModule === "cases") {
    const caseId = text(meta.caseId);
    if (!caseId) return null;
    const ref: CaseErrorRef = {
      caseId,
      nounId: text(meta.nounId),
      plural: meta.plural === true,
      adjectiveId: text(meta.adjectiveId),
      triggerId: text(meta.triggerId),
      sentence: text(meta.sentence),
      exerciseKind: text(meta.exerciseKind),
      numeral: typeof meta.numeral === "number" ? meta.numeral : null,
    };
    // Une réponse écrite avant que le journal garde le nom ne permet de
    // retrouver que son déclencheur : elle reviendra avec un autre mot.
    if (!ref.nounId) {
      return ref.triggerId ? { key: triggerKey(caseId, ref.triggerId), module: errorModule, case: ref } : null;
    }
    const key = [
      "case",
      caseId,
      ref.nounId,
      ref.plural ? "pl" : "sg",
      ref.adjectiveId ?? "",
      ref.sentence ?? ref.exerciseKind ?? "",
      ref.numeral ?? "",
    ].join(":");
    return { key, module: errorModule, case: ref };
  }

  const itemId = text(meta.itemId);
  return itemId ? { key: `${errorModule}:${itemId}`, module: errorModule, itemId } : null;
}

function triggerKey(caseId: string, triggerId: string): string {
  return `case:${caseId}:trigger:${triggerId}`;
}

/**
 * Les erreurs en attente, de la plus ancienne à la plus récente.
 *
 * Une réussite ferme l'exercice exact ; sur les cas, elle ferme aussi une
 * erreur ancienne rattachée au seul déclencheur — c'est lui qu'elle mesurait.
 */
export function pendingErrors(attempts: LoggedAttempt[], limit: number = MAX_ERRORS): PendingError[] {
  const sorted = [...attempts].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const open = new Map<string, PendingError>();

  for (const attempt of sorted) {
    if (attempt.correct === null) continue;
    const located = locate(attempt);
    if (!located) continue;

    if (attempt.correct) {
      open.delete(located.key);
      if (located.case?.triggerId) open.delete(triggerKey(located.case.caseId, located.case.triggerId));
      continue;
    }
    const known = open.get(located.key);
    open.set(located.key, {
      ...located,
      lastWrongAt: attempt.created_at,
      misses: (known?.misses ?? 0) + 1,
    });
  }

  return [...open.values()]
    .sort((a, b) => a.lastWrongAt.localeCompare(b.lastWrongAt))
    .slice(0, limit);
}

/**
 * Une erreur est ÉCHUE quand elle date d'avant aujourd'hui : la retrouver le
 * jour même, juste après la séance, ne mesure pas grand-chose. La page
 * « Mes erreurs » les sert toutes, les échues d'abord ; la séance du jour ne
 * compte que les échues.
 */
export function isDueError(error: Pick<PendingError, "lastWrongAt">, now: number = Date.now()): boolean {
  return error.lastWrongAt < startOfUtcDay(now);
}
