import {
  ASPECT_PAIRS,
  FORMATION_LABEL,
  getPair,
  type AspectPair,
  type TimelineSchema,
} from "./verbs";
import { EXTRA_CONTEXTS } from "./contexts.generated";
import { whyNotFor } from "@/lib/exercises/types";

/**
 * Exercices d'aspect.
 *
 * UNE CONTRAINTE GOUVERNE TOUT LE MODULE. L'aspect a de vraies zones
 * ambiguës : beaucoup de contextes admettent les deux formes avec une
 * nuance, pas une faute. Or un exercice à choix unique ne peut porter que
 * sur ce qui est TRANCHÉ. On ne construit donc d'items que là où l'aspect
 * est FORCÉ :
 *
 *   - par un marqueur    долго, весь день, каждый день → imperfectif
 *                        за два часа, вдруг, уже       → perfectif
 *   - par une construction  impératif négatif → imperfectif
 *                           начать / кончить + infinitif → imperfectif
 *   - par un enchaînement de résultats → perfectif
 *
 * Tout ce dont un russophone dirait « les deux, ça dépend » reste hors du
 * module, quitte à couvrir moins. C'est la même règle qui a fait écarter
 * искать/ждать des déclencheurs de l'accusatif.
 */

export const ASPECT_SKILLS = [
  {
    id: "past",
    title: "Processus ou résultat",
    level: "A2",
    summary:
      "« Я реша́л зада́чу » : je planchais dessus. « Я реши́л зада́чу » : je l'ai résolue. Ce n'est pas une question de moment mais de borne atteinte — c'est là que le français induit en erreur avec son imparfait / passé composé.",
  },
  {
    id: "markers",
    title: "Les mots qui tranchent",
    level: "A2",
    summary:
      "Certains compléments imposent l'aspect à eux seuls : « до́лго », « ка́ждый день », « весь ве́чер » appellent l'imperfectif ; « за два часа́ », « вдруг », « уже́ » appellent le perfectif.",
  },
  {
    id: "future",
    title: "Deux futurs",
    level: "B1",
    summary:
      "« Бу́ду писа́ть » annonce une occupation, « напишу́ » promet un résultat. Le russe a deux futurs là où le français n'en a qu'un.",
  },
  {
    id: "imperative",
    title: "Ordre, prière et interdiction",
    level: "B1",
    summary:
      "À l'impératif négatif, le russe passe à l'imperfectif : « не закрыва́й » interdit, « не закро́й » mettrait en garde contre un accident. Contre-intuitif, et rarement enseigné.",
  },
  {
    id: "pairs",
    title: "Reconnaître la paire",
    level: "B1",
    summary:
      "Le partenaire perfectif s'obtient par préfixe (де́лать → сде́лать), par suffixe (реша́ть → реши́ть), ou pas du tout : говори́ть → сказа́ть. Rien ne le prédit, il faut le savoir.",
  },
] as const;

export type AspectSkillId = (typeof ASPECT_SKILLS)[number]["id"];

export function getSkill(id: string) {
  return ASPECT_SKILLS.find((s) => s.id === id);
}

export interface AspectExercise {
  skill: AspectSkillId;
  /** Permet au serveur de rejuger la réponse sans faire confiance au client. */
  itemId: string;
  prompt: string;
  sentence?: string;
  sentenceFr: string;
  /**
   * La paire du verbe à placer, « писа́ть / написа́ть ». Les deux à la fois :
   * c'est l'aspect qu'on choisit, en nommer un seul donnerait la réponse.
   */
  lemma?: string;
  schema?: TimelineSchema;
  options: string[];
  correctIndex: number;
  explain: string;
  /** Ce que dit chaque mauvaise option — voir `whyNotFor`. */
  whyNot?: Record<string, string>;
}

type Rng = () => number;

/**
 * Ce que chaque aspect DIT, en une phrase : c'est la note affichée sous une
 * mauvaise réponse. Elle ne répète pas la règle du contexte — l'explication
 * s'en charge — elle nomme ce que la forme choisie aurait affirmé.
 */
