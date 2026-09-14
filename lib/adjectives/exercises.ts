import { CASE_ORDER, CaseId, Gender } from "@/lib/grammar/types";
import { normalizeTyped, whyNotFor } from "@/lib/exercises/types";
import { getAdjective } from "@/lib/grammar/adjectives-data";
import { getNoun } from "@/lib/grammar/nouns-data";
import { declineAdjective } from "@/lib/grammar/decline-adjective";
import { stripAccent } from "@/lib/grammar/decline";
import { declineNoun } from "@/lib/grammar/decline";
import { ADJECTIVE_CONTEXTS_EXTRA } from "./contexts.generated";

/**
 * Accord de l'adjectif — module autonome.
 *
 * POURQUOI PAS UN ONGLET DU MODULE « CAS »
 *
 * L'accord vivait dans /cases comme cinquième onglet, et il y tirait TROIS
 * banques indépendamment : un déclencheur, un nom, un adjectif. Un exercice
 * qui croise n banques a besoin de C(n,2) relations de compatibilité curées ;
 * il n'en avait qu'une (nom ↔ déclencheur). La relation manquante — nom ↔
 * adjectif — était approchée par l'animacité GRAMMATICALE, qui n'est pas une
 * propriété sémantique : « рыба » est animé et se mange, « семья » est
 * inanimé et désigne des gens. Résultat mesuré : une phrase sur trois que
 * personne ne dirait (« une règle brillante », « un droit cher », « ce
 * gérant bleu »).
 *
 * COMMENT CELUI-CI L'ÉVITE
 *
 * Le couple adjectif + nom n'est plus tiré : il est ÉCRIT, contexte par
 * contexte, comme dans les modules Aspect, Mouvement et Participes — qui
 * n'ont jamais eu ce problème, précisément parce qu'ils ne combinent pas
 * deux banques au hasard. Ce qui varie d'un exercice à l'autre, c'est le
 * contexte tiré dans la liste, jamais le contenu d'un contexte.
 *
 * CE QUI RESTE CALCULÉ
 *
 * Les FORMES, et elles seules : la déclinaison de l'adjectif long est un
 * système fermé et régulier (lib/grammar/decline-adjective.ts, vérifié
 * forme par forme par `npm run check:grammar`), et le nom vient du
 * dictionnaire. Écrire les formes à la main n'ajouterait que des fautes de
 * frappe. Un contexte ne fournit donc que le cadre de phrase, sa traduction
 * et son explication.
 */

export const ADJECTIVE_SKILLS = [
  {
    id: "nominative",
    title: "L'accord de base",
    level: "A1",
    summary:
      "Un adjectif russe prend le genre et le nombre de son nom : но́вый дом, но́вая кни́га, но́вое письмо́. Trois désinences là où le français en a deux.",
  },
  {
    id: "spelling",
    title: "Radical dur, mou, mixte",
    level: "A2",
    summary:
      "Ру́сский et non « ру́сскый » : après г к х ж ч ш щ, jamais ы — c'est la règle des 7 lettres. Et après ж ч ш щ non accentués, о devient е (хоро́шее). Les désinences ne changent pas, leur orthographe si.",
  },
  {
    id: "accusative",
    title: "L'accusatif animé",
    level: "A2",
    summary:
      "Я ви́жу но́вый стол, mais я ви́жу но́вого студе́нта. Au masculin singulier, l'accusatif copie le nominatif pour un objet et le génitif pour un être vivant. Au féminin, -ую dans les deux cas.",
  },
  {
    id: "oblique",
    title: "Les cas obliques",
    level: "B1",
    summary:
      "Génitif, datif, instrumental, prépositionnel : -ого, -ому, -ым, -ом au masculin et au neutre — et une seule forme, -ой, pour les quatre au féminin.",
  },
  {
    id: "plural",
    title: "Le pluriel",
    level: "B1",
    summary:
      "Au pluriel le genre disparaît : но́вые дома́, но́вые кни́ги, но́вые о́кна. Six formes à retenir au lieu de dix-huit — le pluriel est la partie facile.",
  },
] as const;

export type AdjectiveSkillId = (typeof ADJECTIVE_SKILLS)[number]["id"];

export function getSkill(id: string) {
  return ADJECTIVE_SKILLS.find((s) => s.id === id);
}

