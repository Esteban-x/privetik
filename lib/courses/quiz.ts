import type { Lesson, Unit } from "./types";
import type { CefrLevel } from "@/lib/supabase/types";
import type { Rng, Skill } from "@/lib/exercises/types";
import { whyNotFor } from "@/lib/exercises/types";
import { ASPECT_SKILLS, generateAspectExercise, type AspectSkillId } from "@/lib/aspect/exercises";
import { MOTION_SKILLS, generateMotionExercise, type MotionSkillId } from "@/lib/motion/exercises";
import {
  PARTICIPLE_SKILLS,
  generateParticipleExercise,
  type ParticipleSkillId,
} from "@/lib/participles/exercises";
import {
  ADJECTIVE_SKILLS,
  generateAdjectiveExercise,
  type AdjectiveSkillId,
} from "@/lib/adjectives/exercises";
import { NUMBER_SKILLS, generateNumberExercise } from "@/lib/numbers/exercises";
import { CONJUGATION_SKILLS, generateConjugationExercise } from "@/lib/conjugation/exercises";
import { ALPHABET_SKILLS, generateAlphabetExercise } from "@/lib/alphabet/exercises";
import { CASES } from "@/lib/grammar/cases";
import { CASE_ORDER, type CaseId } from "@/lib/grammar/types";
import { declineNoun, stripAccent } from "@/lib/grammar/decline";
import { nounsForLevel } from "@/lib/grammar/nouns-data";
import {
  PROPER_NOUN_TRIGGER_ID,
  resolveNumber,
  templatesFor,
  triggersForCase,
} from "@/lib/grammar/triggers";
import { poolFor } from "@/lib/grammar/exercise-generator";
import { fillFrenchBlank, frenchNounPhrase } from "@/lib/grammar/french-article";

/**
 * Le quiz de fin de leçon : « as-tu retenu ce que tu viens de lire ? »
 *
 * LIRE N'EST PAS APPRENDRE. Une leçon se termine sur l'impression d'avoir
 * compris — celle que donne n'importe quelle explication claire — et la
 * coche « Leçon lue » la consacrait. Se tester juste après, c'est l'effet
 * de test : chercher la réponse fixe la règle bien mieux que la relire, et
 * montre tout de suite ce qui n'a pas été compris.
 *
 * AUCUNE QUESTION ÉCRITE À LA MAIN. 127 leçons × 5 questions, relues, c'est
 * un second cours à maintenir. Les questions viennent de ce qui est déjà
 * vérifié par script :
 *   - les banques d'exercices des compétences que la leçon renvoie à
 *     pratiquer (`lesson.practice`) — la règle de la leçon, appliquée ;
 *   - pour les cas, une phrase de déclencheur et les formes du même nom aux
 *     autres cas comme leurres ;
 *   - les exemples de la leçon, dont il faut retrouver le sens parmi ceux
 *     de l'unité.
 *
 * DÉTERMINISTE. Le tirage est semé par le slug : la page est prérendue, le
 * quiz est le même pour tous, et le script de contrôle rejoue exactement ce
 * qui est servi. Ce n'est donc pas une porte dérobée vers une pratique
 * illimitée hors quota — cinq questions fixes par leçon.
 */

export const QUIZ_SIZE = 5;

/** En deçà, ce n'est plus un quiz : la leçon n'en propose pas. */
export const QUIZ_MIN = 3;

/** Au moins cette part de bonnes réponses : la leçon est marquée comme lue. */
export const QUIZ_PASS = 0.8;

export interface QuizQuestion {
  id: string;
  /** La consigne, en une ligne. */
  prompt: string;
  /** Ce qui précède la question : proposition dépliée, groupe à accorder. */
  context?: string;
  /** Le corps de la question ; `___` marque le trou. */
  question: string;
  /** Traduction ou précision, sous la question. */
  hint?: string;
  options: string[];
  correctIndex: number;
  explain: string;
  whyNot?: Record<string, string>;
}

