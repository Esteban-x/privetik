import { NOUNS } from "@/lib/grammar/nouns-data";
import { hasUsablePlural, isCountable } from "@/lib/grammar/noun-categories";
import type { Noun } from "@/lib/grammar/types";
import {
  buildOptions,
  pick,
  whyNotFor,
  type PracticeExercise,
  type Rng,
  type Skill,
} from "@/lib/exercises/types";

/**
 * Nombres, heure et dates.
 *
 * POURQUOI CE MODULE EST GÉNÉRATIF, ALORS QUE LES AUTRES ONT UNE BANQUE
 * ÉCRITE. Les modules Aspect, Mouvement et Adjectif portent sur des choix
 * de SENS : aucun calcul ne dit si « он шёл » ou « он ходил » convient dans
 * une situation donnée, il faut l'écrire. Ici, tout est mécanique — le cas
 * du nom après un nombre se déduit de son dernier chiffre, l'heure russe se
 * calcule, la date suit une règle. Écrire ces exercices à la main
 * n'ajouterait que des fautes de frappe et une liste finie là où la règle
 * couvre l'infini.
 *
 * Ce qui est écrit, en revanche : les contextes de durée (за / че́рез / на),
 * qui relèvent bien du sens, et les phrases-cadres, choisies pour que le
 * nombre y soit naturel.
 *
 * LES FORMES VIENNENT DE LA BANQUE. Les noms sont pris dans
 * lib/grammar/nouns-data, dont chaque forme est vérifiée par
 * `npm run check:grammar` — le module ne fabrique aucune terminaison.
 */

export const NUMBER_SKILLS: Skill[] = [
  {
    id: "agreement",
    title: "L'accord après un nombre",
    level: "A2",
    summary:
      "Оди́н дом, два до́ма, пять домо́в : le cas du nom se lit sur le DERNIER chiffre du nombre. 1 appelle le nominatif singulier, 2-4 le génitif singulier, 5 et au-delà le génitif pluriel — et 11 à 14 suivent la règle de 5.",
  },
  {
    id: "time",
    title: "Dire l'heure",
    level: "A2",
    summary:
      "Полови́на пя́того, c'est quatre heures et demie : le russe compte à l'intérieur de l'heure EN COURS. Avant la demie on ajoute les minutes à l'heure suivante, après la demie on les retranche.",
  },
  {
    id: "date",
    title: "Les dates",
    level: "A2",
    summary:
      "Annoncer une date et situer un événement demandent deux formes différentes du même ordinal : сего́дня пя́тое ма́я, mais он прие́дет пя́того ма́я — au génitif, sans préposition.",
  },
  {
    id: "age",
    title: "L'âge",
    level: "A1",
    summary:
      "Мне два́дцать оди́н год : la personne est au datif, et год suit la règle d'accord des nombres — год, го́да, лет. C'est la construction la plus fréquente du russe quotidien.",
  },
  {
    id: "duration",
    title: "Durée et délai",
    level: "B1",
    summary:
      "Quatre questions, quatre constructions : combien de temps (accusatif seul), en combien de temps (за), dans combien de temps (че́рез), pour combien de temps (на).",
  },
  {
    id: "listening",
    title: "À l'oreille",
    level: "A1",
    summary:
      "Пятна́дцать ou пятьдеся́т ? À l'écrit, 15 et 50 ne se ressemblent pas ; à l'oral, seule la finale les sépare. Reconnaître un prix, une heure ou un numéro de quai se joue sur -на́дцать, -дцать et -сот.",
  },
];

/** Les compétences qu'on peut aussi écrire : un nombre entendu se note en chiffres. */
export const TYPABLE_NUMBER_SKILLS = ["listening"];

export type NumberSkillId = (typeof NUMBER_SKILLS)[number]["id"];

export function getNumberSkill(id: string): Skill | undefined {
  return NUMBER_SKILLS.find((s) => s.id === id);
}

// ─────────────────────────────────────────────────────────────────
// 1. L'accord après un nombre
// ─────────────────────────────────────────────────────────────────

/** Les nombres proposés : un par zone d'accord, plus les pièges 11-14 et 21. */
const AGREEMENT_NUMBERS = [
  { value: 1, word: "оди́н", zone: "nom-sg" },
  { value: 2, word: "два", zone: "gen-sg" },
  { value: 3, word: "три", zone: "gen-sg" },
  { value: 4, word: "четы́ре", zone: "gen-sg" },
  { value: 5, word: "пять", zone: "gen-pl" },
  { value: 7, word: "семь", zone: "gen-pl" },
  { value: 11, word: "оди́ннадцать", zone: "gen-pl" },
  { value: 12, word: "двена́дцать", zone: "gen-pl" },
  { value: 21, word: "два́дцать оди́н", zone: "nom-sg" },
  { value: 22, word: "два́дцать два", zone: "gen-sg" },
  { value: 25, word: "два́дцать пять", zone: "gen-pl" },
] as const;

type AgreementZone = (typeof AGREEMENT_NUMBERS)[number]["zone"];

/**
 * Une centaine de noms concrets et dénombrables suffisent : les abstraits se
 * comptent mal.
 *
 * Le rang de fréquence ne dit RIEN de la dénombrabilité, et le laisser
 * décider seul faisait servir « 5 + вода », « 12 + вре́мя », « 7 + кровь » —
 * des mots parmi les plus courants de la langue, et qu'on ne compte jamais.
 * La liste d'exclusion curée (isCountable) tranche ; le rang ne fait plus que
 * ce qu'il sait faire, garder l'exercice dans le vocabulaire fréquent.
 */
const COUNTABLE = NOUNS.filter(
  (n) =>
    n.animacy === "inanimate" &&
    n.forms.plural &&
    n.rank !== undefined &&
    n.rank < 2500 &&
    isCountable(n.id) &&
    // Le génitif pluriel sert dès 5 : un nom sans pluriel réel donnerait
    // « двена́дцать лжей ». Même liste que pour les exercices de cas.
    hasUsablePlural(n.id)
).slice(0, 120);