/**
 * Un contexte : une phrase écrite à la main autour d'un couple adjectif +
 * nom choisi pour lui.
 *
 * `ru` porte deux marques : `___` pour l'adjectif à trouver, `{N}` pour le
 * nom, inséré décliné et accentué depuis le dictionnaire. Écrire le nom
 * fléchi à la main dans la phrase rouvrirait la porte aux fautes que la
 * banque existe précisément pour fermer.
 */
interface AdjectiveContext {
  id: string;
  /** Identifiant dans lib/grammar/adjectives-data.ts. */
  adjective: string;
  /** Identifiant dans la banque de noms. */
  noun: string;
  case: CaseId;
  plural?: boolean;
  ru: string;
  fr: string;
  why: string;
}

// ─── 1. L'accord de base (nominatif singulier) ─────────────────────
const NOMINATIVE_CONTEXTS: AdjectiveContext[] = [
  {
    id: "novyy-dom",
    adjective: "novyy", noun: "dom", case: "nominative",
    ru: "На на́шей у́лице ___ {N}.",
    fr: "Il y a une maison neuve dans notre rue.",
    why: "Дом est masculin : l'adjectif prend -ый, la désinence du dictionnaire.",
  },
  {
    id: "novyy-kniga",
    adjective: "novyy", noun: "kniga", case: "nominative",
    ru: "На столе́ ___ {N}.",
    fr: "Il y a un livre neuf sur la table.",
    why: "Кни́га est féminin : -ая. Peu importe que « livre » soit masculin en français, c'est le genre RUSSE qui commande.",
  },
  {
    id: "staryy-pismo",
    adjective: "staryy", noun: "pismo", case: "nominative",
    ru: "В я́щике лежи́т ___ {N}.",
    fr: "Une vieille lettre est rangée dans le tiroir.",
    why: "Письмо́ est neutre : -ое. Le français n'a pas ce troisième genre, c'est la case qu'on oublie.",
  },
  {
    id: "krasivyy-gorod",
    adjective: "krasivyy", noun: "gorod", case: "nominative",
    ru: "Э́то ___ {N}.",
    fr: "C'est une belle ville.",
    why: "Го́род est masculin : -ый. Après « э́то », l'attribut reste au nominatif.",
  },
  {
    id: "interesnyy-istoriya",
    adjective: "interesnyy", noun: "istoriya", case: "nominative",
    ru: "Э́то ___ {N}.",
    fr: "C'est une histoire intéressante.",
    why: "Исто́рия est féminin : -ая.",
  },
  {
    id: "interesnyy-film",
    adjective: "interesnyy", noun: "film", case: "nominative",
    ru: "Вчера́ был ___ {N}.",
    fr: "Hier il y avait un film intéressant.",
    why: "Фильм est masculin : -ый.",
  },
  {
    id: "umnyy-student",
    adjective: "umnyy", noun: "student", case: "nominative",
    ru: "Он ___ {N}.",
    fr: "C'est un étudiant intelligent.",
    why: "Студе́нт est masculin : -ый. L'animacité ne change rien au nominatif.",
  },
  {
    id: "molodoy-vrach",
    adjective: "molodoy", noun: "vrach", case: "nominative",
    ru: "В на́шей поликли́нике ___ {N}.",
    fr: "Il y a un jeune médecin dans notre dispensaire.",
    why: "Молодо́й porte l'accent sur la désinence : au masculin elle s'écrit -ой, jamais -ый.",
  },
  {
    id: "tyoplyy-leto",
    adjective: "tyoplyy", noun: "leto", case: "nominative",
    ru: "Э́то бы́ло ___ {N}.",
    fr: "C'était un été chaud.",
    why: "Ле́то est neutre : -ое.",
  },
  {
    id: "kholodnyy-zima",
    adjective: "kholodnyy", noun: "zima", case: "nominative",
    ru: "В Сиби́ри ___ {N}.",
    fr: "En Sibérie l'hiver est froid.",
    why: "Зима́ est féminin : -ая.",
  },
  {
    id: "staryy-derevo",
    adjective: "staryy", noun: "derevo", case: "nominative",
    ru: "В саду́ растёт ___ {N}.",
    fr: "Un vieil arbre pousse dans le jardin.",
    why: "Де́рево est neutre : -ое. Le neutre est la case que le français fait oublier.",
  },
  {
    id: "vkusnyy-sup",
    adjective: "vkusnyy", noun: "sup", case: "nominative",
    ru: "На обе́д был ___ {N}.",
    fr: "Au déjeuner il y avait une soupe délicieuse.",
    why: "Суп est masculin en russe : -ый, même si « soupe » est féminin en français.",
  },
];

