"use client";

import { useEffect, useMemo, useState } from "react";
import type { Quality } from "@/lib/srs/sm2";
import { countFocus, focusOf, reviewQueue, type Focus } from "./focus";
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
import { matchesAnswer } from "./answer-check";
import { DAILY_NEW_WORDS } from "./new-words";
import { RETRY_GAP, retriesLeft } from "@/lib/practice/retry";
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
// marqués « à travailler », puis les « normal » échus, puis les nouveaux dans
// la limite du jour. Une carte consommée à la fois, puis retirée de la file
// de cette session.
//
// Les mots « je le sais » ne sont PAS dans la file, mais restent dans
// `allWords` : ils servent encore de distracteurs au QCM, où un mauvais
// choix doit rester plausible.
//
// UN MOT RATÉ REVIENT PENDANT LA SÉANCE. Une carte ratée repartait à un jour
// d'intervalle et quittait la file : on lisait la réponse, et on ne la
// cherchait plus avant le lendemain. Elle revient maintenant `RETRY_GAP`
// cartes plus tard — deux fois au plus, jamais deux d'affilée —, comme les
// étapes d'apprentissage d'Anki. Ce retour est corrigé ici, SANS appel au
// serveur : la révision est déjà notée, et le plan gratuit ne paie pas deux
// fois le même mot.

interface Relearn {
  item: VocabItem;
  /** Rang de séance à partir duquel le mot peut revenir. */
  due: number;
  /** Retours déjà servis pour ce mot. */
  attempts: number;
}

