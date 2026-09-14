import { NOUNS } from "@/lib/grammar/nouns-data";
import {
  buildOptions,
  pick,
  shuffle,
  whyNotFor,
  type PracticeExercise,
  type Rng,
  type Skill,
} from "@/lib/exercises/types";

/**
 * Lire et écrire — le module A0 qui manquait.
 *
 * Tous les autres modules supposent la lecture acquise : ils affichent des
 * phrases russes et demandent une terminaison. Or c'est le déchiffrage qui
 * bloque les premières semaines, et rien ne le faisait travailler.
 *
 * TROIS DES CINQ ONGLETS SONT GÉNÉRATIFS. La lecture fautive « à la latine »
 * se calcule (il suffit d'appliquer la valeur latine aux six lettres qui
 * trompent), et les positions d'accent possibles d'un mot aussi. Les deux
 * autres — l'orthographe et la réduction — reposent sur des couples écrits,
 * parce qu'ils ne se déduisent d'aucune règle mécanique.
 *
 * Les mots accentués viennent de la banque de noms du projet, dont chaque
 * forme est vérifiée par `npm run check:grammar`.
 */

export const ALPHABET_SKILLS: Skill[] = [
  {
    id: "letters",
    title: "La valeur des lettres",
    level: "A0",
    summary:
      "Trente-trois lettres, une par son. Celle-ci se prononce comment ? C'est la seule liste du russe qu'il faut savoir par cœur, et elle se retient en une soirée.",
  },
  {
    id: "traps",
    title: "Les lettres qui trompent",
    level: "A0",
    summary:
      "В, Н, Р, С, У, Х ressemblent à des lettres latines et se lisent tout autrement. Tant que l'œil les lit à la française, « рестора́н » reste un mot inconnu.",
  },
  {
    id: "stress",
    title: "Où tombe l'accent",
    level: "A1",
    summary:
      "L'accent russe est libre, mobile, et jamais écrit. Il décide pourtant de la prononciation de toutes les voyelles du mot : le placer au mauvais endroit rend le mot méconnaissable.",
  },
  {
    id: "spelling",
    title: "Les règles d'orthographe",
    level: "A1",
    summary:
      "Après г к х ж ч ш щ, jamais ы ; après ж ч ш щ ц non accentué, jamais о. Ces deux règles expliquent la moitié des « irrégularités » de déclinaison.",
  },
  {
    id: "sounds",
    title: "Ce qu'on entend vraiment",
    level: "A1",
    summary:
      "Молоко́ se dit « malako », сейча́с se dit « sitchas » : hors accent, о devient a et е devient i. C'est la raison pour laquelle un débutant qui lit bien ne comprend rien à l'oral.",
  },
  {
    id: "dictation",
    title: "Dictée",
    level: "A1",
    summary:
      "On entend « malako », on écrit молоко́ : l'orthographe russe garde ce que la prononciation efface. Écouter un mot et l'écrire, c'est remettre le о atone, le е et la consonne finale assourdie à leur place.",
  },
];

/** Les compétences qu'on peut aussi écrire : une dictée s'écrit. */
export const TYPABLE_ALPHABET_SKILLS = ["dictation"];

export function getAlphabetSkill(id: string): Skill | undefined {
  return ALPHABET_SKILLS.find((s) => s.id === id);
}

// ─────────────────────────────────────────────────────────────────
// 1. La valeur des lettres
// ─────────────────────────────────────────────────────────────────

/**
 * Les 33 lettres, y compris les six qui se lisent comme en français.
 *
 * А, Е, К, М, О, Т manquaient. L'omission se comprend — leur forme ET leur
 * son sont ceux du latin, donc « rien à apprendre » — mais le résumé de la
 * compétence promet « trente-trois lettres », l'apprenant compte, et il
 * trouve vingt-sept. Surtout, Е n'appartient pas à cette famille : sa forme
 * est latine, sa lecture ne l'est pas (« ye »), et c'est exactement le
 * genre de lettre qu'on croit connaître.
 *
 * L'alphabet est la seule liste du russe qu'il faut savoir par cœur : la
 * servir incomplète, c'est laisser six trous dans la seule chose qui doit
 * être close.
 */