// ─── 2. Radical dur, mou, mixte ────────────────────────────────────
const SPELLING_CONTEXTS: AdjectiveContext[] = [
  {
    id: "russkiy-yazyk",
    adjective: "russkiy", noun: "yazyk", case: "nominative",
    ru: "___ {N} о́чень краси́вый.",
    fr: "La langue russe est très belle.",
    why: "Radical en -к : la règle des 7 lettres interdit ы, on écrit -ий. La désinence est bien celle des durs, seule son orthographe change.",
  },
  {
    id: "malenkiy-stol",
    adjective: "malenkiy", noun: "stol", case: "nominative",
    ru: "В углу́ стои́т ___ {N}.",
    fr: "Il y a une petite table dans le coin.",
    why: "Même règle : по́сле -к, -ий et non -ый.",
  },
  {
    id: "khoroshiy-den",
    adjective: "khoroshiy", noun: "den", case: "nominative",
    ru: "Сего́дня ___ {N}.",
    fr: "Aujourd'hui c'est une bonne journée.",
    why: "Radical en -ш : -ий par la règle des 7 lettres.",
  },
  {
    id: "khoroshiy-mesto",
    adjective: "khoroshiy", noun: "mesto", case: "nominative",
    ru: "Э́то ___ {N} для пикника́.",
    fr: "C'est un bon endroit pour un pique-nique.",
    why: "Règle des 5 lettres : après ж ч ш щ non accentués, о devient е — хоро́шее, pas « хоро́шое ».",
  },
  {
    id: "bolshoy-okno-spelling",
    adjective: "bolshoy", noun: "okno", case: "nominative",
    ru: "В за́ле ___ {N}.",
    fr: "Il y a une grande fenêtre dans la salle.",
    why: "Radical en -ш aussi, mais l'accent tombe sur la désinence : la règle des 5 lettres ne s'applique pas, on garde -ое. À comparer avec хоро́шее.",
  },
  {
    id: "siniy-plate",
    adjective: "siniy", noun: "plate", case: "nominative",
    ru: "На ней ___ {N}.",
    fr: "Elle porte une robe bleue.",
    why: "Си́ний est un vrai radical mou : il a sa propre série, -ий / -яя / -ее / -ие. Ce n'est pas une correction orthographique, c'est une autre table.",
  },
  {
    id: "siniy-kniga",
    adjective: "siniy", noun: "kniga", case: "nominative",
    ru: "На по́лке ___ {N}.",
    fr: "Il y a un livre bleu sur l'étagère.",
    why: "Féminin d'un radical mou : -яя, jamais -ая.",
  },
  {
    id: "domashniy-rabota",
    adjective: "domashniy", noun: "rabota", case: "nominative",
    ru: "Э́то ___ {N}.",
    fr: "C'est un travail à la maison.",
    why: "Дома́шний est mou lui aussi : -яя au féminin.",
  },
  {
    id: "russkiy-yazyk-instr",
    adjective: "russkiy", noun: "yazyk", case: "instrumental",
    ru: "Он свобо́дно владе́ет ___ {N}.",
    fr: "Il maîtrise couramment la langue russe.",
    why: "La règle des 7 lettres vaut à tous les cas : l'instrumental -ым devient -им après -к.",
  },
  {
    id: "khoroshiy-drug-instr",
    adjective: "khoroshiy", noun: "drug", case: "instrumental",
    ru: "Он всегда́ был ___ {N}.",
    fr: "Il a toujours été un bon ami.",
    why: "Après -ш, -ым devient -им.",
  },
  {
    id: "yarkiy-tsvetok",
    adjective: "yarkiy", noun: "tsvetok", case: "nominative",
    ru: "В саду́ расцвёл ___ {N}.",
    fr: "Une fleur éclatante s'est ouverte dans le jardin.",
    why: "Radical en -к : -ий.",
    },
  {
    id: "malenkiy-sobaka",
    adjective: "malenkiy", noun: "sobaka", case: "nominative",
    ru: "У сосе́да ___ {N}.",
    fr: "Le voisin a un petit chien.",
    why: "Au féminin, -ая s'écrit normalement : la règle des 7 lettres ne concerne que les désinences contenant ы.",
  },
];