const SAYS = {
  pastImperfective: "imperfectif : un déroulement, une durée ou une répétition, sans résultat affirmé",
  pastPerfective: "perfectif : une action menée à son terme, un résultat",
  futureImperfective: "futur imperfectif : une occupation à venir, sans résultat promis",
  futurePerfective: "futur perfectif : un résultat promis",
  imperativeImperfective: "impératif imperfectif : invitation, habitude ou interdiction",
  imperativePerfective:
    "impératif perfectif : une action ponctuelle à mener à terme — nié, il met en garde au lieu d'interdire",
};

function pick<T>(items: T[], random: Rng): T {
  return items[Math.floor(random() * items.length)];
}

function shuffleWithAnswer(options: string[], correct: string, random: Rng) {
  const copy = [...options];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return { options: copy, correctIndex: copy.indexOf(correct) };
}

// ─── 1 et 2. Passé : processus vs résultat, et marqueurs ───────────
interface AspectContext {
  id: string;
  /** Gabarit russe : ___ reçoit la forme verbale. */
  template: string;
  fr: string;
  schema: TimelineSchema;
  answer: "imperfective" | "perfective";
  why: string;
  /**
   * Genre du sujet de la phrase. Le passé russe s'accorde en genre, et
   * trois gabarits disent « Она́ … » : ils recevaient le passé masculin,
   * donc « Она́ сра́зу отве́тил », « Она́ два часа́ гото́вил у́жин ». Le second
   * s'appelle même `za-chas-prigotovila` — l'identifiant nommait la forme
   * féminine que la donnée ne savait pas produire.
   */
  subject?: "m" | "f";
  /** UNE paire, pas une liste — voir le commentaire ci-dessous. */
  pair: string;
}

/**
 * Chaque contexte est lié à UNE SEULE paire aspectuelle.
 *
 * Ce n'est pas une limitation, c'est une garantie. La phrase française doit
 * nommer le verbe — sans quoi l'apprenant ne saurait pas lequel employer —
 * et seul l'ASPECT reste à trouver. Si le contexte tirait sa paire au
 * hasard, la phrase française dirait « j'ai lu » pendant que la réponse
 * attendue serait « решил » : « j'ai résolu ce livre ». Lier le contexte à
 * sa paire supprime ce mode d'échec par construction plutôt que par
 * vigilance.
 */