const LETTERS: { letter: string; sound: string; example: string }[] = [
  { letter: "А", sound: "a de patte", example: "а́дрес" },
  { letter: "Б", sound: "b de bon", example: "брат" },
  { letter: "В", sound: "v de vent", example: "вода́" },
  { letter: "Г", sound: "g de gare", example: "год" },
  { letter: "Д", sound: "d de date", example: "дом" },
  { letter: "Е", sound: "ye de yeux", example: "е́сли" },
  { letter: "Ж", sound: "j de jour", example: "жена́" },
  { letter: "З", sound: "z de zéro", example: "зима́" },
  { letter: "И", sound: "i de midi", example: "и́мя" },
  { letter: "Й", sound: "y de yaourt", example: "мой" },
  { letter: "К", sound: "k de kilo", example: "кот" },
  { letter: "Л", sound: "l de lac", example: "луна́" },
  { letter: "М", sound: "m de mer", example: "ма́ма" },
  { letter: "Н", sound: "n de nord", example: "нос" },
  { letter: "О", sound: "o de porte, quand il est accentué", example: "о́блако" },
  { letter: "П", sound: "p de page", example: "план" },
  { letter: "Р", sound: "r roulé", example: "рука́" },
  { letter: "С", sound: "s de sac", example: "суп" },
  { letter: "Т", sound: "t de table", example: "там" },
  { letter: "У", sound: "ou de tout", example: "у́тро" },
  { letter: "Ф", sound: "f de fil", example: "фильм" },
  { letter: "Х", sound: "kh, la jota espagnole", example: "хлеб" },
  { letter: "Ц", sound: "ts de tsar", example: "центр" },
  { letter: "Ч", sound: "tch de tchèque", example: "час" },
  { letter: "Ш", sound: "ch dur de chat", example: "шко́ла" },
  { letter: "Щ", sound: "chtch mouillé", example: "щи" },
  { letter: "Ы", sound: "i guttural, sans équivalent", example: "ты" },
  { letter: "Э", sound: "è de mère", example: "э́то" },
  { letter: "Ю", sound: "iou", example: "юг" },
  { letter: "Я", sound: "ia", example: "я́блоко" },
  { letter: "Ё", sound: "io, toujours accentué", example: "ёлка" },
  { letter: "Ь", sound: "aucun son : il mouille la consonne d'avant", example: "соль" },
  { letter: "Ъ", sound: "aucun son : il sépare", example: "объе́кт" },
];

type Letter = (typeof LETTERS)[number];

/**
 * Chaque tirage accepte un choix IMPOSÉ en plus du hasard : c'est ce qui
 * permet de reconstruire un exercice à partir de son seul identifiant (voir
 * `rebuildAlphabetExercise`).
 */
function letterExercise(random: Rng, forced?: Letter): PracticeExercise {
  const target = forced ?? pick(LETTERS, random);
  // Tirage SANS remise : quatre `pick` indépendants peuvent ramener deux
  // fois le même son, et le QCM tombait alors à deux options — c'est-à-dire
  // à pile ou face.
  const others = shuffle(
    LETTERS.filter((l) => l.letter !== target.letter).map((l) => l.sound),
    random
  );
  const { options, correctIndex } = buildOptions(target.sound, others.slice(0, 3), random);
  return {
    itemId: `letters:${target.letter}`,
    prompt: "Cette lettre se prononce",
    question: target.letter,
    options,
    correctIndex,
    whyNot: whyNotFor(
      options,
      target.sound,
      LETTERS.map((l) => [l.sound, `c'est la valeur de la lettre ${l.letter}`])
    ),
    explain: `${target.letter} se lit « ${target.sound} » — comme dans ${target.example}.`,
  };
}

// ─────────────────────────────────────────────────────────────────
// 2. Les lettres qui trompent
// ─────────────────────────────────────────────────────────────────

/** La valeur réelle de chaque lettre, pour transcrire un mot. */
const READING: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "io", ж: "j", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "ou", ф: "f", х: "kh", ц: "ts", ч: "tch", ш: "ch",
  щ: "chtch", ъ: "", ы: "y", ь: "", э: "è", ю: "iou", я: "ia",
};

/** Les six lettres lues « à la latine », et la faute qu'elles produisent. */
const TRAP_READING: Record<string, string> = { в: "b", н: "h", р: "p", с: "c", у: "y", х: "x" };

/**
 * Uniquement des mots contenant AU MOINS DEUX lettres-pièges différentes.
 *
 * Un mot qui n'en contient qu'une (« парк », « метро́ ») ne produit qu'un
 * seul leurre : le QCM tombe alors à deux options, c'est-à-dire à pile ou
 * face. Avec deux pièges, on obtient la lecture fautive complète plus une
 * fautive par lettre — quatre options, dont trois erreurs réelles.
 */
const TRAP_WORDS = [
  "рестора́н", "спорт", "суп", "вход", "вы́ход", "па́спорт", "университе́т",
  "авто́бус", "сувени́р", "тури́ст", "курс", "фру́кты", "но́мер", "Росси́я",
  "но́вость", "хорошо́", "врач", "сын", "нос", "суббо́та", "ру́сский",
  "вопро́с", "стра́на", "здра́вствуйте", "у́жин", "ве́чер", "но́вый", "вкус",
  "сестра́", "кварти́ра",
];

function transcribe(word: string, traps: string[]): string {
  let out = "";
  for (const char of word.toLowerCase()) {
    if (char === "́") continue;
    if (traps.includes(char) && TRAP_READING[char]) out += TRAP_READING[char];
    else out += READING[char] ?? char;
  }
  return out;
}