function formFor(noun: Noun, zone: AgreementZone): string {
  // Ordre des formes dans la banque : nominatif, génitif, datif, accusatif,
  // instrumental, prépositionnel.
  if (zone === "nom-sg") return noun.forms.singular[0];
  if (zone === "gen-sg") return noun.forms.singular[1];
  return noun.forms.plural![1];
}

/**
 * Les deux nombres russes qui s'accordent en genre : оди́н et два.
 *
 * Le commentaire d'origine disait « contrairement aux AUTRES nombres » et
 * ne traitait qu'оди́н. Or два a un féminin, две, et la banque des noms
 * comptables contient 48 féminins (кни́га, ко́мната, дверь, маши́на, шко́ла…) :
 * l'exercice affichait régulièrement « два кни́ги » et « два́дцать два
 * маши́ны », qui sont faux, en donnant la forme du nom pour bonne réponse.
 *
 * Trois et au-delà ne s'accordent pas — c'est là que le « contrairement aux
 * autres » était juste, et c'est cette moitié de règle qui a été prise pour
 * la règle entière.
 */
function agreeNumeral(word: string, noun: Noun): string {
  if (word.endsWith("оди́н")) {
    const base = word.slice(0, -"оди́н".length);
    if (noun.gender === "feminine") return `${base}одна́`;
    if (noun.gender === "neuter") return `${base}одно́`;
    return word;
  }
  // два / две : le neutre suit le masculin (два окна́).
  if (word.endsWith("два")) {
    const base = word.slice(0, -"два".length);
    return noun.gender === "feminine" ? `${base}две` : word;
  }
  return word;
}

type AgreementNumber = (typeof AGREEMENT_NUMBERS)[number];

/**
 * Chaque tirage accepte un choix IMPOSÉ en plus du hasard : c'est ce qui
 * permet de reconstruire un exercice à partir de son seul identifiant (voir
 * `rebuildNumberExercise`). Le hasard ne sert plus alors qu'à mélanger.
 */
function agreementExercise(
  random: Rng,
  forced?: { noun: Noun; number: AgreementNumber }
): PracticeExercise {
  const noun = forced?.noun ?? pick(COUNTABLE, random);
  const number = forced?.number ?? pick(AGREEMENT_NUMBERS, random);
  const correct = formFor(noun, number.zone);
  const numberWord = agreeNumeral(number.word, noun);

  const candidates = [
    noun.forms.singular[0],
    noun.forms.singular[1],
    noun.forms.plural![1],
    noun.forms.plural![0],
  ];
  const { options, correctIndex } = buildOptions(correct, candidates, random);
  const whyNot = whyNotFor(options, correct, [
    [noun.forms.singular[0], "nominatif singulier : la forme après 1, 21, 31…"],
    [noun.forms.singular[1], "génitif singulier : la forme après 2, 3, 4"],
    [noun.forms.plural![1], "génitif pluriel : la forme dès 5, et de 11 à 14"],
    [noun.forms.plural![0], "nominatif pluriel : ce n'est pas la forme qui suit un nombre"],
  ]);

  const last = number.value % 100;
  const why =
    last >= 11 && last <= 14
      ? `${number.value} fait partie des « adolescents » 11-14 : malgré son dernier chiffre, il commande le génitif pluriel — ${correct}.`
      : number.zone === "nom-sg"
        ? `Le nombre se termine par 1 : le nom reste au nominatif singulier — ${correct}.`
        : number.zone === "gen-sg"
          ? `Le nombre se termine par 2, 3 ou 4 : génitif singulier — ${correct}.`
          : `À partir de 5, le nom passe au génitif pluriel — ${correct}.`;

  return {
    itemId: `agreement:${noun.id}:${number.value}`,
    prompt: "Complète",
    question: `${numberWord} ___`,
    hint: `${number.value} × ${noun.translation}`,
    badge: noun.lemma,
    options,
    correctIndex,
    explain: why,
    whyNot,
  };
}

// ─────────────────────────────────────────────────────────────────
// 2. L'heure
// ─────────────────────────────────────────────────────────────────

const HOUR_CARDINAL = [
  "час", "два", "три", "четы́ре", "пять", "шесть",
  "семь", "во́семь", "де́вять", "де́сять", "оди́ннадцать", "двена́дцать",
];

const HOUR_ORDINAL_GEN = [
  "пе́рвого", "второ́го", "тре́тьего", "четвёртого", "пя́того", "шесто́го",
  "седьмо́го", "восьмо́го", "девя́того", "деся́того", "оди́ннадцатого", "двена́дцатого",
];

const MINUTES_NOM: Record<number, string> = {
  5: "пять мину́т",
  10: "де́сять мину́т",
  15: "че́тверть",
  20: "два́дцать мину́т",
  25: "два́дцать пять мину́т",
};

const MINUTES_GEN: Record<number, string> = {
  5: "пяти́",
  10: "десяти́",
  15: "че́тверти",
  20: "двадцати́",
  25: "двадцати́ пяти́",
};

/** Le mot « heure » accordé : час, часа́, часо́в. */
function hourWord(hour: number): string {
  if (hour === 1) return "";
  if (hour >= 2 && hour <= 4) return " часа́";
  return " часо́в";
}

/** L'heure suivante, sur un cadran de 12. */
function nextHour(hour: number): number {
  return hour === 12 ? 1 : hour + 1;
}

/**
 * L'heure en langue courante. `hour` de 1 à 12, `minute` multiple de 5.
 *
 * Avant la demie, le russe nomme l'heure EN COURS par son ordinal — 16 h 20
 * est « vingt minutes de la cinquième ». Après la demie, il retranche de
 * l'heure suivante. C'est exactement l'inverse du réflexe français, d'où le
 * module.
 */