const PAST_CONTEXTS: AspectContext[] = [
  {
    id: "ves-vecher",
    template: "Вчера́ я весь ве́чер ___ э́ту кни́гу.",
    fr: "Hier, j'ai lu ce livre toute la soirée.",
    schema: "process",
    answer: "imperfective",
    why: "« весь ве́чер » mesure une durée occupée, sans dire qu'on est arrivé au bout — imperfectif.",
    pair: "chitat",
  },
  {
    id: "za-dva-chasa",
    template: "Я ___ э́ту кни́гу за два часа́.",
    fr: "J'ai lu ce livre en deux heures.",
    schema: "duration",
    answer: "perfective",
    why: "« за + durée » dit le temps qu'il a fallu pour ALLER AU BOUT : le résultat est atteint — perfectif.",
    pair: "chitat",
  },
  {
    id: "dolgo",
    template: "Он до́лго ___ э́ту зада́чу.",
    fr: "Il a longtemps planché sur ce problème.",
    schema: "attempt",
    answer: "imperfective",
    why: "« до́лго » décrit l'effort qui dure ; rien ne dit qu'il a abouti — imperfectif.",
    pair: "reshat",
  },
  {
    id: "nakonets",
    template: "Наконе́ц он ___ э́ту зада́чу.",
    fr: "Il a fini par résoudre ce problème.",
    schema: "result",
    answer: "perfective",
    why: "« наконе́ц » annonce l'aboutissement après l'effort — perfectif.",
    pair: "reshat",
  },
  {
    id: "kazhdyy-den",
    template: "Ка́ждый день я ___ ей.",
    fr: "Chaque jour, je lui téléphonais.",
    schema: "repetition",
    answer: "imperfective",
    why: "« ка́ждый день » marque la répétition : une suite d'occurrences, pas un événement unique — imperfectif.",
    pair: "zvonit",
  },
  {
    id: "vdrug",
    template: "Вдруг он ___ мне пра́вду.",
    fr: "Soudain, il m'a dit la vérité.",
    schema: "result",
    answer: "perfective",
    why: "« вдруг » signale un événement ponctuel, une rupture — perfectif.",
    pair: "govorit",
  },
  {
    id: "uzhe",
    template: "Я уже́ ___ э́тот фильм.",
    fr: "J'ai déjà vu ce film.",
    schema: "result",
    answer: "perfective",
    why: "« уже́ » pointe un résultat acquis, dont l'effet vaut encore — perfectif.",
    pair: "smotret",
  },
  {
    id: "kogda-zazvonil",
    template: "Когда́ я ___ письмо́, зазвони́л телефо́н.",
    fr: "Pendant que j'écrivais la lettre, le téléphone a sonné.",
    schema: "interrupted",
    answer: "imperfective",
    why: "Un processus en cours pendant lequel un événement survient : la première action n'est pas bornée — imperfectif.",
    pair: "pisat",
  },
  {
    id: "potom",
    template: "Он ___ письмо́ и сра́зу отпра́вил его́.",
    fr: "Il a écrit la lettre et l'a envoyée aussitôt.",
    schema: "sequence",
    answer: "perfective",
    why: "Deux actions qui s'enchaînent, chacune menée à son terme — perfectif.",
    pair: "pisat",
  },
  {
    id: "obychno",
    template: "Обы́чно я ___ в семь часо́в.",
    fr: "D'habitude, je me levais à sept heures.",
    schema: "repetition",
    answer: "imperfective",
    why: "« обы́чно » décrit une habitude — imperfectif.",
    pair: "vstavat",
  },
  {
    id: "nikogda",
    template: "Я никогда́ не ___ э́ту кни́гу.",
    fr: "Je n'ai jamais lu ce livre.",
    schema: "process",
    answer: "imperfective",
    why: "La négation d'expérience porte sur le fait même, pas sur un résultat manqué — imperfectif.",
    pair: "chitat",
  },
  {
    id: "srazu",
    subject: "f",
    template: "Она́ сра́зу ___ на мой вопро́с.",
    fr: "Elle a répondu tout de suite à ma question.",
    schema: "result",
    answer: "perfective",
    why: "« сра́зу » présente l'action comme un événement unique et abouti — perfectif.",
    pair: "otvechat",
  },
  {
    id: "dva-chasa-gotovil",
    subject: "f",
    template: "Она́ два часа́ ___ у́жин.",
    fr: "Elle a préparé le dîner pendant deux heures.",
    schema: "duration",
    answer: "imperfective",
    why: "« два часа́ » à l'accusatif mesure une durée REMPLIE, pas un délai d'aboutissement — imperfectif. Comparer avec « за два часа́ » (en deux heures), qui appelle le perfectif.",
    pair: "gotovit",
  },
  {
    id: "za-chas-prigotovila",
    subject: "f",
    template: "Она́ ___ у́жин за час.",
    fr: "Elle a préparé le dîner en une heure.",
    schema: "duration",
    answer: "perfective",
    why: "« за + durée » = le temps qu'il a fallu pour aboutir — perfectif. C'est la paire exacte de l'item précédent, et c'est la préposition seule qui change tout.",
    pair: "gotovit",
  },
  {
    id: "chasto",
    template: "В де́тстве он ча́сто ___ э́тот фильм.",
    fr: "Enfant, il regardait souvent ce film.",
    schema: "repetition",
    answer: "imperfective",
    why: "« ча́сто » marque la répétition — imperfectif.",
    pair: "smotret",
  },
  {
    id: "vypil-srazu",
    template: "Он ___ стака́н воды́ и вы́шел.",
    fr: "Il a bu un verre d'eau et il est sorti.",
    schema: "sequence",
    answer: "perfective",
    why: "Enchaînement de deux actions achevées — perfectif.",
    pair: "pit",
  },
  {
    id: "poka-govoril",
    template: "Пока́ он ___, все молча́ли.",
    fr: "Pendant qu'il parlait, tout le monde se taisait.",
    schema: "process",
    answer: "imperfective",
    why: "« пока́ » installe un arrière-plan qui dure — imperfectif.",
    pair: "govorit",
  },
  {
    id: "uzhe-kupil",
    template: "Я уже́ ___ биле́ты.",
    fr: "J'ai déjà acheté les billets.",
    schema: "result",
    answer: "perfective",
    why: "« уже́ » + résultat encore valable — perfectif.",
    pair: "pokupat",
  },
];

