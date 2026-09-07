import { Adjective, CaseId, Noun } from "./types";
import { NOUNS } from "./nouns-data";
import { getAdjective } from "./adjectives-data";
import { declineAdjective } from "./decline-adjective";
import { NOUN_ADJECTIVES } from "./noun-adjectives.generated";
import { RUSSIAN_NAMES } from "./names-data";
import { declineNoun } from "./decline";
import {
  CaseTrigger,
  PROPER_NOUN_TRIGGER_ID,
  resolveNumber,
  templatesFor,
  triggersForCase,
} from "./triggers";
import { CASES } from "./cases";
import { CountForm, countFormFor, randomCountNumber } from "./numerals";
import { fillFrenchBlank, frenchNounPhrase } from "./french-article";
import {
  categoryOf,
  countableNouns,
  pluralisableNouns,
  type NounCategory,
} from "./noun-categories";
import { TRIGGER_NOUNS } from "./trigger-nouns.generated";

// Pool unique de tous les exercices : la banque importée, dont chaque forme
// vient du dictionnaire (voir scripts/build-nouns.mjs). Le vocabulaire perso
// de l'apprenant n'y entre PAS — un mot ajouté à la volée n'a ni paradigme
// vérifié, ni irrégularités connues (стул -> стулья, человек -> люди), ni
// schéma accentuel : le moteur en inventerait une déclinaison plausible mais
// fausse, présentée comme la bonne réponse.
//
// Les emprunts indéclinables (кофе, метро) sont écartés à l'import : la
// banque ne contient que des mots qui se déclinent réellement.
export const DECLINABLE_NOUNS = NOUNS;

/**
 * Vivier minimal servi à un déclencheur, quel que soit le niveau.
 *
 * CE QUE CE NOMBRE REMPLACE. Le repli ne se déclenchait que sur un vivier
 * VIDE, et sautait alors d'un coup à la banque entière. Deux conséquences.
 * Un vivier d'un seul mot était considéré comme sain : « Я рабо́таю на ___ »
 * ne trouvait que « компью́тер » au niveau A1, et rendait la même phrase au
 * caractère près, indéfiniment. Et le niveau s'inversait — « Дай мне кусо́к
 * ___ » donnait 16 mots à A0 (vivier vide, donc toute la liste curée) contre
 * 2 à A1 (deux mots, donc pas de repli) : un débutant voyait plus de variété
 * qu'un A1.
 *
 * On élargit donc dès qu'on passe SOUS ce seuil, et par ordre de fréquence
 * plutôt que d'un bond : l'élargissement d'un niveau est toujours contenu
 * dans celui du niveau inférieur, l'inversion ne peut pas revenir.
 *
 * Douze : de quoi ne pas reconnaître la phrase d'un exercice à l'autre sur
 * une série de cinquante (voir scripts/check-variety.mjs), sans forcer la
 * curation de listes que la langue ne peut pas remplir — la banque ne
 * contient que six boissons, « un verre de ___ » n'ira pas au-delà.
 */
const MIN_POOL = 12;

/** Banque triée du plus courant au plus rare : l'ordre dans lequel on élargit. */
const BY_FREQUENCY = [...NOUNS].sort((a, b) => a.rank - b.rank);

export type ExerciseKind = "isolated" | "sentence-fixed" | "trigger-mcq" | "numeral";

/**
 * Les adjectifs qui peuvent qualifier ce nom — la liste curée, ou rien.
 *
 * RIEN N'EST DÉDUIT ICI. Un nom absent de l'index n'aura jamais d'adjectif
 * dans un exercice de cas, et c'est le comportement voulu : mieux vaut un
 * nom nu qu'un « droit cher ». C'est très exactement l'approximation qui
 * avait fait sortir l'accord de ce module (voir noun-adjectives.generated.ts).
 */
export function adjectivesFor(noun: Noun): Adjective[] {
  const ids = NOUN_ADJECTIVES[noun.id];
  if (!ids) return [];
  return ids.map(getAdjective).filter((a): a is Adjective => a !== undefined);
}

