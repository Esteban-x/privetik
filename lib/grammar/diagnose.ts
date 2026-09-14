import { CASE_ORDER, type Adjective, type CaseId, type Gender, type Noun } from "./types";
import { CASES } from "./cases";
import { ruleForm } from "./decline";
import { declineAdjective } from "./decline-adjective";
import { checkAnswer, normalizeAnswer, type CaseExercise } from "./exercise-generator";

/**
 * Ce qu'une réponse fausse EST, quand on peut le savoir.
 *
 * POURQUOI C'EST POSSIBLE ICI, ET NULLE PART AILLEURS AUSSI BIEN. La banque
 * porte les douze formes vérifiées de chaque nom. Une réponse fausse n'est
 * donc presque jamais une suite de lettres au hasard : c'est une AUTRE case
 * du même tableau. « столу́ » tapé là où l'on attend « стола́ » dit que
 * l'apprenant a pensé datif — pas qu'il ignore le mot. Le lui dire corrige
 * le raisonnement ; afficher « стола́ » seul ne corrige que l'exercice.
 *
 * TROIS DIAGNOSTICS, DU PLUS SÛR AU PLUS PRUDENT :
 *   1. la forme occupe d'autres cases du tableau → on les nomme, en
 *      préférant celles du nombre demandé (« кни́ги » est génitif singulier
 *      ET nominatif pluriel : si l'on attend un singulier, c'est le génitif
 *      qui a été pensé) ;
 *   2. le bon cas, mais l'autre nombre → on le dit tel quel ;
 *   3. la forme est celle que donnerait la règle générale, sur un mot qui
 *      lui échappe → on le dit, parce que c'est une erreur intelligente.
 * Au-delà — une faute de frappe, un autre mot — rien : mieux vaut se taire
 * qu'inventer une explication.
 *
 * Déterministe, sans appel réseau : le plan gratuit y a droit comme les
 * autres.
 */

const NAME = Object.fromEntries(CASES.map((c) => [c.id, c.nameFr.toLowerCase()])) as Record<
  CaseId,
  string
>;

const GENDER_NAME: Record<Gender, string> = {
  masculine: "masculin",
  feminine: "féminin",
  neuter: "neutre",
};

const startsWithVowel = (word: string) => /^[aeiouyéèê]/.test(word);

/** « le génitif », « l'accusatif » — pour une liste, l'article suit son premier mot. */
function the(words: string): string {
  return startsWithVowel(words) ? `l'${words}` : `le ${words}`;
}

/** « au génitif », « à l'accusatif ». */
function at(caseId: CaseId): string {
  const name = NAME[caseId];
  return startsWithVowel(name) ? `à l'${name}` : `au ${name}`;
}

function orList(words: string[]): string {
  const unique = [...new Set(words)];
  return unique.length <= 1
    ? (unique[0] ?? "")
    : `${unique.slice(0, -1).join(", ")} ou ${unique[unique.length - 1]}`;
}

const numberName = (plural: boolean) => (plural ? "pluriel" : "singulier");

interface Cell {
  case: CaseId;
  plural: boolean;
}

/** Les cases du paradigme où cette forme apparaît, variantes du dictionnaire comprises. */
export function cellsOf(noun: Noun, given: string): Cell[] {
  const key = normalizeAnswer(given);
  const cells: Cell[] = [];
  for (const plural of [false, true]) {
    const forms = plural ? noun.forms.plural : noun.forms.singular;
    const variants = plural ? noun.forms.variants?.plural : noun.forms.variants?.singular;
    CASE_ORDER.forEach((caseId, index) => {
      const candidates = [forms?.[index], variants?.[index]].filter(
        (form): form is string => typeof form === "string"
      );
      if (candidates.some((form) => normalizeAnswer(form) === key)) {
        cells.push({ case: caseId, plural });
      }
    });
  }
  return cells;
}