/**
 * Chaque tirage accepte un contexte IMPOSÉ en plus du hasard : c'est ce qui
 * permet de reconstruire un exercice à partir de son identifiant (voir
 * `rebuildAspectExercise`). Le hasard ne sert plus alors qu'à mélanger.
 */
function pastExercise(random: Rng, onlyMarkers: boolean, forced?: AspectContext): AspectExercise {
  // Le mode « marqueurs » ne retient que les contextes dont le sens tient
  // dans un seul mot : c'est ce mot qu'on apprend à repérer.
  const contexts = onlyMarkers
    ? PAST_CONTEXTS.filter((c) => MARKER_OF[c.id] !== undefined)
    : PAST_CONTEXTS;
  const context = forced ?? pick(contexts, random);
  const pair = getPair(context.pair)!;
  const feminine = context.subject === "f";
  const imperfective = feminine ? pair.impPastF : pair.impPast;
  const perfective = feminine ? pair.perfPastF : pair.perfPast;
  const correct = context.answer === "imperfective" ? imperfective : perfective;

  const { options, correctIndex } = shuffleWithAnswer(
    [imperfective, perfective],
    correct,
    random
  );
  const marker = MARKER_OF[context.id];
  return {
    skill: onlyMarkers ? "markers" : "past",
    itemId: `${onlyMarkers ? "markers" : "past"}:${context.id}:${pair.id}`,
    lemma: `${pair.imperfective} / ${pair.perfective}`,
    prompt: onlyMarkers
      ? `Quel aspect « ${marker} » impose-t-il ?`
      : "Processus en cours, ou résultat atteint ?",
    sentence: context.template,
    sentenceFr: context.fr,
    schema: context.schema,
    options,
    correctIndex,
    explain: `${context.why} Ici : ${correct} (${pair.imperfective} / ${pair.perfective}).`,
    whyNot: whyNotFor(options, correct, [
      [imperfective, SAYS.pastImperfective],
      [perfective, SAYS.pastPerfective],
    ]),
  };
}

/** Le mot qui, à lui seul, tranche l'aspect du contexte. */
const MARKER_OF: Record<string, string> = {
  "ves-vecher": "весь ве́чер",
  "za-dva-chasa": "за два часа́",
  dolgo: "до́лго",
  nakonets: "наконе́ц",
  "kazhdyy-den": "ка́ждый день",
  vdrug: "вдруг",
  uzhe: "уже́",
  obychno: "обы́чно",
  srazu: "сра́зу",
  "dva-chasa-gotovil": "два часа́",
  "za-chas-prigotovila": "за час",
  chasto: "ча́сто",
  "uzhe-kupil": "уже́",
};

// ─── 3. Les deux futurs ────────────────────────────────────────────
interface FutureContext {
  id: string;
  template: string;
  fr: string;
  schema: TimelineSchema;
  answer: "imperfective" | "perfective";
  why: string;
  pair: string;
}