export function tellTime(hour: number, minute: number): string {
  if (minute === 0) return `${HOUR_CARDINAL[hour - 1]}${hourWord(hour)}`;
  const nextOrdinal = HOUR_ORDINAL_GEN[nextHour(hour) - 1];
  if (minute === 30) return `полови́на ${nextOrdinal}`;
  if (minute < 30) return `${MINUTES_NOM[minute]} ${nextOrdinal}`;
  const remaining = 60 - minute;
  return `без ${MINUTES_GEN[remaining]} ${HOUR_CARDINAL[nextHour(hour) - 1]}`;
}

/** « 4 h 30 », « 5 h » : l'heure qu'une tournure russe désigne vraiment. */
function clock(hour: number, minute: number): string {
  return minute === 0 ? `${hour} h` : `${hour} h ${String(minute).padStart(2, "0")}`;
}

function timeExercise(random: Rng, forced?: { hour: number; minute: number }): PracticeExercise {
  const hour = forced?.hour ?? 1 + Math.floor(random() * 12);
  const minute = forced?.minute ?? pick([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55], random);
  const correct = tellTime(hour, minute);
  const previousHour = hour === 1 ? 12 : hour - 1;

  // Trois leurres, trois erreurs réelles : l'heure en cours au lieu de la
  // suivante, la construction inversée autour de la demie, et une quantité
  // de minutes fausse.
  const wrongHour =
    minute === 0
      ? tellTime(nextHour(hour), 0)
      : minute <= 30
        ? `${minute === 30 ? "полови́на" : MINUTES_NOM[minute]} ${HOUR_ORDINAL_GEN[hour - 1]}`
        : `без ${MINUTES_GEN[60 - minute]} ${HOUR_CARDINAL[hour - 1]}`;

  const flipped =
    minute === 0
      ? `полови́на ${HOUR_ORDINAL_GEN[nextHour(hour) - 1]}`
      : minute < 30
        ? `без ${MINUTES_GEN[minute]} ${HOUR_CARDINAL[nextHour(hour) - 1]}`
        : minute === 30
          ? `три́дцать мину́т ${HOUR_ORDINAL_GEN[hour - 1]}`
          : `${MINUTES_NOM[60 - minute]} ${HOUR_ORDINAL_GEN[nextHour(hour) - 1]}`;

  const otherMinute = minute === 0 ? 15 : minute === 15 ? 20 : 15;
  const wrongMinute = tellTime(hour, otherMinute);

  const { options, correctIndex } = buildOptions(
    correct,
    [wrongHour, flipped, wrongMinute],
    random
  );

  // CE QUE CHAQUE LEURRE DIT RÉELLEMENT. Ce ne sont pas des phrases fausses
  // mais des heures fausses : « полови́на четвёртого » est une tournure
  // parfaitement russe, qui désigne 3 h 30 et non 4 h 30. Le dire vaut mieux
  // que « faux » — c'est exactement le décalage d'une heure que le module
  // veut désamorcer.
  const whyNot = whyNotFor(options, correct, [
    [
      wrongHour,
      minute === 0
        ? `c'est ${clock(nextHour(hour), 0)}`
        : `veut dire ${clock(previousHour, minute)} : le russe nomme l'heure qui commence`,
    ],
    [
      flipped,
      minute === 30
        ? "la demie se dit « полови́на », pas « trente minutes »"
        : minute === 0
          ? `c'est ${clock(hour, 30)}`
          : `veut dire ${clock(hour, 60 - minute)}`,
    ],
    [wrongMinute, `c'est ${clock(hour, otherMinute)}`],
  ]);

  const explain =
    minute === 0
      ? `${hour} h pile : le nombre commande l'accord de час — ${correct}.`
      : minute === 30
        ? `La demie se dit « la moitié de l'heure SUIVANTE » : ${hour} h 30 → ${correct}.`
        : minute < 30
          ? `Avant la demie, on ajoute les minutes à l'heure suivante (${nextHour(hour)}ᵉ) : ${correct}.`
          : `Après la demie, on retranche de l'heure suivante avec без + génitif : ${correct}.`;

  return {
    itemId: `time:${hour}:${minute}`,
    prompt: "Quelle heure est-il, en langue courante ?",
    question: `${hour}:${String(minute).padStart(2, "0")}`,
    options,
    correctIndex,
    explain,
    whyNot,
  };
}

// ─────────────────────────────────────────────────────────────────
// 3. Les dates
// ─────────────────────────────────────────────────────────────────

const MONTHS_GEN = [
  "января́", "февраля́", "ма́рта", "апре́ля", "ма́я", "ию́ня",
  "ию́ля", "а́вгуста", "сентября́", "октября́", "ноября́", "декабря́",
];

const MONTHS_NOM = [
  "янва́рь", "февра́ль", "март", "апре́ль", "май", "ию́нь",
  "ию́ль", "а́вгуст", "сентя́брь", "октя́брь", "ноя́брь", "дека́брь",
];

/**
 * Les trente et un quantièmes, au nominatif neutre et au génitif.
 *
 * Il n'y en avait dix, et le tirage s'arrêtait donc au 10 — jamais de
 * « оди́ннадцатое », jamais de « два́дцать пе́рвого », c'est-à-dire jamais les
 * formes composées ni les « adolescents » en -надцатое, qui sont la seule
 * difficulté réelle de cet exercice. Les dix premiers ordinaux sont aussi
 * les dix qu'on apprend en premier ailleurs.
 *
 * Au-delà de 20, seul le DERNIER élément se décline : « два́дцать пе́рвого »,
 * pas « двадца́того пе́рвого ». La table est écrite en entier plutôt que
 * composée à la volée — trente et une lignes se relisent, une règle de
 * composition se déboguerait.
 */