/** Les lettres-pièges réellement présentes dans un mot. */
function trapsIn(word: string): string[] {
  return Object.keys(TRAP_READING).filter((t) => word.toLowerCase().includes(t));
}

function trapExercise(random: Rng, forced?: string): PracticeExercise {
  const word = forced ?? pick(TRAP_WORDS, random);
  const correct = transcribe(word, []);
  const present = trapsIn(word);
  // La lecture fautive complète, puis une fautive par lettre-piège : chaque
  // leurre correspond à une erreur qu'on fait réellement, et il y en a
  // toujours au moins trois puisque la banque impose deux pièges par mot.
  const candidates = [transcribe(word, present), ...present.map((t) => transcribe(word, [t]))];
  const { options, correctIndex } = buildOptions(correct, candidates, random);
  return {
    itemId: `traps:${word}`,
    prompt: "Comment se lit ce mot ?",
    question: word,
    options,
    correctIndex,
    whyNot: whyNotFor(options, correct, [
      [
        candidates[0],
        `lecture « à la latine » de ${present.map((t) => `« ${t} »`).join(" et ")}`,
      ],
      ...present.map((t): [string, string] => [
        transcribe(word, [t]),
        `« ${t} » lu comme le ${TRAP_READING[t]} latin — il vaut ${READING[t]}`,
      ]),
    ]),
    explain: present.length
      ? `Les pièges de ce mot : ${present.map((t) => `${t} = ${READING[t]}, pas ${TRAP_READING[t]}`).join(" ; ")}.`
      : "Aucun faux ami ici : toutes les lettres se lisent comme elles se prononcent.",
  };
}

// ─────────────────────────────────────────────────────────────────
// 3. Où tombe l'accent
// ─────────────────────────────────────────────────────────────────

const ACCENT = "́";
const VOWELS = "аеёиоуыэюя";

/** Toutes les positions d'accent possibles d'un mot, la vraie comprise. */
function accentVariants(accented: string): { correct: string; variants: string[] } {
  const bare = accented.split(ACCENT).join("");
  const variants: string[] = [];
  for (let i = 0; i < bare.length; i += 1) {
    if (VOWELS.includes(bare[i])) {
      variants.push(bare.slice(0, i + 1) + ACCENT + bare.slice(i + 1));
    }
  }
  return { correct: accented, variants };
}

/** Des mots d'au moins trois syllabes : sur deux, le choix est trop pauvre. */
const STRESS_WORDS = NOUNS.filter((n) => {
  const bare = n.forms.singular[0].split(ACCENT).join("");
  const vowels = [...bare].filter((c) => VOWELS.includes(c)).length;
  return vowels >= 3 && n.rank < 3000 && n.forms.singular[0].includes(ACCENT);
}).slice(0, 90);

function stressExercise(random: Rng, forced?: (typeof STRESS_WORDS)[number]): PracticeExercise {
  const noun = forced ?? pick(STRESS_WORDS, random);
  const accented = noun.forms.singular[0];
  const { correct, variants } = accentVariants(accented);
  const { options, correctIndex } = buildOptions(
    correct,
    variants.filter((v) => v !== correct),
    random
  );
  return {
    itemId: `stress:${noun.id}`,
    prompt: "Où tombe l'accent ?",
    question: accented.split(ACCENT).join(""),
    hint: noun.translation,
    options,
    correctIndex,
    explain: `${correct}. L'accent n'est jamais écrit en russe : il fait partie du mot, comme son genre — et il commande la prononciation de toutes les autres voyelles.`,
  };
}

// ─────────────────────────────────────────────────────────────────
// 4. Les règles d'orthographe
// ─────────────────────────────────────────────────────────────────

interface SpellingItem {
  id: string;
  question: string;
  hint: string;
  correct: string;
  wrong: string[];
  why: string;
}