const FUTURE_CONTEXTS: FutureContext[] = [
  {
    id: "ves-den",
    template: "За́втра я весь день ___.",
    fr: "Demain, je vais lire toute la journée.",
    schema: "process",
    answer: "imperfective",
    why: "« весь день » annonce une occupation qui remplit du temps, sans borne — futur imperfectif « бу́ду » + infinitif.",
    pair: "chitat",
  },
  {
    id: "i-otpravlyu",
    template: "За́втра я ___ письмо́ и отпра́влю его́.",
    fr: "Demain, j'écrirai la lettre et je l'enverrai.",
    schema: "sequence",
    answer: "perfective",
    why: "Deux actions qui s'enchaînent, chacune menée à son terme — futur perfectif.",
    pair: "pisat",
  },
  {
    id: "kazhdyy-vecher",
    template: "Ка́ждый ве́чер я ___ ей.",
    fr: "Chaque soir, je lui téléphonerai.",
    schema: "repetition",
    answer: "imperfective",
    why: "La répétition exclut le perfectif, qui ne décrit qu'une occurrence — futur imperfectif.",
    pair: "zvonit",
  },
  {
    id: "obeshchayu",
    template: "Обеща́ю, я ___ э́то сего́дня.",
    fr: "Je te promets que je le ferai aujourd'hui.",
    schema: "result",
    answer: "perfective",
    why: "Une promesse porte sur un résultat, pas sur une occupation — futur perfectif.",
    pair: "delat",
  },
  {
    id: "za-chas",
    template: "Я ___ э́то за час.",
    fr: "Je le ferai en une heure.",
    schema: "duration",
    answer: "perfective",
    why: "« за + durée » mesure le temps nécessaire pour aboutir — futur perfectif.",
    pair: "delat",
  },
  {
    id: "vsyu-nedelyu",
    template: "Я всю неде́лю ___ к экза́мену.",
    fr: "Toute la semaine, je vais préparer l'examen.",
    schema: "process",
    answer: "imperfective",
    why: "« всю неде́лю » décrit une occupation étalée — futur imperfectif.",
    pair: "gotovit",
  },
  {
    id: "zavtra-vstanu",
    template: "За́втра я ___ в шесть часо́в.",
    fr: "Demain, je me lèverai à six heures.",
    schema: "result",
    answer: "perfective",
    why: "Un événement unique et daté — futur perfectif.",
    pair: "vstavat",
  },
  {
    id: "tselyy-god",
    template: "Весь год я ___ ру́сский язы́к.",
    fr: "Toute l'année, je vais étudier le russe.",
    schema: "process",
    answer: "imperfective",
    why: "« весь год » annonce une occupation étalée dans le temps — futur imperfectif.",
    pair: "izuchat",
  },
  {
    id: "kak-tolko",
    template: "Как то́лько прие́ду, я ___ тебе́.",
    fr: "Dès que j'arrive, je t'appellerai.",
    schema: "sequence",
    answer: "perfective",
    why: "Un événement unique déclenché par un autre — futur perfectif.",
    pair: "zvonit",
  },
  {
    id: "nikogda-ne",
    template: "Бо́льше я никогда́ не ___ об э́том.",
    fr: "Je n'en parlerai plus jamais.",
    schema: "process",
    answer: "imperfective",
    why: "« никогда́ не » nie l'action en général, pas un résultat manqué — futur imperfectif.",
    pair: "govorit",
  },
  {
    id: "poka-ne",
    template: "Я не уйду́, пока́ не ___ э́ту зада́чу.",
    schema: "sequence",
    fr: "Je ne partirai pas tant que je n'aurai pas résolu ce problème.",
    answer: "perfective",
    why: "« пока́ не » attend un RÉSULTAT atteint : futur perfectif, malgré la négation.",
    pair: "reshat",
  },
  {
    id: "kazhdyy-den",
    template: "В Москве́ я ___ по-ру́сски ка́ждый день.",
    schema: "process",
    fr: "À Moscou, je parlerai russe tous les jours.",
    answer: "imperfective",
    why: "Action répétée jour après jour, sans achèvement visé — futur imperfectif composé (бу́ду + infinitif).",
    pair: "govorit",
  },
  {
    id: "zavtra-utrom",
    template: "За́втра у́тром я ___ письмо́ и отпра́влю его́.",
    schema: "sequence",
    fr: "Demain matin j'écrirai la lettre et je l'enverrai.",
    answer: "perfective",
    why: "Deux actions uniques qui s'enchaînent, chacune menée à son terme — futur perfectif.",
    pair: "pisat",
  },
];

function futureExercise(random: Rng, forced?: FutureContext): AspectExercise {
  const context = forced ?? pick(FUTURE_CONTEXTS, random);
  const pair = getPair(context.pair)!;
  const imperfectiveFuture = `буду ${pair.imperfective}`;
  const correct = context.answer === "imperfective" ? imperfectiveFuture : pair.perfFuture1;

  const { options, correctIndex } = shuffleWithAnswer(
    [imperfectiveFuture, pair.perfFuture1],
    correct,
    random
  );
  return {
    skill: "future",
    itemId: `future:${context.id}:${pair.id}`,
    lemma: `${pair.imperfective} / ${pair.perfective}`,
    prompt: "Occupation à venir, ou résultat promis ?",
    sentence: context.template,
    sentenceFr: context.fr,
    schema: context.schema,
    options,
    correctIndex,
    explain: `${context.why} Ici : ${correct}.`,
    whyNot: whyNotFor(options, correct, [
      [imperfectiveFuture, SAYS.futureImperfective],
      [pair.perfFuture1, SAYS.futurePerfective],
    ]),
  };
}

