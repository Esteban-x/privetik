import {
  MOTION_PAIRS,
  MOTION_PREFIXES,
  getPair,
  getPrefix,
  type MotionMode,
  type MotionPair,
  type MotionPrefix,
  type TrajectorySchema,
} from "./verbs";
import { EXTRA_CONTEXTS } from "./contexts.generated";
import { getCase } from "@/lib/grammar/cases";
import { whyNotFor } from "@/lib/exercises/types";

/**
 * Quatre compétences, dans l'ordre où elles se construisent. Chacune isole
 * UNE difficulté : mélanger le mode et la direction dans un même exercice
 * ne dit pas laquelle des deux a fait échouer l'apprenant.
 */
export const MOTION_SKILLS = [
  {
    id: "mode",
    title: "À pied ou en véhicule",
    level: "A1",
    summary:
      "Le français dit « aller » pour tout. Le russe choisit le verbe selon le moyen de déplacement — « Я иду́ в Москву́ » signifie qu'on s'y rend à pied.",
  },
  {
    id: "direction",
    title: "Un trajet ou une habitude",
    level: "A2",
    summary:
      "идти́ = un trajet en cours, dans une direction. ходи́ть = une habitude, un aller-retour, une aptitude. Au passé, « ходи́л » veut dire qu'on est allé ET revenu.",
  },
  {
    id: "prefix",
    title: "Les préfixes",
    level: "B1",
    summary:
      "при-, у-, в-, вы-, под-… changent le sens et rendent le verbe perfectif. Préfixe + идти́ donne un perfectif, préfixe + ходи́ть son imperfectif.",
  },
  {
    id: "government",
    title: "Préfixe, préposition et cas",
    level: "B1",
    summary:
      "Chaque préfixe appelle sa préposition, et chaque préposition son cas : вы́йти из + génitif, подойти́ к + datif, войти́ в + accusatif.",
  },
] as const;

export type MotionSkillId = (typeof MOTION_SKILLS)[number]["id"];

export function getSkill(id: string) {
  return MOTION_SKILLS.find((s) => s.id === id);
}

export interface MotionExercise {
  skill: MotionSkillId;
  /** Identifie l'item pour que le serveur puisse rejuger la réponse. */
  itemId: string;
  prompt: string;
  /** Phrase russe à trou, si l'exercice en a une. */
  sentence?: string;
  sentenceFr: string;
  /**
   * La paire à placer dans le trou, « идти́ / ходи́ть ». Absent quand le verbe
   * EST la réponse (le mode de déplacement) ou que le trou n'est pas un verbe.
   */
  lemma?: string;
  schema?: TrajectorySchema;
  mode?: MotionMode;
  options: string[];
  correctIndex: number;
  explain: string;
  /** Ce que dit chaque mauvaise option — voir `whyNotFor`. */
  whyNot?: Record<string, string>;
}

function shuffleWithAnswer(options: string[], correct: string, random: () => number) {
  const copy = [...options];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return { options: copy, correctIndex: copy.indexOf(correct) };
}

function pick<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

// ─── 1. Mode de déplacement ────────────────────────────────────────
// Le schéma montre le moyen de transport ; la phrase française ne le
// répète pas. L'apprenant lit l'image, pas une traduction.
const MODE_DESTINATIONS: Record<MotionMode, { ru: string; fr: string }[]> = {
  foot: [
    { ru: "в шко́лу", fr: "à l'école" },
    { ru: "в магази́н", fr: "au magasin" },
    { ru: "домо́й", fr: "à la maison" },
    { ru: "на по́чту", fr: "à la poste" },
    { ru: "в парк", fr: "au parc" },
    { ru: "к врачу́", fr: "chez le médecin" },
  ],
  vehicle: [
    { ru: "в Москву́", fr: "à Moscou" },
    { ru: "на рабо́ту", fr: "au travail" },
    { ru: "в центр", fr: "dans le centre" },
    { ru: "на да́чу", fr: "à la datcha" },
    { ru: "в аэропо́рт", fr: "à l'aéroport" },
  ],
  air: [
    { ru: "в Пари́ж", fr: "à Paris" },
    { ru: "домо́й", fr: "à la maison" },
    { ru: "в Сибирь", fr: "en Sibérie" },
  ],
  water: [
    { ru: "к о́строву", fr: "vers l'île" },
    { ru: "че́рез ре́ку", fr: "de l'autre côté de la rivière" },
    { ru: "к бе́регу", fr: "vers la rive" },
  ],
  carry: [
    { ru: "кни́ги в библиоте́ку", fr: "des livres à la bibliothèque" },
    { ru: "су́мку домо́й", fr: "un sac à la maison" },
    { ru: "докуме́нты в о́фис", fr: "des documents au bureau" },
  ],
};

