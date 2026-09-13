"use client";

import { useEffect, useMemo, useState } from "react";
import type { Quality } from "@/lib/srs/sm2";
import { focusOf, reviewQueue, type Focus } from "./focus";
import type { VocabItem } from "./data";
import {
  fetchDueWords,
  fetchListDetail,
  reviewCustomCard,
  setWordFocus,
  submitVocabAnswer,
  toVocabItem,
  type CustomVocabWord,
} from "./custom";
import {
  exhaustedQuota,
  isQuotaError,
  type QuotaInfo,
} from "@/lib/billing/quota-client";
import type { ReviewAllowance } from "./custom";

// File de révision : soit d'UNE liste (perso ou amorcée depuis un thème) si
// `listId` est fourni, soit la file GLOBALE (toutes listes confondues, façon
// Anki/Duolingo "réviser maintenant") si `listId` est `null`. L'ordre vient
// de reviewQueue (lib/vocabulary/focus.ts) : les mots que l'apprenant a
// marqués « à travailler », puis les « normal » échus. Une carte consommée à
// la fois, puis retirée de la file de cette session.
//
// Les mots « je le sais » ne sont PAS dans la file, mais restent dans
// `allWords` : ils servent encore de distracteurs au QCM, où un mauvais
// choix doit rester plausible.
export function useReviewQueue(listId: string | null) {
  const [words, setWords] = useState<CustomVocabWord[] | null>(null);
  const [allWords, setAllWords] = useState<CustomVocabWord[]>([]); // pool stable, ne rétrécit pas (distracteurs QCM)
  const [listName, setListName] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionDone, setSessionDone] = useState(0);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [reloadTick, setReloadTick] = useState(0);
  // Le plafond de révisions du plan gratuit. `blocked` remplace la carte par
  // l'écran d'abonnement ; `lastOne` le tient prêt sans l'afficher encore,
  // le temps que l'apprenant voie le résultat de la carte qu'il vient de
  // faire — c'était la dernière, pas une de trop.
  const [blocked, setBlocked] = useState<{ quota: QuotaInfo; message: string } | null>(null);
  const [lastOne, setLastOne] = useState<{ quota: QuotaInfo; message: string } | null>(null);

  /** Note ce que le serveur vient de dire du compteur, sans encore l'afficher. */
  function noteAllowance(quota: ReviewAllowance | undefined) {
    if (quota && quota.remaining <= 0) {
      setLastOne(exhaustedQuota("vocab_review", quota.plan, quota.cap));
    }
  }

  // Nouvelle liste (ou bascule liste <-> globale) : réinitialise avant de
  // refetch. Ajusté pendant le rendu (comparaison au dernier listId vu)
  // plutôt que dans l'effet de fetch.
  const [seenListId, setSeenListId] = useState(listId);
  if (listId !== seenListId) {
    setSeenListId(listId);
    setWords(null);
    setAllWords([]);
    setLoadError(null);
    setSessionDone(0);
    setSessionCorrect(0);
  }

  useEffect(() => {
    // Une réponse arrivée APRÈS un changement de liste ne doit pas écraser
    // celle de la liste suivante : sans ce drapeau, la plus lente gagnait.
    let cancelled = false;
    const req = listId
      ? fetchListDetail(listId).then((d) => ({ words: d.words, name: d.list.name }))
      : fetchDueWords().then((d) => ({ words: d.words, name: "Révision du jour" }));

    req
      .then(({ words: fetched, name }) => {
        if (cancelled) return;
        setListName(name);
        setWords(fetched.filter((w) => focusOf(w) !== "known"));
        setAllWords(fetched);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(
          err instanceof Error
            ? err.message
            : listId
              ? "Liste introuvable."
              : "Impossible de charger tes mots."
        );
      });
    return () => {
      cancelled = true;
    };
  }, [listId, reloadTick]);

  const queue = useMemo(() => {
    if (!words) return [];
    return reviewQueue(words).map((w) => toVocabItem(w, listName));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionDone, words, listName]);

  const pool: VocabItem[] = useMemo(
    () => allWords.map((w) => toVocabItem(w, listName)),
    [allWords, listName]
  );

  const current: VocabItem | undefined = queue[0];
  const currentFocus: Focus = current
    ? focusOf(allWords.find((w) => w.id === current.id) ?? {})
    : "normal";
  const loading = words === null && !loadError;
  const noWordsAtAll = words !== null && allWords.length === 0;
  // Il y a des mots, mais l'apprenant les a tous mis de côté : à distinguer
  // d'une liste vide (rien à ajouter à dire) comme d'une session terminée
  // (le résumé annoncerait zéro révision).
  const allKnown =
    words !== null && allWords.length > 0 && allWords.every((w) => focusOf(w) === "known");

  /**
   * Auto-évaluation : cartes retournées et mode oral, où l'apprenant est le
   * seul juge de son souvenir. Pour la frappe et le QCM, utiliser
   * `submitAnswer` — la réponse y est objectivement vérifiable, et c'est le
   * serveur qui tranche.
   */
  async function review(quality: Quality) {
    if (!current) return;

    setWords((prev) => (prev ? prev.filter((w) => w.id !== current.id) : prev));
    try {
      const { quota } = await reviewCustomCard(current.id, current.ru, current.fr, quality);
      // Ici la carte est déjà notée et retirée : rien à faire voir de plus,
      // le refus peut s'afficher tout de suite plutôt qu'au geste suivant.
      if (quota && quota.remaining <= 0) {
        setBlocked(exhaustedQuota("vocab_review", quota.plan, quota.cap));
      }
    } catch (err) {
      // Plafond atteint : la carte n'a PAS été notée côté serveur. On la
      // laisse retirée de la file locale — la session s'arrête ici de toute
      // façon — et l'écran bascule sur l'abonnement.
      if (isQuotaError(err)) {
        setBlocked({ quota: err.quota, message: err.message });
        return;
      }
      // La révision reste retirée de la file localement ; elle réapparaîtra
      // simplement au prochain chargement si l'enregistrement a échoué.
    }

    setSessionCorrect((n) => n + (quality >= 3 ? 1 : 0));
    setSessionDone((n) => n + 1);
  }

  /**
   * Soumet une réponse produite et renvoie le verdict du SERVEUR. La carte
   * n'est retirée de la file qu'à `advance()` : l'apprenant doit d'abord
   * voir son résultat.
   *
   * En cas de panne réseau, on renvoie `null` plutôt qu'un verdict inventé
   * — la page affiche alors une erreur au lieu de compter faux à tort.
   */
  async function submitAnswer(params: {
    userAnswer: string;
    expectedLanguage: "ru" | "fr";
    mode: "typing" | "qcm";
    revealed?: boolean;
  }): Promise<{ correct: boolean; expected: string } | null> {
    if (!current) return null;
    try {
      const verdict = await submitVocabAnswer({ cardId: current.id, ...params });
      setSessionCorrect((n) => n + (verdict.correct ? 1 : 0));
      // C'était la dernière : le refus est préparé mais pas affiché — la
      // réponse qu'on vient de donner mérite d'abord d'être corrigée.
      noteAllowance(verdict.quota);
      return verdict;
    } catch (err) {
      if (isQuotaError(err)) {
        setBlocked({ quota: err.quota, message: err.message });
        return null;
      }
      return null;
    }
  }

  /**
   * Range le mot en cours sans quitter la session.
   *
   * C'est pendant une révision qu'on se dit « celui-là je le sais » ou
   * « celui-là, remontre-le moi » — l'obliger à rouvrir la liste pour le
   * noter revenait à lui faire perdre l'information en chemin. Marqué
   * « je le sais », le mot quitte la file immédiatement : le garder aurait
   * contredit le geste dans la seconde qui suit.
   */
  async function setFocus(focus: Focus) {
    if (!current) return;
    const id = current.id;
    setAllWords((prev) => prev.map((w) => (w.id === id ? { ...w, focus } : w)));
    setWords((prev) =>
      prev
        ? focus === "known"
          ? prev.filter((w) => w.id !== id)
          : prev.map((w) => (w.id === id ? { ...w, focus } : w))
        : prev
    );
    try {
      await setWordFocus(id, focus);
    } catch {
      // Non enregistré : le mot revient tel qu'il était au prochain
      // chargement. Rien à défaire ici, la session continue.
    }
  }

  /** Passe au mot suivant, une fois le résultat vu. */
  function advance() {
    // Le compteur était à zéro à la carte précédente : plutôt que d'en
    // servir une de plus pour la refuser une fois répondue, on s'arrête ici.
    if (lastOne) {
      setBlocked(lastOne);
      return;
    }
    if (!current) return;
    setWords((prev) => (prev ? prev.filter((w) => w.id !== current.id) : prev));
    setSessionDone((n) => n + 1);
  }

  function reload() {
    setWords(null);
    setAllWords([]);
    setSessionDone(0);
    setSessionCorrect(0);
    // Le refus n'est PAS effacé : le plafond est journalier, relancer une
    // session ne le lève pas. Le remettre à null ferait croire le contraire
    // le temps d'une carte, jusqu'au premier 429.
    setReloadTick((t) => t + 1);
  }

  return {
    blocked,
    current,
    currentFocus,
    setFocus,
    review,
    submitAnswer,
    advance,
    reload,
    pool,
    loading,
    loadError,
    listName,
    sessionIndex: sessionDone,
    sessionCorrect,
    /** Mots encore à passer dans cette session, celui en cours compris. */
    remaining: queue.length,
    noWordsAtAll,
    allKnown,
  };
}