// ─── 4. Impératif : ordre, prière, interdiction ────────────────────
interface ImperativeContext {
  id: string;
  template: string;
  fr: string;
  answer: "imperfective" | "perfective";
  why: string;
  /**
   * À qui la phrase s'adresse. La banque ne portait que la forme de
   * politesse, et huit contextes sur douze tutoient : « Ne m'appelle pas si
   * tard », « Passe-moi le sel », « Lis en russe tous les jours — так ты
   * бы́стрее вы́учишь язы́к ». Ce dernier se contredisait dans sa propre
   * phrase, en donnant « Чита́йте » pour un « ты » écrit trois mots plus
   * loin.
   */
  address: "ty" | "vy";
  pair: string;
}

const IMPERATIVE_CONTEXTS: ImperativeContext[] = [
  {
    id: "negation",
    address: "ty",
    template: "Не ___ окно́, пожа́луйста!",
    fr: "Ne ferme pas la fenêtre, s'il te plaît !",
    answer: "imperfective",
    why: "Interdiction : l'impératif NÉGATIF appelle l'imperfectif. Le perfectif « не закро́й » serait une mise en garde contre un accident (« attention à ne pas fermer »).",
    pair: "zakryvat",
  },
  {
    id: "negation-opozdat",
    address: "ty",
    template: "Не ___ мне так по́здно!",
    fr: "Ne m'appelle pas si tard !",
    answer: "imperfective",
    why: "Même règle : une interdiction se dit à l'imperfectif.",
    pair: "zvonit",
  },
  {
    id: "polite-request",
    address: "vy",
    template: "___, пожа́луйста, ещё раз.",
    fr: "Répétez, s'il vous plaît.",
    answer: "perfective",
    why: "Demande ponctuelle et unique, dont on attend le résultat — perfectif.",
    pair: "povtoryat",
  },
  {
    id: "invitation",
    address: "vy",
    template: "___, пожа́луйста! Чу́вствуйте себя́ как до́ма.",
    fr: "Asseyez-vous, je vous en prie ! Faites comme chez vous.",
    answer: "imperfective",
    why: "Invitation chaleureuse : l'imperfectif « сади́тесь » accueille, alors que le perfectif « ся́дьте » sonne comme un ordre.",
    pair: "sadit",
  },
  {
    id: "one-off",
    address: "ty",
    template: "___ мне соль, пожа́луйста.",
    fr: "Passe-moi le sel, s'il te plaît.",
    answer: "perfective",
    why: "Une seule action attendue, avec son résultat — perfectif.",
    pair: "davat",
  },
  {
    id: "negation-brat",
    address: "ty",
    template: "Не ___ э́ту кни́гу без разреше́ния.",
    fr: "Ne prends pas ce livre sans autorisation.",
    answer: "imperfective",
    why: "Interdiction générale : l'impératif négatif appelle l'imperfectif.",
    pair: "brat",
  },
  {
    id: "negation-govorit",
    address: "ty",
    template: "Не ___ об э́том нико́му!",
    fr: "N'en parle à personne !",
    answer: "imperfective",
    why: "Défense de faire quelque chose, sans limite de temps — imperfectif.",
    pair: "govorit",
  },
  {
    id: "polite-open",
    address: "vy",
    template: "___, пожа́луйста, окно́.",
    fr: "Ouvrez la fenêtre, s'il vous plaît.",
    answer: "perfective",
    why: "Une action unique dont on attend le résultat immédiat — perfectif.",
    pair: "otkryvat",
  },
  {
    id: "invitation-eat",
    address: "vy",
    template: "___, пожа́луйста! Всё ещё горя́чее.",
    fr: "Mangez, je vous en prie ! C'est encore chaud.",
    answer: "imperfective",
    why: "Invitation chaleureuse : l'imperfectif accueille, le perfectif « съе́шьте » sonnerait comme un ordre.",
    pair: "est",
  },
  {
    id: "warning-zabyt",
    address: "ty",
    template: "Не ___ ключи́!",
    fr: "N'oublie pas tes clés !",
    answer: "perfective",
    why: "Mise en garde contre un accident ponctuel — c'est le cas RARE où l'impératif négatif prend le perfectif.",
    pair: "zabyvat",
  },
  {
    id: "request-write",
    address: "ty",
    template: "___ мне свой а́дрес, пожа́луйста.",
    fr: "Écris-moi ton adresse, s'il te plaît.",
    answer: "perfective",
    why: "Demande d'un acte unique dont on attend le résultat — perfectif.",
    pair: "pisat",
  },
  {
    id: "habit-read",
    address: "ty",
    template: "___ по-ру́сски ка́ждый день — так ты быстре́е вы́учишь язы́к.",
    fr: "Lis en russe tous les jours — tu apprendras la langue plus vite.",
    answer: "imperfective",
    why: "Conseil de répéter l'action régulièrement, sans point d'arrivée : imperfectif.",
    pair: "chitat",
  },
];