const SPELLING_ITEMS: SpellingItem[] = [
  {
    id: "knigi",
    question: "одна́ кни́га → две ___",
    hint: "deux livres",
    correct: "кни́ги",
    wrong: ["кни́гы", "кни́га", "кни́гэ"],
    why: "Après г, jamais ы : la règle des sept lettres impose и. La terminaison reste celle du génitif singulier, seule son orthographe change.",
  },
  {
    id: "ruchki",
    question: "одна́ ру́чка → две ___",
    hint: "deux stylos",
    correct: "ру́чки",
    wrong: ["ру́чкы", "ру́чке", "ру́чкя"],
    why: "Après к, и obligatoire — et le ч n'y change rien, c'est la consonne juste avant la terminaison qui commande.",
  },
  {
    id: "pishu",
    question: "я ___ письмо́",
    hint: "j'écris une lettre",
    correct: "пишу́",
    wrong: ["пишю́", "писа́ю", "пишо́"],
    why: "Après ш, jamais ю : on écrit -у. Et le radical alterne (с → ш), d'où пишу́ et non писа́ю.",
  },
  {
    id: "khoroshee",
    question: "___ ме́сто",
    hint: "un bon endroit",
    correct: "хоро́шее",
    wrong: ["хоро́шое", "хоро́шые", "хоро́шие"],
    why: "Après ш en terminaison NON accentuée, о devient е. Comparer avec большо́е, où la terminaison porte l'accent et garde son о.",
  },
  {
    id: "bolshoy",
    question: "___ дом",
    hint: "une grande maison",
    correct: "большо́й",
    wrong: ["больше́й", "больши́й", "большы́й"],
    why: "Ici la terminaison est accentuée : о se maintient. La règle « е après une sifflante » ne vaut que hors accent.",
  },
  {
    id: "tovarishchem",
    question: "с ___",
    hint: "avec le camarade",
    correct: "това́рищем",
    wrong: ["това́рищом", "това́рищым", "това́рищам"],
    why: "Instrumental singulier après щ, terminaison atone : -ем et non -ом.",
  },
  {
    id: "vrachi",
    question: "оди́н врач → два ___",
    hint: "deux médecins",
    correct: "врача́",
    wrong: ["врачы́", "врачи́", "врачо́в"],
    why: "Après 2, 3, 4 : génitif singulier — врача́. Le génitif pluriel враче́й viendrait après 5.",
  },
  {
    id: "russkiy",
    question: "___ язы́к",
    hint: "la langue russe",
    correct: "ру́сский",
    wrong: ["ру́сскый", "ру́сское", "ру́сская"],
    why: "Après к, и obligatoire : l'adjectif dur ру́сск- ne peut pas prendre -ый.",
  },
  // ─── Écrits après coup : la banque n'en comptait que huit, soit un item
  // tous les trois exercices sur une série de cinquante. Ce sont des RÈGLES
  // d'orthographe, pas du texte libre : elles s'écrivent à la main, une par
  // une, et pas une seule ne sort d'un modèle.
  {
    id: "nogi",
    question: "одна́ нога́ → две ___",
    hint: "deux jambes",
    correct: "ноги́",
    wrong: ["ногы́", "ноге́", "нога́"],
    why: "Après г, jamais ы : la règle des sept lettres impose и, comme dans кни́ги.",
  },
  {
    id: "devushki",
    question: "одна́ де́вушка → две ___",
    hint: "deux jeunes filles",
    correct: "де́вушки",
    wrong: ["де́вушкы", "де́вушке", "де́вушкя"],
    why: "Après ш, и obligatoire. La règle des sept lettres vaut pour г к х ж ч ш щ, pas seulement pour les gutturales.",
  },
  {
    id: "zhivu",
    question: "я ___ в Москве́",
    hint: "j'habite à Moscou",
    correct: "живу́",
    wrong: ["жыву́", "живю́", "живо́"],
    why: "жи s'écrit toujours avec и — jamais жы. Et après ж, la terminaison est -у, jamais -ю.",
  },
  {
    id: "slyshu",
    question: "я ___ му́зыку",
    hint: "j'entends la musique",
    correct: "слы́шу",
    wrong: ["слы́шю", "слы́шо", "слы́ша"],
    why: "Après ш, on écrit -у et non -ю : les sifflantes ж ш ч щ ne prennent jamais les voyelles molles я ю.",
  },
  {
    id: "nozhom",
    question: "ре́зать ___",
    hint: "couper avec un couteau",
    correct: "ножо́м",
    wrong: ["но́жем", "ножы́м", "ножа́м"],
    why: "Ici la terminaison porte l'accent : après ж, о se maintient. Comparer това́рищем, où elle est atone et donne -ем.",
  },
  {
    id: "solntsem",
    question: "над ___",
    hint: "au-dessus du soleil",
    correct: "со́лнцем",
    wrong: ["со́лнцом", "со́лнцым", "со́лнцам"],
    why: "Après ц, terminaison atone : -ем. Le ц suit ici la même règle que les sifflantes.",
  },
  {
    id: "ulitsy",
    question: "одна́ у́лица → две ___",
    hint: "deux rues",
    correct: "у́лицы",
    wrong: ["у́лици", "у́лице", "у́лица"],
    why: "Après ц, la TERMINAISON s'écrit ы. C'est l'exception : la règle des sept lettres nomme г к х ж ч ш щ, et pas ц.",
  },
  {
    id: "tsirk",
    question: "мы идём в ___",
    hint: "nous allons au cirque",
    correct: "цирк",
    wrong: ["цырк", "цырьк", "ци́рк"],
    why: "Dans le RADICAL, ц prend и : цирк, ци́фра, ци́ркуль. C'est dans les terminaisons qu'il prend ы.",
  },
  {
    id: "shirokiy",
    question: "___ мост",
    hint: "un pont large",
    correct: "широ́кий",
    wrong: ["шыро́кий", "широ́кый", "широ́кой"],
    why: "Deux règles dans un mot : ши s'écrit avec и, et après к l'adjectif dur prend -ий.",
  },
  {
    id: "myagkiy",
    question: "___ знак",
    hint: "le signe mou",
    correct: "мя́гкий",
    wrong: ["мя́гкый", "мя́гкой", "мя́гкое"],
    why: "Après к, -ий et jamais -ый. Le nom de la lettre ь se dit avec l'adjectif au masculin, accordé sur знак.",
  },
  {
    id: "mysh",
    question: "___ (une souris)",
    hint: "féminin en -ь",
    correct: "мышь",
    wrong: ["мыш", "мишь", "мышъ"],
    why: "Un nom FÉMININ terminé par ж ш ч щ prend un ь : мышь, ночь, вещь. Un masculin n'en prend pas : нож, врач.",
  },
  {
    id: "nochyu",
    question: "___ я сплю",
    hint: "la nuit, je dors",
    correct: "но́чью",
    wrong: ["но́чю", "но́чъю", "но́чей"],
    why: "L'instrumental de ночь est но́чью : le ь sépare le ч de la voyelle, sans quoi on lirait -чу.",
  },
];