const DAY_ORDINAL_NOM = [
  "пе́рвое", "второ́е", "тре́тье", "четвёртое", "пя́тое", "шесто́е",
  "седьмо́е", "восьмо́е", "девя́тое", "деся́тое",
  "оди́ннадцатое", "двена́дцатое", "трина́дцатое", "четы́рнадцатое",
  "пятна́дцатое", "шестна́дцатое", "семна́дцатое", "восемна́дцатое",
  "девятна́дцатое", "двадца́тое",
  "два́дцать пе́рвое", "два́дцать второ́е", "два́дцать тре́тье",
  "два́дцать четвёртое", "два́дцать пя́тое", "два́дцать шесто́е",
  "два́дцать седьмо́е", "два́дцать восьмо́е", "два́дцать девя́тое",
  "тридца́тое", "три́дцать пе́рвое",
];

const DAY_ORDINAL_GEN = [
  "пе́рвого", "второ́го", "тре́тьего", "четвёртого", "пя́того", "шесто́го",
  "седьмо́го", "восьмо́го", "девя́того", "деся́того",
  "оди́ннадцатого", "двена́дцатого", "трина́дцатого", "четы́рнадцатого",
  "пятна́дцатого", "шестна́дцатого", "семна́дцатого", "восемна́дцатого",
  "девятна́дцатого", "двадца́того",
  "два́дцать пе́рвого", "два́дцать второ́го", "два́дцать тре́тьего",
  "два́дцать четвёртого", "два́дцать пя́того", "два́дцать шесто́го",
  "два́дцать седьмо́го", "два́дцать восьмо́го", "два́дцать девя́того",
  "тридца́того", "три́дцать пе́рвого",
];

/**
 * Les mois en FRANÇAIS, pour l'indice.
 *
 * L'indice tentait de fabriquer un nom de mois en retirant la finale du
 * génitif russe : `"января́".replace("я́", "")` — d'où « Il arrivera le 5
 * январ… », un mot russe tronqué au milieu d'une phrase française. Et pour
 * les mois dont le génitif ne finit pas par -я́ (ма́рта, а́вгуста), la
 * substitution ne faisait rien du tout et laissait le russe intact.
 *
 * Un indice sert à dire, en français, ce qu'il faut produire en russe. Il
 * n'a aucune raison d'y mêler du russe abîmé.
 */
const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

function dateExercise(
  random: Rng,
  forced?: { day: number; month: number; situate: boolean }
): PracticeExercise {
  const day = forced?.day ?? 1 + Math.floor(random() * DAY_ORDINAL_NOM.length);
  const month = forced?.month ?? Math.floor(random() * 12);
  const situate = forced?.situate ?? random() < 0.5;

  const nom = `${DAY_ORDINAL_NOM[day - 1]} ${MONTHS_GEN[month]}`;
  const gen = `${DAY_ORDINAL_GEN[day - 1]} ${MONTHS_GEN[month]}`;
  const correct = situate ? gen : nom;

  const candidates = [
    situate ? nom : gen,
    `${DAY_ORDINAL_NOM[day - 1]} ${MONTHS_NOM[month]}`,
    `${DAY_ORDINAL_GEN[day - 1]} ${MONTHS_NOM[month]}`,
  ];
  const { options, correctIndex } = buildOptions(correct, candidates, random);

  return {
    itemId: `date:${day}:${month}:${situate ? "when" : "what"}`,
    prompt: situate ? "Situe l'événement" : "Annonce la date",
    question: situate ? "Он прие́дет ___." : "Сего́дня ___.",
    hint: situate
      ? `Il arrivera le ${day} ${MONTHS_FR[month]}…`
      : `Nous sommes le ${day} ${MONTHS_FR[month]}…`,
    badge: `${day} / ${month + 1}`,
    options,
    correctIndex,
    whyNot: whyNotFor(options, correct, [
      [nom, "nominatif : la forme pour ANNONCER la date — « Сего́дня… »"],
      [gen, "génitif : la forme pour SITUER un événement — « Он прие́дет… »"],
      [candidates[1], "mois au nominatif : dans une date, le mois reste au génitif"],
      [candidates[2], "mois au nominatif : dans une date, le mois reste au génitif"],
    ]),
    explain: situate
      ? "Pour SITUER un événement, l'ordinal passe au génitif, et sans aucune préposition. Le mois reste au génitif dans les deux cas."
      : "Pour ANNONCER la date, l'ordinal est au nominatif neutre (число́ sous-entendu) et le mois au génitif.",
  };
}

// ─────────────────────────────────────────────────────────────────
// 4. L'âge
// ─────────────────────────────────────────────────────────────────

const PEOPLE = [
  { subject: "Мне", fr: "J'ai" },
  { subject: "Ему́", fr: "Il a" },
  { subject: "Ей", fr: "Elle a" },
  { subject: "Моему́ бра́ту", fr: "Mon frère a" },
  { subject: "Мое́й сестре́", fr: "Ma sœur a" },
] as const;

const AGES = [1, 2, 3, 4, 5, 7, 11, 12, 18, 21, 22, 25, 31, 40, 51] as const;

/** Год au bon cas : год, го́да, лет — la même règle que pour n'importe quel nom. */
export function yearWord(age: number): string {
  const last = age % 100;
  if (last >= 11 && last <= 14) return "лет";
  const unit = age % 10;
  if (unit === 1) return "год";
  if (unit >= 2 && unit <= 4) return "го́да";
  return "лет";
}

const AGE_NUMERALS: Record<number, string> = {
  1: "оди́н", 2: "два", 3: "три", 4: "четы́ре", 5: "пять", 7: "семь",
  11: "оди́ннадцать", 12: "двена́дцать", 18: "восемна́дцать", 21: "два́дцать оди́н",
  22: "два́дцать два", 25: "два́дцать пять", 31: "три́дцать оди́н", 40: "со́рок",
  51: "пятьдеся́т оди́н",
};

