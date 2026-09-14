"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// Web Speech API : pas de types officiels dans lib.dom (encore expérimental
// hors Chromium). Déclarations minimales pour ce qu'on utilise réellement.
interface SpeechRecognitionResultLike {
  [index: number]: { transcript: string };
}
interface SpeechRecognitionEventLike {
  results: { [index: number]: SpeechRecognitionResultLike };
}
/** `error` porte le code du standard : "not-allowed", "no-speech", "network"… */
interface SpeechRecognitionErrorLike {
  error?: string;
}
interface SpeechRecognitionLike {
  lang: string;
  /** Faux : le moteur rend la main dès que la phrase est finie. */
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  /** Coupe sans attendre de résultat — sert au démontage. */
  abort(): void;
  onstart: (() => void) | null;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

/** Prononce un texte à voix haute. No-op silencieux si le navigateur ne le supporte pas. */
export function speak(text: string, lang: string, rate = 1) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel(); // n'empile pas les prononciations précédentes
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = rate;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Synthèse refusée (aucune voix, contexte restreint) : le silence plutôt
    // qu'une exception qui remonterait jusqu'au bouton.
  }
}

// ─── Prononciation : voix de synthèse professionnelle ───────────
//
// POURQUOI NE PAS S'EN TENIR AU NAVIGATEUR. `speechSynthesis` dépend des
// voix installées sur la machine. Sur la plupart des PC français, aucune
// voix russe ne l'est : le navigateur lit alors le cyrillique avec une
// voix française — « книга » devient « k-n-i-g-a » prononcé à la
// française — ou ne dit rien du tout. Pour une app dont la prononciation
// est un argument de vente, c'est le défaut le plus visible.
//
// L'audio vient donc du serveur (/api/tts, ElevenLabs), mis en cache
// globalement : un mot déjà synthétisé par n'importe quel apprenant est
// servi par le CDN, gratuitement et instantanément.

export type SpeechLang = "ru" | "fr";

/**
 * URL connue par (langue, texte). `null` = déjà tenté, indisponible : on ne
 * redemande pas. La langue fait partie de la clé parce que la voix en
 * dépend — sans elle, « merci » lu par la voix russe serait servi au
 * français.
 */
const audioUrls = new Map<string, string | null>();
/** Requêtes en cours, pour qu'un double-clic ne déclenche pas deux appels. */
const pending = new Map<string, Promise<string | null>>();
let currentAudio: HTMLAudioElement | null = null;

const keyOf = (lang: SpeechLang, text: string) => `${lang}|${text}`;

/**
 * « Une synthèse est-elle en cours ? », exposé comme un abonnement.
 *
 * POURQUOI PAS UN SIMPLE useState DANS LA PAGE. La lecture automatique de
 * la révision vocale part d'un `useEffect` : y poser un setState place une
 * mise à jour dans le corps synchrone de l'effet, ce que React déconseille
 * (rendus en cascade). Or cette information n'appartient pas à React — elle
 * vit dans la Map `pending` de ce module. Le motif recommandé est donc
 * exactement celui-ci : un composant s'abonne, et le setState a lieu dans
 * le callback, quand l'état externe change.
 */
const busyListeners = new Set<(busy: boolean) => void>();
let wasBusy = false;

function notifyBusy() {
  const busy = pending.size > 0;
  if (busy === wasBusy) return; // pas de rendu si rien n'a changé
  wasBusy = busy;
  for (const listener of busyListeners) listener(busy);
}

/** Renvoie la fonction de désabonnement, pour un `useEffect` d'une ligne. */
export function onSpeechBusy(listener: (busy: boolean) => void): () => void {
  busyListeners.add(listener);
  listener(pending.size > 0);
  return () => {
    busyListeners.delete(listener);
  };
}

async function resolveAudioUrl(lang: SpeechLang, text: string): Promise<string | null> {
  const key = keyOf(lang, text);
  if (audioUrls.has(key)) return audioUrls.get(key)!;
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;

  const request = fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, lang }),
  })
    .then((r) => (r.ok ? r.json() : { url: null }))
    .then((d: { url?: string | null }) => {
      const url = typeof d.url === "string" ? d.url : null;
      audioUrls.set(key, url);
      return url;
    })
    .catch(() => {
      audioUrls.set(key, null);
      return null;
    })
    .finally(() => {
      pending.delete(key);
      notifyBusy();
    });

  pending.set(key, request);
  notifyBusy();
  return request;
}