function spellingExercise(random: Rng, forced?: SpellingItem): PracticeExercise {
  const item = forced ?? pick(SPELLING_ITEMS, random);
  const { options, correctIndex } = buildOptions(item.correct, item.wrong, random);
  return {
    itemId: `spelling:${item.id}`,
    prompt: "Complète",
    question: item.question,
    hint: item.hint,
    options,
    correctIndex,
    explain: item.why,
  };
}

// ─────────────────────────────────────────────────────────────────
// 5. Ce qu'on entend vraiment
// ─────────────────────────────────────────────────────────────────

interface SoundItem {
  id: string;
  word: string;
  translation: string;
  heard: string;
  wrong: string[];
  why: string;
}

const SOUND_ITEMS: SoundItem[] = [
  {
    id: "moloko",
    word: "молоко́",
    translation: "le lait",
    heard: "malako",
    wrong: ["moloko", "malaka", "moulouko"],
    why: "Les deux о atones se prononcent a ; seul le о accentué garde son timbre.",
  },
  {
    id: "khorosho",
    word: "хорошо́",
    translation: "bien",
    heard: "kharacho",
    wrong: ["khorocho", "karacho", "khorosho"],
    why: "Même règle : о atone → a. Et х se lit kh, jamais k.",
  },
  {
    id: "spasibo",
    word: "спаси́бо",
    translation: "merci",
    heard: "spassiba",
    wrong: ["spassibo", "spasiba", "spazibo"],
    why: "Le о final atone s'entend a — d'où « spassiba », que tout le monde reconnaît à l'oral.",
  },
  {
    id: "sestra",
    word: "сестра́",
    translation: "la sœur",
    heard: "sistra",
    wrong: ["sestra", "sietra", "chestra"],
    why: "Le е atone se prononce i : c'est l'и́канье, l'autre grande règle de réduction.",
  },
  {
    id: "seychas",
    word: "сейча́с",
    translation: "maintenant",
    heard: "sitchas",
    wrong: ["seytchas", "seïchas", "sitchass"],
    why: "е atone → i, et ч = tch. À l'oral rapide, le mot se réduit encore, jusqu'à « chtchas ».",
  },
  {
    id: "khleb",
    word: "хлеб",
    translation: "le pain",
    heard: "khlep",
    wrong: ["khleb", "kleb", "khlièb"],
    why: "En fin de mot, une consonne sonore se dévoise : б se prononce p.",
  },
  {
    id: "vodka",
    word: "во́дка",
    translation: "la vodka",
    heard: "votka",
    wrong: ["vodka", "vadka", "botka"],
    why: "Assimilation : д devient t devant к, qui est sourd. C'est la dernière consonne du groupe qui impose son camp.",
  },
  {
    id: "chto",
    word: "что",
    translation: "que, quoi",
    heard: "chto",
    wrong: ["tchto", "kto", "chtcho"],
    why: "Irrégularité isolée, mais du mot le plus fréquent de la langue : ч s'y prononce ch.",
  },
  {
    id: "ego",
    word: "его́",
    translation: "son, le sien",
    heard: "yivo",
    wrong: ["yego", "ego", "yigo"],
    why: "Le г des terminaisons -его / -ого se prononce v, et le е atone se réduit en i.",
  },
  {
    id: "pozhaluysta",
    word: "пожа́луйста",
    translation: "s'il vous plaît",
    heard: "pajalsta",
    wrong: ["pojalouïsta", "pozhalousta", "pajalouysta"],
    why: "Quatre syllabes à l'écrit, trois à l'oral : le -уй- disparaît dans l'usage courant.",
  },
  // ─── Écrits après coup, comme les items d'orthographe ci-dessus : dix
  // mots ne font pas une compétence, et la réduction vocalique se joue sur
  // des mots précis qu'on ne peut pas dériver.
  {
    id: "gorod",
    word: "го́род",
    translation: "la ville",
    heard: "gorat",
    wrong: ["gorod", "garod", "khorat"],
    why: "Deux règles à la fois : le о atone final s'entend a, et le д final se dévoise en t.",
  },
  {
    id: "segodnya",
    word: "сего́дня",
    translation: "aujourd'hui",
    heard: "sivodnia",
    wrong: ["segodnia", "sigodnia", "sevodnia"],
    why: "Même règle que его́ : le -его- interne se dit -ivo-. Le mot est un ancien génitif figé.",
  },
  {
    id: "zdravstvuyte",
    word: "здра́вствуйте",
    translation: "bonjour",
    heard: "zdrastvouyte",
    wrong: ["zdravstvouyte", "zdrastvouite", "zdravstouyte"],
    why: "Le в de -вств- ne se prononce pas : trois consonnes d'affilée, la langue en laisse une.",
  },
  {
    id: "solntse",
    word: "со́лнце",
    translation: "le soleil",
    heard: "sontse",
    wrong: ["solntse", "soltse", "sonntsé"],
    why: "Le л de -лнц- est muet. C'est une consonne imprononçable de plus, comme le в de здра́вствуйте.",
  },
  {
    id: "serdtse",
    word: "се́рдце",
    translation: "le cœur",
    heard: "siertse",
    wrong: ["serdtse", "sertsie", "cherdtse"],
    why: "Le д de -рдц- est muet lui aussi, et le е accentué garde son timbre : sier-.",
  },
  {
    id: "konechno",
    word: "коне́чно",
    translation: "bien sûr",
    heard: "kanechna",
    wrong: ["konetchno", "kanetchna", "kanechno"],
    why: "Exception : dans коне́чно et ску́чно, чн se dit chn. Partout ailleurs, ч vaut tch.",
  },
  {
    id: "lozhka",
    word: "ло́жка",
    translation: "la cuillère",
    heard: "lochka",
    wrong: ["lojka", "loska", "lachka"],
    why: "Assimilation : ж se dévoise en ch devant к, qui est sourd. Même mécanique que во́дка.",
  },
  {
    id: "vsyo",
    word: "всё",
    translation: "tout",
    heard: "fsio",
    wrong: ["vsio", "fso", "vso"],
    why: "Le в se dévoise en f devant с, qui est sourd. Et ё porte toujours l'accent.",
  },
  {
    id: "avtobus",
    word: "авто́бус",
    translation: "le bus",
    heard: "aftobous",
    wrong: ["avtobous", "aftaboust", "avtabous"],
    why: "Encore un в dévoisé, devant т. Le у, lui, ne se réduit jamais : il se lit ou, accentué ou non.",
  },
  {
    id: "yazyk",
    word: "язы́к",
    translation: "la langue",
    heard: "yizyk",
    wrong: ["yazyk", "iazik", "yazik"],
    why: "Le я atone se réduit à i, comme le е. Le ы, lui, garde son timbre — il n'a pas d'équivalent français.",
  },
  {
    id: "muzh",
    word: "муж",
    translation: "le mari",
    heard: "mouch",
    wrong: ["mouj", "mouje", "moujh"],
    why: "En fin de mot, ж se dévoise en ch. Même règle que le б de хлеб, qui s'entend p.",
  },
  {
    id: "chelovek",
    word: "челове́к",
    translation: "la personne",
    heard: "tchilaviek",
    wrong: ["tchelovek", "tchilovek", "chilaviek"],
    why: "Deux réductions dans un mot : le е atone donne i, le о atone donne a. Seule la syllabe accentuée garde son timbre.",
  },
];