// Les VARIANTES écrites à la construction s'ajoutent aux contextes écrits à
// la main, qui restent en tête. Elles gardent le marqueur, la règle et
// l'explication de leur contexte d'origine — voir scripts/curate-contexts.mjs
// pour ce qui est hérité, ce qui est déclaré, et pourquoi.
PAST_CONTEXTS.push(...((EXTRA_CONTEXTS.PAST_CONTEXTS ?? []) as unknown as AspectContext[]));
FUTURE_CONTEXTS.push(...((EXTRA_CONTEXTS.FUTURE_CONTEXTS ?? []) as unknown as FutureContext[]));
IMPERATIVE_CONTEXTS.push(
  ...((EXTRA_CONTEXTS.IMPERATIVE_CONTEXTS ?? []) as unknown as ImperativeContext[]),
);


/**
 * Les deux impératifs d'une paire, dans la personne que la phrase adresse.
 * `null` si l'un des deux verbes n'a pas d'impératif usuel — le contexte
 * est alors inutilisable, et `check:aspect` refuse qu'on en écrive un.
 */
function imperativesFor(
  pair: AspectPair,
  address: ImperativeContext["address"]
): [string, string] | null {
  const imperfective = address === "ty" ? pair.impImperativeTy : pair.impImperative;
  const perfective = address === "ty" ? pair.perfImperativeTy : pair.perfImperative;
  return imperfective && perfective ? [imperfective, perfective] : null;
}

function imperativeExercise(random: Rng, forced?: ImperativeContext): AspectExercise {
  const usable = IMPERATIVE_CONTEXTS.filter((c) => imperativesFor(getPair(c.pair)!, c.address));
  const context = forced ?? pick(usable, random);
  const pair = getPair(context.pair)!;
  const [imperfective, perfective] = imperativesFor(pair, context.address)!;
  const correct = context.answer === "imperfective" ? imperfective : perfective;

  const { options, correctIndex } = shuffleWithAnswer([imperfective, perfective], correct, random);
  return {
    skill: "imperative",
    itemId: `imperative:${context.id}:${pair.id}`,
    lemma: `${pair.imperfective} / ${pair.perfective}`,
    prompt: "Quelle forme de l'impératif ?",
    sentence: context.template,
    sentenceFr: context.fr,
    schema: context.answer === "imperfective" ? "process" : "result",
    options,
    correctIndex,
    explain: `${context.why} Ici : ${correct}.`,
    whyNot: whyNotFor(options, correct, [
      [imperfective, SAYS.imperativeImperfective],
      [perfective, SAYS.imperativePerfective],
    ]),
  };
}

// ─── 5. Reconnaître la paire ───────────────────────────────────────
function pairsExercise(random: Rng, forced?: AspectPair): AspectExercise {
  const pair = forced ?? pick(ASPECT_PAIRS, random);
  const others = ASPECT_PAIRS.filter((p) => p.id !== pair.id);
  const shuffled = [...others];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const distractors = shuffled.slice(0, 3).map((p) => p.perfective);

  const { options, correctIndex } = shuffleWithAnswer(
    [pair.perfective, ...distractors],
    pair.perfective,
    random
  );
  return {
    skill: "pairs",
    itemId: `pairs:${pair.id}`,
    prompt: "Quel est le partenaire perfectif de ce verbe ?",
    sentence: pair.imperfective,
    sentenceFr: pair.translation,
    options,
    correctIndex,
    whyNot: whyNotFor(
      options,
      pair.perfective,
      shuffled
        .slice(0, 3)
        .map((p): [string, string] => [p.perfective, `partenaire perfectif de « ${p.imperfective} » (${p.translation})`])
    ),
    explain: `${pair.imperfective} → ${pair.perfective} (${FORMATION_LABEL[pair.formation]}). ${
      pair.formation === "suppletion"
        ? "Aucun rapport de forme entre les deux : cette paire s'apprend telle quelle."
        : "Repérer le procédé aide, mais il ne se devine pas : chaque paire s'apprend."
    }`,
  };
}