/**
 * Chaque tirage accepte un choix IMPOSÉ en plus du hasard : c'est ce qui
 * permet de reconstruire un exercice à partir de son identifiant (voir
 * `rebuildMotionExercise`). Le hasard ne sert plus alors qu'à mélanger.
 */
function modeExercise(
  random: () => number,
  forced?: { pair: MotionPair; destination: { ru: string; fr: string } }
): MotionExercise {
  // La phrase dit « je vais » : seuls les verbes d'« aller » peuvent être la
  // réponse. Les verbes de manière (courir, porter) restent en distracteurs,
  // où ils testent utilement la confusion aller/courir.
  const pair = forced?.pair ?? pick(MOTION_PAIRS.filter((p) => p.isGoing), random);
  const destination = forced?.destination ?? pick(MODE_DESTINATIONS[pair.mode], random);
  const correct = pair.uniForms.present1;
  const others = MOTION_PAIRS.filter((p) => p.id !== pair.id);
  for (let i = others.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const distractors = others.slice(0, 3).map((p) => p.uniForms.present1);

  const { options, correctIndex } = shuffleWithAnswer(
    [correct, ...distractors],
    correct,
    random
  );
  return {
    whyNot: whyNotFor(
      options,
      correct,
      others.slice(0, 3).map((p): [string, string] => [p.uniForms.present1, `${p.uni} : ${p.translation}`])
    ),
    skill: "mode",
    itemId: `mode:${pair.id}:${destination.ru}`,
    prompt: "Quel verbe correspond au mode de déplacement montré ?",
    sentence: `Я ___ ${destination.ru}.`,
    sentenceFr: `Je vais ${destination.fr}.`,
    schema: "oneway",
    mode: pair.mode,
    options,
    correctIndex,
    explain: `${pair.uni} / ${pair.multi} = ${pair.translation}. Le russe choisit le verbe selon le moyen de déplacement (${MODE_LABEL_FR[pair.mode]}), là où le français dit « aller » dans tous les cas.`,
  };
}

const MODE_LABEL_FR: Record<MotionMode, string> = {
  foot: "à pied",
  vehicle: "en véhicule",
  air: "en avion",
  water: "par l'eau",
  carry: "en portant quelque chose",
};

// ─── 2. Unidirectionnel vs multidirectionnel ───────────────────────
// Deux variantes : lire un schéma de trajet, ou repérer le marqueur
// temporel dans la phrase. La seconde est celle qui piège vraiment.
interface DirectionContext {
  id: string;
  schema: TrajectorySchema;
  /** Modes compatibles avec la destination de la phrase. */
  modes: MotionMode[];
  /** Marqueur qui impose la réponse. */
  marker: string;
  fr: string;
  form: "present1" | "present2" | "present3" | "pastM" | "pastPl" | "infinitive";
  answer: "uni" | "multi";
  why: string;
}

const DIRECTION_CONTEXTS: DirectionContext[] = [
  {
    id: "now",
    modes: ["foot", "vehicle"],
    schema: "oneway",
    marker: "Сейча́с я ___ в университе́т.",
    fr: "En ce moment, je vais à l'université.",
    form: "present1",
    answer: "uni",
    why: "« Сейча́с » : un trajet en cours, dans une direction — unidirectionnel.",
  },
  {
    id: "every-day",
    modes: ["foot", "vehicle"],
    schema: "repeated",
    marker: "Ка́ждый день я ___ в университе́т.",
    fr: "Chaque jour, je vais à l'université.",
    form: "present1",
    answer: "multi",
    why: "« Ка́ждый день » : une habitude qui se répète — multidirectionnel.",
  },
  {
    id: "usually",
    modes: ["foot", "vehicle"],
    schema: "repeated",
    marker: "Обы́чно я ___ на рабо́ту у́тром.",
    fr: "D'habitude, je vais au travail le matin.",
    form: "present1",
    answer: "multi",
    why: "« Обы́чно » marque l'habitude — multidirectionnel.",
  },
  {
    id: "yesterday-roundtrip",
    modes: ["foot", "vehicle"],
    schema: "roundtrip",
    marker: "Вчера́ он ___ в кино́.",
    fr: "Hier, il est allé au cinéma (et il en est revenu).",
    form: "pastM",
    answer: "multi",
    why: "Le piège classique : au passé, le multidirectionnel dit qu'on est allé ET revenu. « Он шёл в кино́ » signifierait qu'il était en chemin, sans dire s'il y est arrivé.",
  },
  {
    id: "on-the-way",
    modes: ["foot", "vehicle"],
    schema: "oneway",
    marker: "Когда́ он ___ домо́й, начался́ дождь.",
    fr: "Alors qu'il rentrait chez lui, la pluie a commencé.",
    form: "pastM",
    answer: "uni",
    why: "Une action en cours pendant laquelle une autre survient : le trajet n'est pas terminé — unidirectionnel.",
  },
  {
    id: "where-going",
    modes: ["foot", "vehicle"],
    schema: "oneway",
    marker: "Куда́ ты ___?",
    fr: "Où vas-tu (là, maintenant) ?",
    // Le sujet est « ты » : c'est la 2e personne, pas la 1re. Le contexte
    // demandait `present1` faute d'un champ pour la 2e, et l'exercice
    // servait « Куда ты иду́ ? » en donnant « иду́ » pour bonne réponse.
    form: "present2",
    answer: "uni",
    why: "« Куда́ ты…? » interroge sur un trajet en cours — unidirectionnel.",
  },
  {
    id: "tomorrow",
    // « в Москву » exclut le trajet à pied.
    modes: ["vehicle"],
    schema: "oneway",
    marker: "За́втра я ___ в Москву́.",
    fr: "Demain, je vais à Moscou.",
    form: "present1",
    answer: "uni",
    why: "Un déplacement prévu, unique et daté : le présent unidirectionnel sert de futur proche.",
  },
  {
    id: "never",
    modes: ["vehicle"],
    schema: "repeated",
    marker: "Он никогда́ не ___ в Росси́ю.",
    fr: "Il n'est jamais allé en Russie.",
    form: "pastM",
    answer: "multi",
    why: "« Никогда́ не » porte sur l'expérience en général, pas sur un trajet précis — multidirectionnel.",
  },
  {
    id: "around-town",
    modes: ["foot", "vehicle"],
    schema: "repeated",
    marker: "Мы до́лго ___ по го́роду.",
    fr: "Nous avons longtemps circulé dans la ville.",
    // Sujet « мы » : passé pluriel. `pastM` donnait « Мы до́лго ходи́л ».
    form: "pastPl",
    answer: "multi",
    why: "« По + datif » décrit un déplacement sans destination unique, dans tous les sens — multidirectionnel.",
  },
  {
    id: "likes",
    modes: ["foot"],
    schema: "repeated",
    marker: "Я люблю́ ___ пешко́м.",
    fr: "J'aime marcher.",
    form: "infinitive",
    answer: "multi",
    why: "Un goût ou une aptitude générale, sans trajet précis — multidirectionnel.",
  },
  {
    id: "can-walk",
    modes: ["foot"],
    schema: "repeated",
    marker: "Ребёнок уже́ уме́ет ___.",
    fr: "L'enfant sait déjà marcher.",
    form: "infinitive",
    answer: "multi",
    why: "Savoir faire quelque chose est une aptitude, pas un trajet — multidirectionnel.",
  },
  {
    id: "bus-now",
    modes: ["vehicle"],
    schema: "oneway",
    marker: "Смотри́, авто́бус ___ в центр.",
    fr: "Regarde, le bus va vers le centre.",
    form: "present3",
    answer: "uni",
    why: "Le trajet est visible, en cours, dans une direction — unidirectionnel.",
  },
  {
    id: "often",
    modes: ["foot", "vehicle"],
    schema: "repeated",
    marker: "Он ча́сто ___ к ба́бушке.",
    fr: "Il va souvent chez sa grand-mère.",
    form: "pastM",
    answer: "multi",
    why: "« Ча́сто » marque la répétition — multidirectionnel.",
  },
];

/** L'infinitif est le lemme lui-même ; les autres formes sont dans la table. */
function formOf(pair: MotionPair, context: DirectionContext, which: "uni" | "multi"): string {
  if (context.form === "infinitive") return which === "uni" ? pair.uni : pair.multi;
  return which === "uni" ? pair.uniForms[context.form] : pair.multiForms[context.form];
}

function directionExercise(
  random: () => number,
  forced?: { pair: MotionPair; context: DirectionContext }
): MotionExercise {
  const context = forced?.context ?? pick(DIRECTION_CONTEXTS, random);
  // Le contexte fixe la destination (« в университет », « в кино ») : seuls
  // les verbes d'« aller » dont le mode y mène sont éligibles. On ne va pas
  // au cinéma à la nage.
  const pair =
    forced?.pair ??
    pick(
      MOTION_PAIRS.filter((p) => p.isGoing && context.modes.includes(p.mode)),
      random
    );
  const uniForm = formOf(pair, context, "uni");
  const multiForm = formOf(pair, context, "multi");
  const correct = context.answer === "uni" ? uniForm : multiForm;

  const { options, correctIndex } = shuffleWithAnswer([uniForm, multiForm], correct, random);
  return {
    whyNot: whyNotFor(options, correct, [
      [uniForm, "unidirectionnel : un trajet précis, dans une direction, en cours"],
      [multiForm, "multidirectionnel : habitude, aller-retour, ou déplacement sans direction unique"],
    ]),
    skill: "direction",
    itemId: `direction:${pair.id}:${context.id}`,
    lemma: `${pair.uni} / ${pair.multi}`,
    prompt: "Trajet unique ou habitude ?",
    sentence: context.marker,
    sentenceFr: context.fr,
    schema: context.schema,
    mode: pair.mode,
    options,
    correctIndex,
    explain: `${context.why} Ici : ${correct} (${pair.uni} / ${pair.multi}).`,
  };
}

// ─── 3. Préfixes ───────────────────────────────────────────────────
// Le schéma porte tout le sens : une flèche qui entre, qui sort, qui
// s'arrête au bord, qui contourne. L'apprenant lit la géométrie.
//
// LES LEURRES RESTENT DANS LE MODE DE LA RÉPONSE. Depuis que la série en
// véhicule existe, mélanger les deux rendrait l'exercice trivial dans un
// sens (un seul verbe en -е́хать parmi trois en -йти́ : on le reconnaît sans
// lire le schéma) et injuste dans l'autre. Le mode est DONNÉ par le
// pictogramme ; ce qui est demandé, c'est le trajet.
function prefixExercise(random: () => number, forced?: MotionPrefix): MotionExercise {
  const target = forced ?? pick(MOTION_PREFIXES, random);
  const others = MOTION_PREFIXES.filter(
    (p) => p.id !== target.id && p.schema !== target.schema && p.mode === target.mode
  );
  const distractors: MotionPrefix[] = [];
  const shuffled = [...others];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  for (const p of shuffled) {
    if (distractors.length >= 3) break;
    if (!distractors.some((d) => d.perfective === p.perfective)) distractors.push(p);
  }

  const { options, correctIndex } = shuffleWithAnswer(
    [target.perfective, ...distractors.map((d) => d.perfective)],
    target.perfective,
    random
  );
  return {
    skill: "prefix",
    itemId: `prefix:${target.id}`,
    prompt: "Quel verbe décrit ce trajet ?",
    sentenceFr: target.translation,
    schema: target.schema,
    mode: target.mode,
    options,
    correctIndex,
    whyNot: whyNotFor(
      options,
      target.perfective,
      distractors.map((d): [string, string] => [d.perfective, `${d.prefix} : ${d.translation}`])
    ),
    // La règle de formation n'est pas la même dans les deux séries, et
    // l'annoncer de travers apprendrait « приездить ».
    explain:
      `${target.prefix} → ${target.perfective} / ${target.imperfective} = ${target.translation}. ` +
      `${target.example.ru} — ${target.example.fr} ` +
      (target.mode === "vehicle"
        ? "Préfixe + е́хать donne le perfectif ; l'imperfectif se bâtit sur -езжа́ть, pas sur е́здить."
        : "Préfixe + идти donne le perfectif, préfixe + ходить l'imperfectif."),
  };
}

// ─── 4. Préfixe, préposition et cas ────────────────────────────────
// Le pont avec le module Cas : le préfixe impose la préposition, la
// préposition impose le cas.
interface GovernmentTarget {
  prefixId: string;
  /** Groupe attendu, déjà décliné. */
  correct: string;
  distractors: string[];
  sentence: string;
  sentenceFr: string;
}

// Les VARIANTES écrites à la construction s'ajoutent aux contextes écrits à
// la main, qui restent en tête. Elles gardent le marqueur, la règle et
// l'explication de leur contexte d'origine — voir scripts/curate-contexts.mjs
// pour ce qui est hérité, ce qui est déclaré, et pourquoi.
DIRECTION_CONTEXTS.push(
  ...((EXTRA_CONTEXTS.DIRECTION_CONTEXTS ?? []) as unknown as DirectionContext[]),
);


const GOVERNMENT_ITEMS: GovernmentTarget[] = [
  {
    prefixId: "vy",
    correct: "из магази́на",
    distractors: ["из магази́н", "от магази́на", "с магази́на"],
    sentence: "Она́ вы́шла ___.",
    sentenceFr: "Elle est sortie du magasin.",
  },
  {
    prefixId: "v",
    correct: "в ко́мнату",
    distractors: ["в ко́мнате", "в ко́мнаты", "к ко́мнате"],
    sentence: "Он вошёл ___.",
    sentenceFr: "Il est entré dans la pièce.",
  },
  {
    prefixId: "pod",
    correct: "к окну́",
    distractors: ["к окно́", "у окна́", "в окно́"],
    sentence: "Он подошёл ___.",
    sentenceFr: "Il s'est approché de la fenêtre.",
  },
  {
    prefixId: "ot",
    correct: "от две́ри",
    distractors: ["от дверь", "из две́ри", "к две́ри"],
    sentence: "Она́ отошла́ ___.",
    sentenceFr: "Elle s'est écartée de la porte.",
  },
  {
    prefixId: "do",
    correct: "до вокза́ла",
    distractors: ["до вокза́л", "к вокза́лу", "на вокза́л"],
    sentence: "Мы дошли́ ___.",
    sentenceFr: "Nous sommes allés jusqu'à la gare.",
  },
  {
    prefixId: "pri",
    correct: "на рабо́ту",
    distractors: ["на рабо́те", "к рабо́те", "в рабо́ту"],
    sentence: "Он пришёл ___.",
    sentenceFr: "Il est arrivé au travail.",
  },
  {
    prefixId: "u",
    correct: "из до́ма",
    distractors: ["из дом", "от до́ма", "с до́ма"],
    sentence: "Она́ ушла́ ___.",
    sentenceFr: "Elle est partie de la maison.",
  },
  {
    prefixId: "pere",
    correct: "че́рез у́лицу",
    distractors: ["че́рез у́лице", "че́рез у́лицы", "по у́лице"],
    sentence: "Он перешёл ___.",
    sentenceFr: "Il a traversé la rue.",
  },
  {
    prefixId: "vy",
    correct: "из авто́буса",
    distractors: ["из авто́бус", "с авто́буса", "от авто́буса"],
    sentence: "Он вы́шел ___.",
    sentenceFr: "Il est descendu du bus.",
  },
  {
    prefixId: "do",
    correct: "до па́рка",
    distractors: ["до парк", "к па́рку", "в парк"],
    sentence: "Они́ дошли́ ___.",
    sentenceFr: "Ils sont allés jusqu'au parc.",
  },
  {
    prefixId: "pod",
    correct: "к столу́",
    distractors: ["к стол", "у стола́", "на стол"],
    sentence: "Она́ подошла́ ___.",
    sentenceFr: "Elle s'est approchée de la table.",
  },
  {
    prefixId: "pere",
    correct: "че́рез доро́гу",
    distractors: ["че́рез доро́ге", "че́рез доро́ги", "по доро́ге"],
    sentence: "Де́ти перешли́ ___.",
    sentenceFr: "Les enfants ont traversé la route.",
  },
  {
    prefixId: "ob",
    correct: "дом",
    distractors: ["до́ма", "до́му", "до́мом"],
    sentence: "Он обошёл ___.",
    sentenceFr: "Il a contourné la maison.",
  },
  {
    prefixId: "za",
    correct: "к дру́гу",
    distractors: ["к дру́га", "у дру́га", "в дру́га"],
    sentence: "Я зашёл ___.",
    sentenceFr: "Je suis passé chez un ami.",
  },
  {
    prefixId: "vy",
    correct: "из теа́тра",
    distractors: ["из теа́тр", "от теа́тра", "с теа́тра"],
    sentence: "Мы вы́шли ___.",
    sentenceFr: "Nous sommes sortis du théâtre.",
  },
  {
    prefixId: "pri",
    correct: "к врачу́",
    distractors: ["к врача́", "у врача́", "в врача́"],
    sentence: "Он пришёл ___.",
    sentenceFr: "Il est allé chez le médecin.",
  },
  {
    prefixId: "ob",
    correct: "пло́щадь",
    distractors: ["пло́щади", "пло́щадью", "о пло́щади"],
    sentence: "Они́ обошли́ ___.",
    sentenceFr: "Ils ont contourné la place.",
  },
  {
    prefixId: "do",
    correct: "до угла́",
    distractors: ["до у́гол", "к углу́", "на у́гол"],
    sentence: "Мы дошли́ ___.",
    sentenceFr: "Nous sommes allés jusqu'au coin de la rue.",
  },
  {
    prefixId: "s",
    correct: "с по́езда",
    distractors: ["с по́езд", "из по́езда", "от по́езда"],
    sentence: "Она́ сошла́ ___.",
    sentenceFr: "Elle est descendue du train.",
  },
  {
    prefixId: "za",
    correct: "за у́гол",
    distractors: ["за угло́м", "за угла́", "на у́гол"],
    sentence: "Маши́на зае́хала ___.",
    sentenceFr: "La voiture a tourné au coin de la rue.",
  },
];

function governmentExercise(random: () => number, forced?: GovernmentTarget): MotionExercise {
  const item = forced ?? pick(GOVERNMENT_ITEMS, random);
  const prefix = getPrefix(item.prefixId)!;
  const { options, correctIndex } = shuffleWithAnswer(
    [item.correct, ...item.distractors],
    item.correct,
    random
  );
  const caseName = getCase(prefix.governs)?.nameFr ?? prefix.governs;
  return {
    skill: "government",
    itemId: `government:${item.prefixId}:${item.correct}`,
    prompt: "Quelle préposition, et à quel cas ?",
    sentence: item.sentence,
    sentenceFr: item.sentenceFr,
    schema: prefix.schema,
    mode: "foot",
    options,
    correctIndex,
    explain: `${prefix.perfective} appelle « ${prefix.preposition} » + ${caseName.toLowerCase()} : ${item.correct}.`,
  };
}

const GENERATORS: Record<MotionSkillId, (random: () => number) => MotionExercise> = {
  mode: modeExercise,
  direction: directionExercise,
  prefix: prefixExercise,
  government: governmentExercise,
};

export function generateMotionExercise(
  skill: MotionSkillId,
  random: () => number = Math.random
): MotionExercise {
  return GENERATORS[skill](random);
}

/**
 * L'exercice exact qu'un identifiant désigne, options remélangées — pour
 * « Mes erreurs ». `null` pour un identifiant qu'aucun tirage ne produit :
 * un verbe de manière sur « je vais », une destination hors de son mode.
 */
export function rebuildMotionExercise(
  itemId: string,
  random: () => number = Math.random
): MotionExercise | null {
  const [kind, ...rest] = itemId.split(":");
  if (kind === "mode") {
    const pair = getPair(rest[0]);
    const destinationRu = rest.slice(1).join(":");
    const destination = pair?.isGoing
      ? MODE_DESTINATIONS[pair.mode].find((d) => d.ru === destinationRu)
      : undefined;
    return pair && destination ? modeExercise(random, { pair, destination }) : null;
  }
  if (kind === "direction") {
    const pair = getPair(rest[0]);
    const context = DIRECTION_CONTEXTS.find((c) => c.id === rest[1]);
    if (!pair || !context || !pair.isGoing || !context.modes.includes(pair.mode)) return null;
    return directionExercise(random, { pair, context });
  }
  if (kind === "prefix") {
    const prefix = getPrefix(rest[0]);
    return prefix ? prefixExercise(random, prefix) : null;
  }
  if (kind === "government") {
    const item = GOVERNMENT_ITEMS.find(
      (g) => g.prefixId === rest[0] && g.correct === rest.slice(1).join(":")
    );
    return item && getPrefix(item.prefixId) ? governmentExercise(random, item) : null;
  }
  return null;
}

/**
 * Rejoue la correction d'un item à partir de son seul identifiant : le
 * client envoie ce qu'il a répondu, jamais s'il avait juste. Même principe
 * que le module Cas — un seul verdict, côté serveur.
 */
export function checkMotionAnswer(itemId: string, answer: string): boolean | null {
  const [kind, ...rest] = itemId.split(":");
  if (kind === "mode") {
    const pair = getPair(rest[0]);
    return pair ? pair.uniForms.present1 === answer : null;
  }
  if (kind === "direction") {
    const pair = getPair(rest[0]);
    const context = DIRECTION_CONTEXTS.find((c) => c.id === rest[1]);
    if (!pair || !context) return null;
    return formOf(pair, context, context.answer) === answer;
  }
  if (kind === "prefix") {
    const prefix = getPrefix(rest[0]);
    return prefix ? prefix.perfective === answer : null;
  }
  if (kind === "government") {
    const item = GOVERNMENT_ITEMS.find(
      (g) => g.prefixId === rest[0] && g.correct === rest.slice(1).join(":")
    );
    return item ? item.correct === answer : null;
  }
  return null;
}

export const MOTION_CONTEXT_COUNT = DIRECTION_CONTEXTS.length;
export const MOTION_GOVERNMENT_COUNT = GOVERNMENT_ITEMS.length;
export { DIRECTION_CONTEXTS, GOVERNMENT_ITEMS };
export type { MotionPair };
