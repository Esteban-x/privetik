import { getVerb, PARTICIPLE_VERBS, type ParticipleVerb } from "./verbs";
import { EXTRA_CONTEXTS } from "./contexts.generated";
import { whyNotFor } from "@/lib/exercises/types";

/**
 * Exercices sur les participes et gérondifs.
 *
 * Tout le module repose sur la TRANSFORMATION : on montre la proposition
 * dépliée, l'apprenant produit la forme comprimée. C'est ce que le
 * participe est réellement, et c'est la seule manipulation qui installe la
 * compétence — reconnaître « читающий » dans une liste ne prouve rien, le
 * dériver de « который читает », si.
 *
 * Comme dans les modules Aspect et Mouvement, chaque contexte est lié à UN
 * verbe : la phrase française nomme le verbe, seule la FORME reste à
 * trouver. Le tirage aléatoire du verbe produirait des phrases dont la
 * traduction ne correspond pas à la réponse attendue.
 */

export const PARTICIPLE_SKILLS = [
  {
    id: "active",
    title: "Participes actifs",
    level: "B2",
    summary:
      "« Челове́к, кото́рый чита́ет » se comprime en « чита́ющий ». Présent pour ce qui se fait, passé en -вший pour ce qui s'est fait. Le participe s'accorde comme un adjectif.",
  },
  {
    id: "passive",
    title: "Participes passifs",
    level: "B2",
    summary:
      "« Кни́га, кото́рую написа́л Толсто́й » devient « кни́га, напи́санная Толсты́м ». L'objet devient le support du participe, et l'auteur passe à l'instrumental.",
  },
  {
    id: "short",
    title: "Forme longue ou courte",
    level: "B2",
    summary:
      "« закры́тая дверь » qualifie (épithète), « дверь закры́та » affirme (attribut). Le français dit « fermée » dans les deux cas — le russe non.",
  },
  {
    id: "gerund",
    title: "Gérondifs",
    level: "B2",
    summary:
      "Imperfectif en -я pour une action simultanée (« чита́я »), perfectif en -в pour une action antérieure (« прочита́в »). C'est l'ordre des actions qui décide.",
  },
  {
    id: "subject",
    title: "La règle du sujet unique",
    level: "C1",
    summary:
      "Un gérondif doit avoir le MÊME sujet que le verbe principal. « Возвраща́ясь домо́й, начался́ дождь » est fautif : ce n'est pas la pluie qui rentrait. L'erreur la plus fréquente, et la plus invisible pour un francophone.",
  },
] as const;

export type ParticipleSkillId = (typeof PARTICIPLE_SKILLS)[number]["id"];

export function getSkill(id: string) {
  return PARTICIPLE_SKILLS.find((s) => s.id === id);
}

export interface ParticipleExercise {
  skill: ParticipleSkillId;
  itemId: string;
  prompt: string;
  /** Proposition dépliée — ce qu'on comprime. */
  expanded?: string;
  /** Phrase comprimée, avec ___ à la place de la forme cherchée. */
  compressed: string;
  sentenceFr: string;
  options: string[];
  correctIndex: number;
  explain: string;
  /** Ce que dit chaque mauvaise option — voir `whyNotFor`. */
  whyNot?: Record<string, string>;
}

type Rng = () => number;

/**
 * Ce que chaque forme du paradigme EST, pour la note sous une mauvaise
 * réponse. Les leurres de ce module viennent tous du même verbe : ce qui les
 * sépare n'est pas le sens mais la fonction de la forme, et c'est elle qu'il
 * faut nommer.
 */
const FORM_SAYS = {
  activePresent: "participe actif présent : l'action se déroule en même temps",
  activePast: "participe actif passé : l'action appartient au passé",
  activeVoice: "participe actif : le nom ferait l'action, alors qu'ici il la subit",
  passiveVoice: "participe passif : le nom subirait l'action, alors qu'ici il la fait",
  gerund: "gérondif : invariable, il se rapporte au verbe et ne qualifie aucun nom",
  gerundImperfective: "gérondif imperfectif : une action simultanée à celle du verbe principal",
  gerundPerfective: "gérondif perfectif : une action achevée avant celle du verbe principal",
  participleForTime: "participe : il qualifie un nom, il ne remplace pas une subordonnée de temps",
  short: "forme courte : attribut, elle affirme un état — « дверь закры́та »",
  long: "forme longue : épithète, elle qualifie le nom — « закры́тая дверь »",
};

function pick<T>(items: T[], random: Rng): T {
  return items[Math.floor(random() * items.length)];
}

function shuffleWithAnswer(options: string[], correct: string, random: Rng) {
  const unique = [...new Set(options)];
  for (let i = unique.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [unique[i], unique[j]] = [unique[j], unique[i]];
  }
  return { options: unique, correctIndex: unique.indexOf(correct) };
}

// ─── 1. Participes actifs ──────────────────────────────────────────
interface ActiveContext {
  id: string;
  verb: string;
  /** Forme attendue : présent (ce qui se fait) ou passé (ce qui s'est fait). */
  tense: "present" | "past";
  expanded: string;
  compressed: string;
  fr: string;
  why: string;
}