const GENERATORS: Record<AspectSkillId, (random: Rng) => AspectExercise> = {
  past: (r) => pastExercise(r, false),
  markers: (r) => pastExercise(r, true),
  future: futureExercise,
  imperative: imperativeExercise,
  pairs: pairsExercise,
};

export function generateAspectExercise(
  skill: AspectSkillId,
  random: Rng = Math.random
): AspectExercise {
  return GENERATORS[skill](random);
}

/**
 * L'exercice exact qu'un identifiant désigne, options remélangées — pour
 * « Mes erreurs ». `null` si le contexte n'existe pas, ou s'il ne porte pas
 * la paire annoncée : un contexte est lié à UNE paire, et un identifiant qui
 * dit le contraire ne désigne aucun exercice que l'app sache produire.
 */
export function rebuildAspectExercise(
  itemId: string,
  random: Rng = Math.random
): AspectExercise | null {
  const [kind, ...rest] = itemId.split(":");

  if (kind === "past" || kind === "markers") {
    const context = PAST_CONTEXTS.find((c) => c.id === rest[0]);
    if (!context || context.pair !== rest[1] || !getPair(context.pair)) return null;
    if (kind === "markers" && MARKER_OF[context.id] === undefined) return null;
    return pastExercise(random, kind === "markers", context);
  }
  if (kind === "future") {
    const context = FUTURE_CONTEXTS.find((c) => c.id === rest[0]);
    if (!context || context.pair !== rest[1] || !getPair(context.pair)) return null;
    return futureExercise(random, context);
  }
  if (kind === "imperative") {
    const context = IMPERATIVE_CONTEXTS.find((c) => c.id === rest[0]);
    const pair = context && context.pair === rest[1] ? getPair(context.pair) : undefined;
    if (!context || !pair || !imperativesFor(pair, context.address)) return null;
    return imperativeExercise(random, context);
  }
  if (kind === "pairs") {
    const pair = getPair(rest[0]);
    return pair ? pairsExercise(random, pair) : null;
  }
  return null;
}

/**
 * Rejoue la correction à partir du seul identifiant d'item : le client
 * envoie ce qu'il a choisi, jamais s'il avait juste. Même règle que les
 * modules Cas et Mouvement.
 */
export function checkAspectAnswer(itemId: string, answer: string): boolean | null {
  const [kind, ...rest] = itemId.split(":");

  if (kind === "past" || kind === "markers") {
    const context = PAST_CONTEXTS.find((c) => c.id === rest[0]);
    const pair = getPair(rest[1]);
    if (!context || !pair) return null;
    if (kind === "markers" && MARKER_OF[context.id] === undefined) return null;
    const feminine = context.subject === "f";
    const expected =
      context.answer === "imperfective"
        ? feminine
          ? pair.impPastF
          : pair.impPast
        : feminine
          ? pair.perfPastF
          : pair.perfPast;
    return expected === answer;
  }
  if (kind === "future") {
    const context = FUTURE_CONTEXTS.find((c) => c.id === rest[0]);
    const pair = getPair(rest[1]);
    if (!context || !pair) return null;
    const expected =
      context.answer === "imperfective" ? `буду ${pair.imperfective}` : pair.perfFuture1;
    return expected === answer;
  }
  if (kind === "imperative") {
    const context = IMPERATIVE_CONTEXTS.find((c) => c.id === rest[0]);
    const pair = getPair(rest[1]);
    if (!context || !pair) return null;
    const forms = imperativesFor(pair, context.address);
    if (!forms) return false;
    return (context.answer === "imperfective" ? forms[0] : forms[1]) === answer;
  }
  if (kind === "pairs") {
    const pair = getPair(rest[0]);
    return pair ? pair.perfective === answer : null;
  }
  return null;
}

export { PAST_CONTEXTS, FUTURE_CONTEXTS, IMPERATIVE_CONTEXTS, MARKER_OF };
export type { AspectPair };
