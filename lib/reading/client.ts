import type { CaseWhy, GlossedWord, ReadingText } from "./texts";
import type { ReadingLength, ReadingStyle } from "@/lib/ai/prompts";
import type { CaseId } from "@/lib/grammar/types";
import type { CefrLevel } from "@/lib/supabase/types";
import { quotaErrorFrom } from "@/lib/billing/quota-client";

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  // Le refus de quota AVANT l'erreur générique : un 429 est une réponse
  // normale (plafond atteint), pas un incident réseau, et il appelle un
  // écran d'abonnement plutôt qu'un message rouge « réessayer ».
  const quota = quotaErrorFrom(res, data);
  if (quota) throw quota;
  if (!res.ok) throw new Error(data.error || "Erreur réseau");
  return data as T;
}

export interface GenerateReadingOptions {
  /** Absent = le niveau du profil, décidé côté serveur. */
  level?: CefrLevel;
  length?: ReadingLength;
  style?: ReadingStyle;
  focusCase?: CaseId;
}

export function generateReadingText(
  options: GenerateReadingOptions
): Promise<{ text: ReadingText; id: string | null }> {
  return fetch("/api/ai/reading", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  }).then((r) => json(r));
}

/**
 * Un texte collé par l'apprenant, annoté mot à mot — voir app/api/ai/reading/annotate.
 * Il n'est pas enregistré : `id` vaut toujours `null`, et le titre français
 * et le résumé reviennent à part, pour l'enregistrer tel quel s'il est gardé.
 */
export function annotateReadingText(input: {
  text: string;
  title?: string;
}): Promise<{ text: ReadingText; id: null; titleFr: string | null; summaryFr: string | null }> {
  return fetch("/api/ai/reading/annotate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).then((r) => json(r));
}

/** Un texte écrit en français, traduit en russe avant d'être annoté — voir app/api/ai/reading/translate. */
export function translateReadingText(text: string): Promise<{ ru: string }> {
  return fetch("/api/ai/reading/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  }).then((r) => json(r));
}

export interface SavedReadingTextSummary {
  id: string;
  title: string;
  titleFr: string | null;
  level: CefrLevel;
  sentenceCount: number;
  /** Nombre de mots annotés de chaque cas. */
  caseCounts?: Partial<Record<CaseId, number>>;
  createdAt: string;
}

export function fetchMyReadingTexts(): Promise<{ texts: SavedReadingTextSummary[] }> {
  return fetch("/api/reading/mine").then((r) => json(r));
}

export function fetchMyReadingText(id: string): Promise<{ text: ReadingText & { summaryFr: string | null } }> {
  return fetch(`/api/reading/mine/${id}`).then((r) => json(r));
}

/** Garder un texte lu sans être enregistré, explications comprises — voir POST /api/reading/mine. */
export function saveReadingText(input: {
  title: string;
  titleFr: string | null;
  summaryFr: string | null;
  level: CefrLevel;
  sentences: GlossedWord[][];
}): Promise<{ id: string }> {
  return fetch("/api/reading/mine", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).then((r) => json(r));
}

export function deleteMyReadingText(id: string): Promise<{ ok: true }> {
  return fetch(`/api/reading/mine/${id}`, { method: "DELETE" }).then((r) => json(r));
}

/** Les cas d'une phrase, expliqués — voir app/api/reading/explain. */
export interface SentenceCases {
  translation: string | null;
  /** Par position du mot dans la phrase (clé numérique sérialisée en chaîne). */
  words: Record<string, CaseWhy>;
  /** Vrai quand rien n'a été rédigé : explication relue à la main, ou déjà demandée. */
  cached: boolean;
}

export function explainSentenceCases(textId: string, sentenceIndex: number): Promise<SentenceCases> {
  return fetch("/api/reading/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ textId, sentenceIndex }),
  }).then((r) => json(r));
}

/** La même demande pour un texte non enregistré : le serveur n'en a pas de copie, la phrase part avec. */
export function explainUnsavedSentence(sentence: GlossedWord[]): Promise<SentenceCases> {
  return fetch("/api/reading/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sentence }),
  }).then((r) => json(r));
}

/**
 * Une phrase, son explication posée dessus : `why` sur chaque mot expliqué,
 * la traduction sur le premier mot. C'est ainsi qu'un texte garde ses
 * explications — en base pour un texte enregistré, à l'écran pour les autres.
 */
export function withExplanation(
  sentence: GlossedWord[],
  explained: { translation: string | null; words: Record<number, CaseWhy> }
): GlossedWord[] {
  return sentence.map((word, index) => {
    const why = explained.words[index];
    const withWhy = why ? { ...word, why } : word;
    return index === 0 && explained.translation
      ? { ...withWhy, sentenceFr: explained.translation }
      : withWhy;
  });
}

/** Enregistre la fin d'un texte, et le score du mode « Deviner les cas » s'il a été joué. */
export function completeReadingText(params: {
  textId: string;
  level: string;
  found?: number;
  total?: number;
}): Promise<{ ok: true }> {
  return fetch("/api/reading/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).then((r) => json(r));
}
