import { clozeOf } from "./cloze";

/**
 * Le mode de révision conseillé aujourd'hui.
 *
 * CINQ MODES, AUCUN CONSEIL. Chacun sert à un moment de l'apprentissage d'un
 * mot — le reconnaître, puis le produire, puis l'employer — et la grille les
 * présentait côte à côte, laissant l'apprenant prendre le plus confortable :
 * les cartes, où l'on se note soi-même. Le conseil suit l'état de la file :
 *   - surtout des mots neufs : QCM, les reconnaître avant de les écrire ;
 *   - surtout des mots en cours (moins de trois réussites) : la frappe ;
 *   - des mots solides qui ont une phrase : la phrase à trous ;
 *   - sinon les cartes, un passage rapide.
 */

export type ReviewMode = "flashcards" | "typing" | "qcm" | "cloze";

export interface GuidedWord {
  ru: string;
  exampleRu?: string | null;
  focus?: string | null;
  srs: { repetitions: number; dueAt: number } | null;
}

export interface Recommendation {
  mode: ReviewMode;
  reason: string;
}

export function recommendReviewMode(
  words: GuidedWord[],
  now: number,
  newAllowance: number = Infinity
): Recommendation | null {
  const active = words.filter((w) => w.focus !== "known");
  const seenDue = active.filter((w) => w.srs && w.srs.dueAt <= now);
  const fresh = Math.min(active.filter((w) => !w.srs).length, Math.max(0, newAllowance));
  const total = seenDue.length + fresh;
  if (total === 0) return null;

  if (fresh / total >= 0.5) {
    return {
      mode: "qcm",
      reason: `${fresh} mot${fresh > 1 ? "s" : ""} nouveau${fresh > 1 ? "x" : ""} : les reconnaître parmi quatre avant d'avoir à les écrire.`,
    };
  }
  const learning = seenDue.filter((w) => (w.srs?.repetitions ?? 0) < 3).length;
  if (learning / total >= 0.5) {
    return { mode: "typing", reason: "Des mots en cours d'apprentissage : les écrire toi-même les ancre." };
  }
  const withSentence = seenDue.filter((w) => clozeOf(w.ru, w.exampleRu)).length;
  if (withSentence / total >= 0.3) {
    return { mode: "cloze", reason: "Des mots déjà solides : les retrouver à la bonne forme, dans une phrase." };
  }
  return { mode: "flashcards", reason: "Des mots déjà solides : un passage rapide en cartes suffit." };
}
