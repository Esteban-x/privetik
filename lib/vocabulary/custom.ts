// Listes de vocabulaire (page /vocabulary) : petits wrappers fetch vers
// app/api/vocab/**, appelés depuis des composants client. Toutes les listes
// sont créées par l'utilisateur.

import type { SrsCard } from "@/lib/srs/sm2";
import type { Focus } from "./focus";
import type { Animacy, FrenchGender, Gender, StemType } from "@/lib/grammar/types";
import type { VocabItem } from "./data";
import { quotaErrorFrom } from "@/lib/billing/quota-client";

export interface VocabListSummary {
  id: string;
  name: string;
  createdAt: string;
  wordCount: number;
  /** Mots que l'apprenant a marqués « je le sais » — hors révision. */
  knownCount: number;
  /** Mots qu'il a marqués « à travailler » — toujours en tête de file. */
  priorityCount: number;
  /** Mots que la file proposera maintenant — ce qui fait choisir par où commencer. */
  dueCount: number;
}

export interface CustomVocabWord {
  id: string;
  ru: string;
  transliteration: string | null;
  fr: string;
  exampleRu: string | null;
  exampleFr: string | null;
  gender?: Gender | null;
  animacy?: Animacy | null;
  stemType?: StemType | null;
  frenchGender?: FrenchGender | null;
  indeclinable?: boolean | null;
  // Présents seulement dans la file de révision globale (fetchDueWords) où
  // les mots viennent de listes différentes ; absents en contexte liste
  // unique (fetchListDetail), où toVocabItem retombe sur un nom fourni.
  listId?: string;
  listName?: string;
  /** Priorité choisie par l'apprenant (voir lib/vocabulary/focus.ts). */
  focus: Focus;
  srs: SrsCard | null;
}

export function fetchDueWords(): Promise<{
  words: CustomVocabWord[];
  dueCount: number;
  /** Mots mis de côté par l'apprenant — hors file, mais bien présents. */
  knownCount: number;
  totalWords: number;
  /** Nouveaux mots encore permis aujourd'hui (voir lib/vocabulary/new-words.ts). */
  newAllowance?: number;
  /** Nouveaux mots que la limite du jour laisse pour demain. */
  newWaiting?: number;
}> {
  return fetch("/api/vocab/due").then((r) => json(r));
}

export function fetchDailyProgress(): Promise<{ reviewedToday: number; goal: number }> {
  return fetch("/api/vocab/daily-progress").then((r) => json(r));
}

/**
 * Le mot est déjà dans la liste.
 *
 * Un type dédié, pour la raison qui a valu le sien à `QuotaError` : sans
 * lui, le `catch` ne peut que comparer des chaînes pour distinguer un
 * doublon d'une panne, et les deux appellent des écrans opposés — l'un
 * montre le mot déjà présent, l'autre propose de réessayer. Le pendant
 * serveur est le 409 de app/api/vocab/words.
 */
export class DuplicateWordError extends Error {
  readonly existing: { id: string; ru: string; fr: string };

  constructor(message: string, existing: { id: string; ru: string; fr: string }) {
    super(message);
    this.name = "DuplicateWordError";
    this.existing = existing;
  }
}

export function isDuplicateWordError(err: unknown): err is DuplicateWordError {
  return err instanceof DuplicateWordError;
}

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  // Le refus de quota AVANT l'erreur générique : un 429 est une réponse
  // normale (plafond de révisions atteint), pas un incident réseau, et il
  // appelle un écran d'abonnement plutôt qu'un message rouge « réessayer ».
  const quota = quotaErrorFrom(res, data);
  if (quota) throw quota;
  // Même raisonnement pour le 409 : c'est une réponse, pas une panne.
  if (res.status === 409 && data.duplicate) {
    throw new DuplicateWordError(data.error || "Ce mot est déjà dans la liste.", data.duplicate);
  }
  if (!res.ok) throw new Error(data.error || "Erreur réseau");
  return data as T;
}