function ageExercise(random: Rng, forcedAge?: number): PracticeExercise {
  const person = pick(PEOPLE, random);
  const age = forcedAge ?? pick(AGES, random);
  const correct = yearWord(age);
  const { options, correctIndex } = buildOptions(correct, ["год", "го́да", "лет", "года́м"], random);
  const last = age % 100;

  return {
    whyNot: whyNotFor(options, correct, [
      ["год", "nominatif singulier : après 1, 21, 31…"],
      ["го́да", "génitif singulier : après 2, 3, 4"],
      ["лет", "génitif pluriel : dès 5, et de 11 à 14"],
      ["года́м", "datif pluriel : il ne sert pas à dire l'âge"],
    ]),
    itemId: `age:${age}`,
    prompt: "Complète",
    question: `${person.subject} ${AGE_NUMERALS[age]} ___.`,
    hint: `${person.fr} ${age} ans.`,
    options,
    correctIndex,
    explain:
      last >= 11 && last <= 14
        ? `${age} est un « adolescent » (11-14) : лет, comme après 5.`
        : correct === "год"
          ? `${age} se termine par 1 : nominatif singulier, год.`
          : correct === "го́да"
            ? `${age} se termine par 2, 3 ou 4 : génitif singulier, го́да.`
            : `${age} appelle le génitif pluriel, et год y fait лет — une forme empruntée à ле́то.`,
  };
}

// ─────────────────────────────────────────────────────────────────
// 5. Durée et délai — les seuls contextes écrits du module
// ─────────────────────────────────────────────────────────────────

interface DurationContext {
  id: string;
  ru: string;
  fr: string;
  correct: string;
  why: string;
}

const DURATION_OPTIONS = ["за час", "че́рез час", "на час", "час"];

const DURATION_CONTEXTS: DurationContext[] = [
  {
    id: "read-two-hours",
    ru: "Я чита́л ___ и о́чень уста́л.",
    fr: "J'ai lu deux heures et je suis très fatigué.",
    correct: "два часа́",
    why: "Combien de temps l'activité a duré : accusatif seul, sans préposition, avec un verbe imperfectif.",
  },
  {
    id: "finished-in-two-hours",
    ru: "Он сде́лал всю рабо́ту ___.",
    fr: "Il a fait tout le travail en deux heures.",
    correct: "за два часа́",
    why: "Le temps qu'il a fallu pour ABOUTIR : за + accusatif, et le verbe est perfectif.",
  },
  {
    id: "call-in-an-hour",
    ru: "Позвони́ мне ___.",
    fr: "Appelle-moi dans une heure.",
    correct: "че́рез час",
    why: "Un délai à partir de maintenant : че́рез + accusatif.",
  },
  {
    id: "came-for-a-week",
    ru: "Он прие́хал в Москву́ ___.",
    fr: "Il est venu à Moscou pour une semaine.",
    correct: "на неде́лю",
    why: "La durée PRÉVUE du séjour, après un verbe de déplacement : на + accusatif.",
  },
  {
    id: "lived-three-years",
    ru: "Мы жи́ли в Петербу́рге ___.",
    fr: "Nous avons vécu trois ans à Saint-Pétersbourg.",
    correct: "три го́да",
    why: "Durée effective : accusatif seul. На три го́да dirait qu'on y était venu POUR trois ans.",
  },
  {
    id: "borrowed-for-a-week",
    ru: "Я взял кни́гу ___.",
    fr: "J'ai emprunté le livre pour une semaine.",
    correct: "на неде́лю",
    why: "На + accusatif : la durée porte sur l'état qui résulte de l'action, pas sur l'action elle-même.",
  },
  {
    id: "ready-in-five-minutes",
    ru: "Всё бу́дет гото́во ___.",
    fr: "Tout sera prêt dans cinq minutes.",
    correct: "че́рез пять мину́т",
    why: "Че́рез compte à partir du moment où l'on parle.",
  },
  {
    id: "wrote-in-a-week",
    ru: "Она́ написа́ла статью́ ___.",
    fr: "Elle a écrit l'article en une semaine.",
    correct: "за неде́лю",
    why: "За + accusatif mesure le temps nécessaire au résultat — le verbe est perfectif (написа́ла).",
  },

  // ─── Accusatif seul : combien de temps ça a duré ────────────────
  {
    id: "slept-all-night",
    ru: "Он спал ___.",
    fr: "Il a dormi toute la nuit.",
    correct: "всю ночь",
    why: "Dormir n'aboutit à rien : il n'y a que de la durée, donc l'accusatif seul. « На всю ночь » dirait qu'il s'est couché POUR la nuit — c'est остался на всю ночь, pas спал.",
  },
  {
    id: "waited-twenty-minutes",
    ru: "Мы жда́ли авто́буса ___.",
    fr: "Nous avons attendu le bus vingt minutes.",
    correct: "два́дцать мину́т",
    why: "Жда́ли est imperfectif et l'attente n'a pas de terme atteint : accusatif nu. За два́дцать мину́т supposerait un résultat obtenu en vingt minutes.",
  },
  {
    id: "worked-all-day",
    ru: "Она́ рабо́тала ___.",
    fr: "Elle a travaillé toute la journée.",
    correct: "весь день",
    why: "L'accusatif seul répond à « combien de temps ». Весь день, sans préposition — la journée est remplie par l'activité, pas mesurée par son résultat.",
  },
  {
    id: "studied-five-years",
    ru: "Он учи́лся в университе́те ___.",
    fr: "Il a étudié cinq ans à l'université.",
    correct: "пять лет",
    why: "Cinq ans de présence effective : accusatif seul. За пять лет dirait ce qu'il a réussi À FAIRE en cinq ans, pas combien de temps il y est resté.",
  },

  // ─── За + accusatif : le temps qu'il a fallu pour aboutir ───────
  {
    id: "learned-in-a-month",
    ru: "Она́ вы́учила все слова́ ___.",
    fr: "Elle a appris tous les mots en un mois.",
    correct: "за ме́сяц",
    why: "Il y a un résultat — tous les mots sont sus — et вы́учила est perfectif : за + accusatif. Ме́сяц seul dirait qu'elle a passé un mois à apprendre, sans dire qu'elle a fini.",
  },
  {
    id: "read-in-two-days",
    ru: "Я прочита́л рома́н ___.",
    fr: "J'ai lu le roman en deux jours.",
    correct: "за два дня",
    why: "Прочита́л (perfectif) : le livre est fini. За два дня mesure le temps qu'il a fallu. Два дня seul irait avec чита́л — j'ai lu, sans dire jusqu'au bout.",
  },
  {
    id: "built-in-a-year",
    ru: "Дом постро́или ___.",
    fr: "On a construit la maison en un an.",
    correct: "за год",
    why: "La maison est debout : le résultat existe, donc за + accusatif. C'est la question « en combien de temps ? », pas « pendant combien de temps ? ».",
  },
  {
    id: "ate-in-five-minutes",
    ru: "Он съел суп ___.",
    fr: "Il a mangé la soupe en cinq minutes.",
    correct: "за пять мину́т",
    why: "Съел : l'assiette est vide. За + accusatif. Че́рез пять мину́т voudrait dire qu'il s'est mis à manger cinq minutes plus tard.",
  },

  // ─── Че́рез + accusatif : dans combien de temps ──────────────────
  {
    id: "train-in-ten-minutes",
    ru: "По́езд отправля́ется ___.",
    fr: "Le train part dans dix minutes.",
    correct: "че́рез де́сять мину́т",
    why: "Un point dans le futur, compté depuis maintenant : че́рез + accusatif. За де́сять мину́т dirait combien de temps le départ a PRIS, ce qui n'a pas de sens ici.",
  },
  {
    id: "back-in-a-week",
    ru: "Я верну́сь ___.",
    fr: "Je reviendrai dans une semaine.",
    correct: "че́рез неде́лю",
    why: "Че́рез situe le retour ; на неде́лю dirait pour combien de temps je reste une fois revenu. Deux phrases justes, deux sens différents — c'est le contexte qui tranche.",
  },
  {
    id: "exam-in-three-days",
    ru: "Экза́мен бу́дет ___.",
    fr: "L'examen aura lieu dans trois jours.",
    correct: "че́рез три дня",
    why: "Le délai qui nous sépare de l'événement : че́рез + accusatif. Три дня seul dirait que l'examen DURE trois jours.",
  },

  // ─── На + accusatif : pour combien de temps ─────────────────────
  {
    id: "left-for-a-month",
    ru: "Он уе́хал в дере́вню ___.",
    fr: "Il est parti à la campagne pour un mois.",
    correct: "на ме́сяц",
    why: "На porte sur ce qui SUIT le départ : il compte y rester un mois. Le trajet, lui, a duré quelques heures — c'est toute la différence avec l'accusatif seul.",
  },
  {
    id: "holiday-for-two-weeks",
    ru: "Он взял о́тпуск ___.",
    fr: "Il a pris deux semaines de congé.",
    correct: "на две неде́ли",
    why: "Взять о́тпуск dure un instant ; ce sont les deux semaines de congé qui suivent. На + accusatif est obligatoire ici, l'accusatif nu serait faux.",
  },
  {
    id: "booked-for-three-nights",
    ru: "Мы заброни́ровали но́мер ___.",
    fr: "Nous avons réservé la chambre pour trois nuits.",
    correct: "на три но́чи",
    why: "La réservation se fait en une minute ; les trois nuits sont la durée réservée. На + accusatif — et но́чи après три, comme après tout nombre de 2 à 4.",
  },
];