// ─── 3. L'accusatif animé ──────────────────────────────────────────
const ACCUSATIVE_CONTEXTS: AdjectiveContext[] = [
  {
    id: "novyy-stol-acc",
    adjective: "novyy", noun: "stol", case: "accusative",
    ru: "Мы купи́ли ___ {N}.",
    fr: "Nous avons acheté une table neuve.",
    why: "Стол est un objet : à l'accusatif masculin, l'adjectif copie le nominatif.",
  },
  {
    id: "novyy-student-acc",
    adjective: "novyy", noun: "student", case: "accusative",
    ru: "Я ви́жу ___ {N}.",
    fr: "Je vois le nouvel étudiant.",
    why: "Студе́нт est animé : à l'accusatif masculin, l'adjectif copie le GÉNITIF, -ого.",
  },
  {
    id: "staryy-drug-acc",
    adjective: "staryy", noun: "drug", case: "accusative",
    ru: "Вчера́ я встре́тил ___ {N}.",
    fr: "Hier j'ai croisé un vieil ami.",
    why: "Друг est animé : -ого.",
  },
  {
    id: "staryy-dom-acc",
    adjective: "staryy", noun: "dom", case: "accusative",
    ru: "Отсю́да мы ви́дим ___ {N}.",
    fr: "D'ici nous voyons la vieille maison.",
    why: "Дом est un objet : accusatif = nominatif. Le même verbe « voir » ne change rien — c'est le nom qui décide, pas le verbe.",
  },
  {
    id: "krasivyy-mashina-acc",
    adjective: "krasivyy", noun: "mashina", case: "accusative",
    ru: "Он купи́л ___ {N}.",
    fr: "Il a acheté une belle voiture.",
    why: "Au féminin, l'accusatif a sa forme propre : -ую.",
  },
  {
    id: "malenkiy-sobaka-acc",
    adjective: "malenkiy", noun: "sobaka", case: "accusative",
    ru: "Я ви́жу ___ {N}.",
    fr: "Je vois le petit chien.",
    why: "Соба́ка est animé, mais au féminin ça ne change rien : -ую dans les deux cas. L'opposition animé/inanimé ne joue qu'au masculin singulier.",
  },
  {
    id: "molodoy-vrach-acc",
    adjective: "molodoy", noun: "vrach", case: "accusative",
    ru: "Мы до́лго жда́ли ___ {N}.",
    fr: "Nous avons longtemps attendu le jeune médecin.",
    why: "Врач est animé : -ого. L'accent sur la désinence donne молодо́го.",
  },
  {
    id: "bolshoy-okno-acc",
    adjective: "bolshoy", noun: "okno", case: "accusative",
    ru: "Она́ откры́ла ___ {N}.",
    fr: "Elle a ouvert la grande fenêtre.",
    why: "Au neutre, l'accusatif copie toujours le nominatif.",
  },
  {
    id: "interesnyy-kniga-acc",
    adjective: "interesnyy", noun: "kniga", case: "accusative",
    ru: "Я чита́ю ___ {N}.",
    fr: "Je lis un livre intéressant.",
    why: "Féminin : -ую.",
  },
  {
    id: "umnyy-sosed-acc",
    adjective: "umnyy", noun: "sosed", case: "accusative",
    ru: "Все зна́ют ___ {N}.",
    fr: "Tout le monde connaît le voisin intelligent.",
    why: "Сосе́д est animé : -ого.",
  },
  {
    id: "vkusnyy-pirog-acc",
    adjective: "vkusnyy", noun: "pirog", case: "accusative",
    ru: "Она́ испекла́ ___ {N}.",
    fr: "Elle a fait une tarte délicieuse.",
    why: "Пиро́г est un objet : accusatif = nominatif.",
  },
  {
    id: "dorogoy-podarok-acc",
    adjective: "dorogoy", noun: "podarok", case: "accusative",
    ru: "Он получи́л ___ {N}.",
    fr: "Il a reçu un cadeau coûteux.",
    why: "Пода́рок est un objet : accusatif = nominatif, et l'accent sur la désinence donne дорого́й.",
  },
];

