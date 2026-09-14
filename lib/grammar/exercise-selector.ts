import { CefrLevel } from "@/lib/supabase/types";
import { CaseTrigger, TriggerTier } from "./triggers";

export interface TriggerStat {
  attempts: number;
  correct: number;
}

export type TriggerProgressMap = Record<string, TriggerStat>; // clé = trigger.id

// Sélection pondérée simple (pas un SRS complet — le drilling de cas est du
// tir rapide, pas de la révision espacée) : un déclencheur jamais vu passe
// en priorité, puis on favorise ceux au taux de réussite le plus faible.
// Un déclencheur maîtrisé garde une petite chance de revenir (poids
// plancher) pour ne pas disparaître complètement de la rotation.
function accuracyWeight(trigger: CaseTrigger, progress: TriggerProgressMap): number {
  const stat = progress[trigger.id];
  if (!stat || stat.attempts === 0) return 3;
  const accuracy = stat.correct / stat.attempts;
  return Math.max(0.15, 1 - accuracy * 0.85);
}

// Les déclencheurs n'ont que 3 paliers (voir triggers.ts), mais l'échelle
// CEFR en compte 7 : on travaille donc sur l'INDEX du niveau plutôt que sur
// une étape à trois valeurs. Auparavant A0 et A1 recevaient exactement le
// même tirage, A2 et B1 aussi — un grand débutant voyait « вопреки » aussi
// souvent qu'un A1 confirmé.
const LEVEL_INDEX: Record<CefrLevel, number> = { A0: 0, A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };
// Niveau à partir duquel un palier de déclencheurs est pleinement de saison.
const TIER_UNLOCK: Record<TriggerTier, number> = { basic: 0, intermediate: 2, advanced: 4 };
const MAX_LEVEL_INDEX = 6;
// Un palier se débloque « en avance » quand la maîtrise est démontrée : on
// avance alors l'index de deux crans, l'écart entre deux paliers.
const UNLOCK_STEP = 2;

// Seuils de "maîtrise" pour débloquer le palier suivant plus tôt que le
// niveau du profil ne le suggère — au moins quelques déclencheurs
// DIFFÉRENTS du palier, chacun essayé plusieurs fois, avec une bonne
// précision globale. Un seul mot réussi par chance ne suffit pas.
const MASTERY_MIN_TRIGGERS = 3;
// Exportés : l'estimation continue du niveau (lib/progress/level-estimate.ts)
// doit dire "maîtrisé" exactement quand le tirage cesse de le proposer en
// priorité. Deux définitions concurrentes de la maîtrise donneraient un
// tableau de bord en désaccord avec les exercices.
export const MASTERY_MIN_ATTEMPTS_EACH = 3;
export const MASTERY_ACCURACY = 0.85;

export function tierMastered(
  tier: TriggerTier,
  triggers: CaseTrigger[],
  progress: TriggerProgressMap
): boolean {
  const attempted = triggers.filter(
    (t) => t.tier === tier && (progress[t.id]?.attempts ?? 0) >= MASTERY_MIN_ATTEMPTS_EACH
  );
  if (attempted.length < MASTERY_MIN_TRIGGERS) return false;

  let totalAttempts = 0;
  let totalCorrect = 0;
  for (const t of attempted) {
    const stat = progress[t.id]!;
    totalAttempts += stat.attempts;
    totalCorrect += stat.correct;
  }
  return totalCorrect / totalAttempts >= MASTERY_ACCURACY;
}

/**
 * Index « effectif » : celui du profil, avancé tant que l'apprenant démontre
 * une vraie maîtrise du palier courant SUR CE CAS précis — plus réactif
 * qu'un niveau de profil figé, qui ne reflète pas forcément la pratique
 * réelle sur un cas donné (un A1 qui a beaucoup travaillé le génitif peut
 * être prêt pour « вопреки » avant que son niveau global ne bouge).
 */
function effectiveIndex(
  baseIndex: number,
  triggers: CaseTrigger[],
  progress: TriggerProgressMap
): number {
  let index = baseIndex;
  const order: TriggerTier[] = ["basic", "intermediate", "advanced"];
  for (const tier of order) {
    if (index >= TIER_UNLOCK[tier] + UNLOCK_STEP) continue; // déjà largement acquis
    if (!tierMastered(tier, triggers, progress)) break;
    index = Math.min(MAX_LEVEL_INDEX, Math.max(index, TIER_UNLOCK[tier] + UNLOCK_STEP));
  }
  return index;
}

/**
 * Part visée pour un palier selon sa distance au niveau de l'apprenant.
 * Rien n'est jamais exclu : un cran au-dessus reste possible (exposition
 * progressive), au-delà ça devient rare.
 */
function tierShare(tier: TriggerTier, index: number | undefined): number {
  if (index === undefined) return 1; // pas de niveau connu (déconnecté) : aucun biais
  const gap = TIER_UNLOCK[tier] - index;
  if (gap <= 0) return 1;
  if (gap === 1) return 0.35;
  if (gap === 2) return 0.12;
  return 0.04;
}

/**
 * Poids de base d'un déclencheur : la part visée pour son palier, DIVISÉE
 * par le nombre de déclencheurs de ce palier dans le cas courant.
 *
 * Sans cette normalisation, le tirage subit la composition de la banque au
 * lieu du niveau : le génitif compte 24 déclencheurs intermédiaires pour 13
 * basiques, si bien qu'un grand débutant recevait un quart d'exercices en
 * « вокруг » / « в течение » simplement parce qu'ils sont plus nombreux.
 */
function tierWeights(triggers: CaseTrigger[], index: number | undefined): Map<TriggerTier, number> {
  const counts = new Map<TriggerTier, number>();
  for (const t of triggers) counts.set(t.tier, (counts.get(t.tier) ?? 0) + 1);
  const weights = new Map<TriggerTier, number>();
  for (const [tier, count] of counts) {
    weights.set(tier, tierShare(tier, index) / count);
  }
  return weights;
}

export function pickWeightedTrigger(
  triggers: CaseTrigger[],
  progress: TriggerProgressMap,
  level?: CefrLevel
): CaseTrigger {
  if (triggers.length === 0) throw new Error("Aucun déclencheur disponible");
  const index = level ? effectiveIndex(LEVEL_INDEX[level], triggers, progress) : undefined;
  const byTier = tierWeights(triggers, index);
  const weights = triggers.map((t) => accuracyWeight(t, progress) * (byTier.get(t.tier) ?? 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < triggers.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return triggers[i];
  }
  return triggers[triggers.length - 1];
}

/**
 * Un déclencheur est-il maîtrisé ? La même définition que le tirage et
 * l'estimation du niveau : c'est elle qui décide, sur la page d'un cas, de
 * cacher la pastille « Déclencheur » derrière un bouton « Indice ».
 */
export function isTriggerMastered(stat: TriggerStat | undefined): boolean {
  return (
    stat !== undefined &&
    stat.attempts >= MASTERY_MIN_ATTEMPTS_EACH &&
    stat.correct / stat.attempts >= MASTERY_ACCURACY
  );
}