const DURATION_DISTRACTORS: Record<string, string[]> = {
  "два часа́": ["за два часа́", "че́рез два часа́", "на два часа́"],
  "за два часа́": ["два часа́", "че́рез два часа́", "на два часа́"],
  "че́рез час": ["за час", "на час", "час"],
  "на неде́лю": ["неде́лю", "за неде́лю", "че́рез неде́лю"],
  "три го́да": ["на три го́да", "за три го́да", "че́рез три го́да"],
  "че́рез пять мину́т": ["за пять мину́т", "на пять мину́т", "пять мину́т"],
  "за неде́лю": ["неде́лю", "на неде́лю", "че́рез неде́лю"],
  "всю ночь": ["за всю ночь", "че́рез всю ночь", "на всю ночь"],
  "два́дцать мину́т": ["за два́дцать мину́т", "че́рез два́дцать мину́т", "на два́дцать мину́т"],
  "весь день": ["за весь день", "че́рез весь день", "на весь день"],
  "пять лет": ["за пять лет", "че́рез пять лет", "на пять лет"],
  "за ме́сяц": ["ме́сяц", "че́рез ме́сяц", "на ме́сяц"],
  "за два дня": ["два дня", "че́рез два дня", "на два дня"],
  "за год": ["год", "че́рез год", "на год"],
  "за пять мину́т": ["пять мину́т", "че́рез пять мину́т", "на пять мину́т"],
  "че́рез де́сять мину́т": ["за де́сять мину́т", "на де́сять мину́т", "де́сять мину́т"],
  "че́рез неде́лю": ["за неде́лю", "на неде́лю", "неде́лю"],
  "че́рез три дня": ["за три дня", "на три дня", "три дня"],
  "на ме́сяц": ["ме́сяц", "за ме́сяц", "че́рез ме́сяц"],
  "на две неде́ли": ["две неде́ли", "за две неде́ли", "че́рез две неде́ли"],
  "на три но́чи": ["три но́чи", "за три но́чи", "че́рез три но́чи"],
};