const ACTIVE_CONTEXTS: ActiveContext[] = [
  {
    id: "student-reading",
    verb: "chitat",
    tense: "present",
    expanded: "Студе́нт, кото́рый чита́ет в библиоте́ке, — мой друг.",
    compressed: "Студе́нт, ___ в библиоте́ке, — мой друг.",
    fr: "L'étudiant qui lit à la bibliothèque est mon ami.",
    why: "L'action est en cours et le sujet la fait : participe présent ACTIF en -щий.",
  },
  {
    id: "man-worked",
    verb: "rabotat",
    tense: "past",
    expanded: "Челове́к, кото́рый рабо́тал здесь, уе́хал.",
    compressed: "Челове́к, ___ здесь, уе́хал.",
    fr: "L'homme qui travaillait ici est parti.",
    why: "L'action est révolue : participe passé actif en -вший.",
  },
  {
    id: "people-living",
    verb: "zhit",
    tense: "present",
    expanded: "Лю́ди, кото́рые живу́т в э́том до́ме, о́чень дру́жные.",
    compressed: "Лю́ди, ___ в э́том до́ме, о́чень дру́жные.",
    fr: "Les gens qui habitent cet immeuble sont très soudés.",
    why: "État actuel : participe présent actif. Il s'accorde ici au pluriel — comme un adjectif.",
  },
  {
    id: "girl-helped",
    verb: "pomogat",
    tense: "past",
    expanded: "Де́вушка, кото́рая помога́ла нам, рабо́тает здесь.",
    compressed: "Де́вушка, ___ нам, рабо́тает здесь.",
    fr: "La jeune fille qui nous aidait travaille ici.",
    why: "Action passée et durable : participe passé actif imperfectif en -вший.",
  },
  {
    id: "engineer-building",
    verb: "stroit",
    tense: "present",
    expanded: "Инжене́р, кото́рый стро́ит э́тот мост, о́чень о́пытный.",
    compressed: "Инжене́р, ___ э́тот мост, о́чень о́пытный.",
    fr: "L'ingénieur qui construit ce pont est très expérimenté.",
    why: "Le sujet accomplit l'action maintenant : participe présent actif.",
  },
  {
    id: "friend-returning",
    verb: "vozvrashchatsya",
    tense: "present",
    expanded: "Друг, кото́рый возвраща́ется из Москвы́, позвони́т ве́чером.",
    compressed: "Друг, ___ из Москвы́, позвони́т ве́чером.",
    fr: "L'ami qui revient de Moscou appellera ce soir.",
    why: "Verbe pronominal : le participe garde le -ся, qui ne devient jamais -сь.",
  },
  {
    id: "teacher-speaking",
    verb: "govorit",
    tense: "present",
    expanded: "Преподава́тель, кото́рый говори́т по-кита́йски, ре́дкость.",
    compressed: "Преподава́тель, ___ по-кита́йски, ре́дкость.",
    fr: "Un professeur qui parle chinois, c'est rare.",
    why: "Aptitude actuelle : participe présent actif.",
  },
  {
    id: "students-studied",
    verb: "izuchat",
    tense: "past",
    expanded: "Студе́нты, кото́рые изуча́ли ру́сский, сда́ли экза́мен.",
    compressed: "Студе́нты, ___ ру́сский, сда́ли экза́мен.",
    fr: "Les étudiants qui étudiaient le russe ont réussi l'examen.",
    why: "Action passée : participe passé actif, accordé au pluriel.",
  },
  {
    id: "girl-writing",
    verb: "pisat",
    tense: "present",
    expanded: "Де́вушка, кото́рая пи́шет письмо́, — журнали́стка.",
    compressed: "Де́вушка, ___ письмо́, — журнали́стка.",
    fr: "La jeune femme qui écrit une lettre est journaliste.",
    why: "Action en cours accomplie par le sujet : participe présent actif en -щий.",
  },
  {
    id: "engineer-built",
    verb: "stroit",
    tense: "past",
    expanded: "Инжене́р, кото́рый стро́ил э́тот мост, уже́ на пе́нсии.",
    compressed: "Инжене́р, ___ э́тот мост, уже́ на пе́нсии.",
    fr: "L'ingénieur qui construisait ce pont est déjà à la retraite.",
    why: "Action révolue : participe passé actif en -вший, formé sur l'imperfectif.",
  },
  {
    id: "friends-helping",
    verb: "pomogat",
    tense: "present",
    expanded: "Друзья́, кото́рые помога́ют нам, живу́т ря́дом.",
    compressed: "Друзья́, ___ нам, живу́т ря́дом.",
    fr: "Les amis qui nous aident habitent à côté.",
    why: "Le participe s'accorde au pluriel avec « друзья́ », comme le ferait un adjectif.",
  },
  {
    id: "woman-returning",
    verb: "vozvrashchatsya",
    tense: "present",
    expanded: "Же́нщина, кото́рая возвраща́ется домо́й, рабо́тает в больни́це.",
    compressed: "Же́нщина, ___ домо́й, рабо́тает в больни́це.",
    fr: "La femme qui rentre chez elle travaille à l'hôpital.",
    why: "Verbe pronominal : le participe garde -ся, qui ne devient JAMAIS -сь après une consonne.",
  },
];

/**
 * Chaque tirage accepte un contexte IMPOSÉ en plus du hasard : c'est ce qui
 * permet de reconstruire un exercice à partir de son identifiant (voir
 * `rebuildParticipleExercise`).
 */
function activeExercise(random: Rng, forced?: ActiveContext): ParticipleExercise {
  const context = forced ?? pick(ACTIVE_CONTEXTS, random);
  const verb = getVerb(context.verb)!;
  const correct = context.tense === "present" ? verb.activePresent : verb.activePastImp;
  const other = context.tense === "present" ? verb.activePastImp : verb.activePresent;

  // Distracteurs pris dans le PARADIGME DU MÊME VERBE : c'est la forme
  // qu'il faut choisir, pas le verbe. Un distracteur d'un autre verbe
  // rendrait l'item trivial.
  const distractors = [other, verb.gerundImp, verb.passivePast].filter(
    (f): f is string => typeof f === "string" && f !== correct
  );
  const { options, correctIndex } = shuffleWithAnswer(
    [correct, ...distractors.slice(0, 3)],
    correct,
    random
  );
  return {
    skill: "active",
    itemId: `active:${context.id}`,
    prompt: "Comprime la relative en participe",
    expanded: context.expanded,
    compressed: context.compressed,
    sentenceFr: context.fr,
    options,
    correctIndex,
    explain: `${context.why} Ici : ${correct} (${verb.imperfective}).`,
    whyNot: whyNotFor(options, correct, [
      [verb.activePresent, FORM_SAYS.activePresent],
      [verb.activePastImp, FORM_SAYS.activePast],
      [verb.gerundImp, FORM_SAYS.gerund],
      [verb.passivePast, FORM_SAYS.passiveVoice],
    ]),
  };
}