// ─── 4. Les cas obliques ───────────────────────────────────────────
const OBLIQUE_CONTEXTS: AdjectiveContext[] = [
  {
    id: "novyy-dom-gen",
    adjective: "novyy", noun: "dom", case: "genitive",
    ru: "Мы живём недалеко́ от ___ {N}.",
    fr: "Nous habitons non loin de la maison neuve.",
    why: "Génitif masculin : -ого.",
  },
  {
    id: "staryy-kniga-gen",
    adjective: "staryy", noun: "kniga", case: "genitive",
    ru: "Э́то страни́ца из ___ {N}.",
    fr: "C'est une page tirée d'un vieux livre.",
    why: "Génitif féminin : -ой. Au féminin, une seule forme couvre génitif, datif, instrumental et prépositionnel.",
  },
  {
    id: "krasivyy-plate-gen",
    adjective: "krasivyy", noun: "plate", case: "genitive",
    ru: "Цвет ___ {N} мне о́чень нра́вится.",
    fr: "La couleur de la belle robe me plaît beaucoup.",
    why: "Le neutre suit le masculin aux cas obliques : -ого.",
  },
  {
    id: "khoroshiy-drug-dat",
    adjective: "khoroshiy", noun: "drug", case: "dative",
    ru: "Я пишу́ ___ {N}.",
    fr: "J'écris à un bon ami.",
    why: "Datif masculin : -ому, écrit -ему après ш non accentué (règle des 5 lettres).",
  },
  {
    id: "molodoy-aktrisa-dat",
    adjective: "molodoy", noun: "aktrisa", case: "dative",
    ru: "Режиссёр объясня́ет роль ___ {N}.",
    fr: "Le réalisateur explique le rôle à la jeune actrice.",
    why: "Datif féminin : -ой, comme le génitif.",
  },
  {
    id: "malenkiy-okno-prep",
    adjective: "malenkiy", noun: "okno", case: "prepositional",
    ru: "Кот спит на ___ {N}.",
    fr: "Le chat dort sur la petite fenêtre.",
    why: "Prépositionnel neutre : -ом, écrit -ем après un radical mou ou une chuintante non accentuée.",
  },
  {
    id: "bolshoy-gorod-prep",
    adjective: "bolshoy", noun: "gorod", case: "prepositional",
    ru: "Мы говори́м о ___ {N}.",
    fr: "Nous parlons d'une grande ville.",
    why: "Prépositionnel masculin : -ом.",
  },
  {
    id: "tyoplyy-strana-prep",
    adjective: "tyoplyy", noun: "strana", case: "prepositional",
    ru: "Они́ живу́т в ___ {N}.",
    fr: "Ils vivent dans un pays chaud.",
    why: "Prépositionnel féminin : -ой, encore la même forme.",
  },
  {
    id: "novyy-telefon-instr",
    adjective: "novyy", noun: "telefon", case: "instrumental",
    ru: "Она́ фотографи́рует ___ {N}.",
    fr: "Elle prend des photos avec son téléphone neuf.",
    why: "Instrumental masculin : -ым.",
  },
  {
    id: "interesnyy-rabota-instr",
    adjective: "interesnyy", noun: "rabota", case: "instrumental",
    ru: "Он за́нят ___ {N}.",
    fr: "Il est pris par un travail intéressant.",
    why: "Instrumental féminin : -ой — la quatrième et dernière fois que cette forme sert.",
  },
  {
    id: "umnyy-chelovek-instr",
    adjective: "umnyy", noun: "chelovek", case: "instrumental",
    ru: "Его́ счита́ют ___ {N}.",
    fr: "On le tient pour quelqu'un d'intelligent.",
    why: "Instrumental masculin : -ым. Après « счита́ть », l'attribut passe à l'instrumental.",
  },
  {
    id: "dorogoy-podarok-gen",
    adjective: "dorogoy", noun: "podarok", case: "genitive",
    ru: "Он не хо́чет тако́го ___ {N}.",
    fr: "Il ne veut pas d'un cadeau aussi coûteux.",
    why: "Génitif masculin : -ого. L'accent sur la désinence donne дорого́го.",
  },
];