/**
 * Ce que dit chaque construction de temps, quelle que soit la durée : les
 * quatre options d'un item reprennent la même expression (voir
 * check:exercises), c'est donc la préposition seule qui les distingue.
 */
function durationNote(option: string): string {
  if (option.startsWith("за ")) return "за + accusatif : le temps mis pour obtenir un résultat";
  if (option.startsWith("че́рез ")) return "че́рез + accusatif : au bout de ce délai, l'événement a lieu";
  if (option.startsWith("на ")) return "на + accusatif : la durée prévue du résultat, une fois l'action faite";
  return "accusatif seul : la durée de l'activité elle-même";
}

function durationExercise(random: Rng, forced?: DurationContext): PracticeExercise {
  const context = forced ?? pick(DURATION_CONTEXTS, random);
  const { options, correctIndex } = buildOptions(
    context.correct,
    DURATION_DISTRACTORS[context.correct] ?? DURATION_OPTIONS,
    random
  );
  return {
    itemId: `duration:${context.id}`,
    prompt: "Complète",
    question: context.ru,
    hint: context.fr,
    options,
    correctIndex,
    explain: context.why,
    whyNot: whyNotFor(
      options,
      context.correct,
      options.map((option) => [option, durationNote(option)])
    ),
  };
}

// ─────────────────────────────────────────────────────────────────
// 6. À l'oreille
// ─────────────────────────────────────────────────────────────────

/**
 * POURQUOI À L'ORAL. Tous les onglets de ce module montrent le nombre écrit.
 * Or c'est à l'oral qu'un nombre se rate : au marché, au téléphone, à la
 * gare. Et ce qui trompe n'est pas ce qui trompe à l'écrit — ce sont des
 * mots presque homophones : пятна́дцать / пятьдеся́т / пятьсо́т, двена́дцать /
 * два́дцать, се́мьдесят / семна́дцать. Les leurres sont donc tirés de la même
 * famille que la réponse, et chacun dit comment il se serait prononcé.
 */

const UNITS = ["", "оди́н", "два", "три", "четы́ре", "пять", "шесть", "семь", "во́семь", "де́вять"];
const TEENS = [
  "де́сять", "оди́ннадцать", "двена́дцать", "трина́дцать", "четы́рнадцать",
  "пятна́дцать", "шестна́дцать", "семна́дцать", "восемна́дцать", "девятна́дцать",
];
const TENS = ["", "", "два́дцать", "три́дцать", "со́рок", "пятьдеся́т", "шестьдеся́т", "се́мьдесят", "во́семьдесят", "девяно́сто"];
const HUNDREDS = ["", "сто", "две́сти", "три́ста", "четы́реста", "пятьсо́т", "шестьсо́т", "семьсо́т", "восемьсо́т", "девятьсо́т"];

/** Un cardinal de 1 à 999, en toutes lettres et accentué. */
export function cardinalWords(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 999) throw new Error(`Nombre hors limites : ${n}`);
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds > 0) parts.push(HUNDREDS[hundreds]);
  if (rest >= 10 && rest < 20) parts.push(TEENS[rest - 10]);
  else {
    if (rest >= 20) parts.push(TENS[Math.floor(rest / 10)]);
    if (rest % 10 > 0) parts.push(UNITS[rest % 10]);
  }
  return parts.join(" ");
}