// ─── 2. Participes passifs ─────────────────────────────────────────
interface PassiveContext {
  id: string;
  verb: string;
  /** Genre et nombre du support, pour l'accord de la forme longue. */
  agreement: "f" | "m" | "n" | "pl";
  expanded: string;
  compressed: string;
  fr: string;
  why: string;
}

/**
 * Terminaisons de la forme longue selon l'accord — ET selon le cas.
 *
 * Elle ne produisait que du NOMINATIF, ce qui suffisait tant que le
 * participe restait attribut. Un contexte le met en épithète dans un groupe
 * à l'accusatif — « Он не заме́тил ___ дверь » — et recevait donc
 * « закры́тая дверь » là où le russe demande « закры́тую дверь », donné pour
 * bonne réponse.
 *
 * L'accusatif ne se distingue du nominatif qu'au féminin singulier : le
 * neutre et le masculin inanimé le copient, ce qui est exactement pourquoi
 * les trois autres épithètes passaient inaperçues.
 */
function agree(
  long: string,
  agreement: PassiveContext["agreement"],
  grammaticalCase: "nominative" | "accusative" = "nominative"
): string {
  const stem = long.slice(0, -2); // -ый / -ий / -ой font deux caractères
  const soft = long.endsWith("ий");
  if (agreement === "f") {
    if (grammaticalCase === "accusative") return stem + (soft ? "юю" : "ую");
    return stem + (soft ? "яя" : "ая");
  }
  if (agreement === "m") return long;
  if (agreement === "n") return stem + (soft ? "её" : "ое");
  return stem + (soft ? "ие" : "ые");
}

const PASSIVE_CONTEXTS: PassiveContext[] = [
  {
    id: "book-written",
    verb: "pisat",
    agreement: "f",
    expanded: "Кни́га, кото́рую написа́л То́лстой, ста́ла кла́ссикой.",
    compressed: "Кни́га, ___ То́лстым, ста́ла кла́ссикой.",
    fr: "Le livre écrit par Tolstoï est devenu un classique.",
    why: "L'objet devient le support du participe passif, et l'auteur passe à l'instrumental (То́лстым). Le participe s'accorde avec « кни́га », féminin.",
  },
  {
    id: "bridge-built",
    verb: "stroit",
    agreement: "m",
    expanded: "Мост, кото́рый постро́или в про́шлом ве́ке, ещё стои́т.",
    compressed: "___ в про́шлом ве́ке мост ещё стои́т.",
    fr: "Le pont construit au siècle dernier tient encore.",
    why: "Participe passé passif, accordé au masculin avec « мост ».",
  },
  {
    id: "letter-received",
    verb: "poluchat",
    agreement: "n",
    expanded: "Письмо́, кото́рое получи́ли вчера́, бы́ло ва́жным.",
    compressed: "___ вчера́ письмо́ бы́ло ва́жным.",
    fr: "La lettre reçue hier était importante.",
    why: "« письмо́ » est neutre : le participe prend la terminaison neutre.",
  },
  {
    id: "problems-solved",
    verb: "reshat",
    agreement: "pl",
    expanded: "Зада́чи, кото́рые реши́ли студе́нты, бы́ли тру́дными.",
    compressed: "___ студе́нтами зада́чи бы́ли тру́дными.",
    fr: "Les problèmes résolus par les étudiants étaient difficiles.",
    why: "Accord au pluriel, et l'agent au pluriel instrumental (студе́нтами).",
  },
  {
    id: "dinner-prepared",
    verb: "gotovit",
    agreement: "m",
    expanded: "У́жин, кото́рый пригото́вила ма́ма, был вку́сным.",
    compressed: "___ ма́мой у́жин был вку́сным.",
    fr: "Le dîner préparé par maman était délicieux.",
    why: "L'agent féminin passe aussi à l'instrumental : ма́мой.",
  },
  {
    id: "work-finished",
    verb: "zakanchivat",
    agreement: "f",
    expanded: "Рабо́та, кото́рую зако́нчили во́время, получи́ла приз.",
    compressed: "___ во́время рабо́та получи́ла приз.",
    fr: "Le travail terminé à temps a reçu un prix.",
    why: "Accord au féminin avec « рабо́та ».",
  },
  {
    id: "door-closed",
    verb: "zakryvat",
    agreement: "f",
    expanded: "Дверь, кото́рую закры́ли у́тром, так и оста́лась закры́той.",
    compressed: "___ у́тром дверь так и оста́лась закры́той.",
    fr: "La porte fermée le matin est restée close.",
    why: "Participe passé passif accordé au féminin avec « дверь ».",
  },
  {
    id: "window-opened",
    verb: "otkryvat",
    agreement: "n",
    expanded: "Окно́, кото́рое откры́ли но́чью, впусти́ло хо́лод.",
    compressed: "___ но́чью окно́ впусти́ло хо́лод.",
    fr: "La fenêtre ouverte pendant la nuit a laissé entrer le froid.",
    why: "« окно́ » est neutre : le participe prend la terminaison neutre.",
  },
  {
    id: "work-done",
    verb: "delat",
    agreement: "f",
    expanded: "Рабо́та, кото́рую сде́лали вчера́, всех устро́ила.",
    compressed: "___ вчера́ рабо́та всех устро́ила.",
    fr: "Le travail fait hier a satisfait tout le monde.",
    why: "Accord au féminin avec « рабо́та ».",
  },
  {
    id: "topic-studied",
    verb: "izuchat",
    agreement: "f",
    expanded: "Те́ма, кото́рую изучи́ли в про́шлом году́, сно́ва появи́лась на экза́мене.",
    compressed: "___ в про́шлом году́ те́ма сно́ва появи́лась на экза́мене.",
    fr: "Le sujet étudié l'an dernier est réapparu à l'examen.",
    why: "Le participe se place avant le nom et s'accorde avec lui.",
  },
];