/** Les noms d'un vivier qui portent au moins un adjectif curé. */
function withAdjectives(pool: Noun[]): Noun[] {
  return pool.filter((n) => (NOUN_ADJECTIVES[n.id]?.length ?? 0) > 0);
}

/**
 * Le groupe nominal : l'adjectif accordé, puis le nom décliné.
 *
 * L'ACCORD SE FAIT SUR LE GENRE RUSSE ET L'ANIMACITÉ DU NOM, les deux
 * propriétés qui décident de la désinence — « но́вого студе́нта » (animé,
 * accusatif = génitif) contre « но́вый стол » (inanimé, accusatif =
 * nominatif). Les rater ne se voit qu'à l'accusatif masculin, ce qui est
 * précisément la case que cet exercice a le plus à enseigner.
 *
 * LA VARIANTE DU NOM SE PROPAGE AU GROUPE. Quand le dictionnaire donne deux
 * formes — « дочерьми́ » et « дочеря́ми » — les deux groupes correspondants
 * sont acceptés. Sans ça, l'apprenant qui tape la seconde verrait « faux »
 * sur une réponse que le nom seul aurait acceptée.
 */
function asGroup(
  adjective: Adjective,
  noun: Noun,
  targetCase: CaseId,
  plural: boolean,
  declined: { form: string; accented: string; variant?: string; ruleApplied: string },
): {
  correctForm: string;
  accentedForm: string;
  variantForm?: string;
  ruleApplied: string;
  promptRu: string;
  promptFr: string;
} {
  const adj = declineAdjective(adjective, targetCase, noun.gender, plural, noun.animacy);
  return {
    correctForm: `${adj.form} ${declined.form}`,
    accentedForm: `${adj.accented} ${declined.accented}`,
    variantForm: declined.variant ? `${adj.form} ${declined.variant}` : undefined,
    ruleApplied: `${adj.ruleApplied} ; ${declined.ruleApplied}`,
    // ─── L'ÉNONCÉ MONTRE LE GROUPE DÉJÀ ACCORDÉ ────────────────────
    //
    // « ста́рое письмо́ », pas « ста́рый письмо́ ». La forme du dictionnaire
    // d'un adjectif est son masculin, et l'afficher telle quelle devant un
    // neutre ou un féminin donnerait à copier une faute — dans l'énoncé
    // même de l'exercice qui apprend à ne pas la faire.
    //
    // Toujours au SINGULIER, comme la forme de dictionnaire du nom que
    // l'énoncé montrait déjà pour un exercice au pluriel : c'est un point
    // de départ, pas la réponse.
    promptRu: `${declineAdjective(adjective, "nominative", noun.gender, false, noun.animacy).accented} ${noun.forms.singular[0]}`,
    promptFr: frenchNounPhrase(noun.translation, noun.frenchGender, "none", false, adjective),
  };
}

export interface CaseExercise {
  kind: ExerciseKind;
  noun: Noun;
  /**
   * L'adjectif qui qualifie le nom, quand l'exercice porte sur le GROUPE
   * entier. Absent, l'exercice est celui qu'il a toujours été : un nom nu.
   *
   * Quand il est là, `correctForm` porte les deux mots — « но́вой доро́ги »
   * — et c'est ce qui permet à tout le reste de la chaîne de ne rien
   * changer : la correction compare des chaînes normalisées, et
   * `normalizeAnswer` réduit déjà les espaces.
   */
  adjective?: Adjective;
  /**
   * Le groupe sous sa forme de dictionnaire, accordé — « но́вая доро́га » —
   * et sa traduction sans article — « nouvelle route ». Ce que l'énoncé
   * montre, quand il montre quelque chose ; absents sur un nom nu, où
   * l'écran retombe sur le nom et sa traduction.
   */
  promptRu?: string;
  promptFr?: string;
  // Cas réellement demandé par l'exercice. Presque toujours celui de la
  // page, SAUF pour les chiffres : "21 + стол" appelle un nominatif alors
  // que l'onglet vit sur la page du génitif (voir generateNumeralExercise).
  // C'est ce champ, jamais l'id de la page, qui doit servir à vérifier la
  // réponse.
  targetCase: CaseId;
  plural: boolean;
  correctForm: string;
  /** Même forme avec l'accent tonique, pour l'affichage de la réponse. */
  accentedForm: string;
  /**
   * Seconde forme que le dictionnaire donne pour cette case, s'il y en a
   * une. Acceptée comme réponse, et annoncée quand l'apprenant la trouve.
   */
  variantForm?: string;
  ruleApplied: string;

