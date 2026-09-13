import type { CaseId } from "@/lib/grammar/types";
import { isFrenchProse } from "@/lib/ai/client";
import type { CaseWhy, GlossedWord } from "./texts";
import { foldWord } from "./case-hints";

/**
 * L'explication des cas d'une phrase, rédigée par l'IA — et ce qu'on en garde.
 *
 * SERVEUR ET CONTRÔLES UNIQUEMENT (elle lit `isFrenchProse`, qui vit avec le
 * client Anthropic).
 *
 * Le modèle COMMENTE ici un fait grammatical que l'annotation a déjà posé ;
 * c'est la situation où il peut enseigner faux avec le plus d'aplomb. Trois
 * garde-fous, tous mécaniques :
 *
 *   1. LA LANGUE. Une explication rédigée en russe est inutilisable pour qui
 *      apprend le russe — elle est écartée (voir isFrenchProse).
 *   2. L'ACCORD AVEC L'ANNOTATION. Quand le modèle lit un autre cas que celui
 *      du texte, sa justification défend SON cas : elle est gardée à part
 *      (`disputed`), et l'écran décide selon que l'annotation a été vérifiée
 *      contre le dictionnaire ou non.
 *   3. LE DÉCLENCHEUR EXISTE. Un « mot qui impose le cas » absent de la phrase
 *      est une invention — il est retiré, l'explication reste.
 */

const CASE_IDS = new Set<CaseId>([
  "nominative",
  "genitive",
  "dative",
  "accusative",
  "instrumental",
  "prepositional",
]);

export interface SentenceExplanation {
  /** La phrase en français, ou `null` si la traduction n'a pas passé les contrôles. */
  translation: string | null;
  /** Par position dans la phrase. Seuls les mots annotés d'un cas peuvent y figurer. */
  words: Record<number, CaseWhy>;
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

export function toSentenceExplanation(
  raw: unknown,
  sentence: GlossedWord[]
): SentenceExplanation | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const translationRaw = text(r.translation, 500);
  const translation =
    translationRaw.length >= 3 && isFrenchProse(translationRaw) ? translationRaw : null;

  const present = new Set(sentence.map((w) => foldWord(w.ru)).filter(Boolean));
  const words: Record<number, CaseWhy> = {};

  for (const item of Array.isArray(r.words) ? r.words : []) {
    if (!item || typeof item !== "object") continue;
    const w = item as Record<string, unknown>;
    const index = typeof w.index === "number" ? w.index : Number(w.index);
    if (!Number.isInteger(index) || index < 0 || index >= sentence.length) continue;
    const annotated = sentence[index].case;
    if (!annotated || words[index]) continue;

    const reason = text(w.reason, 400);
    if (reason.length < 15 || !isFrenchProse(reason)) continue;

    const why: CaseWhy = { reason, source: "ai" };

    const lemma = text(w.lemma, 40);
    if (/^[а-яё́-]+$/i.test(lemma)) why.lemma = lemma;

    if (w.number === "singular" || w.number === "plural") why.number = w.number;

    const trigger = text(w.trigger, 40);
    // Le déclencheur doit être un mot de la phrase — une ou deux formes
    // (« во время »), toutes présentes.
    if (trigger && trigger.split(" ").every((part) => present.has(foldWord(part)))) {
      why.trigger = trigger;
    }

    const read = typeof w.case === "string" ? (w.case as CaseId) : null;
    if (read && CASE_IDS.has(read) && read !== annotated) why.disputed = read;

    words[index] = why;
  }

  if (!translation && Object.keys(words).length === 0) return null;
  return { translation, words };
}