function passiveExercise(random: Rng, forced?: PassiveContext): ParticipleExercise {
  const context = forced ?? pick(PASSIVE_CONTEXTS, random);
  const verb = getVerb(context.verb)!;
  const correct = agree(verb.passivePast!, context.agreement);

  // Distracteurs : l'actif (contresens de voix), un mauvais accord, et le
  // gérondif. Trois erreurs réellement commises.
  const wrongGender = context.agreement === "f" ? "masculin" : "féminin";
  const wrongAgreement = agree(verb.passivePast!, context.agreement === "f" ? "m" : "f");
  const distractors = [verb.activePastPerf, wrongAgreement, verb.gerundPerf].filter(
    (f): f is string => typeof f === "string" && f !== correct
  );
  const { options, correctIndex } = shuffleWithAnswer(
    [correct, ...distractors.slice(0, 3)],
    correct,
    random
  );
  return {
    skill: "passive",
    itemId: `passive:${context.id}`,
    prompt: "Comprime la relative en participe passif",
    expanded: context.expanded,
    compressed: context.compressed,
    sentenceFr: context.fr,
    options,
    correctIndex,
    explain: `${context.why} Ici : ${correct}.`,
    whyNot: whyNotFor(options, correct, [
      [verb.activePastPerf, FORM_SAYS.activeVoice],
      [
        wrongAgreement,
        `accord au ${wrongGender} singulier : le participe prend le genre et le nombre du nom qu'il qualifie`,
      ],
      [verb.gerundPerf, FORM_SAYS.gerund],
    ]),
  };
}

// ─── 3. Forme longue ou forme courte ───────────────────────────────
interface ShortContext {
  id: string;
  verb: string;
  form: "short" | "long";
  agreement: "m" | "f" | "n" | "pl";
  /**
   * Cas du groupe où vit le participe. Ne change la forme qu'au féminin
   * singulier (закры́тая / закры́тую) — mais c'est justement là que le seul
   * contexte à l'accusatif se trouvait.
   */
  grammaticalCase?: "nominative" | "accusative";
  sentence: string;
  fr: string;
  why: string;
}

const SHORT_CONTEXTS: ShortContext[] = [
  {
    id: "door-is-closed",
    verb: "zakryvat",
    form: "short",
    agreement: "f",
    sentence: "Дверь ___.",
    fr: "La porte est fermée.",
    why: "Le participe est ATTRIBUT : il affirme quelque chose du sujet → forme courte.",
  },
  {
    id: "closed-door",
    verb: "zakryvat",
    form: "long",
    agreement: "f",
    // « заме́тил » régit l'accusatif : закры́тую, pas закры́тая.
    grammaticalCase: "accusative",
    sentence: "Он не заме́тил ___ дверь.",
    fr: "Il n'a pas remarqué la porte fermée.",
    why: "Le participe est ÉPITHÈTE : il qualifie le nom qu'il accompagne → forme longue, accordée.",
  },
  {
    id: "house-is-built",
    verb: "stroit",
    form: "short",
    agreement: "m",
    sentence: "Дом ___ в про́шлом году́.",
    fr: "La maison a été construite l'an dernier.",
    why: "Attribut au passif : forme courte, accordée au masculin avec « дом ».",
  },
  {
    id: "window-is-open",
    verb: "otkryvat",
    form: "short",
    agreement: "n",
    sentence: "Окно́ ___.",
    fr: "La fenêtre est ouverte.",
    why: "« окно́ » est neutre : la forme courte prend -о.",
  },
  {
    id: "work-is-done",
    verb: "delat",
    form: "short",
    agreement: "f",
    sentence: "Рабо́та ___.",
    fr: "Le travail est fait.",
    why: "Attribut : forme courte, accordée avec « рабо́та », féminin.",
  },
  {
    id: "solved-problem",
    verb: "reshat",
    form: "long",
    agreement: "f",
    sentence: "Э́то уже́ ___ зада́ча.",
    fr: "C'est un problème déjà résolu.",
    why: "Épithète devant le nom : forme longue accordée.",
  },
  {
    id: "letters-received",
    verb: "poluchat",
    form: "short",
    agreement: "pl",
    sentence: "Все пи́сьма ___.",
    fr: "Toutes les lettres ont été reçues.",
    why: "Attribut au pluriel : forme courte en -ы.",
  },
  {
    id: "letter-is-written",
    verb: "pisat",
    form: "short",
    agreement: "n",
    sentence: "Письмо́ ___ по-ру́сски.",
    fr: "La lettre est écrite en russe.",
    why: "Attribut du sujet « письмо́ », neutre : forme courte accordée au neutre.",
  },
  {
    id: "written-letter",
    verb: "pisat",
    form: "long",
    agreement: "n",
    sentence: "Он показа́л мне ___ письмо́.",
    fr: "Il m'a montré la lettre écrite.",
    why: "Épithète : le participe qualifie « письмо́ » à l'intérieur du groupe nominal → forme longue.",
  },
  {
    id: "problems-are-solved",
    verb: "reshat",
    form: "short",
    agreement: "pl",
    sentence: "Все зада́чи ___.",
    fr: "Tous les problèmes sont résolus.",
    why: "Forme courte au pluriel. Attention à l'accent : решён au masculin, mais решены́ au pluriel.",
  },
  {
    id: "received-answer",
    verb: "poluchat",
    form: "long",
    agreement: "m",
    sentence: "Мы обсуди́ли ___ отве́т.",
    fr: "Nous avons discuté de la réponse reçue.",
    why: "Épithète devant le nom : forme longue, accordée au masculin avec « отве́т ».",
  },
];