export function fetchLists(): Promise<{ lists: VocabListSummary[] }> {
  return fetch("/api/vocab/lists").then((r) => json(r));
}

export function createList(name: string): Promise<{ list: VocabListSummary }> {
  return fetch("/api/vocab/lists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  }).then((r) => json(r));
}

export function renameList(listId: string, name: string): Promise<{ ok: true }> {
  return fetch(`/api/vocab/lists/${listId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  }).then((r) => json(r));
}

export function deleteList(listId: string): Promise<{ ok: true }> {
  return fetch(`/api/vocab/lists/${listId}`, { method: "DELETE" }).then((r) => json(r));
}

export function fetchListDetail(listId: string): Promise<{
  list: { id: string; name: string };
  words: CustomVocabWord[];
  /** Nouveaux mots encore permis aujourd'hui (voir lib/vocabulary/new-words.ts). */
  newAllowance?: number;
}> {
  return fetch(`/api/vocab/lists/${listId}`).then((r) => json(r));
}

export interface WordInput {
  ru: string;
  fr: string;
  transliteration?: string;
  exampleRu?: string;
  exampleFr?: string;
}

/**
 * Ce que devient une tentative d'ajout, vu du formulaire.
 *
 * TROIS ISSUES ET NON DEUX. « null ou pas null » confondait le doublon et
 * la panne, alors que l'un demande de corriger le mot et l'autre de
 * réessayer le même. Le formulaire a besoin de savoir lequel des deux pour
 * choisir ce qu'il dit — et pour garder les champs remplis dans les deux
 * cas, ce qu'il ne faisait pas.
 */
export type AddOutcome =
  | { status: "added"; word: CustomVocabWord; alsoIn?: string[] }
  | { status: "duplicate"; message: string }
  | { status: "failed"; message: string };

export function addWord(
  listId: string,
  word: WordInput
): Promise<{ word: CustomVocabWord; alsoIn?: string[] }> {
  return fetch("/api/vocab/words", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listId, ...word }),
  }).then((r) => json(r));
}

/**
 * Enregistre la modification d'un mot et renvoie le mot TEL QUE LE SERVEUR
 * L'A ÉCRIT — accent tonique posé, translittération recalculée. Sans
 * l'état de révision (`srs`), que la modification ne touche pas : l'appelant
 * garde le sien.
 *
 * Un russe qui existe déjà dans la liste lève `DuplicateWordError`, comme à
 * l'ajout.
 */
export function updateWord(
  wordId: string,
  word: Partial<WordInput>
): Promise<{ ok: true; word: Omit<CustomVocabWord, "srs" | "listId" | "listName"> }> {
  return fetch(`/api/vocab/words/${wordId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(word),
  }).then((r) => json(r));
}

/**
 * L'autre moitié d'un mot, proposée pendant la saisie — dans les deux sens.
 *
 * `from` dit ce que l'apprenant a tapé : "ru" (il veut la traduction) ou
 * "fr" (il veut le mot russe). La réponse porte toujours les DEUX côtés, le
 * côté saisi étant recopié tel quel.
 *
 * `null` dès que rien d'utile n'est disponible (saisie trop courte, mauvais
 * alphabet, IA indisponible, clé absente) : l'appelant n'a alors rien à
 * afficher, le formulaire reste utilisable tel quel.
 */
export interface TranslationSuggestion {
  ru: string;
  fr: string;
  transliteration: string | null;
  partOfSpeech: string | null;
  confident: boolean;
  /** "bank" = traduction relue à la main, "ai" = proposée par le modèle. */
  source: "bank" | "ai";
  /** Le côté que l'apprenant a saisi, donc celui qu'il ne faut pas toucher. */
  from: "ru" | "fr";
}

/**
 * Propose l'autre moitié d'un mot pendant la saisie.
 *
 * PAS D'ANNULATION, ET C'EST DÉLIBÉRÉ. Une requête interrompue par
 * `AbortController` rejette, et ce rejet doit être attrapé partout où il
 * peut surgir — la requête elle-même, la lecture du corps de la réponse,
 * la couche de transport du framework. Il suffit d'un chemin oublié pour
 * qu'un `AbortError` remonte jusqu'à l'écran, ce qui est arrivé deux fois
 * ici malgré des gardes successives.
 *
 * Les traducteurs à saisie continue (Yandex, Google) ne s'annulent pas non
 * plus : ils NUMÉROTENT leurs requêtes et jettent les réponses qui ne sont
 * plus les dernières. Aucune promesse n'est jamais rejetée, donc aucune ne
 * peut fuir. Le coût est une requête qui va au bout alors que son résultat
 * ne servira pas — négligeable ici, la temporisation de saisie n'en
 * laissant partir qu'une par pause de frappe.
 *
 * Voir `AddWordForm` pour la numérotation côté appelant.
 */
export interface SuggestionResponse {
  suggestion: TranslationSuggestion | null;
  /** Présent quand la suggestion a été REFUSÉE, et non simplement absente. */
  quota?: { reason: string; plan: "free" | "premium"; upgrade: boolean };
}

export function suggestTranslation(
  word: string,
  from: "ru" | "fr"
): Promise<SuggestionResponse> {
  return fetch("/api/vocab/suggest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ word, from }),
  }).then((r) => json(r));
}