function soundExercise(random: Rng, forced?: SoundItem): PracticeExercise {
  const item = forced ?? pick(SOUND_ITEMS, random);
  const { options, correctIndex } = buildOptions(item.heard, item.wrong, random);
  return {
    itemId: `sounds:${item.id}`,
    prompt: "Qu'entend-on réellement ?",
    question: item.word,
    hint: item.translation,
    options,
    correctIndex,
    explain: item.why,
    // Le seul leurre dont on sait à coup sûr ce qu'il est : la lecture
    // lettre à lettre, celle qu'on produit en lisant sans connaître la
    // réduction des voyelles atones.
    whyNot: whyNotFor(options, item.heard, [
      [transcribe(item.word, []), "lecture lettre à lettre : ce qui est écrit, pas ce qu'on entend"],
    ]),
  };
}

// ─────────────────────────────────────────────────────────────────
// 6. Dictée
// ─────────────────────────────────────────────────────────────────

/**
 * L'ENVERS DE « CE QU'ON ENTEND VRAIMENT ». L'onglet précédent part de
 * l'écrit et demande le son ; celui-ci part du son et demande l'écrit. Les
 * leurres sont les fautes que produit une oreille juste : écrire ce qu'on
 * entend — а pour le о atone, и pour le е ou le я atones, la sourde pour
 * la sonore finale. Aucun n'est inventé : chacun est la transcription
 * fidèle d'une prononciation réelle, et sa note dit laquelle.
 */

