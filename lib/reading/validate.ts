import type { CaseWhy, GlossedWord, ReadingText } from "./texts";
import type { CaseId } from "@/lib/grammar/types";
import { CEFR_LEVELS, type CefrLevel } from "@/lib/supabase/types";
import { verifyCaseTags } from "./verify-cases";
import { detectTextLanguage } from "./manual";

const CASE_IDS = new Set<CaseId>([
  "nominative",
  "genitive",
  "dative",
  "accusative",
  "instrumental",
  "prepositional",
]);

// L'IA ne renvoie pas toujours EXACTEMENT le schéma demandé dans le prompt
// (lib/ai/prompts.ts) — un champ mal typé ou une structure différente
// planterait ReadingPassage (sentence.map, word.ru) sans error boundary, ou
// pire, serait sauvegardé tel quel en base. Validé ici (utilisé à la fois
// côté serveur avant l'insert et côté client en filet de sécurité) plutôt
// que casté en confiance.
export function toReadingText(raw: unknown, fallbackLevel: CefrLevel = "A1"): ReadingText | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  if (typeof t.title !== "string" || !Array.isArray(t.sentences)) return null;

  const sentences: GlossedWord[][] = [];
  for (const rawSentence of t.sentences) {
    if (!Array.isArray(rawSentence)) return null;
    const sentence: GlossedWord[] = [];
    for (const rawWord of rawSentence) {
      if (!rawWord || typeof rawWord !== "object") return null;
      const w = rawWord as Record<string, unknown>;
      if (typeof w.ru !== "string") return null;
      const word: GlossedWord = { ru: w.ru };
      if (typeof w.gloss === "string") word.gloss = w.gloss;
      // Le cas annoncé est ici seulement RECOPIÉ s'il a la bonne forme ;
      // sa justesse est éprouvée plus bas par verifyCaseTags, qui retire
      // les analyses que la banque contredit.
      if (typeof w.case === "string" && CASE_IDS.has(w.case as CaseId)) {
        word.case = w.case as CaseId;
      }
      sentence.push(word);
    }
    sentences.push(sentence);
  }
  if (sentences.length === 0) return null;

  const level = CEFR_LEVELS.includes(t.level as CefrLevel) ? (t.level as CefrLevel) : fallbackLevel;

  // Dernière étape, et la seule qui juge du FOND : les tags de cas passent
  // devant la banque de déclinaisons. Ceux qu'elle contredit disparaissent,
  // ceux qu'elle confirme sont marqués comme tels. Appliqué ici, donc avant
  // l'insert en base : un texte stocké est déjà nettoyé.
  const verified = verifyCaseTags(sentences);

  return {
    id: "ai-generated",
    title: t.title,
    level,
    sentences: verified.sentences,
    caseCheck: verified.report,
  };
}

/** Un texte collé fait au plus 1500 caractères, un texte généré long vingt phrases : de la marge, pas un plafond qu'on frôle. */
const CLIENT_MAX_SENTENCES = 120;
const CLIENT_MAX_WORDS = 600;

function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.trim().slice(0, max) || undefined;
}

function whyFromClient(raw: unknown): CaseWhy | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const w = raw as Record<string, unknown>;
  const reason = clip(w.reason, 400);
  if (!reason) return undefined;
  // Toujours « ai » : « relue à la main » ne se décerne qu'aux textes de la
  // bibliothèque, jamais sur la foi de ce que le navigateur envoie.
  const why: CaseWhy = { reason, source: "ai" };
  const lemma = clip(w.lemma, 40);
  if (lemma) why.lemma = lemma;
  if (w.number === "singular" || w.number === "plural") why.number = w.number;
  const trigger = clip(w.trigger, 40);
  if (trigger) why.trigger = trigger;
  if (typeof w.disputed === "string" && CASE_IDS.has(w.disputed as CaseId)) {
    why.disputed = w.disputed as CaseId;
  }
  return why;
}

/**
 * Des phrases renvoyées PAR LE NAVIGATEUR : celles d'un texte lu sans être
 * enregistré, dont le serveur n'a aucune copie — pour en expliquer une, ou
 * pour l'enregistrer.
 *
 * On n'en garde que la forme connue, bornée : russe, glose, cas, explication
 * et traduction de la phrase. L'état de vérification n'est pas repris — c'est
 * à l'appelant de repasser par verifyCaseTags. Et le texte doit être du
 * russe : sans ce contrôle, l'explication servirait de rédacteur libre sur le
 * quota de l'apprenant.
 */
export function sentencesFromClient(raw: unknown): GlossedWord[][] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > CLIENT_MAX_SENTENCES) return null;

  let count = 0;
  const sentences: GlossedWord[][] = [];
  for (const rawSentence of raw) {
    if (!Array.isArray(rawSentence) || rawSentence.length === 0) return null;
    count += rawSentence.length;
    if (count > CLIENT_MAX_WORDS) return null;

    const sentence: GlossedWord[] = [];
    for (const [index, rawWord] of rawSentence.entries()) {
      if (!rawWord || typeof rawWord !== "object") return null;
      const w = rawWord as Record<string, unknown>;
      const ru = clip(w.ru, 60);
      if (!ru) return null;
      const word: GlossedWord = { ru };
      const gloss = clip(w.gloss, 80);
      if (gloss) word.gloss = gloss;
      if (typeof w.case === "string" && CASE_IDS.has(w.case as CaseId)) {
        word.case = w.case as CaseId;
        const why = whyFromClient(w.why);
        if (why) word.why = why;
      }
      const sentenceFr = index === 0 ? clip(w.sentenceFr, 500) : undefined;
      if (sentenceFr) word.sentenceFr = sentenceFr;
      sentence.push(word);
    }
    sentences.push(sentence);
  }

  const russian = sentences.map((s) => s.map((w) => w.ru).join(" ")).join(" ");
  return detectTextLanguage(russian) === "ru" ? sentences : null;
}