function shortExercise(random: Rng, forced?: ShortContext): ParticipleExercise {
  const context = forced ?? pick(SHORT_CONTEXTS, random);
  const verb = getVerb(context.verb)!;
  const short = verb.passiveShort![context.agreement];
  const long = agree(verb.passivePast!, context.agreement, context.grammaticalCase);
  const correct = context.form === "short" ? short : long;

  const { options, correctIndex } = shuffleWithAnswer([short, long], correct, random);
  return {
    skill: "short",
    itemId: `short:${context.id}`,
    prompt: "Attribut ou épithète ?",
    compressed: context.sentence,
    sentenceFr: context.fr,
    options,
    correctIndex,
    explain: `${context.why} Ici : ${correct}.`,
    whyNot: whyNotFor(options, correct, [
      [short, FORM_SAYS.short],
      [long, FORM_SAYS.long],
    ]),
  };
}

// ─── 4. Gérondifs ──────────────────────────────────────────────────
interface GerundContext {
  id: string;
  verb: string;
  aspect: "imperfective" | "perfective";
  expanded: string;
  compressed: string;
  fr: string;
  why: string;
}

const GERUND_CONTEXTS: GerundContext[] = [
  {
    id: "finished-then-left",
    verb: "zakanchivat",
    aspect: "perfective",
    expanded: "Когда́ он зако́нчил рабо́ту, он пошёл домо́й.",
    compressed: "___ рабо́ту, он пошёл домо́й.",
    fr: "Ayant terminé son travail, il est rentré.",
    why: "L'action est ACHEVÉE avant celle du verbe principal → gérondif perfectif en -в.",
  },
  {
    id: "reading-smiled",
    verb: "chitat",
    aspect: "imperfective",
    expanded: "Пока́ он чита́л письмо́, он улыба́лся.",
    compressed: "___ письмо́, он улыба́лся.",
    fr: "En lisant la lettre, il souriait.",
    why: "Les deux actions sont SIMULTANÉES → gérondif imperfectif en -я.",
  },
  {
    id: "returning-met",
    verb: "vozvrashchatsya",
    aspect: "imperfective",
    expanded: "Когда́ я возвраща́лся домо́й, я встре́тил дру́га.",
    compressed: "___ домо́й, я встре́тил дру́га.",
    fr: "En rentrant chez moi, j'ai croisé un ami.",
    why: "Le trajet est en cours quand la rencontre a lieu → gérondif imperfectif. Un verbe pronominal donne -ясь.",
  },
  {
    id: "having-read",
    verb: "chitat",
    aspect: "perfective",
    expanded: "Когда́ он прочита́л письмо́, он его́ вы́бросил.",
    compressed: "___ письмо́, он его́ вы́бросил.",
    fr: "Après avoir lu la lettre, il l'a jetée.",
    why: "L'action est terminée avant la suivante → gérondif perfectif.",
  },
  {
    id: "working-listened",
    verb: "rabotat",
    aspect: "imperfective",
    expanded: "Пока́ он рабо́тал, он слу́шал му́зыку.",
    compressed: "___, он слу́шал му́зыку.",
    fr: "Pendant qu'il travaillait, il écoutait de la musique.",
    why: "Arrière-plan simultané → gérondif imperfectif.",
  },
  {
    id: "having-arrived",
    verb: "idti",
    aspect: "perfective",
    expanded: "Когда́ он пришёл домо́й, он сра́зу лёг спать.",
    compressed: "___ домо́й, он сра́зу лёг спать.",
    fr: "Une fois rentré, il s'est couché aussitôt.",
    why: "Arrivée achevée, puis action suivante → gérondif perfectif (придя́).",
  },
  {
    id: "helping-explained",
    verb: "pomogat",
    aspect: "imperfective",
    expanded: "Когда́ она́ помога́ла мне, она́ всё объясня́ла.",
    compressed: "___ мне, она́ всё объясня́ла.",
    fr: "En m'aidant, elle expliquait tout.",
    why: "Actions simultanées → gérondif imperfectif.",
  },
  {
    id: "opening-saw",
    verb: "otkryvat",
    aspect: "perfective",
    expanded: "Когда́ она́ откры́ла окно́, она́ услы́шала му́зыку.",
    compressed: "___ окно́, она́ услы́шала му́зыку.",
    fr: "Ayant ouvert la fenêtre, elle a entendu de la musique.",
    why: "L'ouverture précède et s'achève avant l'écoute → gérondif perfectif en -в.",
  },
  {
    id: "studying-took-notes",
    verb: "izuchat",
    aspect: "imperfective",
    expanded: "Пока́ он изуча́л ру́сский язы́к, он вёл за́писи.",
    compressed: "___ ру́сский язы́к, он вёл за́писи.",
    fr: "Tout en étudiant le russe, il prenait des notes.",
    why: "Les deux actions se déroulent en même temps → gérondif imperfectif en -я.",
  },
  {
    id: "cooking-listened",
    verb: "gotovit",
    aspect: "imperfective",
    expanded: "Пока́ она́ гото́вила у́жин, она́ слу́шала ра́дио.",
    compressed: "___ у́жин, она́ слу́шала ра́дио.",
    fr: "En préparant le dîner, elle écoutait la radio.",
    why: "Deux occupations menées de front → gérondif imperfectif. Le radical alterne : гото́вить → гото́вя.",
  },
  {
    id: "arrived-called",
    verb: "idti",
    aspect: "perfective",
    expanded: "Когда́ он пришёл домо́й, он сра́зу позвони́л ма́тери.",
    compressed: "___ домо́й, он сра́зу позвони́л ма́тери.",
    fr: "Une fois rentré, il a tout de suite appelé sa mère.",
    why: "Gérondif perfectif irrégulier : придя́, et non « прише́дши » — forme à mémoriser.",
  },
];