/**
 * Prononce un mot, avec repli sur la voix du navigateur.
 *
 * Le repli n'est pas un détail : il couvre la clé ElevenLabs absente, le
 * quota épuisé, la panne réseau et le navigateur qui refuse la lecture
 * automatique. Dans tous ces cas l'apprenant entend quelque chose plutôt
 * qu'un bouton mort — et en français, la voix du navigateur est même tout
 * à fait correcte sur un poste francophone.
 */
export async function speakIn(
  lang: SpeechLang,
  text: string,
  /** `rate` < 1 ralentit la lecture — pour réentendre un mot syllabe par syllabe. */
  options: { rate?: number } = {}
) {
  if (typeof window === "undefined") return;
  const rate = options.rate ?? 1;

  // Coupe la prononciation précédente, quelle que soit sa source — et
  // celles qui attendent encore leur fichier.
  stopSpeaking();
  const mine = speechGeneration;

  const url = await resolveAudioUrl(lang, text);
  // UNE AUTRE DEMANDE EST ARRIVÉE PENDANT L'ATTENTE. Sans ce contrôle, deux
  // mots se chevauchaient : la lecture automatique du mot suivant attendait
  // son fichier pendant qu'on cliquait « Écouter », et les deux sons
  // partaient l'un sur l'autre. Pire, un micro ouvert entre-temps captait
  // la voix de synthèse et la transcrivait comme réponse.
  if (mine !== speechGeneration) return;
  if (!url) {
    speak(text, lang === "ru" ? "ru-RU" : "fr-FR", rate);
    return;
  }

  try {
    const audio = new Audio(url);
    audio.playbackRate = rate;
    currentAudio = audio;
    await audio.play();
  } catch {
    // Lecture refusée (politique d'autoplay, fichier illisible) : la voix
    // du navigateur, elle, part d'un geste utilisateur déjà validé.
    if (mine !== speechGeneration) return;
    currentAudio = null;
    speak(text, lang === "ru" ? "ru-RU" : "fr-FR", rate);
  }
}

/** Numéro de la dernière demande de lecture : une réponse plus ancienne se tait. */
let speechGeneration = 0;

/**
 * Fait taire tout ce qui parle ou s'apprête à parler.
 *
 * Appelé avant d'ouvrir le micro : la reconnaissance vocale entend ce que
 * les haut-parleurs jouent, et une consigne encore en cours de lecture était
 * transcrite comme si l'apprenant l'avait dite.
 */
export function stopSpeaking() {
  speechGeneration += 1;
  if (typeof window === "undefined") return;
  if ("speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

/** Raccourcis : la langue est presque toujours connue à l'appel. */
export const speakRu = (text: string) => speakIn("ru", text);
export const speakFr = (text: string) => speakIn("fr", text);

/**
 * Prononce un texte russe et ne rend la main qu'À LA FIN de la lecture.
 *
 * `speakIn` rend la main dès que le son démarre : c'est ce qu'il faut à un
 * bouton, pas à une lecture qui enchaîne les phrases d'un texte en
 * surlignant celle qu'on entend. Renvoie `false` si une autre lecture — ou
 * `stopSpeaking` — l'a interrompue : l'appelant s'arrête alors aussi.
 */
export async function speakRuToEnd(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  stopSpeaking();
  const mine = speechGeneration;

  const viaBrowser = () =>
    new Promise<boolean>((resolve) => {
      if (!("speechSynthesis" in window)) {
        resolve(mine === speechGeneration);
        return;
      }
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "ru-RU";
        utterance.onend = () => resolve(mine === speechGeneration);
        utterance.onerror = () => resolve(mine === speechGeneration);
        window.speechSynthesis.speak(utterance);
      } catch {
        resolve(mine === speechGeneration);
      }
    });

  const url = await resolveAudioUrl("ru", text);
  if (mine !== speechGeneration) return false;
  if (!url) return viaBrowser();

  const audio = new Audio(url);
  currentAudio = audio;
  const ended = new Promise<boolean>((resolve) => {
    audio.onended = () => resolve(mine === speechGeneration);
    audio.onpause = () => {
      if (!audio.ended) resolve(false);
    };
    audio.onerror = () => resolve(mine === speechGeneration);
  });
  try {
    await audio.play();
  } catch {
    if (mine !== speechGeneration) return false;
    currentAudio = null;
    return viaBrowser();
  }
  return ended;
}

/**
 * Prépare l'audio du mot SUIVANT sans le jouer.
 *
 * En révision, le mot défile toutes les quelques secondes : sans ça, le
 * premier appel de chaque mot attend l'aller-retour réseau et le son
 * arrive après que l'apprenant a déjà lu. Le résultat est mis en cache,
 * donc la lecture est ensuite immédiate.
 */
export function prefetch(lang: SpeechLang, text: string | undefined) {
  if (text && !audioUrls.has(keyOf(lang, text))) void resolveAudioUrl(lang, text);
}

export const prefetchRu = (text: string | undefined) => prefetch("ru", text);

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Reconnaissance vocale, comme aide d'auto-vérification uniquement — le
 * transcript n'est jamais noté automatiquement (fiabilité trop variable
 * selon navigateur/accent), juste affiché pour que l'apprenant compare
 * lui-même à ce qu'il visait. Indisponible sur Safari/Firefox : le bouton
 * d'enregistrement se masque proprement dans ce cas (voir `supported`).
 */