// ─── Tirage semé ───────────────────────────────────────────────────

function seedOf(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededRandom(text: string): Rng {
  let state = seedOf(text);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: Rng): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pick<T>(items: T[], random: Rng): T {
  return items[Math.floor(random() * items.length)];
}

// ─── Les banques que la leçon renvoie à pratiquer ──────────────────

type BankModule =
  | "aspect"
  | "motion"
  | "participles"
  | "adjectives"
  | "numbers"
  | "conjugation"
  | "alphabet"
  | "cases";

const CASE_SKILLS: Skill[] = CASES.map((c) => ({
  id: c.id,
  title: c.nameFr,
  level: c.id === "nominative" ? "A0" : c.id === "dative" || c.id === "instrumental" ? "A2" : "A1",
  summary: "",
}));

const BANK_SKILLS: Record<BankModule, readonly Skill[]> = {
  aspect: ASPECT_SKILLS,
  motion: MOTION_SKILLS,
  participles: PARTICIPLE_SKILLS,
  adjectives: ADJECTIVE_SKILLS,
  numbers: NUMBER_SKILLS,
  conjugation: CONJUGATION_SKILLS,
  alphabet: ALPHABET_SKILLS,
  cases: CASE_SKILLS,
};

const LEVELS: CefrLevel[] = ["A0", "A1", "A2", "B1", "B2", "C1", "C2"];

/** Les compétences qu'un lien de pratique désigne : une précise, ou celles du module au niveau de la leçon. */
export function skillsForLink(href: string, level: CefrLevel): { module: BankModule; skill: string }[] {
  const [, moduleId, skillId] = href.split("/");
  if (!(moduleId in BANK_SKILLS)) return [];
  const bankModule = moduleId as BankModule;
  const skills = BANK_SKILLS[bankModule];
  if (skillId) return skills.some((s) => s.id === skillId) ? [{ module: bankModule, skill: skillId }] : [];

  const rank = LEVELS.indexOf(level);
  const same = skills.filter((s) => s.level === level);
  const below = skills.filter((s) => LEVELS.indexOf(s.level as CefrLevel) <= rank);
  const chosen = same.length > 0 ? same : below.length > 0 ? below : skills.slice(0, 1);
  return chosen.map((s) => ({ module: bankModule, skill: s.id }));
}

/** Les modules dont un exercice a besoin d'un schéma pour être compris : sans lui, pas de question. */
function bankQuestion(module: BankModule, skill: string, random: Rng, level: CefrLevel): QuizQuestion | null {
  switch (module) {
    case "aspect": {
      const ex = generateAspectExercise(skill as AspectSkillId, random);
      if (ex.schema) return null;
      return {
        id: ex.itemId,
        prompt: ex.sentence ? ex.prompt : "Choisis",
        question: ex.sentence ?? ex.prompt,
        hint: ex.sentenceFr,
        options: ex.options,
        correctIndex: ex.correctIndex,
        explain: ex.explain,
        whyNot: ex.whyNot,
      };
    }
    case "motion": {
      const ex = generateMotionExercise(skill as MotionSkillId, random);
      if (ex.schema) return null;
      return {
        id: ex.itemId,
        prompt: ex.sentence ? ex.prompt : "Choisis",
        question: ex.sentence ?? ex.prompt,
        hint: ex.sentenceFr,
        options: ex.options,
        correctIndex: ex.correctIndex,
        explain: ex.explain,
        whyNot: ex.whyNot,
      };
    }
    case "participles": {
      const ex = generateParticipleExercise(skill as ParticipleSkillId, random);
      // « Qui fait l'action ? » n'a pas de phrase comprimée : la question est
      // la phrase elle-même.
      return {
        id: ex.itemId,
        prompt: ex.prompt,
        context: ex.compressed ? ex.expanded : undefined,
        question: ex.compressed || ex.expanded || ex.prompt,
        hint: ex.sentenceFr,
        options: ex.options,
        correctIndex: ex.correctIndex,
        explain: ex.explain,
        whyNot: ex.whyNot,
      };
    }
    case "adjectives": {
      const ex = generateAdjectiveExercise(skill as AdjectiveSkillId, random);
      return {
        id: ex.itemId,
        prompt: "Accorde l'adjectif",
        context: `Avec : ${ex.nounLabel}`,
        question: ex.sentence,
        hint: ex.sentenceFr,
        options: ex.options,
        correctIndex: ex.correctIndex,
        explain: ex.explain,
        whyNot: ex.whyNot,
      };
    }
    case "numbers":
    case "conjugation":
    case "alphabet": {
      const generate =
        module === "numbers"
          ? generateNumberExercise
          : module === "conjugation"
            ? generateConjugationExercise
            : generateAlphabetExercise;
      const ex = generate(skill, random);
      return {
        id: ex.itemId,
        prompt: ex.prompt,
        context: ex.badge,
        question: ex.question,
        hint: ex.hint,
        options: ex.options,
        correctIndex: ex.correctIndex,
        explain: ex.explain,
        whyNot: ex.whyNot,
      };
    }
    case "cases":
      return caseQuestion(skill as CaseId, random, level);
  }
}

const CASE_NAME = Object.fromEntries(CASES.map((c) => [c.id, c.nameFr.toLowerCase()])) as Record<CaseId, string>;

function formNote(caseId: CaseId, plural: boolean): string {
  const name = CASE_NAME[caseId];
  return `forme ${/^[aeiouy]/.test(name) ? "de l'" : "du "}${name} ${plural ? "pluriel" : "singulier"}`;
}

/**
 * Une phrase de déclencheur, le nom à mettre au bon cas, et comme leurres le
 * même nom à d'autres cas : c'est exactement la décision que la leçon
 * enseigne — et chaque leurre dit quel cas il aurait été.
 */
function caseQuestion(caseId: CaseId, random: Rng, level: CefrLevel): QuizQuestion | null {
  const triggers = triggersForCase(caseId).filter((t) => t.id !== PROPER_NOUN_TRIGGER_ID);
  const basic = triggers.filter((t) => t.tier === "basic");
  if (triggers.length === 0) return null;
  const trigger = pick(basic.length > 0 ? basic : triggers, random);
  const template = pick(templatesFor(trigger), random);
  const plural = resolveNumber(trigger, false);
  const pool = poolFor(trigger, nounsForLevel(level === "A0" ? "A1" : level));
  if (pool.length === 0) return null;
  const noun = pick(pool, random);

  const result = declineNoun(noun, caseId, plural);
  const correct = result.accented ?? result.form;
  const seen = new Set([stripAccent(correct)]);
  if (result.variant) seen.add(stripAccent(result.variant));
  const labels: [string, string][] = [];
  const decoys: string[] = [];
  for (const other of shuffle(
    CASE_ORDER.filter((c) => c !== caseId),
    random
  )) {
    const form = declineNoun(noun, other, plural);
    const shown = form.accented ?? form.form;
    labels.push([shown, formNote(other, plural)]);
    if (seen.has(stripAccent(shown)) || decoys.length >= 3) continue;
    seen.add(stripAccent(shown));
    decoys.push(shown);
  }
  if (decoys.length < 2) return null;

  const options = shuffle([correct, ...decoys], random);
  return {
    id: `case:${caseId}:${trigger.id}:${noun.id}`,
    prompt: `Mets « ${noun.forms.singular[0]} » à la bonne forme`,
    question: template.ru,
    hint: fillFrenchBlank(template.fr, frenchNounPhrase(noun.translation, noun.frenchGender, trigger.article, plural)),
    options,
    correctIndex: options.indexOf(correct),
    explain: `${CASE_NAME[caseId].charAt(0).toUpperCase()}${CASE_NAME[caseId].slice(1)} ${plural ? "pluriel" : "singulier"} : ${result.ruleApplied}.`,
    whyNot: whyNotFor(options, correct, labels),
  };
}

// ─── Les exemples de la leçon ──────────────────────────────────────

const CYRILLIC = /[а-яё]/i;

function sameMeaning(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[«»"'’.,!?;:—–-]/g, "").replace(/\s+/g, " ").trim();
  return norm(a) === norm(b);
}

/** « Que veut dire cette phrase ? » — les leurres sont d'autres exemples de la leçon, puis de l'unité. */
function exampleQuestions(lesson: Lesson, unit: Unit, random: Rng): QuizQuestion[] {
  const examplesOf = (l: Lesson) =>
    l.sections.flatMap((s) => (s.kind === "examples" ? s.items : [])).filter((item) => CYRILLIC.test(item.ru));
  const own = examplesOf(lesson);
  const unitPool = unit.lessons.filter((l) => l.slug !== lesson.slug).flatMap(examplesOf);
  // La même phrase russe deux fois, traduite deux fois autrement — c'est
  // toute la leçon sur l'intonation : hors de sa voix, elle n'a pas UN sens.
  const occurrences = new Map<string, number>();
  for (const item of own) occurrences.set(stripAccent(item.ru), (occurrences.get(stripAccent(item.ru)) ?? 0) + 1);

  const questions: QuizQuestion[] = [];
  for (const item of shuffle(own, random)) {
    if ((occurrences.get(stripAccent(item.ru)) ?? 0) > 1) continue;
    const decoys: string[] = [];
    for (const other of [...shuffle(own, random), ...shuffle(unitPool, random)]) {
      if (decoys.length >= 3) break;
      if (sameMeaning(other.fr, item.fr) || decoys.some((d) => sameMeaning(d, other.fr))) continue;
      decoys.push(other.fr);
    }
    if (decoys.length < 3) continue;
    const options = shuffle([item.fr, ...decoys], random);
    questions.push({
      id: `example:${item.ru}`,
      prompt: "Que veut dire cette phrase ?",
      question: item.ru,
      options,
      correctIndex: options.indexOf(item.fr),
      explain: item.note ? `${item.note.charAt(0).toUpperCase()}${item.note.slice(1)}` : "",
    });
  }
  return questions;
}

// ─── Le quiz ───────────────────────────────────────────────────────

/** Le quiz d'une leçon — vide quand la leçon n'offre pas de quoi en faire un. */
export function buildLessonQuiz(lesson: Lesson, unit: Unit): QuizQuestion[] {
  const random = seededRandom(lesson.slug);

  const targets = (lesson.practice ?? []).flatMap((link) => skillsForLink(link.href, lesson.level));
  const bank: QuizQuestion[] = [];
  const seen = new Set<string>();
  for (let attempt = 0; targets.length > 0 && bank.length < 3 && attempt < 18; attempt += 1) {
    const target = targets[attempt % targets.length];
    const question = bankQuestion(target.module, target.skill, random, lesson.level);
    if (!question || seen.has(question.question)) continue;
    seen.add(question.question);
    bank.push(question);
  }

  const examples = exampleQuestions(lesson, unit, random).slice(0, QUIZ_SIZE - bank.length);
  // En alternance, un exemple d'abord : retrouver un sens met en route
  // avant d'appliquer la règle.
  const quiz: QuizQuestion[] = [];
  while ((examples.length > 0 || bank.length > 0) && quiz.length < QUIZ_SIZE) {
    const fromExamples = examples.length > 0 && (bank.length === 0 || quiz.length % 2 === 0);
    quiz.push((fromExamples ? examples : bank).shift() as QuizQuestion);
  }
  return quiz.length >= QUIZ_MIN ? quiz : [];
}
