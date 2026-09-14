"use client";

import { SrsCard, createNewCard } from "./srs/sm2";

// La progression du module "Cas" n'est PAS ici : elle vit uniquement côté
// serveur (app/api/cases/attempt). Un double stockage local + base donnait
// deux compteurs qui divergeaient (l'écran disait "juste", la base "faux"),
// pour un mode hors-ligne qui n'existe pas — /cases exige un compte.
const KEYS = {
  srs: "ru-app:srs-cards",
  direction: "ru-app:vocab-direction", // + `:${mode}`
  addWordFirstSide: "ru-app:add-word-first-side",
  coursesRead: "ru-app:courses-read",
  lastVocabList: "ru-app:vocab-last-list",
  caseNumber: "ru-app:case-number",
  recentDraws: "ru-app:practice-recent",
  answerMode: "ru-app:answer-mode", // + `:${module}`
};

/** Exposée pour lib/courses/use-read-lessons.ts, qui lit le brut sans le parser. */
export const COURSES_READ_KEY = KEYS.coursesRead;

// --- SRS (vocabulaire) ---

export function loadSrsCards(): Record<string, SrsCard> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEYS.srs);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveSrsCards(cards: Record<string, SrsCard>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEYS.srs, JSON.stringify(cards));
}

export function getOrCreateCard(cards: Record<string, SrsCard>, id: string): SrsCard {
  return cards[id] ?? createNewCard(id);
}

// --- Sens de révision du vocabulaire (carte, frappe, QCM, voix) ---
// "ru-first" = le mot russe est montré en premier, la réponse est en
// français ; "fr-first" = l'inverse. Préférence par mode d'exercice.

export type VocabMode = "flashcards" | "typing" | "voice" | "qcm";
export type VocabDirection = "ru-first" | "fr-first";

export function loadDirection(mode: VocabMode, fallback: VocabDirection): VocabDirection {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(`${KEYS.direction}:${mode}`);
    return raw === "ru-first" || raw === "fr-first" ? raw : fallback;
  } catch {
    return fallback;
  }
}

export function saveDirection(mode: VocabMode, direction: VocabDirection) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${KEYS.direction}:${mode}`, direction);
}

// --- Exercices : choisir la réponse, ou l'écrire ---
//
// Même statut que le sens de révision : une façon de travailler, gardée par
// module sur l'appareil. Quelqu'un qui a choisi d'écrire ses conjugaisons ne
// doit pas le redemander à chaque compétence.

export type AnswerMode = "choice" | "typing";

export function loadAnswerMode(scope: string): AnswerMode {
  if (typeof window === "undefined") return "choice";
  try {
    return localStorage.getItem(`${KEYS.answerMode}:${scope}`) === "typing" ? "typing" : "choice";
  } catch {
    return "choice";
  }
}

export function saveAnswerMode(scope: string, mode: AnswerMode) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${KEYS.answerMode}:${scope}`, mode);
  } catch {}
}

// --- Formulaire d'ajout : quelle langue en premier ---
//
// Purement visuel : l'ordre des deux champs, pas le sens de la traduction.
// Quelqu'un qui part systématiquement du français ne doit pas le redire à
// chaque mot.

export function loadAddWordFirstSide(): "ru" | "fr" {
  if (typeof window === "undefined") return "ru";
  try {
    return localStorage.getItem(KEYS.addWordFirstSide) === "fr" ? "fr" : "ru";
  } catch {
    // Stockage refusé (navigation privée, cookies bloqués) : le russe
    // d'abord, ce n'est qu'une préférence d'affichage.
    return "ru";
  }
}

export function saveAddWordFirstSide(side: "ru" | "fr") {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEYS.addWordFirstSide, side);
  } catch {}
}

// --- Vocabulaire : la dernière liste ouverte ---
//
// UN MARQUE-PAGE, PAS UNE SÉLECTION. Sous 1024 px le module est deux écrans
// successifs — les listes, puis la liste ouverte — et revenir de n'importe
// quelle autre page ramenait toujours au premier : on repartait de la
// sélection des listes après un aller-retour vers les cas ou la lecture,
// alors qu'on était en train de travailler une liste précise.
//
// Local et pas en base : c'est l'état d'un écran sur un appareil, pas une
// donnée d'apprentissage. Sur le téléphone et sur l'ordinateur, on n'est pas
// forcément au même endroit, et c'est très bien.

export function loadLastVocabList(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(KEYS.lastVocabList);
  } catch {
    return null;
  }
}

export function saveLastVocabList(listId: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (listId) localStorage.setItem(KEYS.lastVocabList, listId);
    else localStorage.removeItem(KEYS.lastVocabList);
  } catch {}
}

// --- Cours : leçons déjà lues ---
//
// Uniquement local, et volontairement : c'est un marque-page, pas une
// progression pédagogique. Rien n'en dépend (aucun calcul de niveau, aucun
// tirage d'exercice), donc rien ne justifie une table, une requête au
// chargement de la page, ni un compte obligatoire pour lire un cours.

