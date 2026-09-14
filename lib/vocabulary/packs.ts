import { NOUNS } from "@/lib/grammar/nouns-data";
import { categoryOf, type NounCategory } from "@/lib/grammar/noun-categories";
import type { Animacy, FrenchGender, Gender, Noun } from "@/lib/grammar/types";

/**
 * Les paquets de départ : des listes toutes faites, tirées de la banque.
 *
 * LE VOCABULAIRE COMMENÇAIT VIDE. Toutes les listes étaient à écrire à la
 * main, mot par mot — alors que l'app porte 451 noms traduits, accentués,
 * classés par fréquence et par sens, dont chaque forme est vérifiée par
 * check:grammar. Un débutant arrivait devant « Crée ta première liste » sans
 * savoir quels mots valent la peine d'être appris en premier. C'est
 * précisément ce que la banque sait.
 *
 * DEUX FAÇONS DE DÉCOUPER. Par fréquence d'abord : les cinquante noms les plus
 * courants couvrent une part énorme de ce qu'on lit, et c'est par eux qu'il
 * faut commencer. Par thème ensuite, pour qui a un besoin précis — les gens,
 * la table, les lieux.
 *
 * L'ORDRE COMPTE. Les mots d'un paquet sont rangés du plus courant au plus
 * rare, et arrivent en révision dans cet ordre, dix nouveaux par jour (voir
 * lib/vocabulary/new-words.ts) : importer cent mots d'un coup ne noie pas
 * les révisions.
 */

export interface StarterPack {
  id: string;
  title: string;
  description: string;
  level: "A1" | "A2" | "B1";
  nouns: Noun[];
}

export interface PackWord {
  ru: string;
  fr: string;
  gender: Gender;
  animacy: Animacy;
  frenchGender: FrenchGender;
}

const BY_RANK = [...NOUNS].sort((a, b) => a.rank - b.rank);

function themed(categories: NounCategory[], size: number): Noun[] {
  return BY_RANK.filter((noun) => {
    const category = categoryOf(noun.id);
    return category !== undefined && categories.includes(category);
  }).slice(0, size);
}

export const STARTER_PACKS: StarterPack[] = [
  {
    id: "frequents-1",
    title: "Les 50 noms les plus courants",
    description: "Ceux qu'on croise dans presque chaque texte : le socle de tout le reste.",
    level: "A1",
    nouns: BY_RANK.slice(0, 50),
  },
  {
    id: "frequents-2",
    title: "Noms courants, 51 à 120",
    description: "La suite logique du premier paquet, toujours du plus fréquent au plus rare.",
    level: "A2",
    nouns: BY_RANK.slice(50, 120),
  },
  {
    id: "frequents-3",
    title: "Noms courants, 121 à 200",
    description: "Ce qui sépare un texte qu'on devine d'un texte qu'on comprend.",
    level: "B1",
    nouns: BY_RANK.slice(120, 200),
  },
  {
    id: "personnes",
    title: "Les gens",
    description: "Famille, métiers, relations : celles et ceux dont on parle.",
    level: "A1",
    nouns: themed(["human"], 40),
  },
  {
    id: "table",
    title: "À table",
    description: "Ce qu'on mange et ce qu'on boit.",
    level: "A1",
    nouns: themed(["food", "drink"], 40),
  },
  {
    id: "lieux",
    title: "Les lieux",
    description: "La ville, la maison, le pays : où l'on est, où l'on va.",
    level: "A1",
    nouns: themed(["place", "area"], 40),
  },
  {
    id: "temps",
    title: "Le temps qui passe",
    description: "Jours, saisons, moments : ce qui situe une phrase.",
    level: "A2",
    nouns: themed(["time"], 30),
  },
  {
    id: "objets",
    title: "Les choses",
    description: "Ce qu'on touche, porte, lit et range.",
    level: "A2",
    nouns: themed(["object", "text"], 40),
  },
  {
    id: "animaux",
    title: "Les animaux",
    description: "Des plus familiers aux plus sauvages.",
    level: "A2",
    nouns: themed(["animal"], 30),
  },
];

export function getPack(id: string): StarterPack | undefined {
  return STARTER_PACKS.find((pack) => pack.id === id);
}

/** Les mots d'un paquet tels qu'ils entrent dans une liste : accentués, genre connu. */
export function packWords(pack: StarterPack): PackWord[] {
  return pack.nouns.map((noun) => ({
    ru: noun.forms.singular[0],
    fr: noun.translation,
    gender: noun.gender,
    animacy: noun.animacy,
    frenchGender: noun.frenchGender,
  }));
}

/** Ce qu'on montre d'un paquet avant de l'ajouter — sans envoyer la banque au navigateur. */
export function packSummary(pack: StarterPack) {
  return {
    id: pack.id,
    title: pack.title,
    description: pack.description,
    level: pack.level,
    count: pack.nouns.length,
    preview: pack.nouns.slice(0, 6).map((noun) => noun.forms.singular[0]),
  };
}

export type PackSummary = ReturnType<typeof packSummary>;