function gerundExercise(random: Rng, forced?: GerundContext): ParticipleExercise {
  const context = forced ?? pick(GERUND_CONTEXTS, random);
  const verb = getVerb(context.verb)!;
  const correct = context.aspect === "imperfective" ? verb.gerundImp! : verb.gerundPerf!;
  const other = context.aspect === "imperfective" ? verb.gerundPerf : verb.gerundImp;

  const distractors = [other, verb.activePresent, verb.activePastImp].filter(
    (f): f is string => typeof f === "string" && f !== correct
  );
  const { options, correctIndex } = shuffleWithAnswer(
    [correct, ...distractors.slice(0, 3)],
    correct,
    random
  );
  return {
    skill: "gerund",
    itemId: `gerund:${context.id}`,
    prompt: "Actions simultanées, ou l'une avant l'autre ?",
    expanded: context.expanded,
    compressed: context.compressed,
    sentenceFr: context.fr,
    options,
    correctIndex,
    explain: `${context.why} Ici : ${correct}.`,
    whyNot: whyNotFor(options, correct, [
      [verb.gerundImp, FORM_SAYS.gerundImperfective],
      [verb.gerundPerf, FORM_SAYS.gerundPerfective],
      [verb.activePresent, FORM_SAYS.participleForTime],
      [verb.activePastImp, FORM_SAYS.participleForTime],
    ]),
  };
}

// ─── 5. La règle du sujet unique ───────────────────────────────────
/**
 * L'erreur la plus fréquente, et la plus invisible pour un francophone :
 * le gérondif doit avoir le même sujet que le verbe principal. Ici on ne
 * demande pas de produire une forme mais de REPÉRER la phrase correcte.
 */
interface SubjectItem {
  id: string;
  correct: string;
  wrong: string[];
  fr: string;
  why: string;
}

// Les VARIANTES écrites à la construction s'ajoutent aux contextes écrits à
// la main, qui restent en tête. Elles gardent le marqueur, la règle et
// l'explication de leur contexte d'origine — voir scripts/curate-contexts.mjs
// pour ce qui est hérité, ce qui est déclaré, et pourquoi.
ACTIVE_CONTEXTS.push(...((EXTRA_CONTEXTS.ACTIVE_CONTEXTS ?? []) as unknown as ActiveContext[]));
PASSIVE_CONTEXTS.push(...((EXTRA_CONTEXTS.PASSIVE_CONTEXTS ?? []) as unknown as PassiveContext[]));
SHORT_CONTEXTS.push(...((EXTRA_CONTEXTS.SHORT_CONTEXTS ?? []) as unknown as ShortContext[]));
GERUND_CONTEXTS.push(...((EXTRA_CONTEXTS.GERUND_CONTEXTS ?? []) as unknown as GerundContext[]));