// ─── 5. Le pluriel ─────────────────────────────────────────────────
const PLURAL_CONTEXTS: AdjectiveContext[] = [
  {
    id: "novyy-dom-pl",
    adjective: "novyy", noun: "dom", case: "nominative", plural: true,
    ru: "На э́той у́лице ___ {N}.",
    fr: "Il y a des maisons neuves dans cette rue.",
    why: "Pluriel : -ые, quel que soit le genre.",
  },
  {
    id: "novyy-kniga-pl",
    adjective: "novyy", noun: "kniga", case: "nominative", plural: true,
    ru: "На по́лке ___ {N}.",
    fr: "Il y a des livres neufs sur l'étagère.",
    why: "Féminin au pluriel : -ые aussi. Le genre disparaît.",
  },
  {
    id: "novyy-okno-pl",
    adjective: "novyy", noun: "okno", case: "nominative", plural: true,
    ru: "В до́ме ___ {N}.",
    fr: "La maison a des fenêtres neuves.",
    why: "Neutre au pluriel : -ые, comme les deux autres.",
  },
  {
    id: "malenkiy-sobaka-pl",
    adjective: "malenkiy", noun: "sobaka", case: "nominative", plural: true,
    ru: "Во дворе́ ___ {N}.",
    fr: "Il y a des petits chiens dans la cour.",
    why: "Règle des 7 lettres au pluriel : -ые devient -ие après -к.",
  },
  {
    id: "russkiy-kniga-pl",
    adjective: "russkiy", noun: "kniga", case: "nominative", plural: true,
    ru: "Э́то ___ {N}.",
    fr: "Ce sont des livres russes.",
    why: "Même règle : -ие après -к.",
  },
  {
    id: "molodoy-vrach-pl",
    adjective: "molodoy", noun: "vrach", case: "nominative", plural: true,
    ru: "В больни́це рабо́тают ___ {N}.",
    fr: "De jeunes médecins travaillent à l'hôpital.",
    why: "Pluriel : -ые. L'accent sur la désinence ne se voit qu'au masculin singulier.",
  },
  {
    id: "staryy-drug-pl-acc",
    adjective: "staryy", noun: "drug", case: "accusative", plural: true,
    ru: "Я ча́сто ви́жу ___ {N}.",
    fr: "Je vois souvent de vieux amis.",
    why: "Animé au pluriel : l'accusatif copie le génitif, -ых. La règle du masculin singulier s'étend à TOUS les genres au pluriel.",
  },
  {
    id: "staryy-stol-pl-acc",
    adjective: "staryy", noun: "stol", case: "accusative", plural: true,
    ru: "Мы продаём ___ {N}.",
    fr: "Nous vendons de vieilles tables.",
    why: "Inanimé au pluriel : l'accusatif copie le nominatif, -ые.",
  },
  {
    id: "interesnyy-film-pl-gen",
    adjective: "interesnyy", noun: "film", case: "genitive", plural: true,
    ru: "Я посмотре́л мно́го ___ {N}.",
    fr: "J'ai vu beaucoup de films intéressants.",
    why: "Génitif pluriel : -ых.",
  },
  {
    id: "khoroshiy-student-pl-dat",
    adjective: "khoroshiy", noun: "student", case: "dative", plural: true,
    ru: "Преподава́тель помога́ет ___ {N}.",
    fr: "Le professeur aide les bons étudiants.",
    why: "Datif pluriel : -ым, écrit -им après -ш.",
  },
  {
    id: "krasivyy-tsvetok-pl-instr",
    adjective: "krasivyy", noun: "tsvetok", case: "instrumental", plural: true,
    ru: "Стол укра́шен ___ {N}.",
    fr: "La table est décorée de belles fleurs.",
    why: "Instrumental pluriel : -ыми.",
  },
  {
    id: "bolshoy-gorod-pl-prep",
    adjective: "bolshoy", noun: "gorod", case: "prepositional", plural: true,
    ru: "Мы говори́м о ___ {N}.",
    fr: "Nous parlons de grandes villes.",
    why: "Prépositionnel pluriel : -ых, identique au génitif.",
  },
];

const CONTEXTS: Record<AdjectiveSkillId, AdjectiveContext[]> = {
  nominative: NOMINATIVE_CONTEXTS,
  spelling: SPELLING_CONTEXTS,
  accusative: ACCUSATIVE_CONTEXTS,
  oblique: OBLIQUE_CONTEXTS,
  plural: PLURAL_CONTEXTS,
};

// Les contextes écrits à la construction s'ajoutent aux douze écrits à la
// main, qui restent en tête et donnent le style. Douze par compétence
// plafonnaient le module à soixante exercices, à vie : c'est le nombre de
// contextes, et lui seul, qui borne ce qu'un apprenant peut voir ici.
for (const skill of Object.keys(CONTEXTS) as AdjectiveSkillId[]) {
  CONTEXTS[skill] = [...CONTEXTS[skill], ...(ADJECTIVE_CONTEXTS_EXTRA[skill] ?? [])];
}