export function loadReadLessons(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEYS.coursesRead);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function saveReadLessons(slugs: string[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEYS.coursesRead, JSON.stringify(slugs));
  } catch {
    // Quota plein ou stockage refusé : la lecture reste possible, seule la
    // coche est perdue. Rien à signaler à l'apprenant.
  }
}

// --- Cas : singulier, pluriel, ou les deux ---
//
// UNE FAÇON DE TRAVAILLER, PAS UN ÉTAT D'ÉCRAN. Quelqu'un qui révise les
// pluriels les révise sur les six cas, et sur plusieurs sessions : lui
// redemander à chaque page serait lui faire répéter une décision qu'il a
// déjà prise. Local plutôt qu'en base, pour la même raison que la liste de
// vocabulaire — c'est une préférence d'entraînement sur un appareil, pas
// une donnée d'apprentissage à synchroniser.

export type CaseNumberMode = "singular" | "plural" | "mixed";

export function loadCaseNumber(): CaseNumberMode {
  if (typeof window === "undefined") return "mixed";
  try {
    const raw = localStorage.getItem(KEYS.caseNumber);
    return raw === "singular" || raw === "plural" ? raw : "mixed";
  } catch {
    // Stockage refusé : « Mélange », qui est le mode le plus complet et le
    // seul dont personne n'a à se plaindre s'il arrive par défaut.
    return "mixed";
  }
}

export function saveCaseNumber(mode: CaseNumberMode) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEYS.caseNumber, mode);
  } catch {}
}

/**
 * La préférence exposée comme une source externe, pour `useSyncExternalStore`.
 *
 * POURQUOI PAS UN useState + useEffect. Lire localStorage au montage et
 * appeler setState dans l'effet, c'est un rendu jeté à chaque visite — et
 * la règle react-hooks/set-state-in-effect l'interdit, à raison. Un
 * initialiseur paresseux ne marche pas non plus : le serveur rend
 * « Mélange », le client lirait « Pluriel », et l'hydratation divergerait.
 *
 * useSyncExternalStore est fait exactement pour ça : un instantané serveur
 * (« Mélange »), un instantané client (le stockage), et React s'occupe du
 * raccord.
 */
const caseNumberListeners = new Set<() => void>();
let caseNumberCache: CaseNumberMode | null = null;

export function subscribeCaseNumber(onChange: () => void): () => void {
  caseNumberListeners.add(onChange);
  return () => {
    caseNumberListeners.delete(onChange);
  };
}

/** L'instantané client. Mis en cache : `getSnapshot` doit être stable entre deux rendus. */
export function getCaseNumber(): CaseNumberMode {
  if (caseNumberCache === null) caseNumberCache = loadCaseNumber();
  return caseNumberCache;
}

/** L'instantané serveur : aucun stockage à lire, donc le mode le plus complet. */
export function getCaseNumberOnServer(): CaseNumberMode {
  return "mixed";
}

export function setCaseNumber(mode: CaseNumberMode) {
  caseNumberCache = mode;
  saveCaseNumber(mode);
  for (const listener of caseNumberListeners) listener();
}

// --- Entraînement : ce qui vient d'être montré ---
//
// Un anneau d'identifiants par compétence, écrit à chaque tirage. Ce n'est
// ni une progression ni une préférence : c'est la mémoire courte du tirage,
// celle qui manquait pour que « Я рабо́таю на компью́тере » ne revienne pas
// trois fois de suite. Voir lib/practice/recent.ts pour la mécanique.
//
// Local et par appareil, comme le reste de ce fichier : rien ne dépend de
// cette donnée côté serveur, et deux appareils qui ne montrent pas les mêmes
// exercices au même moment, c'est sans conséquence.

/** Un tirage = les identifiants de l'exercice sorti. Le plus récent en fin de liste. */
export type RecentDraws = Record<string, string[][]>;

export function loadRecentDraws(): RecentDraws {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEYS.recentDraws);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    // Le contenu vient du disque : il peut avoir été écrit par une version
    // antérieure, ou trituré à la main. On garde ce qui a la bonne forme et
    // on jette le reste — un anneau vide ne coûte qu'une répétition.
    const clean: RecentDraws = {};
    for (const [key, ring] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(ring)) continue;
      clean[key] = ring.filter(
        (draw): draw is string[] =>
          Array.isArray(draw) && draw.every((id) => typeof id === "string")
      );
    }
    return clean;
  } catch {
    return {};
  }
}

export function saveRecentDraws(store: RecentDraws) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEYS.recentDraws, JSON.stringify(store));
  } catch {
    // Quota plein ou stockage refusé : le tirage redevient sans mémoire,
    // ce qui était l'état d'avant. Rien à signaler à l'apprenant.
  }
}