const VOICED_FINAL: Record<string, string> = { б: "п", в: "ф", г: "к", д: "т", ж: "ш", з: "с" };
const DICTATION_VOWELS = "аеёиоуыэюя";

/** La position de la voyelle accentuée dans le mot sans accent, ou -1 si elle est inconnue. */
function stressedIndex(accented: string): number {
  let plainIndex = -1;
  for (const char of accented) {
    if (char === ACCENT) return plainIndex;
    plainIndex += 1;
  }
  const plain = accented.split(ACCENT).join("");
  if (plain.includes("ё")) return plain.indexOf("ё");
  const vowels = [...plain].map((c, i) => (DICTATION_VOWELS.includes(c) ? i : -1)).filter((i) => i >= 0);
  return vowels.length === 1 ? vowels[0] : -1;
}

interface Slip {
  index: number;
  to: string;
  note: string;
  rule: "o" | "i" | "final" | "assim";
}

const VOICELESS = "кпстфхцчшщ";
const VOICELESS_TO_VOICED: Record<string, string> = { к: "г", п: "б", с: "з", т: "д", ф: "в", ш: "ж" };

/** Toutes les formes fléchies de la banque, sans accent : un leurre ne doit jamais être un vrai mot. */
const KNOWN_FORMS = new Set(
  NOUNS.flatMap((n) => [...n.forms.singular, ...(n.forms.plural ?? [])]).map((f) => f.split(ACCENT).join(""))
);

function slipsOf(accented: string): Slip[] {
  const plain = [...accented.split(ACCENT).join("")];
  const stressed = stressedIndex(accented);
  if (stressed < 0) return [];
  const slips: Slip[] = [];
  plain.forEach((char, index) => {
    // La voyelle FINALE atone se réduit en un son neutre, ni a ni i : l'écrire
    // « comme on l'entend » ne donne aucune graphie sûre — et donnerait souvent
    // un vrai mot (тётя → тёти).
    if (index !== stressed && index !== plain.length - 1) {
      if (char === "о") {
        slips.push({ index, to: "а", rule: "o", note: "le о atone se prononce [a], mais l'écrit garde le о" });
      } else if (char === "е" || char === "я") {
        slips.push({ index, to: "и", rule: "i", note: `le ${char} atone se prononce presque [i], mais l'écrit garde le ${char}` });
      }
    }
    // L'assimilation : une consonne prend la sonorité de celle qui la suit —
    // ло́дка se dit « lotka », вокза́л « vagzal ».
    const next = plain[index + 1];
    if (next && VOICED_FINAL[char] && VOICELESS.includes(next)) {
      slips.push({
        index,
        to: VOICED_FINAL[char],
        rule: "assim",
        note: `devant ${next}, ${char} s'entend ${VOICED_FINAL[char]}, mais l'écrit garde le ${char}`,
      });
    } else if (next && VOICELESS_TO_VOICED[char] && "бгджз".includes(next)) {
      slips.push({
        index,
        to: VOICELESS_TO_VOICED[char],
        rule: "assim",
        note: `devant ${next}, ${char} s'entend ${VOICELESS_TO_VOICED[char]}, mais l'écrit garde le ${char}`,
      });
    }
  });
  const last = plain[plain.length - 1] === "ь" ? plain.length - 2 : plain.length - 1;
  const devoiced = VOICED_FINAL[plain[last]];
  if (devoiced) {
    slips.push({
      index: last,
      to: devoiced,
      rule: "final",
      note: `en fin de mot, ${plain[last]} s'entend ${devoiced}, mais l'écrit garde le ${plain[last]}`,
    });
  }
  return slips;
}

/** Les fautes d'oreille possibles : une confusion, puis deux quand une seule ne suffit pas. */
function dictationDecoys(accented: string): { form: string; note: string }[] {
  const plain = [...accented.split(ACCENT).join("")];
  const apply = (slips: Slip[]) => {
    const copy = [...plain];
    for (const slip of slips) copy[slip.index] = slip.to;
    return copy.join("");
  };
  const slips = slipsOf(accented);
  const decoys = slips.map((slip) => ({ form: apply([slip]), note: slip.note }));
  if (decoys.length < 3) {
    for (let i = 0; i < slips.length; i += 1) {
      for (let j = i + 1; j < slips.length; j += 1) {
        decoys.push({ form: apply([slips[i], slips[j]]), note: `${slips[i].note} ; ${slips[j].note}` });
      }
    }
  }
  return decoys.filter(
    (d, i) => decoys.findIndex((o) => o.form === d.form) === i && !KNOWN_FORMS.has(d.form)
  );
}