export interface AdjectiveExercise {
  skill: AdjectiveSkillId;
  itemId: string;
  /** Phrase russe, nom déjà décliné, `___` à la place de l'adjectif. */
  sentence: string;
  sentenceFr: string;
  /** Le nom qualifié, en clair, avec son genre — ce sur quoi on accorde. */
  nounLabel: string;
  /**
   * L'adjectif à accorder, à la forme du dictionnaire : « но́вый ». En mode
   * « Écrire », rien d'autre ne le nommait — la traduction française le
   * laissait deviner, et l'exercice devenait une question de vocabulaire.
   */
  lemma: string;
  options: string[];
  correctIndex: number;
  explain: string;
  /** La case du tableau que chaque mauvaise option occupe — voir `whyNotFor`. */
  whyNot?: Record<string, string>;
}

type Rng = () => number;

const GENDER_LABEL: Record<Gender, string> = {
  masculine: "masculin",
  feminine: "féminin",
  neuter: "neutre",
};

const CASE_LABEL: Record<CaseId, string> = {
  nominative: "nominatif",
  genitive: "génitif",
  dative: "datif",
  accusative: "accusatif",
  instrumental: "instrumental",
  prepositional: "prépositionnel",
};

const GENDERS: Gender[] = ["masculine", "feminine", "neuter"];