  // sentence-fixed / trigger-mcq
  trigger?: CaseTrigger;
  sentenceTemplate?: string;
  sentenceFr?: string;
  hint?: string;

  // trigger-mcq
  options?: string[];

  // numeral
  numeral?: number;
  countForm?: CountForm;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// "Меня зовут ___" n'a de sens qu'avec un prénom : ce déclencheur tire dans
// la banque de prénoms, pas dans celle des noms communs.
/**
 * Noms utilisables avec ce déclencheur — ce qui empêche « Я ем ___ » de
 * recevoir « помо́щник », « je mange cet assistant ».
 *
 * Trois sources, de la plus précise à la plus grossière :
 *
 * 1. « Меня́ зову́т ___ » ne prend qu'un prénom.
 * 2. La LISTE CURÉE (trigger-nouns.generated.ts) : pour chaque déclencheur
 *    exigeant, les mots qui donnent une phrase qu'un russophone dirait
 *    vraiment. Écrite une fois par l'IA, relue, figée — l'exécution reste
 *    déterministe et gratuite. C'est la source normale.
 * 3. Les CLASSES sémantiques (`accepts`), en repli : elles couvrent un
 *    déclencheur ajouté depuis la dernière curation, qui produirait sinon
 *    n'importe quoi en silence.
 *
 * Le pool passé est réduit par niveau (un débutant ne voit que les mots
 * fréquents), et ce croisement peut ne presque rien laisser : voir
 * `MIN_POOL` pour ce qu'on fait alors.
 *
 * Exporté : la route IA (app/api/ai/exercise/route.ts) doit composer son
 * échantillon avec EXACTEMENT ce filtre. Elle tirait auparavant 40 mots au
 * hasard dans toute la banque du niveau, ce qui court-circuitait la
 * curation : « владеть » (maîtriser) recevait « рот » (bouche) faute d'un
 * seul mot valide dans l'échantillon.
 */
export function poolFor(trigger: CaseTrigger, pool: Noun[]): Noun[] {
  if (trigger.id === PROPER_NOUN_TRIGGER_ID) return RUSSIAN_NAMES;

  const curated = TRIGGER_NOUNS[trigger.id];
  let keep: (n: Noun) => boolean;
  if (curated && curated.length > 0) {
    const allowed = new Set(curated);
    keep = (n) => allowed.has(n.id);
  } else if (trigger.accepts) {
    const accepted = new Set<NounCategory>(trigger.accepts);
    keep = (n) => {
      const category = categoryOf(n.id);
      return category !== undefined && accepted.has(category);
    };
  } else {
    return pool;
  }

  const filtered = pool.filter(keep);
  if (filtered.length >= MIN_POOL) return filtered;

  // Vivier trop maigre : on le complète par les mots ADMIS les plus
  // fréquents, ceux que le niveau écartait. Jamais au-delà de ce que le
  // déclencheur admet — « Я ем ___ » ne reçoit pas « дом » parce qu'il
  // manquait des aliments.
  const chosen = new Set(filtered.map((n) => n.id));
  const widened = [...filtered];
  for (const noun of BY_FREQUENCY) {
    if (widened.length >= MIN_POOL) break;
    if (chosen.has(noun.id) || !keep(noun)) continue;
    widened.push(noun);
    chosen.add(noun.id);
  }
  return widened.length > 0 ? widened : pool;
}

// ─── Déclinaison isolée ────────────────────────────────────────────
export function generateIsolatedExercise(
  targetCase: CaseId,
  plural = false,
  pool: Noun[] = DECLINABLE_NOUNS,
  withAdjective = false
): CaseExercise {
  // Le nominatif SINGULIER est la forme du dictionnaire : rien à décliner,
  // on ferait retaper le mot affiché. Le pluriel etait donc force ici — ce
  // qui réglait ce cas et en créait deux autres : le nominatif singulier
  // devenait intestable, et « ри́сы », « шокола́ды », « мяса́ » étaient
  // demandés parce que le forçage ignorait la dénombrabilité.
  //
  // Le nombre vient maintenant du sélecteur, et le nominatif singulier est
  // simplement écarté du tirage : c'est la seule case des douze qui
  // n'apprend rien.
  const effectivePlural = targetCase === "nominative" ? true : plural;
  const usable = effectivePlural ? pluralisableNouns(pool) : pool;
  // LE VIVIER SE RESTREINT AVANT LE TIRAGE, il ne se filtre pas après :
  // tirer un nom puis constater qu'il n'a pas d'adjectif rendrait un nom nu
  // une fois sur cinq alors qu'on a demandé un groupe. Et s'il ne reste
  // rien — un vivier de niveau très réduit —, on rend le nom seul plutôt
  // que d'échouer : un exercice moins riche vaut mieux que pas d'exercice.
  const qualifiable = withAdjective ? withAdjectives(usable) : [];
  const noun = pickRandom(qualifiable.length > 0 ? qualifiable : usable);
  const result = declineNoun(noun, targetCase, effectivePlural);
  const adjective = qualifiable.length > 0 ? pickRandom(adjectivesFor(noun)) : undefined;
  return {
    kind: "isolated",
    noun,
    adjective,
    targetCase,
    plural: effectivePlural,
    ...(adjective
      ? asGroup(adjective, noun, targetCase, effectivePlural, result)
      : {
          correctForm: result.form,
          accentedForm: result.accented,
          variantForm: result.variant,
          ruleApplied: result.ruleApplied,
        }),
  };
}

// ─── Phrase à trou (gabarit fixe, par déclencheur) ─────────────────
export function generateSentenceExercise(
  targetCase: CaseId,
  trigger?: CaseTrigger,
  pool: Noun[] = DECLINABLE_NOUNS,
  wantPlural = false,
  withAdjective = false
): CaseExercise {
  const chosenTrigger = trigger ?? pickRandom(triggersForCase(targetCase));
  // La contrainte du gabarit l'emporte sur le souhait de l'apprenant :
  // « несколько ___ » reste au pluriel, « Меня зовут ___ » au singulier.
  const plural = resolveNumber(chosenTrigger, wantPlural);
  const candidates = poolFor(chosenTrigger, pool);
  const usable = plural ? pluralisableNouns(candidates) : candidates;
  // ─── LES DEUX RELATIONS SONT CURÉES, ET C'EST TOUT L'ENJEU ──────
  //
  // Le vivier du déclencheur dit quels noms cette phrase accepte ; l'index
  // des adjectifs dit lesquels de ces noms se laissent qualifier, et par
  // quoi. Croiser les deux ne produit que des triplets dont CHAQUE relation
  // a été relue à la main.
  //
  // C'est la différence exacte avec la version qui avait été retirée : elle
  // croisait trois banques en n'ayant curé qu'une seule des trois relations,
  // et approchait la manquante par l'animacité grammaticale — d'où « une
  // règle brillante » une fois sur trois. Aucune paire n'est devinée ici.
  const qualifiable = withAdjective ? withAdjectives(usable) : [];
  const noun = pickRandom(qualifiable.length > 0 ? qualifiable : usable);
  const adjective = qualifiable.length > 0 ? pickRandom(adjectivesFor(noun)) : undefined;
  const result = declineNoun(noun, targetCase, plural);
  // Un déclencheur porte plusieurs phrases depuis qu'elles sont écrites à la
  // construction (voir templatesFor). Sans ce tirage, le nombre de phrases
  // qu'un apprenant peut voir sur une page vaudrait le nombre de
  // déclencheurs du cas — cinq au nominatif.
  const template = pickRandom(templatesFor(chosenTrigger));

  return {
    kind: "sentence-fixed",
    noun,
    adjective,
    targetCase,
    plural,
    ...(adjective
      ? asGroup(adjective, noun, targetCase, plural, result)
      : {
          correctForm: result.form,
          accentedForm: result.accented,
          variantForm: result.variant,
          ruleApplied: result.ruleApplied,
        }),
    trigger: chosenTrigger,
    sentenceTemplate: template.ru,
    // La traduction porte l'adjectif elle aussi : sans lui, l'écran
    // demanderait « но́вой доро́ги » en montrant « près de cette route »,
    // et rien ne dirait d'où sort le second mot.
    sentenceFr: fillFrenchBlank(
      template.fr,
      frenchNounPhrase(
        noun.translation,
        noun.frenchGender,
        chosenTrigger.article,
        plural,
        adjective
      )
    ),
  };
}

// ─── QCM de reconnaissance de déclencheur ──────────────────────────
export function generateMcqExercise(
  targetCase: CaseId,
  trigger?: CaseTrigger,
  pool: Noun[] = DECLINABLE_NOUNS,
  wantPlural = false,
  withAdjective = false
): CaseExercise {
  const base = generateSentenceExercise(targetCase, trigger, pool, wantPlural, withAdjective);
  const otherCases = CASES.map((c) => c.id).filter((id) => id !== targetCase);

  /**
   * La forme d'un nom telle qu'elle doit apparaître sur un bouton : le nom
   * seul, ou le GROUPE entier si l'exercice en demande un.
   *
   * Sans ça, les quatre boutons d'un exercice de groupe auraient offert une
   * bonne réponse à deux mots au milieu de trois distracteurs à un seul —
   * la réponse se serait reconnue à sa longueur, sans lire le russe.
   */
  const formOf = (noun: Noun, kase: CaseId): string => {
    const declined = declineNoun(noun, kase, base.plural);
    if (!base.adjective) return declined.form;
    return asGroup(base.adjective, noun, kase, base.plural, declined).correctForm;
  };

  // La déduplication se fait sur la forme NORMALISÉE, celle qui sert à
  // corriger. Comparer les chaînes brutes laissait passer deux boutons que
  // le serveur aurait tous deux comptés justes — « судьёй » et « судьей »
  // sont la même réponse pour `normalizeAnswer`, pas pour `Set<string>`.
  const taken = new Set([normalizeAnswer(base.correctForm)]);
  const distractors: string[] = [];
  const offer = (form: string): boolean => {
    const key = normalizeAnswer(form);
    if (taken.has(key)) return false;
    taken.add(key);
    distractors.push(form);
    return true;
  };

  for (const c of shuffle(otherCases)) {
    if (distractors.length >= 3) break;
    offer(formOf(base.noun, c));
  }

  // ACCORD ROMPU : le nom au bon cas, l'adjectif à un autre — « но́вый
  // доро́ги ». C'est la faute que l'exercice a précisément à enseigner, et
  // elle n'existe que sur un groupe. Placée avant le repli sur d'autres
  // noms, elle passe donc en premier quand le syncrétisme a mangé les
  // formes du nom seul.
  if (base.adjective && distractors.length < 3) {
    const declined = declineNoun(base.noun, targetCase, base.plural);
    for (const c of shuffle(otherCases)) {
      if (distractors.length >= 3) break;
      const wrong = declineAdjective(base.adjective, c, base.noun.gender, base.plural, base.noun.animacy);
      offer(`${wrong.form} ${declined.form}`);
    }
  }

  // Filet de sécurité quand le nom a trop de formes identiques
  // (syncrétisme) : on complète avec un AUTRE nom, décliné au même cas.
  //
  // Il tire dans le vivier du déclencheur, pas dans le pool brut : « Я ем
  // ___ » propose des aliments, et ses distracteurs aussi. Et il balaie le
  // vivier au lieu d'y piocher dix fois au hasard — l'ancienne boucle
  // pouvait abandonner et rendre un QCM à deux ou trois boutons, sans que
  // rien ne le signale.
  if (distractors.length < 3) {
    for (const other of shuffle(poolFor(base.trigger!, pool))) {
      if (distractors.length >= 3) break;
      if (other.id === base.noun.id) continue;
      offer(formOf(other, targetCase));
    }
  }
  // Dernier recours : la banque entière. Elle contient 451 noms, donc trois
  // formes distinctes s'y trouvent toujours.
  if (distractors.length < 3) {
    for (const other of shuffle(DECLINABLE_NOUNS)) {
      if (distractors.length >= 3) break;
      if (other.id === base.noun.id) continue;
      offer(formOf(other, targetCase));
    }
  }

  const options = shuffle([base.correctForm, ...distractors.slice(0, 3)]);
  return { ...base, kind: "trigger-mcq", options };
}

// ─── Accord nom + chiffre cardinal ─────────────────────────────────
export function generateNumeralExercise(pool: Noun[] = DECLINABLE_NOUNS): CaseExercise {
  const numeral = randomCountNumber();
  const countForm = countFormFor(numeral);
  // Seulement des noms qu'on compte : « 10 + нача́ло » (dix débuts) était
  // grammaticalement juste et sans aucun sens. Voir countableNouns.
  const noun = pickRandom(countableNouns(pool));

  // Un nombre en 1 (1, 21, 31…) laisse le nom au NOMINATIF singulier, même
  // si l'onglet vit sur la page du génitif — d'où `targetCase` porté par
  // l'exercice plutôt que déduit de la page.
  const targetCase: CaseId = countForm === "nom-sg" ? "nominative" : "genitive";
  const plural = countForm === "gen-pl";
  const result = declineNoun(noun, targetCase, plural);

  return {
    kind: "numeral",
    noun,
    targetCase,
    plural,
    correctForm: result.form,
    accentedForm: result.accented,
    variantForm: result.variant,
    ruleApplied: result.ruleApplied,
    numeral,
    countForm,
  };
}

// Résolution d'un id d'exercice vers son Noun : banque curée + banque de
// prénoms (déclencheur "Меня зовут ___"). Utilisée côté serveur pour
// recalculer la forme attendue sans faire confiance au client
// (app/api/cases/attempt/route.ts).
export function resolveExerciseNoun(id: string): Noun | undefined {
  return NOUNS.find((n) => n.id === id) ?? RUSSIAN_NAMES.find((n) => n.id === id);
}

/**
 * Normalisation avant comparaison : casse, espaces, ё/е, et accent tonique.
 * L'accent est affiché à l'apprenant (пра́вда) mais jamais exigé de lui —
 * personne ne le tape, et le copier-coller d'une forme accentuée doit
 * évidemment être accepté.
 */
export function normalizeAnswer(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/́/g, "")
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
}

/**
 * Toutes les réponses acceptables : la forme du paradigme, et la variante
 * du dictionnaire quand il en donne une.
 *
 * Un seul endroit les énumère, et le client comme le serveur l'appellent —
 * c'est ce qui garantit qu'un écran disant « juste » et une base disant
 * « faux » ne peuvent pas coexister.
 */
export function acceptableForms(exercise: {
  correctForm: string;
  variantForm?: string;
}): string[] {
  return exercise.variantForm ? [exercise.correctForm, exercise.variantForm] : [exercise.correctForm];
}

export function checkAnswer(exercise: CaseExercise, userInput: string): boolean {
  const given = normalizeAnswer(userInput);
  return acceptableForms(exercise).some((form) => normalizeAnswer(form) === given);
}

/**
 * L'apprenant a-t-il répondu par la VARIANTE plutôt que par la forme
 * principale ? C'est ce qui déclenche le « Juste aussi : … ».
 */
export function answeredWithVariant(exercise: CaseExercise, userInput: string): boolean {
  if (!exercise.variantForm) return false;
  const given = normalizeAnswer(userInput);
  return (
    given === normalizeAnswer(exercise.variantForm) &&
    given !== normalizeAnswer(exercise.correctForm)
  );
}