const SUBJECT_ITEMS: SubjectItem[] = [
  {
    id: "rain",
    correct: "Возвраща́ясь домо́й, я попа́л под дождь.",
    wrong: ["Возвраща́ясь домо́й, начался́ дождь.", "Возвраща́ясь домо́й, дождь заста́л меня́."],
    fr: "En rentrant chez moi, je me suis fait surprendre par la pluie.",
    why: "Le gérondif et le verbe principal doivent avoir le MÊME sujet. Dans les phrases fautives, c'est la pluie qui « rentrerait à la maison ».",
  },
  {
    id: "reading",
    correct: "Чита́я э́ту кни́гу, я мно́гое по́нял.",
    wrong: ["Чита́я э́ту кни́гу, мне мно́гое ста́ло я́сно.", "Чита́я э́ту кни́гу, всё ста́ло поня́тно."],
    fr: "En lisant ce livre, j'ai compris beaucoup de choses.",
    why: "« мне » et « всё » ne sont pas des sujets qui lisent : seule la phrase où « я » lit ET comprend respecte l'unicité du sujet.",
  },
  {
    id: "finishing",
    correct: "Зако́нчив рабо́ту, он вы́ключил компью́тер.",
    wrong: ["Зако́нчив рабо́ту, компью́тер был вы́ключен.", "Зако́нчив рабо́ту, ему́ ста́ло ле́гче."],
    fr: "Ayant terminé son travail, il a éteint l'ordinateur.",
    why: "Un passif ou un datif impersonnel ne fournit pas de sujet au gérondif : ce n'est pas l'ordinateur qui a terminé le travail.",
  },
  {
    id: "entering",
    correct: "Войдя́ в ко́мнату, она́ поздоро́валась.",
    wrong: ["Войдя́ в ко́мнату, ей ста́ло хо́лодно.", "Войдя́ в ко́мнату, бы́ло темно́."],
    fr: "En entrant dans la pièce, elle a dit bonjour.",
    why: "« ей ста́ло хо́лодно » et « бы́ло темно́ » n'ont pas de sujet agissant : le gérondif reste en l'air.",
  },
  {
    id: "waiting",
    correct: "Ожида́я по́езда, мы пи́ли ко́фе.",
    wrong: ["Ожида́я по́езда, вре́мя шло ме́дленно.", "Ожида́я по́езда, нам бы́ло ску́чно."],
    fr: "En attendant le train, nous buvions du café.",
    why: "Ce n'est pas le temps qui attend le train. Seul « мы » peut à la fois attendre et boire.",
  },
  {
    id: "listening",
    correct: "Слу́шая му́зыку, он де́лал уро́ки.",
    wrong: ["Слу́шая му́зыку, уро́ки бы́ли сде́ланы.", "Слу́шая му́зыку, ему́ бы́ло споко́йно."],
    fr: "En écoutant de la musique, il faisait ses devoirs.",
    why: "Ce ne sont ni « les devoirs » ni « lui » (au datif) qui écoutent : seul un sujet au nominatif peut porter les deux actions.",
  },
  {
    id: "opening",
    correct: "Откры́в дверь, она́ уви́дела госте́й.",
    wrong: ["Откры́в дверь, в ко́мнату вошёл хо́лод.", "Откры́в дверь, ей ста́ло стра́шно."],
    fr: "Ayant ouvert la porte, elle a vu les invités.",
    why: "Le froid n'a pas ouvert la porte, et « ей » n'est pas un sujet : le gérondif resterait sans support.",
  },
  {
    id: "arriving",
    correct: "Прие́хав в Москву́, мы сра́зу пошли́ на Кра́сную пло́щадь.",
    wrong: ["Прие́хав в Москву́, нас встре́тили друзья́.", "Прие́хав в Москву́, бы́ло уже́ по́здно."],
    fr: "Arrivés à Moscou, nous sommes allés tout de suite sur la place Rouge.",
    why: "« Нас встре́тили друзья́ » a pour sujet « друзья́ » — ce ne sont pas eux qui arrivent. « Бы́ло уже́ по́здно » n'a pas de sujet du tout.",
  },

  // Les quatre façons de casser la règle, reprises en alternance : un autre
  // NOM devient sujet du verbe principal, un datif impersonnel remplace le
  // sujet, une tournure sans sujet du tout, ou un passif qui met l'objet à
  // la place de l'agent. Le francophone ne les entend pas — « en répondant
  // à la question, sa voix tremblait » passe très bien en français.
  //
  // Aucune explication ne désigne une phrase par son RANG : les options sont
  // mélangées à chaque tirage. Elles citent le russe.
  {
    id: "crossing",
    correct: "Переходя́ у́лицу, он посмотре́л нале́во.",
    wrong: ["Переходя́ у́лицу, его́ чуть не сби́ла маши́на.", "Переходя́ у́лицу, ему́ ста́ло стра́шно."],
    fr: "En traversant la rue, il a regardé à gauche.",
    why: "Dans « его́ чуть не сби́ла маши́на », le sujet est « маши́на » : ce serait la voiture qui traverse. Et « ему́ » est un datif — un datif n'est jamais sujet.",
  },
  {
    id: "preparing",
    correct: "Гото́вя у́жин, она́ слу́шала ра́дио.",
    wrong: ["Гото́вя у́жин, у неё зазвони́л телефо́н.", "Гото́вя у́жин, бы́ло ве́село."],
    fr: "En préparant le dîner, elle écoutait la radio.",
    why: "« Телефо́н » ne prépare pas le dîner, et « бы́ло ве́село » n'a aucun sujet : dans les deux cas le gérondif reste sans support.",
  },
  {
    id: "leaving-office",
    correct: "Вы́йдя из о́фиса, он встре́тил колле́гу.",
    wrong: ["Вы́йдя из о́фиса, его́ жда́ла маши́на.", "Вы́йдя из о́фиса, ста́ло темно́."],
    fr: "En sortant du bureau, il a croisé un collègue.",
    why: "« Его́ жда́ла маши́на » a pour sujet la voiture — c'est elle qui serait sortie du bureau. « Ста́ло темно́ » n'a pas de sujet.",
  },
  {
    id: "writing-letter",
    correct: "Написа́в письмо́, она́ отпра́вила его́.",
    wrong: ["Написа́в письмо́, оно́ бы́ло отпра́влено.", "Написа́в письмо́, ей ста́ло споко́йнее."],
    fr: "Ayant écrit la lettre, elle l'a envoyée.",
    why: "Le passif déplace l'agent hors de la phrase : « оно́ бы́ло отпра́влено » ne dit plus qui a écrit. Et « ей » est au datif, donc pas sujet.",
  },
  {
    id: "looking-photos",
    correct: "Рассма́тривая фотогра́фии, мы вспомина́ли ле́то.",
    wrong: ["Рассма́тривая фотогра́фии, ле́то каза́лось далёким.", "Рассма́тривая фотогра́фии, нам ста́ло гру́стно."],
    fr: "En regardant les photos, nous nous souvenions de l'été.",
    why: "Ce n'est pas l'été qui regarde les photos, et « нам » est au datif. Seul « мы » peut à la fois regarder et se souvenir.",
  },
  {
    id: "answering",
    correct: "Отвеча́я на вопро́с, студе́нт волнова́лся.",
    wrong: ["Отвеча́я на вопро́с, его́ го́лос дрожа́л.", "Отвеча́я на вопро́с, бы́ло тру́дно сосредото́читься."],
    fr: "En répondant à la question, l'étudiant était nerveux.",
    why: "Le piège du francophone : « en répondant, sa voix tremblait » se dit en français, mais en russe le sujet devient « го́лос » — ce n'est pas la voix qui répond.",
  },
  {
    id: "having-dined",
    correct: "Поу́жинав, они́ пошли́ гуля́ть.",
    wrong: ["Поу́жинав, им захоте́лось спать.", "Поу́жинав, посу́да была́ вы́мыта."],
    fr: "Après avoir dîné, ils sont allés se promener.",
    why: "« Им захоте́лось » est une tournure impersonnelle au datif, et « посу́да была́ вы́мыта » fait de la vaisselle le sujet : ce n'est pas elle qui a dîné.",
  },
  {
    id: "travelling",
    correct: "Путеше́ствуя по Росси́и, мы ви́дели мно́го городо́в.",
    wrong: ["Путеше́ствуя по Росси́и, нам понра́вились города́.", "Путеше́ствуя по Росси́и, бы́ло интере́сно."],
    fr: "En voyageant à travers la Russie, nous avons vu beaucoup de villes.",
    why: "« Нам понра́вились города́ » a pour sujet « города́ », et les villes ne voyagent pas. « Бы́ло интере́сно » n'a pas de sujet du tout.",
  },
  {
    id: "having-returned",
    correct: "Верну́вшись из о́тпуска, он сра́зу вы́шел на рабо́ту.",
    wrong: ["Верну́вшись из о́тпуска, его́ ждала́ ку́ча пи́сем.", "Верну́вшись из о́тпуска, бы́ло тру́дно нача́ть рабо́тать."],
    fr: "Rentré de vacances, il a repris le travail tout de suite.",
    why: "« Ку́ча пи́сем » est le sujet là où les lettres attendent : ce n'est pas le tas qui rentre de vacances. « Бы́ло тру́дно » est impersonnel.",
  },
  {
    id: "studying-russian",
    correct: "Изуча́я ру́сский язы́к, она́ полюби́ла Че́хова.",
    wrong: ["Изуча́я ру́сский язы́к, у неё появи́лись но́вые друзья́.", "Изуча́я ру́сский язы́к, бы́ло непро́сто запо́мнить падежи́."],
    fr: "En étudiant le russe, elle s'est prise d'affection pour Tchekhov.",
    why: "« У неё появи́лись друзья́ » a pour sujet « друзья́ » — les amis n'étudient pas le russe. « Бы́ло непро́сто » n'a pas de sujet du tout.",
  },
  {
    id: "closing-door",
    correct: "Закры́в дверь, она́ вы́ключила свет.",
    wrong: ["Закры́в дверь, свет был вы́ключен.", "Закры́в дверь, в ко́мнате ста́ло темно́."],
    fr: "Ayant fermé la porte, elle a éteint la lumière.",
    why: "Le passif « свет был вы́ключен » fait de la lumière le sujet, et « в ко́мнате ста́ло темно́ » n'en a aucun : personne n'a plus fermé la porte.",
  },
  {
    id: "hurrying",
    correct: "Спеша́ на по́езд, я забы́л зонт.",
    wrong: ["Спеша́ на по́езд, зонт оста́лся до́ма.", "Спеша́ на по́езд, мне бы́ло не до за́втрака."],
    fr: "En me dépêchant pour le train, j'ai oublié mon parapluie.",
    why: "Ce n'est pas le parapluie qui court après le train. Et « мне » est au datif : la tournure est impersonnelle, donc sans sujet à partager.",
  },
];