/** Les nombres servis : unités, 12-19, dizaines, centaines, et deux familles de composés. */
const LISTENING_NUMBERS: number[] = [
  ...[2, 3, 4, 5, 6, 7, 8, 9],
  ...[12, 13, 14, 15, 16, 17, 18, 19],
  ...[20, 30, 40, 50, 60, 70, 80, 90],
  ...[200, 300, 400, 500, 600, 700, 800, 900],
  ...[2, 3, 5, 6, 7, 8, 9].flatMap((d) => [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((e) => e !== d).map((e) => d * 10 + e)),
  ...[2, 3, 5, 6, 7, 8, 9].flatMap((h) => [2, 5, 7, 9].filter((e) => e !== h).map((e) => h * 100 + e)),
];

/** Ce qu'on risque d'entendre à la place : la même famille de sons. */
function listeningDecoys(n: number): number[] {
  const candidates: number[] = [];
  if (n < 10) candidates.push(10 + n, 10 * n, 100 * n);
  else if (n < 20) candidates.push(10 * (n - 10), n - 10, 100 * (n - 10));
  else if (n < 100 && n % 10 === 0) candidates.push(10 + n / 10, n / 10, (n / 10) * 100);
  else if (n % 100 === 0) candidates.push((n / 100) * 10, 10 + n / 100, n / 100);
  else if (n < 100) {
    const d = Math.floor(n / 10);
    const e = n % 10;
    candidates.push(e * 10 + d, 10 + d, d * 100 + e);
  } else {
    const h = Math.floor(n / 100);
    const e = n % 100;
    candidates.push(h * 10 + e, h * 100 + e * 10, e * 10 + h);
  }
  return candidates.filter((m, i) => m >= 1 && m <= 999 && m !== n && candidates.indexOf(m) === i);
}

function listeningExplain(n: number): string {
  const words = cardinalWords(n);
  if (n >= 12 && n < 20) {
    return `« ${words} » : ${n}. La finale -на́дцать (« sur dix ») fait 11 à 19 ; les dizaines finissent en -дцать ou -десят.`;
  }
  if (n >= 20 && n < 100 && n % 10 === 0) {
    return `« ${words} » : ${n}. Les dizaines finissent en -дцать (20, 30) ou -десят (50 à 80) — sauf со́рок et девяно́сто ; -на́дцать ferait 11 à 19.`;
  }
  if (n >= 100) {
    return `« ${words} » : ${n}. Les centaines s'entendent à leur finale : -сти, -ста, -сот.`;
  }
  if (n > 20) return `« ${words} » : ${n}. Les dizaines d'abord, les unités ensuite — comme en français.`;
  return `« ${words} » : ${n}.`;
}

function listeningExercise(random: Rng, forced?: number): PracticeExercise {
  const n = forced ?? pick(LISTENING_NUMBERS, random);
  const decoys = listeningDecoys(n);
  const { options, correctIndex } = buildOptions(String(n), decoys.map(String), random);
  return {
    itemId: `listening:${n}`,
    prompt: "À l'oreille",
    question: "Quel nombre entends-tu ?",
    audio: cardinalWords(n),
    options,
    correctIndex,
    explain: listeningExplain(n),
    whyNot: whyNotFor(
      options,
      String(n),
      decoys.map((m) => [String(m), `se dirait « ${cardinalWords(m)} »`])
    ),
  };
}

// ─────────────────────────────────────────────────────────────────
// Tirage et correction
// ─────────────────────────────────────────────────────────────────

export function generateNumberExercise(skill: string, random: Rng = Math.random): PracticeExercise {
  switch (skill) {
    case "agreement":
      return agreementExercise(random);
    case "time":
      return timeExercise(random);
    case "date":
      return dateExercise(random);
    case "age":
      return ageExercise(random);
    case "duration":
      return durationExercise(random);
    case "listening":
      return listeningExercise(random);
    default:
      throw new Error(`Compétence inconnue : ${skill}`);
  }
}

/**
 * L'exercice exact qu'un identifiant désigne, options remélangées — pour
 * « Mes erreurs ». `null` si l'identifiant ne correspond à aucun tirage
 * possible. L'âge ne garde pas la personne (« Мне », « Ей ») : elle ne
 * change rien à la réponse, et un sujet différent au retour évite de
 * reconnaître la phrase plutôt que la règle.
 */
export function rebuildNumberExercise(
  itemId: string,
  random: Rng = Math.random
): PracticeExercise | null {
  const [skill, ...rest] = itemId.split(":");
  switch (skill) {
    case "agreement": {
      const noun = COUNTABLE.find((n) => n.id === rest[0]);
      const number = AGREEMENT_NUMBERS.find((n) => String(n.value) === rest[1]);
      return noun && number ? agreementExercise(random, { noun, number }) : null;
    }
    case "time": {
      const hour = Number(rest[0]);
      const minute = Number(rest[1]);
      if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
      if (hour < 1 || hour > 12 || minute < 0 || minute % 5 !== 0 || minute > 55) return null;
      return timeExercise(random, { hour, minute });
    }
    case "date": {
      const day = Number(rest[0]);
      const month = Number(rest[1]);
      if (!(Number.isInteger(day) && day >= 1 && day <= DAY_ORDINAL_NOM.length)) return null;
      if (!(Number.isInteger(month) && month >= 0 && month <= 11)) return null;
      if (rest[2] !== "when" && rest[2] !== "what") return null;
      return dateExercise(random, { day, month, situate: rest[2] === "when" });
    }
    case "age": {
      const age = Number(rest[0]);
      return (AGES as readonly number[]).includes(age) ? ageExercise(random, age) : null;
    }
    case "duration": {
      const context = DURATION_CONTEXTS.find((c) => c.id === rest[0]);
      return context ? durationExercise(random, context) : null;
    }
    case "listening": {
      const n = Number(rest[0]);
      return rest.length === 1 && LISTENING_NUMBERS.includes(n) ? listeningExercise(random, n) : null;
    }
    default:
      return null;
  }
}

/**
 * Rejoue la correction côté serveur à partir du seul `itemId`.
 *
 * Chaque identifiant contient tout ce qu'il faut pour recalculer la réponse
 * — le nom et le nombre, l'heure, la date — si bien que le serveur n'a
 * besoin d'aucun état de session et que le client ne peut rien affirmer.
 */
export function checkNumberAnswer(itemId: string, answer: string): boolean | null {
  const [skill, ...rest] = itemId.split(":");
  if (skill === "listening") {
    const n = Number(rest[0]);
    return rest.length === 1 && LISTENING_NUMBERS.includes(n) ? answer === String(n) : null;
  }
  switch (skill) {
    case "agreement": {
      const [nounId, value] = rest;
      const noun = NOUNS.find((n) => n.id === nounId);
      const number = AGREEMENT_NUMBERS.find((n) => String(n.value) === value);
      if (!noun || !number || !noun.forms.plural) return null;
      return formFor(noun, number.zone) === answer;
    }
    case "time": {
      const hour = Number(rest[0]);
      const minute = Number(rest[1]);
      if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
      if (hour < 1 || hour > 12 || minute % 5 !== 0 || minute > 55) return null;
      return tellTime(hour, minute) === answer;
    }
    case "date": {
      const day = Number(rest[0]);
      const month = Number(rest[1]);
      const situate = rest[2] === "when";
      // La borne suit la table, elle n'est plus écrite en dur : elle disait
      // 10 quand la table en comptait 10, et aurait rejeté comme invalide
      // tout item produit par une table plus longue.
      if (!(day >= 1 && day <= DAY_ORDINAL_NOM.length)) return null;
      if (!(month >= 0 && month <= 11)) return null;
      const expected = `${(situate ? DAY_ORDINAL_GEN : DAY_ORDINAL_NOM)[day - 1]} ${MONTHS_GEN[month]}`;
      return expected === answer;
    }
    case "age": {
      const age = Number(rest[0]);
      if (!AGE_NUMERALS[age]) return null;
      return yearWord(age) === answer;
    }
    case "duration": {
      const context = DURATION_CONTEXTS.find((c) => c.id === rest[0]);
      if (!context) return null;
      return context.correct === answer;
    }
    default:
      return null;
  }
}

export { AGREEMENT_NUMBERS, COUNTABLE, DURATION_CONTEXTS };
