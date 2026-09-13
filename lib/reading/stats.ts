import type { CaseId } from "@/lib/grammar/types";

/**
 * Combien de mots de chaque cas un texte contient.
 *
 * Défensif sur la forme : les phrases des textes générés viennent de la base
 * (`reading_texts.sentences`, du JSON), pas d'un type vérifié à la compilation.
 */
export function countCases(sentences: unknown): Partial<Record<CaseId, number>> {
  const counts: Partial<Record<CaseId, number>> = {};
  if (!Array.isArray(sentences)) return counts;
  for (const sentence of sentences) {
    if (!Array.isArray(sentence)) continue;
    for (const word of sentence) {
      const kase = (word as { case?: unknown } | null)?.case;
      if (typeof kase !== "string") continue;
      counts[kase as CaseId] = (counts[kase as CaseId] ?? 0) + 1;
    }
  }
  return counts;
}