function subjectExercise(random: Rng, forced?: SubjectItem): ParticipleExercise {
  const item = forced ?? pick(SUBJECT_ITEMS, random);
  const { options, correctIndex } = shuffleWithAnswer(
    [item.correct, ...item.wrong],
    item.correct,
    random
  );
  return {
    skill: "subject",
    itemId: `subject:${item.id}`,
    prompt: "Quelle phrase respecte la règle du sujet unique ?",
    // Pas de gabarit à trou ici : l'exercice porte sur des phrases entières.
    compressed: "",
    sentenceFr: item.fr,
    options,
    correctIndex,
    explain: item.why,
  };
}

const GENERATORS: Record<ParticipleSkillId, (random: Rng) => ParticipleExercise> = {
  active: activeExercise,
  passive: passiveExercise,
  short: shortExercise,
  gerund: gerundExercise,
  subject: subjectExercise,
};

export function generateParticipleExercise(
  skill: ParticipleSkillId,
  random: Rng = Math.random
): ParticipleExercise {
  return GENERATORS[skill](random);
}

/**
 * L'exercice exact qu'un identifiant désigne, options remélangées — pour
 * « Mes erreurs ». `null` si le contexte n'existe pas ou si son verbe n'a
 * pas la forme que l'exercice demanderait.
 */
export function rebuildParticipleExercise(
  itemId: string,
  random: Rng = Math.random
): ParticipleExercise | null {
  const [kind, id] = itemId.split(":");
  const verbOf = (verbId: string) => getVerb(verbId);

  if (kind === "active") {
    const context = ACTIVE_CONTEXTS.find((c) => c.id === id);
    return context && verbOf(context.verb) ? activeExercise(random, context) : null;
  }
  if (kind === "passive") {
    const context = PASSIVE_CONTEXTS.find((c) => c.id === id);
    return context && verbOf(context.verb)?.passivePast ? passiveExercise(random, context) : null;
  }
  if (kind === "short") {
    const context = SHORT_CONTEXTS.find((c) => c.id === id);
    const verb = context ? verbOf(context.verb) : undefined;
    return context && verb?.passivePast && verb.passiveShort ? shortExercise(random, context) : null;
  }
  if (kind === "gerund") {
    const context = GERUND_CONTEXTS.find((c) => c.id === id);
    const verb = context ? verbOf(context.verb) : undefined;
    const form = context?.aspect === "imperfective" ? verb?.gerundImp : verb?.gerundPerf;
    return context && form ? gerundExercise(random, context) : null;
  }
  if (kind === "subject") {
    const item = SUBJECT_ITEMS.find((i) => i.id === id);
    return item ? subjectExercise(random, item) : null;
  }
  return null;
}

/** Rejoue la correction côté serveur, à partir du seul identifiant d'item. */
export function checkParticipleAnswer(itemId: string, answer: string): boolean | null {
  const [kind, id] = itemId.split(":");

  if (kind === "active") {
    const context = ACTIVE_CONTEXTS.find((c) => c.id === id);
    const verb = context ? getVerb(context.verb) : undefined;
    if (!context || !verb) return null;
    return (context.tense === "present" ? verb.activePresent : verb.activePastImp) === answer;
  }
  if (kind === "passive") {
    const context = PASSIVE_CONTEXTS.find((c) => c.id === id);
    const verb = context ? getVerb(context.verb) : undefined;
    if (!context || !verb?.passivePast) return null;
    return agree(verb.passivePast, context.agreement) === answer;
  }
  if (kind === "short") {
    const context = SHORT_CONTEXTS.find((c) => c.id === id);
    const verb = context ? getVerb(context.verb) : undefined;
    if (!context || !verb?.passivePast || !verb.passiveShort) return null;
    const expected =
      context.form === "short"
        ? verb.passiveShort[context.agreement]
        : agree(verb.passivePast, context.agreement, context.grammaticalCase);
    return expected === answer;
  }
  if (kind === "gerund") {
    const context = GERUND_CONTEXTS.find((c) => c.id === id);
    const verb = context ? getVerb(context.verb) : undefined;
    if (!context || !verb) return null;
    const expected = context.aspect === "imperfective" ? verb.gerundImp : verb.gerundPerf;
    return expected !== undefined && expected === answer;
  }
  if (kind === "subject") {
    const item = SUBJECT_ITEMS.find((i) => i.id === id);
    return item ? item.correct === answer : null;
  }
  return null;
}

export {
  ACTIVE_CONTEXTS,
  PASSIVE_CONTEXTS,
  SHORT_CONTEXTS,
  GERUND_CONTEXTS,
  SUBJECT_ITEMS,
  agree,
  PARTICIPLE_VERBS,
};
export type { ParticipleVerb };
