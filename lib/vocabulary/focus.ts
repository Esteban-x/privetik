// Priorité de révision d'un mot, choisie par l'apprenant.
//
// Ce module remplace lib/vocabulary/mastery.ts, qui déduisait trois états
// (« à découvrir » / « en cours » / « maîtrisé ») du compteur de répétitions
// SM-2. Le verdict venait de la machine : deux réussites d'affilée valaient
// « maîtrisé », une seule faute renvoyait le mot tout en bas, et l'apprenant
// n'avait aucun moyen de dire « celui-là je le sais » ou « celui-là, montre
// le moi plus souvent ». C'est lui qui range ses mots maintenant.
//
// Le SM-2 n'a pas disparu : il continue d'espacer les mots « normal » entre
// eux (lib/srs/sm2.ts). Il ne produit simplement plus aucun libellé.

import { masteryScore } from "@/lib/srs/sm2";

export type Focus = "priority" | "normal" | "known";

export const FOCUS_ORDER: Focus[] = ["priority", "normal", "known"];

export const FOCUS_META: Record<
  Focus,
  {
    label: string;
    short: string;
    icon: string;
    dot: string;
    text: string;
    bar: string;
    /** Habillage du segment sélectionné dans le sélecteur d'une carte mot. */
    active: string;
    hint: string;
  }
> = {
  priority: {
    label: "À travailler",
    short: "à travailler",
    icon: "★",
    dot: "bg-accent",
    text: "text-accent-ink",
    bar: "bg-accent",
    active: "bg-accent text-white",
    hint: "Toujours proposé en premier dans les révisions",
  },
  normal: {
    label: "Normal",
    short: "normal",
    icon: "•",
    dot: "bg-muted/40",
    text: "text-muted",
    bar: "bg-bg3",
    active: "bg-bg3 text-text",
    hint: "Revient selon l'espacement habituel",
  },
  known: {
    label: "Je le sais",
    short: "acquis",
    icon: "✓",
    dot: "bg-success",
    text: "text-success",
    bar: "bg-success",
    // `text-white` sur ce vert menthe donne 2,27:1 en thème sombre. L'encre
    // adaptative (voir --color-on-tint dans globals.css) passe les deux
    // thèmes : 8,72 en sombre, 4,91 en clair.
    active: "bg-success text-on-tint",
    hint: "Retiré des révisions tant que tu ne le remets pas",
  },
};

/**
 * « 3 à travailler », « 12 acquis », « 5 normaux » — l'accord se fait ici
 * plutôt que dans chaque composant, la barre et le rail des listes disant
 * la même chose.
 *
 * POURQUOI « ACQUIS » ET NON « SU ». Son pluriel « sus » se lisait mal —
 * l'œil y voit d'abord la préposition, et en capitales dans un compteur
 * (« 0 SUS ») le mot ne veut plus rien dire du tout. « Acquis » ne change
 * pas au pluriel, se lit à l'identique en majuscules, et dit exactement ce
 * que l'apprenant a déclaré : ce mot-là, il l'a.
 */
export function focusCountLabel(focus: Focus, count: number): string {
  if (focus === "priority") return "à travailler";
  if (focus === "known") return "acquis";
  return count === 1 ? "normal" : "normaux";
}

export function isFocus(value: unknown): value is Focus {
  return value === "priority" || value === "normal" || value === "known";
}

/** Valeur par défaut d'un mot dont la colonne est absente (base pas migrée). */
export function focusOf(word: { focus?: string | null }): Focus {
  return isFocus(word.focus) ? word.focus : "normal";
}

/** Le minimum qu'il faut connaître d'un mot pour l'ordonner. */
export interface Reviewable {
  focus?: string | null;
  srs: { repetitions: number; easeFactor: number; dueAt: number } | null;
}

/**
 * La file de révision, dans l'ordre où les mots seront proposés.
 *
 * Une seule définition, partagée par le serveur (app/api/vocab/due, qui
 * agrège toutes les listes) et le client (useReviewQueue, qui travaille sur
 * une liste ouverte) — deux tris concurrents finiraient par diverger, et
 * l'apprenant verrait un décompte qui ne correspond pas à ce qu'il révise.
 *
 * 1. « à travailler » d'abord, sans regarder l'échéance : c'est exactement
 *    ce que l'apprenant a demandé en les marquant.
 * 2. puis les « normal » DÉJÀ VUS dont l'intervalle SM-2 est échu ;
 * 3. puis les « normal » jamais vus, dans l'ordre reçu et dans la limite du
 *    jour (`newAllowance`, voir lib/vocabulary/new-words.ts). Ils passaient
 *    avant les révisions échues : cinquante mots ajoutés d'un coup
 *    repoussaient tout ce qu'on avait appris la veille.
 * 4. « je le sais » jamais — sauf s'il ne reste plus qu'eux, auquel cas la
 *    file est vide et l'appelant le dit franchement plutôt que de servir
 *    un mot que l'apprenant a mis de côté.
 *
 * À l'intérieur des groupes 1 et 2, le moins bien su passe devant
 * (masteryScore), ce qui reste le seul usage du SM-2 visible d'ici.
 */
export function reviewQueue<T extends Reviewable>(
  words: T[],
  now: number = Date.now(),
  newAllowance: number = Infinity
): T[] {
  const byScore = (a: T, b: T) => masteryScore(a.srs) - masteryScore(b.srs);
  const active = words.filter((w) => focusOf(w) !== "known");
  const priority = active.filter((w) => focusOf(w) === "priority").sort(byScore);
  const normal = active.filter((w) => focusOf(w) === "normal");
  const due = normal.filter((w) => w.srs && w.srs.dueAt <= now).sort(byScore);
  const fresh = normal.filter((w) => !w.srs).slice(0, Math.max(0, newAllowance));
  // Rien d'échu ni de nouveau permis, mais des mots déjà vus : on les propose
  // quand même plutôt que d'afficher une file vide — réviser en avance n'a
  // jamais fait de mal. Les mots nouveaux au-delà de la limite, eux,
  // attendent : les servir ici annulerait la limite.
  if (priority.length === 0 && due.length === 0 && fresh.length === 0) {
    return normal.filter((w) => w.srs).sort(byScore);
  }
  return [...priority, ...due, ...fresh];
}

/** Décompte d'une liste : ce qu'affichent la barre, le rail et le tableau de bord. */
export function countFocus<T extends Reviewable>(
  words: T[],
  now: number = Date.now(),
  newAllowance: number = Infinity
): {
  total: number;
  priority: number;
  normal: number;
  known: number;
  due: number;
  /** Mots jamais vus que la limite du jour laisse pour demain. */
  newWaiting: number;
} {
  let priority = 0;
  let known = 0;
  for (const w of words) {
    const focus = focusOf(w);
    if (focus === "priority") priority += 1;
    else if (focus === "known") known += 1;
  }
  const normal = words.filter((w) => focusOf(w) === "normal");
  const seenDue = normal.filter((w) => w.srs && w.srs.dueAt <= now).length;
  const fresh = normal.filter((w) => !w.srs).length;
  const allowed = Math.min(fresh, Math.max(0, newAllowance));
  return {
    total: words.length,
    priority,
    normal: words.length - priority - known,
    known,
    // « Dû » veut dire « sera proposé maintenant », donc exactement la
    // longueur de la file ci-dessus — sans le repli sur tout le stock, qui
    // ferait afficher un badge rouge alors que rien n'est réellement échu.
    due: priority + seenDue + allowed,
    newWaiting: fresh - allowed,
  };
}