export function useReviewQueue(listId: string | null) {
  const [words, setWords] = useState<CustomVocabWord[] | null>(null);
  const [allWords, setAllWords] = useState<CustomVocabWord[]>([]); // pool stable, ne rétrécit pas (distracteurs QCM)
  const [listName, setListName] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Cartes passées dans la séance, retours compris : l'horloge des retours. */
  const [sessionDone, setSessionDone] = useState(0);
  /** Mots revus pour la première fois dans la séance : ce que le bilan compte. */
  const [reviewedCount, setReviewedCount] = useState(0);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [reloadTick, setReloadTick] = useState(0);
  const [relearn, setRelearn] = useState<Relearn[]>([]);
  const [lastWasRelearn, setLastWasRelearn] = useState(false);
  /** Verdict de la carte affichée (frappe, QCM), en attendant « Suivant ». */
  const [pendingOutcome, setPendingOutcome] = useState<boolean | null>(null);
  // La limite de nouveaux mots du jour, telle que le serveur l'a comptée, et
  // ce que la séance en a déjà consommé ou ajouté à la demande.
  const [newAllowance, setNewAllowance] = useState(Infinity);
  const [newIntroduced, setNewIntroduced] = useState(0);
  const [extraNew, setExtraNew] = useState(0);
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

  function resetSession() {
    setSessionDone(0);
    setReviewedCount(0);
    setSessionCorrect(0);
    setRelearn([]);
    setLastWasRelearn(false);
    setPendingOutcome(null);
    setNewIntroduced(0);
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
    resetSession();
  }

  useEffect(() => {
    // Une réponse arrivée APRÈS un changement de liste ne doit pas écraser
    // celle de la liste suivante : sans ce drapeau, la plus lente gagnait.
    let cancelled = false;
    const req = listId
      ? fetchListDetail(listId).then((d) => ({
          words: d.words,
          name: d.list.name,
          allowance: d.newAllowance,
        }))
      : fetchDueWords().then((d) => ({
          words: d.words,
          name: "Révision du jour",
          allowance: d.newAllowance,
        }));

    req
      .then(({ words: fetched, name, allowance }) => {
        if (cancelled) return;
        setListName(name);
        setWords(fetched.filter((w) => focusOf(w) !== "known"));
        setAllWords(fetched);
        setNewAllowance(typeof allowance === "number" ? allowance : Infinity);
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

  const allowance = Math.max(0, newAllowance - newIntroduced + extraNew);

  const queue = useMemo(() => {
    if (!words) return [];
    return reviewQueue(words, undefined, allowance).map((w) => toVocabItem(w, listName));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionDone, words, listName, allowance]);

  const pool: VocabItem[] = useMemo(
    () => allWords.map((w) => toVocabItem(w, listName)),
    [allWords, listName]
  );

  // Un retour échu passe devant la file, sauf juste après un autre retour ;
  // quand la file est vide, ce qui reste à revoir passe sans attendre.
  const activeRelearn =
    (!lastWasRelearn ? relearn.find((r) => r.due <= sessionDone) : undefined) ??
    (queue.length === 0 ? relearn[0] : undefined);
  const current: VocabItem | undefined = activeRelearn?.item ?? queue[0];
  const isRelearn = Boolean(activeRelearn);

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
  const newWaiting = words ? countFocus(words, undefined, allowance).newWaiting : 0;

  const isNewWord = (id: string) => !allWords.find((w) => w.id === id)?.srs;

  function scheduleRelearn(item: VocabItem, attempts: number) {
    setRelearn((list) => [
      ...list.filter((r) => r.item.id !== item.id),
      { item, attempts, due: sessionDone + 1 + RETRY_GAP },
    ]);
  }

  /** Termine un retour : il repart s'il est encore manqué et qu'il lui reste des essais. */
  function completeRelearn(entry: Relearn, succeeded: boolean) {
    setRelearn((list) => {
      const rest = list.filter((r) => r !== entry);
      return !succeeded && retriesLeft(entry.attempts + 1)
        ? [...rest, { ...entry, attempts: entry.attempts + 1, due: sessionDone + 1 + RETRY_GAP }]
        : rest;
    });
    setPendingOutcome(null);
    setSessionDone((n) => n + 1);
    setLastWasRelearn(true);
  }

  /**
   * Auto-évaluation : cartes retournées et mode oral, où l'apprenant est le
   * seul juge de son souvenir. Pour la frappe et le QCM, utiliser
   * `submitAnswer` — la réponse y est objectivement vérifiable, et c'est le
   * serveur qui tranche.
   */
  async function review(quality: Quality) {
    if (!current) return;
    if (activeRelearn) {
      completeRelearn(activeRelearn, quality >= 3);
      return;
    }
    const item = current;
    const wasNew = isNewWord(item.id);

    setWords((prev) => (prev ? prev.filter((w) => w.id !== item.id) : prev));
    try {
      const { quota } = await reviewCustomCard(item.id, item.ru, item.fr, quality);
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

    if (wasNew) setNewIntroduced((n) => n + 1);
    if (quality < 3) scheduleRelearn(item, 0);
    setSessionCorrect((n) => n + (quality >= 3 ? 1 : 0));
    setReviewedCount((n) => n + 1);
    setSessionDone((n) => n + 1);
    setLastWasRelearn(false);
  }

  /**
   * Soumet une réponse produite et renvoie le verdict. La carte n'est retirée
   * de la file qu'à `advance()` : l'apprenant doit d'abord voir son résultat.
   *
   * Pour un mot neuf, c'est le SERVEUR qui juge ; en cas de panne réseau, on
   * renvoie `null` plutôt qu'un verdict inventé — la page affiche alors une
   * erreur au lieu de compter faux à tort. Pour un retour, la réponse est
   * jugée ici, avec la même fonction que le serveur : rien n'est enregistré.
   */
  async function submitAnswer(params: {
    userAnswer: string;
    expectedLanguage: "ru" | "fr";
    mode: "typing" | "qcm";
    revealed?: boolean;
  }): Promise<{ correct: boolean; expected: string } | null> {
    if (!current) return null;
    if (activeRelearn) {
      const expected = params.expectedLanguage === "ru" ? current.ru : current.fr;
      const correct = !params.revealed && matchesAnswer(params.userAnswer, expected);
      setPendingOutcome(correct);
      return { correct, expected };
    }
    try {
      const verdict = await submitVocabAnswer({ cardId: current.id, ...params });
      setSessionCorrect((n) => n + (verdict.correct ? 1 : 0));
      setPendingOutcome(verdict.correct);
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
    if (focus === "known") setRelearn((list) => list.filter((r) => r.item.id !== id));
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
    if (activeRelearn) {
      completeRelearn(activeRelearn, pendingOutcome !== false);
      return;
    }
    const item = current;
    if (isNewWord(item.id)) setNewIntroduced((n) => n + 1);
    if (pendingOutcome === false) scheduleRelearn(item, 0);
    setWords((prev) => (prev ? prev.filter((w) => w.id !== item.id) : prev));
    setPendingOutcome(null);
    setReviewedCount((n) => n + 1);
    setSessionDone((n) => n + 1);
    setLastWasRelearn(false);
  }

  /** « En découvrir davantage » : la limite du jour protège par défaut, l'apprenant décide. */
  function allowMoreNew() {
    setExtraNew((n) => n + DAILY_NEW_WORDS);
  }

  function reload() {
    setWords(null);
    setAllWords([]);
    resetSession();
    // Le refus n'est PAS effacé : le plafond est journalier, relancer une
    // session ne le lève pas. Le remettre à null ferait croire le contraire
    // le temps d'une carte, jusqu'au premier 429.
    setReloadTick((t) => t + 1);
  }

  return {
    blocked,
    current,
    currentFocus,
    /** La carte affichée est un mot manqué qui revient — corrigé sans être enregistré. */
    isRelearn,
    setFocus,
    review,
    submitAnswer,
    advance,
    reload,
    pool,
    loading,
    loadError,
    listName,
    sessionIndex: reviewedCount,
    sessionCorrect,
    /** Mots encore à passer dans cette session, celui en cours compris. */
    remaining: queue.length + relearn.length,
    noWordsAtAll,
    allKnown,
    /** Nouveaux mots que la limite du jour laisse de côté. */
    newWaiting,
    allowMoreNew,
  };
}