/**
 * Range un mot : « à travailler », « normal » ou « je le sais ». C'est le
 * seul geste qui décide de ce que la file de révision propose — il n'y a
 * plus de classement automatique derrière.
 */
export function setWordFocus(wordId: string, focus: Focus): Promise<{ ok: true }> {
  return fetch(`/api/vocab/words/${wordId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ focus }),
  }).then((r) => json(r));
}

export function deleteWord(wordId: string): Promise<{ ok: true }> {
  return fetch(`/api/vocab/words/${wordId}`, { method: "DELETE" }).then((r) => json(r));
}

/** Ce qu'il reste au plafond de révisions, renvoyé avec chaque carte notée. */
export interface ReviewAllowance {
  plan: "free" | "premium";
  cap: number;
  remaining: number;
}

export function reviewCustomCard(
  cardId: string,
  wordRu: string,
  wordFr: string,
  quality: number
): Promise<{ card: SrsCard; quota?: ReviewAllowance }> {
  return fetch("/api/vocab/srs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cardId, wordRu, wordFr, quality }),
  }).then((r) => json(r));
}

/**
 * Soumet une réponse produite (frappe ou QCM) : c'est le SERVEUR qui la
 * juge et qui enregistre la révision — voir app/api/vocab/answer. Le client
 * n'envoie pas l'attendu et ne décide pas de la note.
 */
export function submitVocabAnswer(params: {
  cardId: string;
  userAnswer: string;
  expectedLanguage: "ru" | "fr";
  mode: "typing" | "qcm";
  revealed?: boolean;
}): Promise<{
  correct: boolean;
  expected: string;
  aiAccepted: boolean;
  quota?: ReviewAllowance;
}> {
  return fetch("/api/vocab/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).then((r) => json(r));
}

// Adapte un mot de liste perso au format VocabItem, pour réutiliser les
// mêmes pages d'exercice que le catalogue intégré. `fallbackListName` sert
// en contexte liste unique ; en révision globale, chaque mot porte déjà son
// propre `listName` (mots de listes différentes mélangés dans une session).
export function toVocabItem(word: CustomVocabWord, fallbackListName: string): VocabItem {
  return {
    id: word.id,
    ru: word.ru,
    transliteration: word.transliteration ?? "",
    fr: word.fr,
    theme: word.listName || fallbackListName,
    example:
      word.exampleRu && word.exampleFr ? { ru: word.exampleRu, fr: word.exampleFr } : undefined,
  };
}