/** « génitif », « génitif ou datif », « génitif, datif ou prépositionnel ». */
function orList(words: string[]): string {
  return words.length <= 1
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} ou ${words[words.length - 1]}`;
}

/**
 * Toutes les cases du tableau qu'une forme occupe, pour ce nom.
 *
 * POURQUOI TOUTES. Une désinence d'adjectif en couvre souvent plusieurs :
 * « но́вой » est à la fois génitif, datif, instrumental et prépositionnel
 * féminin. Dire à quelqu'un qui l'a choisie « c'est le datif » serait
 * vrai et trompeur à la fois — il a peut-être pensé génitif. On nomme donc
 * la ligne entière, genres fusionnés quand ils partagent les mêmes cas
 * (« masculin et neutre »), et le genre omis quand les trois coïncident.
 *
 * L'animacité du nom est gardée : c'est elle qui décide si l'accusatif
 * masculin copie le nominatif ou le génitif.
 */
function paradigmCells(
  adjective: NonNullable<ReturnType<typeof getAdjective>>,
  form: string,
  animacy: "animate" | "inanimate"
): string {
  const singular = new Map<Gender, CaseId[]>();
  const plural: CaseId[] = [];
  for (const c of CASE_ORDER) {
    for (const g of GENDERS) {
      if (declineAdjective(adjective, c, g, false, animacy).accented === form) {
        singular.set(g, [...(singular.get(g) ?? []), c]);
      }
    }
    if (declineAdjective(adjective, c, "masculine", true, animacy).accented === form) plural.push(c);
  }

  const groups = new Map<string, { cases: CaseId[]; genders: Gender[] }>();
  for (const [gender, cases] of singular) {
    const key = cases.join(",");
    const group = groups.get(key) ?? { cases, genders: [] };
    group.genders.push(gender);
    groups.set(key, group);
  }

  const parts = [...groups.values()].map(({ cases, genders }) => {
    const who =
      genders.length === GENDERS.length
        ? ""
        : ` ${genders.map((g) => GENDER_LABEL[g]).join(" et ")}`;
    return `${orList(cases.map((c) => CASE_LABEL[c]))}${who} singulier`;
  });
  if (plural.length > 0) parts.push(`${orList(plural.map((c) => CASE_LABEL[c]))} pluriel`);
  return parts.join(" ; ");
}

/** Résout un contexte : formes calculées, phrase montée. Null si un id ment. */
function resolve(context: AdjectiveContext) {
  const adjective = getAdjective(context.adjective);
  const noun = getNoun(context.noun);
  if (!adjective || !noun) return null;
  const plural = context.plural ?? false;
  const adjResult = declineAdjective(adjective, context.case, noun.gender, plural, noun.animacy);
  const nounResult = declineNoun(noun, context.case, plural);
  return { adjective, noun, plural, adjResult, nounResult };
}

/**
 * Distracteurs : d'AUTRES formes du même adjectif.
 *
 * Un distracteur pris sur un autre adjectif se rejetterait sur le sens, pas
 * sur l'accord — l'apprenant répondrait juste sans avoir rien décliné. En
 * restant dans un seul paradigme, les quatre options ne diffèrent que par la
 * désinence, ce qui est exactement la compétence testée.
 */
function distractors(
  context: AdjectiveContext,
  correct: string,
  random: Rng
): string[] {
  const resolved = resolve(context);
  if (!resolved) return [];
  const { adjective, noun, plural } = resolved;

  const variants: string[] = [];
  const cases: CaseId[] = [
    "nominative", "genitive", "dative", "accusative", "instrumental", "prepositional",
  ];
  // Même case du tableau, autre cas — puis autre genre, puis l'autre nombre.
  for (const c of cases) {
    variants.push(declineAdjective(adjective, c, noun.gender, plural, noun.animacy).accented);
  }
  for (const g of ["masculine", "feminine", "neuter"] as Gender[]) {
    variants.push(declineAdjective(adjective, context.case, g, plural, noun.animacy).accented);
  }
  variants.push(
    declineAdjective(adjective, context.case, noun.gender, !plural, noun.animacy).accented
  );

  const unique = [...new Set(variants)].filter((f) => f !== correct);
  for (let i = unique.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [unique[i], unique[j]] = [unique[j], unique[i]];
  }
  return unique.slice(0, 3);
}

export function generateAdjectiveExercise(
  skill: AdjectiveSkillId,
  random: Rng = Math.random,
  /** Contexte imposé : c'est ce qui permet `rebuildAdjectiveExercise`. */
  forced?: AdjectiveContext
): AdjectiveExercise {
  const pool = CONTEXTS[skill];
  const context = forced ?? pool[Math.floor(random() * pool.length)];
  const resolved = resolve(context);
  // `resolve` ne peut échouer que sur un identifiant faux, ce que
  // `npm run check:adjectives` interdit avant toute exécution.
  if (!resolved) throw new Error(`Contexte invalide : ${context.id}`);
  const { adjective, noun, plural, adjResult, nounResult } = resolved;

  // La forme ACCENTUÉE : la phrase au-dessus l'est (« На на́шей у́лице ___
  // дом. »), et des boutons nus juste en dessous donnaient deux
  // typographies dans un même écran. L'accent n'est jamais exigé de
  // l'apprenant — la correction le retire des deux côtés.
  const correct = adjResult.accented;
  const options = [correct, ...distractors(context, correct, random)];
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }

  return {
    skill,
    itemId: `${skill}:${context.id}`,
    sentence: context.ru.replace("{N}", nounResult.accented),
    lemma: adjective.lemmaM,
    sentenceFr: context.fr,
    nounLabel: `${nounResult.accented} — ${GENDER_LABEL[noun.gender]}${
      plural ? " pluriel" : " singulier"
    }${noun.animacy === "animate" ? ", animé" : ""}`,
    options,
    correctIndex: options.indexOf(correct),
    explain: context.why,
    whyNot: whyNotFor(
      options,
      correct,
      options.map((option) => {
        const cells = paradigmCells(adjective, option, noun.animacy);
        // « forme DE L'instrumental », « forme DU génitif » : l'élision suit
        // le premier cas nommé.
        return [option, `forme ${/^[aeiouy]/.test(cells) ? "de l'" : "du "}${cells}`];
      })
    ),
  };
}

/** L'exercice exact qu'un identifiant désigne, options remélangées — pour « Mes erreurs ». */
export function rebuildAdjectiveExercise(
  itemId: string,
  random: Rng = Math.random
): AdjectiveExercise | null {
  const [skill, id] = itemId.split(":");
  const context = CONTEXTS[skill as AdjectiveSkillId]?.find((c) => c.id === id);
  if (!context || !resolve(context)) return null;
  return generateAdjectiveExercise(skill as AdjectiveSkillId, random, context);
}

/** Rejoue la correction côté serveur, à partir du seul identifiant d'item. */
export function checkAdjectiveAnswer(itemId: string, answer: string): boolean | null {
  const [skill, id] = itemId.split(":");
  const pool = CONTEXTS[skill as AdjectiveSkillId];
  if (!pool) return null;
  const context = pool.find((c) => c.id === id);
  if (!context) return null;
  const resolved = resolve(context);
  if (!resolved) return null;
  // Comparaison sans accent, sans casse et sans ё : l'apprenant clique une
  // option accentuée, ou TAPE la forme — et personne ne tape l'accent. Les
  // formes d'un même adjectif diffèrent toutes par leur désinence, jamais par
  // leur seul accent : cette tolérance ne fait accepter aucun leurre, ce que
  // check:adjectives vérifie sur chaque contexte.
  return normalizeTyped(stripAccent(resolved.adjResult.accented)) === normalizeTyped(answer);
}

export { CONTEXTS as ADJECTIVE_CONTEXTS };
export type { AdjectiveContext };