function nounDiagnosis(noun: Noun, given: string, target: CaseId, plural: boolean): string | null {
  const shownGiven = given.trim();
  const cells = cellsOf(noun, given);

  if (cells.length > 0) {
    if (cells.some((cell) => cell.case === target)) {
      return `« ${shownGiven} » est bien ${at(target)}, mais au ${numberName(!plural)} : ici, il faut le ${numberName(plural)}.`;
    }
    if (!plural && cells.some((cell) => cell.case === "nominative" && !cell.plural)) {
      return `« ${shownGiven} » est la forme du dictionnaire, le nominatif : ici, le mot se met ${at(target)}.`;
    }
    const sameNumber = cells.filter((cell) => cell.plural === plural);
    const shown = sameNumber.length > 0 ? sameNumber : cells;
    const numbers = new Set(shown.map((cell) => cell.plural));
    const names = orList(shown.map((cell) => NAME[cell.case]));
    const number = numbers.size === 1 ? ` ${numberName(shown[0].plural)}` : "";
    return `« ${shownGiven} » est ${the(names)}${number} : ici, le mot se met ${at(target)} ${numberName(plural)}.`;
  }

  if (normalizeAnswer(ruleForm(noun, target, plural)) === normalizeAnswer(given)) {
    return `« ${shownGiven} » est ce que donnerait la règle générale, mais ce mot y échappe : sa forme est à retenir.`;
  }
  return null;
}

/**
 * L'adjectif d'un groupe, quand le nom est juste : à quel genre, nombre ou
 * cas la forme donnée l'accorde-t-elle ?
 */
function adjectiveDiagnosis(
  adjective: Adjective,
  noun: Noun,
  given: string,
  target: CaseId,
  plural: boolean
): string {
  const key = normalizeAnswer(given);
  const matches: { case: CaseId; gender: Gender; plural: boolean }[] = [];
  for (const pl of [false, true]) {
    for (const caseId of CASE_ORDER) {
      for (const gender of ["masculine", "feminine", "neuter"] as Gender[]) {
        const form = declineAdjective(adjective, caseId, gender, pl, noun.animacy);
        if (normalizeAnswer(form.form) === key) matches.push({ case: caseId, gender, plural: pl });
        if (pl) break; // au pluriel, les trois genres ont la même forme
      }
    }
  }

  const agreeing = matches.filter(
    (m) => m.plural === plural && (plural || m.gender === noun.gender)
  );
  if (agreeing.length > 0) {
    return `« ${given.trim()} » est ${the(orList(agreeing.map((m) => NAME[m.case])))} : l'adjectif se met ${at(target)}, comme le nom.`;
  }
  if (matches.length > 0) {
    const other = matches[0];
    const agreement = other.plural ? "au pluriel" : `au ${GENDER_NAME[other.gender]}`;
    const nounAgreement = plural ? "pluriel" : `${GENDER_NAME[noun.gender]} singulier`;
    return `« ${given.trim()} » s'accorde ${agreement}, alors que le nom est ${nounAgreement}.`;
  }
  return "l'adjectif ne s'accorde pas avec le nom.";
}

/**
 * Le diagnostic d'une réponse à un exercice de cas, ou `null` si la réponse
 * est juste, vide, ou d'une nature qu'on ne sait pas nommer.
 */
export function diagnoseCaseAnswer(exercise: CaseExercise, answer: string): string | null {
  const given = normalizeAnswer(answer);
  if (!given || checkAnswer(exercise, answer)) return null;
  const { noun, adjective, targetCase, plural } = exercise;

  if (!adjective) return nounDiagnosis(noun, answer, targetCase, plural);

  const words = given.split(" ");
  const expected = normalizeAnswer(exercise.correctForm).split(" ");
  const nounForms = [exercise.correctForm, exercise.variantForm]
    .filter((form): form is string => Boolean(form))
    .map((form) => normalizeAnswer(form).split(" ").pop());

  if (words.length === 1) {
    return nounForms.includes(words[0])
      ? "Le nom est juste, mais l'adjectif manque : c'est le groupe entier qui se décline."
      : nounDiagnosis(noun, words[0], targetCase, plural);
  }
  if (words.length !== 2 || expected.length !== 2) return null;

  const [adjectiveGiven, nounGiven] = words;
  const nounRight = nounForms.includes(nounGiven);
  const adjectiveRight = adjectiveGiven === expected[0];

  if (nounRight && !adjectiveRight) {
    return `Le nom est juste, mais pas l'adjectif : ${adjectiveDiagnosis(adjective, noun, adjectiveGiven, targetCase, plural)}`;
  }
  if (adjectiveRight && !nounRight) {
    const inner = nounDiagnosis(noun, nounGiven, targetCase, plural);
    return `L'adjectif est juste. ${inner ?? "Le nom, lui, n'a pas la bonne terminaison."}`;
  }
  return nounDiagnosis(noun, nounGiven, targetCase, plural);
}