function hasRecognition(): boolean {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/** Rien à surveiller : la capacité du navigateur ne change pas en cours de visite. */
function subscribeNever(): () => void {
  return () => {};
}

/**
 * LA LANGUE QUE L'APPRENANT VA PARLER, et non celle du mot étudié.
 *
 * C'était « ru-RU » dans les deux sens du mode Voix. Or en « écoute et
 * devine », le mot est ÉNONCÉ en russe et la réponse attendue est sa
 * traduction FRANÇAISE : le moteur écoutait donc du russe pendant qu'on lui
 * parlait français. Il ne rendait rien d'exploitable, et le mode paraissait
 * simplement cassé.
 *
 * La règle vit ici, et non dans la page, pour qu'un contrôle puisse la
 * lire : c'est une règle d'exercice, pas de la mise en page, et elle tient
 * dans une ligne qu'on renverse sans s'en apercevoir.
 */
/**
 * LA LANGUE DE LA CONSIGNE — celle que le bouton « Écouter » prononce.
 *
 * Il jouait le russe dans les deux sens. En « dis ce mot en russe », le
 * russe est précisément ce qu'on demande de produire : le bouton soufflait
 * donc la réponse, à hauteur de première étape. La règle tient en une
 * phrase — on prononce ce qui est DEMANDÉ, jamais ce qui est ATTENDU — et
 * elle vit ici pour qu'un contrôle la confronte à ANSWER_LANG : les deux
 * doivent toujours désigner des langues différentes.
 */
export const PROMPT_LANG: Record<"ru-first" | "fr-first", SpeechLang> = {
  // On écoute le mot russe et on en cherche le sens.
  "ru-first": "ru",
  // On lit le mot français et on cherche à le dire en russe.
  "fr-first": "fr",
};

export const ANSWER_LANG: Record<"ru-first" | "fr-first", string> = {
  // Le mot est dit en russe : on répond en français.
  "ru-first": "fr-FR",
  // Le sens est donné en français : on répond en russe.
  "fr-first": "ru-RU",
};

/**
 * Pourquoi l'écoute peut ne rien donner, dit en français.
 *
 * Les codes du standard sont opaques et le navigateur ne les affiche nulle
 * part : sans cette table, un micro qui échoue est un bouton qui ne fait
 * rien. C'est exactement le défaut qu'on corrige ici.
 */
export const RECOGNITION_ERRORS: Record<string, string> = {
  "not-allowed":
    "Le micro est bloqué pour ce site. Autorise-le dans les réglages du navigateur, puis réessaie.",
  "service-not-allowed":
    "Le navigateur refuse la reconnaissance vocale ici. Elle exige une connexion sécurisée (https) ou localhost.",
  "no-speech": "Je n'ai rien entendu. Rapproche-toi du micro et réessaie.",
  "audio-capture": "Aucun micro trouvé sur cet appareil.",
  network: "La reconnaissance vocale n'a pas pu joindre son service (connexion ?).",
  aborted: "",
};

/**
 * Au-delà, le moteur n'a manifestement pas l'intention de conclure.
 *
 * Il n'existe aucun événement « je n'y arrive pas » : une reconnaissance qui
 * patine se contente de garder le micro. Sans cette borne, le bouton restait
 * sur « J'écoute… » et la voix continuait d'être captée — sans rien afficher,
 * puisqu'aucun résultat n'arrivait.
 */
export const MAX_LISTEN_MS = 12000;

/**
 * Délai laissé à `onend` après une demande d'arrêt, avant de forcer l'état.
 *
 * `stop()` s'en remettait entièrement à `onend`, au motif que lui seul sait
 * quand le micro a rendu la main. C'est vrai, et insuffisant : quand il ne
 * vient pas — iOS le fait —, l'apprenant appuyait sur un bouton d'arrêt qui
 * n'arrêtait rien de visible. On laisse au moteur le temps de conclure, puis
 * on tranche sans lui.
 */
export const END_GRACE_MS = 1500;

/** Lectures demandées au moteur pour une même phrase — voir `alternatives`. */
export const MAX_ALTERNATIVES = 5;

export function useSpeechRecognition(lang: string) {
  // La présence de l'API est un état EXTERNE, pas un état React : elle
  // dépend du navigateur et ne change jamais. Un `useState(false)` corrigé
  // par un effet au montage donnait un rendu de plus à chaque page vocale —
  // et le linter le refuse à juste titre. `useSyncExternalStore` lit la
  // valeur au bon moment (le serveur rend `false`, le client la vraie), sans
  // second rendu ni écart d'hydratation. Même mécanique que ThemeToggle.
  const supported = useSyncExternalStore(subscribeNever, hasRecognition, () => false);

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  /**
   * Toutes les lectures proposées par le moteur, la plus probable d'abord.
   *
   * UNE SEULE NE SUFFISAIT PAS. Sur un mot isolé, le moteur hésite souvent
   * entre plusieurs graphies — « книга », « книгу », « Книга. » — et sa
   * première idée n'est pas toujours la bonne. Comparer la seule première
   * lecture déclarait fausse une réponse juste que le moteur avait bien
   * entendue en deuxième position.
   */
  const [alternatives, setAlternatives] = useState<string[]>([]);
  /** Ce qui a empêché l'écoute d'aboutir, prêt à afficher. "" = rien à dire. */
  const [error, setError] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  /**
   * L'INSTANCE COURANTE, ET ELLE SEULE, A LE DROIT DE TOUCHER À L'ÉTAT.
   *
   * Une reconnaissance arrêtée continue d'émettre `onend` — parfois APRÈS
   * que la suivante a démarré. Sans ce jeton, ce `onend` tardif éteignait
   * l'indicateur d'une écoute qui, elle, venait de commencer : le bouton
   * repassait au repos pendant que le micro tournait encore.
   */
  const token = useRef(0);
  /** Minuterie de secours : bornes MAX_LISTEN_MS et END_GRACE_MS. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Arme le délai de grâce de l'instance courante, posé par `start`. */
  const graceRef = useRef<(() => void) | null>(null);

  function clearTimer() {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function start() {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;

    // Chrome expose l'objet même sur une origine non sécurisée, puis refuse
    // de démarrer. Le dire AVANT de tenter évite le bouton qui s'allume et
    // ne redescend pas — le cas typique de l'app ouverte sur le téléphone
    // via l'adresse réseau du poste (http://192.168.x.x:3000).
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      setError(RECOGNITION_ERRORS["service-not-allowed"]);
      return;
    }

    // Une écoute déjà en cours : `start()` lèverait InvalidStateError.
    clearTimer();
    recognitionRef.current?.abort();
    // Le micro entend les haut-parleurs : une consigne encore en lecture
    // serait transcrite comme la réponse.
    stopSpeaking();

    const mine = (token.current += 1);
    const isStale = () => token.current !== mine;

    // Bilan de CETTE tentative, gardé dans la fermeture : deux instances
    // peuvent se chevaucher le temps que la première s'éteigne.
    let heardSomething = false;
    let reportedError = false;

    const recognition = new Ctor();
    recognition.lang = lang;
    // Explicite plutôt que par défaut : c'est CE réglage qui fait que le
    // moteur rend la main tout seul quand la phrase est finie, au lieu
    // d'écouter jusqu'à ce qu'on reclique.
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = MAX_ALTERNATIVES;

    /**
     * LA FIN, D'OÙ QU'ELLE VIENNE, ET ELLE DIT TOUJOURS QUELQUE CHOSE.
     *
     * C'est le trou que l'apprenant a trouvé. Une tentative peut se terminer
     * sans résultat ET sans erreur — le moteur a entendu quelque chose qu'il
     * n'a pas su transcrire, ce qui arrive constamment sur une réponse
     * hésitante ou mal articulée. Elle ne produisait alors rien du tout :
     * l'indicateur s'éteignait, la carte restait vide, et on avait parlé pour
     * rien sans savoir si le micro, l'app ou soi-même était en cause.
     */
    function finish() {
      if (isStale()) return;
      clearTimer();
      setListening(false);
      if (!heardSomething && !reportedError) {
        setError(
          "Je n'ai pas réussi à transcrire ce que tu as dit. Réessaie en articulant, " +
            "ou révèle la réponse et juge par toi-même."
        );
      }
    }

    /** Force l'état si `onend` se fait attendre après un arrêt demandé. */
    function armEndGrace() {
      clearTimer();
      timer.current = setTimeout(finish, END_GRACE_MS);
    }

    recognition.onstart = () => {
      if (isStale()) return;
      setListening(true);
      // Le moteur a la main : on lui laisse MAX_LISTEN_MS pour conclure, pas
      // davantage. C'est cette borne qui empêche le micro de rester ouvert.
      clearTimer();
      timer.current = setTimeout(() => {
        recognitionRef.current?.abort();
        finish();
      }, MAX_LISTEN_MS);
    };

    recognition.onresult = (e) => {
      if (isStale()) return;
      const result = e.results[0];
      const heard: string[] = [];
      for (let i = 0; i < MAX_ALTERNATIVES; i += 1) {
        const text = (result?.[i]?.transcript ?? "").trim();
        if (text && !heard.includes(text)) heard.push(text);
      }
      // UN TRANSCRIPT VIDE N'EST PAS UN RÉSULTAT. Il ne s'affiche pas —
      // `{transcript && …}` est faux — donc l'écran ne bougeait pas, et
      // `finish` doit le traiter comme une tentative restée sans réponse.
      if (heard.length > 0) {
        heardSomething = true;
        setTranscript(heard[0]);
        setAlternatives(heard);
      }
      // Ceinture et bretelles avec `continuous = false` : certains moteurs
      // gardent le micro ouvert quelques secondes de plus après le résultat.
      // L'apprenant, lui, a fini de parler.
      recognition.stop();
      armEndGrace();
    };

    recognition.onerror = (e) => {
      if (isStale()) return;
      const code = e?.error ?? "";
      const message =
        RECOGNITION_ERRORS[code] ??
        `La reconnaissance vocale a échoué (${code || "raison inconnue"}).`;
      if (message) {
        reportedError = true;
        setError(message);
      } else {
        // « aborted » : c'est NOTRE fait — un nouvel essai, un changement de
        // mot. Pas de message, et pas non plus de « je n'ai pas compris » :
        // on n'a rien demandé au moteur.
        heardSomething = true;
      }
      clearTimer();
      setListening(false);
    };

    recognition.onend = () => finish();

    recognitionRef.current = recognition;
    graceRef.current = armEndGrace;

    setTranscript("");
    setAlternatives([]);
    setError("");

    // `start()` PEUT LEVER, et c'était le premier bug : l'indicateur était
    // allumé juste avant l'appel, si bien qu'une exception laissait le bouton
    // sur « Enregistrement… » définitivement, sans micro derrière. C'est
    // `onstart` qui l'allume maintenant — il ne se déclenche que si le moteur
    // a réellement pris la main.
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setListening(false);
      setError("La reconnaissance vocale n'a pas pu démarrer. Réessaie dans un instant.");
    }
  }

  /**
   * Efface la dernière tentative sans toucher au micro.
   *
   * Sert au passage au mot suivant : sans elle, le transcript du mot
   * précédent restait affiché sous le nouveau, et on validait une réponse
   * qu'on n'avait pas donnée.
   */
  function reset() {
    setTranscript("");
    setAlternatives([]);
    setError("");
    setListening(false);
  }

  /**
   * Coupe l'écoute en cours SANS toucher à l'état React — à appeler depuis un
   * effet, en complément de `reset` appelé au rendu.
   *
   * UNE ÉCOUTE OUVERTE SUR UN MOT RÉPONDAIT POUR LE SUIVANT. Noter une carte
   * pendant que le micro tournait passait au mot suivant sans l'arrêter : la
   * phrase dite pour l'ancien mot arrivait sous le nouveau, et la consigne
   * lue d'office pour celui-ci pouvait même être transcrite. Le jeton rend
   * muets les événements tardifs de l'instance abandonnée.
   */
  function abort() {
    token.current += 1;
    clearTimer();
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    recognition?.abort();
  }

  function stop() {
    recognitionRef.current?.stop();
    // L'indicateur redescend par `onend`, qui seul sait quand le micro a
    // vraiment rendu la main — MAIS on ne l'attend plus indéfiniment. Sans
    // cette borne, un `onend` qui ne vient jamais laissait le bouton d'arrêt
    // sans effet visible, et la voix captée.
    graceRef.current?.();
  }

  // Quitter la page pendant une écoute laissait le micro ouvert : l'onglet
  // gardait son pastillage d'enregistrement jusqu'à la fermeture.
  useEffect(() => {
    return () => {
      token.current += 1;
      if (timer.current !== null) clearTimeout(timer.current);
      recognitionRef.current?.abort();
    };
  }, []);

  return { supported, listening, transcript, alternatives, error, start, stop, reset, abort };
}