/** Au moins deux fautes d'oreille : trois options, dont aucune n'est une devinette. */
const DICTATION_WORDS = NOUNS.filter((n) => {
  const accented = n.forms.singular[0];
  const plain = accented.split(ACCENT).join("");
  return (
    /^[а-яё́]+$/.test(accented) &&
    plain.length >= 4 &&
    plain.length <= 10 &&
    dictationDecoys(accented).length >= 2
  );
});

const RULE_SENTENCE: Record<Slip["rule"], string> = {
  o: "hors accent, о s'entend a",
  i: "е et я s'entendent presque i",
  final: "une consonne sonore s'assourdit en fin de mot",
  assim: "une consonne prend la sonorité de celle qui la suit",
};

function dictationExercise(random: Rng, forced?: (typeof DICTATION_WORDS)[number]): PracticeExercise {
  const noun = forced ?? pick(DICTATION_WORDS, random);
  const accented = noun.forms.singular[0];
  const plain = accented.split(ACCENT).join("");
  const decoys = shuffle(dictationDecoys(accented), random);
  const { options, correctIndex } = buildOptions(
    plain,
    decoys.map((d) => d.form),
    random
  );
  const rules = [...new Set(slipsOf(accented).map((s) => s.rule))].map((rule) => RULE_SENTENCE[rule]);
  return {
    itemId: `dictation:${noun.id}`,
    prompt: "Dictée",
    question: "Quel mot entends-tu ? Retrouve son orthographe.",
    hint: noun.translation,
    audio: accented,
    options,
    correctIndex,
    explain: `« ${accented} » s'écrit ${plain} : ${rules.join(", ")} — l'écrit, lui, ne change pas.`,
    whyNot: whyNotFor(
      options,
      plain,
      decoys.map((d) => [d.form, d.note])
    ),
  };
}

// ─────────────────────────────────────────────────────────────────
// Tirage et correction
// ─────────────────────────────────────────────────────────────────

export function generateAlphabetExercise(
  skill: string,
  random: Rng = Math.random
): PracticeExercise {
  switch (skill) {
    case "letters":
      return letterExercise(random);
    case "traps":
      return trapExercise(random);
    case "stress":
      return stressExercise(random);
    case "spelling":
      return spellingExercise(random);
    case "sounds":
      return soundExercise(random);
    case "dictation":
      return dictationExercise(random);
    default:
      throw new Error(`Compétence inconnue : ${skill}`);
  }
}

/** L'exercice exact qu'un identifiant désigne, pour « Mes erreurs ». */
export function rebuildAlphabetExercise(
  itemId: string,
  random: Rng = Math.random
): PracticeExercise | null {
  const separator = itemId.indexOf(":");
  if (separator < 0) return null;
  const skill = itemId.slice(0, separator);
  const id = itemId.slice(separator + 1);

  switch (skill) {
    case "letters": {
      const letter = LETTERS.find((l) => l.letter === id);
      return letter ? letterExercise(random, letter) : null;
    }
    case "traps":
      return TRAP_WORDS.includes(id) ? trapExercise(random, id) : null;
    case "stress": {
      const noun = STRESS_WORDS.find((n) => n.id === id);
      return noun ? stressExercise(random, noun) : null;
    }
    case "spelling": {
      const item = SPELLING_ITEMS.find((s) => s.id === id);
      return item ? spellingExercise(random, item) : null;
    }
    case "sounds": {
      const item = SOUND_ITEMS.find((s) => s.id === id);
      return item ? soundExercise(random, item) : null;
    }
    case "dictation": {
      const noun = DICTATION_WORDS.find((n) => n.id === id);
      return noun ? dictationExercise(random, noun) : null;
    }
    default:
      return null;
  }
}

export function checkAlphabetAnswer(itemId: string, answer: string): boolean | null {
  const separator = itemId.indexOf(":");
  const skill = itemId.slice(0, separator);
  const id = itemId.slice(separator + 1);

  switch (skill) {
    case "letters": {
      const letter = LETTERS.find((l) => l.letter === id);
      return letter ? letter.sound === answer : null;
    }
    case "traps": {
      if (!TRAP_WORDS.includes(id)) return null;
      return transcribe(id, []) === answer;
    }
    case "stress": {
      const noun = NOUNS.find((n) => n.id === id);
      return noun ? noun.forms.singular[0] === answer : null;
    }
    case "spelling": {
      const item = SPELLING_ITEMS.find((s) => s.id === id);
      return item ? item.correct === answer : null;
    }
    case "sounds": {
      const item = SOUND_ITEMS.find((s) => s.id === id);
      return item ? item.heard === answer : null;
    }
    case "dictation": {
      const noun = DICTATION_WORDS.find((n) => n.id === id);
      return noun ? noun.forms.singular[0].split(ACCENT).join("") === answer : null;
    }
    default:
      return null;
  }
}

export { LETTERS, SPELLING_ITEMS, SOUND_ITEMS, STRESS_WORDS, TRAP_WORDS, DICTATION_WORDS, dictationDecoys, transcribe };
