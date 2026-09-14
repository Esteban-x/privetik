"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addWord,
  isDuplicateWordError,
  type AddOutcome,
  createList,
  deleteList,
  deleteWord,
  fetchListDetail,
  fetchLists,
  renameList,
  setWordFocus,
  updateWord,
  type CustomVocabWord,
  type VocabListSummary,
  type WordInput,
} from "@/lib/vocabulary/custom";
import { countFocus, FOCUS_META, type Focus } from "@/lib/vocabulary/focus";
import AddWordForm from "@/components/vocabulary/AddWordForm";
import EditWordForm, { type EditOutcome } from "@/components/vocabulary/EditWordForm";
import ListRail, { ListTile } from "@/components/vocabulary/ListRail";
import StarterPacks from "@/components/vocabulary/StarterPacks";
import WordCard from "@/components/vocabulary/WordCard";
import { ModeIcon, REVIEW_MODES } from "@/components/vocabulary/ReviewModeGrid";
import {
  ListRailSkeleton,
  WordRowsSkeleton,
  WordToolbarSkeleton,
} from "@/components/vocabulary/VocabularySkeletons";
import { PlusIcon, TrashIcon } from "@/components/ui/icons";
import Modal from "@/components/ui/Modal";
import Dropdown from "@/components/ui/Dropdown";
import { loadLastVocabList, saveLastVocabList } from "@/lib/storage";

/**
   * Le module vocabulaire, en deux panneaux.
   *
   * L'ancienne organisation était une page de listes puis une page par liste :
   * deux navigations complètes pour comparer deux listes, et une page d'accueil
   * qui n'affichait que des noms. Ici les listes tiennent dans une colonne
   * permanente et le panneau de droite montre celle qui est ouverte — on passe
   * de l'une à l'autre sans quitter l'écran.
   *
   * L'URL suit la sélection (`?list=`), donc un lien reste partageable et le
   * retour arrière fonctionne.
   */

/** « Tous », puis les trois rangements que l'apprenant a lui-même posés. */
type Filter = "all" | Focus;

/** Amorces de nom : une liste vide devant soi ne donne pas d'idée. */
const LIST_IDEAS = ["Voyage", "Nourriture", "Verbes courants", "Famille"];

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "priority", label: FOCUS_META.priority.label },
  { id: "normal", label: FOCUS_META.normal.label },
  { id: "known", label: FOCUS_META.known.label },
];

export default function VocabularyWorkspace({ initialListId }: { initialListId?: string }) {
  const [lists, setLists] = useState<VocabListSummary[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(initialListId ?? null);
  const [words, setWords] = useState<CustomVocabWord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Remarque neutre — ce n'est pas une panne, juste quelque chose à savoir. */
  const [notice, setNotice] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showPacks, setShowPacks] = useState(false);
  /** Nouveaux mots encore permis aujourd'hui : les décomptes « à réviser » la respectent. */
  const [newAllowance, setNewAllowance] = useState(Infinity);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  /** Le mot dont la feuille de modification est ouverte. */
  const [editing, setEditing] = useState<CustomVocabWord | null>(null);

  // UN CHARGEMENT QUI ÉCHOUE DOIT POUVOIR SE REJOUER. Les deux requêtes
  // laissaient leur état à `null` en cas d'échec : le squelette tournait
  // indéfiniment sous un bandeau rouge, sans rien pour réessayer. Le
  // compteur de tentatives relance l'effet, l'indicateur remplace le
  // squelette par un message.
  const [listsFailed, setListsFailed] = useState(false);
  const [listsAttempt, setListsAttempt] = useState(0);
  const [wordsFailed, setWordsFailed] = useState(false);
  const [wordsAttempt, setWordsAttempt] = useState(0);

  const activeList = lists?.find((l) => l.id === activeId) ?? null;

  /**
   * La liste ouverte AU MOMENT OÙ une requête répond.
   *
   * Une suppression qui échoue remet le mot à sa place — mais seulement si
   * l'on est toujours dans la même liste : restaurer les mots de « Voyage »
   * par-dessus « Cuisine », ouverte entre-temps, serait pire que l'échec.
   */
  const activeRef = useRef(activeId);
  useEffect(() => {
    activeRef.current = activeId;
  });

  /**
   * UNE NAVIGATION VERS /vocabulary REMET LES LISTES DEVANT.
   *
   * C'est le cas du bandeau du bas : on est dans une liste, on tape
   * « Vocabulaire », et on doit retomber sur ses listes. Sans ceci, rien ne
   * bougeait — React réconcilie le même composant au même endroit et garde
   * son état, si bien que l'adresse changeait sans que l'écran suive.
   *
   * On compare à la DERNIÈRE VALEUR VUE, pas à la valeur courante : la
   * sélection écrit elle-même `?list=` par `replaceState`, que le routeur
   * de Next n'observe pas. `useSearchParams` ne bouge donc que sur une vraie
   * navigation — exactement les cas où l'adresse doit faire autorité.
   *
   * Comparaison pendant le rendu plutôt que dans un effet, comme ailleurs
   * dans ce fichier : un effet qui pose un état provoque un rendu en
   * cascade, et l'écran clignoterait sur l'ancienne liste.
   */
  const urlList = useSearchParams().get("list");
  const [seenUrlList, setSeenUrlList] = useState(urlList);
  if (urlList !== seenUrlList) {
    setSeenUrlList(urlList);
    setActiveId(urlList);
  }

  function closeCreate() {
    setShowCreate(false);
    setNewName("");
  }

  useEffect(() => {
    fetchLists()
      .then((d) => {
        setLists(d.lists);
        // Rien de sélectionné : on ouvre la liste qui a le plus à réviser,
        // sinon la première. Arriver sur un panneau vide alors qu'on a des
        // listes n'apprend rien à personne.
        setActiveId((current) => {
          if (current && d.lists.some((l) => l.id === current)) return current;
          if (d.lists.length === 0) return null;

          // LE MARQUE-PAGE D'ABORD. On revient du module des cas ou d'un
          // texte de lecture : le composant a été démonté, donc `current` est
          // vide, et sans ceci on retombait sur l'écran de sélection des
          // listes — alors qu'on travaillait une liste précise trente
          // secondes plus tôt. Il ne prend la main QUE dans ce cas : une
          // navigation vers /vocabulary pendant que l'écran est déjà là
          // (le bandeau du bas) passe par la comparaison d'URL ci-dessus et
          // ramène bien les listes, puisque c'est le geste qu'on a fait.
          const remembered = loadLastVocabList();
          if (remembered && d.lists.some((l) => l.id === remembered)) return remembered;
          // SOUS 1024 px, ON N'OUVRE RIEN. Les deux panneaux ne tiennent pas
          // côte à côte sur un téléphone : ils y deviennent deux écrans
          // successifs, et le premier est la liste des listes. Ouvrir la
          // plus chargée d'office sautait cet écran — on arrivait dans une
          // liste sans avoir choisi, et sans savoir qu'il y en avait
          // d'autres.
          //
          // La mesure est faite ICI et pas au rendu : ce rappel s'exécute
          // après le chargement des listes, donc côté navigateur, donc sans
          // le moindre risque d'écart avec ce que le serveur a rendu.
          if (!window.matchMedia("(min-width: 1024px)").matches) return null;
          return [...d.lists].sort((a, b) => b.dueCount - a.dueCount)[0].id;
        });
      })
      .catch(() => setListsFailed(true));
  }, [listsAttempt]);

  function retryLists() {
    setListsFailed(false);
    setListsAttempt((n) => n + 1);
  }

  function retryWords() {
    setWordsFailed(false);
    setWordsAttempt((n) => n + 1);
  }

  // Chargement des mots de la liste ouverte. Le reset se fait pendant le
  // rendu (comparaison au dernier id vu) plutôt que dans l'effet, pour ne
  // pas montrer un instant les mots de la liste précédente.
  const [seenId, setSeenId] = useState<string | null | "init">("init");
  if (activeId !== seenId) {
    setSeenId(activeId);
    setWords(null);
    setQuery("");
    setFilter("all");
    setEditingName(false);
    setConfirmingDelete(false);
    setShowAdd(false);
    setEditing(null);
    setWordsFailed(false);
  }

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    fetchListDetail(activeId)
      .then((d) => {
        if (cancelled) return;
        setNameDraft(d.list.name);
        setWords(d.words);
        if (typeof d.newAllowance === "number") setNewAllowance(d.newAllowance);
      })
      .catch(() => {
        if (!cancelled) setWordsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, wordsAttempt]);

  // L'URL suit la sélection sans provoquer de navigation : `replaceState`
  // plutôt que router.replace, qui remonterait jusqu'au serveur pour un
  // changement purement local.
  //
  // LE MARQUE-PAGE N'EST ÉCRIT QU'UNE FOIS LES LISTES ARRIVÉES, et c'est
  // tout ce qui manquait pour qu'il serve enfin à quelque chose. Cet effet
  // part aussi AU MONTAGE, où `activeId` vaut null tant que la requête n'a
  // pas répondu : il effaçait donc le marque-page (`saveLastVocabList(null)`
  // fait un `removeItem`) quelques millisecondes avant que le rappel de
  // `fetchLists` ne vienne le lire. On revenait de la lecture ou des cas, on
  // retombait sur l'écran des listes, et le marque-page — pourtant écrit,
  // pourtant relu — n'avait jamais rien à dire. Il ne consigne donc plus que
  // des sélections VUES : celle qu'on ouvre, et celle qu'on quitte pour
  // remonter aux listes, qui doit bien être oubliée.
  //
  // `loaded` plutôt que `lists` en dépendance : `lists` est réécrit à chaque
  // recomptage (syncCounts), ce qui rejouerait un `replaceState` par mot
  // ajouté. Le booléen, lui, ne bascule qu'une fois.
  const loaded = lists !== null;
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (activeId) url.searchParams.set("list", activeId);
    else url.searchParams.delete("list");
    window.history.replaceState(null, "", url);
    if (loaded) saveLastVocabList(activeId);
  }, [activeId, loaded]);

  const totals = useMemo(() => {
    if (!lists) return null;
    return lists.reduce(
      (acc, l) => ({
        words: acc.words + l.wordCount,
        known: acc.known + l.knownCount,
        priority: acc.priority + l.priorityCount,
        due: acc.due + l.dueCount,
      }),
      { words: 0, known: 0, priority: 0, due: 0 },
    );
  }, [lists]);

  const stats = useMemo(
    () => (words ? countFocus(words, undefined, newAllowance) : null),
    [words, newAllowance],
  );

  const visible = useMemo(() => {
    if (!words) return null;
    const q = query.trim().toLowerCase();
    return words.filter((w) => {
      if (filter !== "all" && w.focus !== filter) return false;
      if (!q) return true;
      return (
        w.ru.toLowerCase().includes(q) ||
        w.fr.toLowerCase().includes(q) ||
        (w.transliteration ?? "").toLowerCase().includes(q)
      );
    });
  }, [words, query, filter]);

  /**
     * Recompte la liste ouverte dans le rail à partir de ses mots.
     *
     * La version précédente incrémentait les compteurs à la main (+1 mot, +1
     * dû). Depuis que l'apprenant range ses mots lui-même, un simple delta ne
     * suffit plus : mettre un mot de côté retire une unité au badge « à
     * réviser » mais pas au nombre de mots, et supprimer un mot déjà mis de
     * côté n'en retire aucune. countFocus est la même fonction que celle du
     * serveur — recompter est ici plus court que d'énumérer les cas.
     */
  function syncCounts(listId: string, nextWords: CustomVocabWord[]) {
    const stat = countFocus(nextWords, undefined, newAllowance);
    setLists((prev) =>
      prev
        ? prev.map((l) =>
            l.id === listId
              ? {
                  ...l,
                  wordCount: stat.total,
                  knownCount: stat.known,
                  priorityCount: stat.priority,
                  dueCount: stat.due,
                }
              : l,
          )
        : prev,
    );
  }

  /**
   * Un paquet de départ vient d'être ajouté : on ouvre sa liste et on relit
   * tout, les décomptes compris — le serveur les calcule avec la limite du
   * jour, le client n'a pas à les deviner.
   */
  function importedPack(list: VocabListSummary, added: number) {
    setShowPacks(false);
    closeCreate();
    setNotice(
      added > 0
        ? `${added} mots ajoutés à « ${list.name} ». Dix nouveaux arrivent en révision chaque jour, les plus courants d'abord.`
        : `« ${list.name} » contenait déjà tous les mots de ce paquet.`,
    );
    setActiveId(list.id);
    setWordsAttempt((n) => n + 1);
    setListsAttempt((n) => n + 1);
  }

  async function submitNewList(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const { list } = await createList(name);
      setLists((prev) => [...(prev ?? []), list]);
      setActiveId(list.id);
      setNewName("");
      setShowCreate(false);
    } catch {
      setError("La création a échoué. Réessaie.");
    } finally {
      setCreating(false);
    }
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const name = nameDraft.trim();
    if (!activeId || !name || name === activeList?.name) {
      setEditingName(false);
      return;
    }
    const id = activeId;
    const previousName = activeList?.name;
    setLists((prev) => (prev ? prev.map((l) => (l.id === id ? { ...l, name } : l)) : prev));
    setEditingName(false);
    try {
      await renameList(id, name);
    } catch {
      // L'ancien nom revient : le nouveau n'a pas été enregistré, et il
      // disparaîtrait de lui-même au prochain chargement.
      if (previousName) {
        setLists((prev) =>
          prev ? prev.map((l) => (l.id === id ? { ...l, name: previousName } : l)) : prev
        );
      }
      setError("Le renommage a échoué.");
    }
  }

  async function handleAdd(input: {
    ru: string;
    fr: string;
    transliteration?: string;
  }): Promise<AddOutcome> {
    if (!activeId) return { status: "failed", message: "Choisis d'abord une liste." };
    setError(null);
    setNotice(null);
    try {
      const { word, alsoIn } = await addWord(activeId, input);
      // En tête de liste : le mot qu'on vient d'ajouter est celui qu'on veut
      // relire, et en bas de cinquante autres il fallait le chercher.
      const next = [word, ...(words ?? [])];
      setWords(next);
      syncCounts(activeId, next);
      setFilter("all");
      setQuery("");
      // Le mot existe dans d'AUTRES listes : ce n'est pas un refus, juste
      // quelque chose qu'on préfère savoir. Le formulaire, lui, s'est déjà
      // refermé — la remarque s'affiche donc ici.
      if (alsoIn?.length) {
        setNotice(
          `« ${word.ru} » est aussi dans ${alsoIn.length === 1 ? "la liste" : "les listes"} ` +
            alsoIn.map((n) => `« ${n} »`).join(", ") +
            "."
        );
      }
      return { status: "added", word, alsoIn };
    } catch (err) {
      // Le doublon N'EST PAS une panne : il a son message, et le formulaire
      // reste rempli pour qu'on puisse corriger le mot plutôt que le retaper.
      if (isDuplicateWordError(err)) {
        return { status: "duplicate", message: err.message };
      }
      return { status: "failed", message: "L'ajout a échoué. Réessaie." };
    }
  }

  async function removeWord(wordId: string) {
    const listId = activeId;
    const previous = words;
    const next = (words ?? []).filter((w) => w.id !== wordId);
    setWords(next);
    if (listId) syncCounts(listId, next);
    try {
      await deleteWord(wordId);
    } catch {
      // LE MOT REVIENT À SA PLACE. Il disparaissait de l'écran pour de bon,
      // alors qu'il était toujours en base : il ressurgissait au chargement
      // suivant, et rien n'avait dit que la suppression n'avait pas eu lieu.
      if (listId && previous && activeRef.current === listId) {
        setWords(previous);
        syncCounts(listId, previous);
      }
      setError("La suppression a échoué.");
    }
  }

  /**
   * Enregistre la modification d'un mot.
   *
   * ATTENDUE, ET NON APPLIQUÉE D'AVANCE comme le rangement : c'est le serveur
   * qui pose l'accent tonique et recalcule la prononciation, donc le mot à
   * afficher est celui qu'il renvoie, pas celui qu'on a tapé. Le formulaire
   * reste ouvert pendant l'aller-retour, et le reste en cas de doublon.
   */
  async function saveEdit(input: Partial<WordInput>): Promise<EditOutcome> {
    if (!editing) return { status: "failed", message: "Aucun mot à modifier." };
    const wordId = editing.id;
    try {
      const { word } = await updateWord(wordId, input);
      setWords((prev) => (prev ? prev.map((w) => (w.id === wordId ? { ...w, ...word } : w)) : prev));
      setEditing(null);
      return { status: "saved" };
    } catch (err) {
      if (isDuplicateWordError(err)) return { status: "duplicate", message: err.message };
      return {
        status: "failed",
        message: err instanceof Error && err.message !== "Erreur réseau"
          ? err.message
          : "L'enregistrement a échoué. Réessaie.",
      };
    }
  }

  /**
     * Range un mot. Appliqué d'abord à l'écran, enregistré ensuite : le geste
     * est un réglage d'affichage autant qu'un réglage de révision, et attendre
     * l'aller-retour réseau ferait clignoter le sélecteur sous le doigt. En
     * cas d'échec on remet la valeur précédente plutôt que de laisser croire
     * à un rangement qui n'a pas été enregistré.
     */
  async function changeFocus(wordId: string, focus: Focus) {
    const previous = words?.find((w) => w.id === wordId)?.focus;
    if (!previous || previous === focus) return;
    const apply = (value: Focus) => {
      const next = (words ?? []).map((w) => (w.id === wordId ? { ...w, focus: value } : w));
      setWords(next);
      if (activeId) syncCounts(activeId, next);
    };
    apply(focus);
    try {
      await setWordFocus(wordId, focus);
    } catch {
      apply(previous);
      setError("Le changement n'a pas été enregistré.");
    }
  }

  async function removeList() {
    if (!activeId) return;
    const id = activeId;
    const previous = lists;
    setLists((prev) => (prev ? prev.filter((l) => l.id !== id) : prev));
    setActiveId(null);
    setConfirmingDelete(false);
    try {
      await deleteList(id);
    } catch {
      setLists(previous);
      setError("La suppression a échoué.");
    }
  }

  const dueCount = activeList?.dueCount ?? 0;

  /**
   * MAÎTRE ET DÉTAIL, EN DEUX ÉCRANS SOUS 1024 px, côte à côte au-delà.
   *
   * C'est la sélection qui décide, pas un état de navigation en plus :
   * l'adresse porte déjà `?list=`, donc un lien partagé ouvre le bon écran,
   * le bouton « retour » du navigateur remonte aux listes, et il n'y a rien
   * à garder synchronisé.
   *
   * Le cas « aucune liste » va au détail malgré tout : c'est lui qui porte
   * l'invitation à en créer une, et le rail ne montrerait qu'un bouton seul.
   */
  const showDetail = Boolean(activeId) || (lists !== null && lists.length === 0);

  return (
    <div className="mx-auto max-w-7xl px-6 pb-10 pt-4">
      {/* LE TITRE RESTE, MAIS IL NE PREND PLUS DE PLACE.
          Cette page portait « СЛОВАРЬ / Vocabulaire » en 36 px, trois
          compteurs et une barre de progression — 130 px avant même d'arriver
          à la liste, et les mêmes chiffres réapparaissaient 200 px plus bas
          dans l'en-tête de liste, puis une troisième fois dans les puces de
          filtre. Le nom de la liste ouverte fait un meilleur titre : il dit
          où l'on est, ce que « Vocabulaire » ne disait pas.
          Il reste ici pour les lecteurs d'écran, qui ont toujours besoin
          d'un h1 pour annoncer la page. */}
      <h1 className="sr-only">Vocabulaire</h1>

      {error && (
        <p className="mb-4 rounded-xl border border-danger/40 bg-danger/10 px-4 py-2.5 font-display text-sm text-danger">
          {error}
        </p>
      )}

      {notice && (
        <p
          role="status"
          className="animate-fade-in mb-4 rounded-xl border border-accent/40 bg-accent/10 px-4 py-2.5 font-display text-sm text-accent-ink"
        >
          {notice}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* ── Colonne des listes ─────────────────────────────────── */}
        {/* LA COLONNE DES LISTES N'EXISTE PLUS SOUS 1024 px. En grille à une
            colonne, elle s'empilait AU-DESSUS des mots : la carte
            « Réviser », le bouton « Nouvelle liste » et une tuile par liste
            passaient devant ce qu'on était venu lire. C'était la vraie
            raison pour laquelle il fallait défiler sur téléphone. On change
            de liste par le titre, qui est un menu. */}
        <aside
          className={`${
            showDetail ? "hidden" : "block"
          } lg:sticky lg:top-[calc(var(--nav-h)+0.5rem)] lg:block lg:h-[calc(100vh-var(--nav-h)-3rem)]`}
        >
          {/* Sur téléphone ce panneau EST la page : il lui faut son titre.
              Au-delà de 1024 px il n'est qu'une colonne à côté des mots, et
              le titre y ferait double emploi avec le nom de la liste
              ouverte. */}
          <h2 className="mb-4 font-display text-2xl font-extrabold tracking-tight lg:hidden">
            Vocabulaire
          </h2>
          {lists === null ? (
            listsFailed ? (
              <LoadFailure message="Impossible de charger tes listes." onRetry={retryLists} />
            ) : (
              <ListRailSkeleton />
            )
          ) : (
            <ListRail
              lists={lists}
              activeId={activeId}
              dueTotal={totals?.due ?? 0}
              onSelect={setActiveId}
              onCreate={() => setShowCreate(true)}
            />
          )}
        </aside>

        {/* ── Les mots ───────────────────────────────────────────── */}
        <section className={`min-w-0 ${showDetail ? "block" : "hidden"} lg:block`}>
          {lists === null ? (
            // LES LISTES NE SONT PAS ENCORE ARRIVÉES — ce n'est ni « aucune
            // liste » ni « rien de sélectionné ». Ce panneau disait « Choisis
            // une liste à gauche » pendant tout le chargement, puis basculait
            // sur la liste ouverte : on lisait un message d'absence avant de
            // voir ses propres mots. L'échec, lui, est déjà dit dans la
            // colonne de gauche ; il n'est répété ici que sous 1024 px, où
            // cette colonne est masquée.
            listsFailed ? (
              <div className="lg:hidden">
                <LoadFailure message="Impossible de charger tes listes." onRetry={retryLists} />
              </div>
            ) : (
              <>
                <WordToolbarSkeleton />
                <WordRowsSkeleton />
              </>
            )
          ) : lists.length === 0 ? (
            <EmptyState onCreate={() => setShowCreate(true)} onImported={importedPack} />
          ) : !activeList ? (
            <div className="rounded-3xl surface p-16 text-center">
              <p className="font-display text-sm text-muted">
                Choisis une liste à gauche pour en voir les mots.
              </p>
            </div>
          ) : (
            <>
              {/* ── LA BARRE : CHERCHER, AJOUTER, LE RESTE DERRIÈRE ────────
                  Le nom de la liste occupait le tiers gauche pour ne rien
                  apprendre : sur grand écran la colonne de gauche le montre
                  déjà en surbrillance, et sur téléphone il se tronquait en
                  « Mots du … », ce qui est pire que de ne rien afficher. Il
                  vit maintenant dans l'invite du champ de recherche, où il
                  donne le contexte sans coûter une ligne, et dans le menu
                  « ⋯ », qui sert aussi à changer de liste.

                  DEUX COMMANDES SEULEMENT SONT À DÉCOUVERT, et ce sont les
                  deux qu'on emploie à chaque session : chercher un mot, en
                  ajouter un. Le reste — filtrer, renommer, supprimer,
                  changer de liste — est derrière le « ⋯ » : ce sont des
                  gestes qu'on fait une fois, pas une fois par mot.

                  Sous 640 px, la recherche prend sa propre ligne : à trois
                  boutons sur la même, il ne lui serait resté que la place
                  d'une icône, c'est-à-dire pas celle d'un champ. */}
              {editingName ? (
                <div className="sticky top-[calc(var(--nav-h)+0.5rem)] z-30 mb-4 rounded-2xl surface px-3 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-bg2/85">
                  <form onSubmit={saveName}>
                    <input
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      autoFocus
                      maxLength={80}
                      onBlur={saveName}
                      aria-label="Nom de la liste"
                      className="w-full rounded-xl border border-accent bg-bg px-3 py-2 font-display text-base font-bold text-text field-focus focus:outline-none"
                    />
                  </form>
                </div>
              ) : (
                <div // `z-50` ET PAS `z-30` : cette barre est `sticky`, donc elle OUVRE UN
                  // CONTEXTE D'EMPILEMENT. Le `z-50` que portent ses menus déroulants
                  // ne les classe qu'entre eux, à l'intérieur ; vis-à-vis du reste de
                  // la page, ils valent le z-index de la barre. À 30, ils passaient
                  // donc sous le bandeau de navigation du bas, qui est en z-40 — et le
                  // menu « ⋯ » se retrouvait coupé par lui.
                  //
                  // Monter la barre est sans effet de bord : elle se fige à 72 px du
                  // haut, la barre de navigation occupe les 64 premiers, et le bandeau
                  // du bas est ailleurs. Elle ne recouvre rien.
                  className="sticky top-[calc(var(--nav-h)+0.5rem)] z-50 mb-4 flex flex-col gap-1.5 rounded-2xl surface px-2.5 py-2 backdrop-blur supports-[backdrop-filter]:bg-bg2/85 sm:flex-row sm:items-center sm:gap-2 sm:px-3 sm:py-2.5">
                  <div className="relative min-w-0 flex-1">
                    <SearchGlyph className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Escape" && setQuery("")}
                      type="text"
                      // L'INVITE PORTE LE NOM DE LA LISTE. C'est le seul
                      // endroit où il ne coûte rien : il disparaît dès qu'on
                      // tape, c'est-à-dire au moment exact où il cesse d'être
                      // utile.
                      placeholder={`Chercher dans « ${activeList.name} »`}
                      aria-label={`Chercher un mot dans ${activeList.name}`}
                      className="w-full rounded-xl border border-border bg-bg py-2 pl-10 pr-9 font-display text-sm text-text placeholder:text-muted/60 field-focus focus:outline-none sm:py-2.5"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        aria-label="Effacer la recherche"
                        className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition-colors hover:text-text"
                      >
                        <CloseGlyph />
                      </button>
                    )}
                  </div>

                  {/* `justify-end` : sous 640 px cette rangée occupe toute
                      la largeur sous le champ de recherche, et les trois
                      boutons s'entassaient à gauche avec un vide à droite.
                      Calés à droite, ils se retrouvent sous le pouce et le
                      vide passe du côté où il ne gêne pas. */}
                  <div className="flex shrink-0 items-center justify-end gap-2">
                    {/* LE RETOUR OCCUPE LE VIDE À GAUCHE DE CETTE RANGÉE.
                        Il était au-dessus, avant le champ de recherche : en
                        colonne, chaque enfant prend sa propre ligne, il s'est
                        donc retrouvé seul sur une rangée à lui, pour une
                        flèche de 32 px. Ici il ne coûte rien — cette place
                        était perdue depuis que les trois boutons sont calés à
                        droite.

                        Il n'existe que là où il y a quelque chose à quitter :
                        au-delà de 1024 px les listes sont déjà à gauche en
                        permanence, et une flèche qui « remonte » vers une
                        colonne visible ne veut rien dire. */}
                    <button
                      type="button"
                      onClick={() => setActiveId(null)}
                      aria-label="Revenir à mes listes"
                      title="Mes listes"
                      className="hover-surface mr-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted sm:h-9 sm:w-9 lg:hidden"
                    >
                      <BackGlyph />
                    </button>

                    {/* AJOUTER EST LE BOUTON PLEIN. C'est par lui que la
                        liste existe : sans mot ajouté, ni la révision ni la
                        recherche n'ont de matière. « Réviser » garde son
                        contour et son compteur — il est la destination, pas
                        le point de départ. */}
                    <button
                      type="button"
                      onClick={() => setShowAdd(true)}
                      className="btn btn-primary btn-sheen flex h-8 shrink-0 items-center gap-1.5 rounded-xl px-2.5 font-display text-[13px] font-bold sm:h-9 sm:px-3 sm:text-sm"
                    >
                      <PlusIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      Ajouter
                    </button>

                    {activeList.wordCount > 0 && (
                      <Dropdown
                        button={
                          <>
                            <PlayGlyph />
                            <span className="hidden lg:inline">Réviser</span>
                            {dueCount > 0 && (
                              <span className="rounded-full bg-accent/15 px-1.5 font-display text-[11px] font-bold text-accent-ink">
                                {dueCount}
                              </span>
                            )}
                          </>
                        }
                        buttonClassName="flex h-8 shrink-0 items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-2.5 font-display text-[13px] font-bold text-accent-ink transition-colors hover:border-accent/60 hover:bg-accent/15 sm:h-9 sm:px-3 sm:text-sm"
                        label="Choisir un mode de révision"
                        width="w-[290px]"
                      >
                        {(close) => (
                          <>
                            {REVIEW_MODES.map((m) => (
                              <Link
                                key={m.mode}
                                href={`/vocabulary/${m.mode}?list=${activeList.id}`}
                                onClick={close}
                                className="menu-item flex items-start gap-3 rounded-[10px] p-2.5"
                              >
                                <span
                                  aria-hidden
                                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg3 text-muted"
                                >
                                  <ModeIcon name={m.icon} />
                                </span>
                                <span className="min-w-0">
                                  <span className="block font-display text-sm font-bold text-text">
                                    {m.label}
                                  </span>
                                  <span className="block font-display text-[12px] leading-snug text-muted">
                                    {m.desc}
                                  </span>
                                </span>
                              </Link>
                            ))}

                            {totals && totals.due > 0 && (
                              <>
                                <div className="my-1 h-px bg-border" />
                                <Link
                                  href="/vocabulary/review"
                                  onClick={close}
                                  className="menu-item flex items-center gap-2 rounded-[10px] px-2.5 py-2 font-display text-sm font-semibold text-text"
                                >
                                  <span className="flex-1">Réviser toutes les listes</span>
                                  <span className="font-display text-xs text-muted">
                                    {totals.due}
                                  </span>
                                </Link>
                              </>
                            )}
                          </>
                        )}
                      </Dropdown>
                    )}

                    <Dropdown
                      button={<MoreDots />}
                      buttonClassName="hover-surface flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted sm:h-9 sm:w-9"
                      label="Listes et réglages"
                      width="w-[250px]"
                    >
                      {(close) => (
                        <>
                          <p className="px-3 pb-1 pt-1.5 font-display text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                            Listes
                          </p>
                          {(lists ?? []).map((l) => (
                            <button
                              key={l.id}
                              onClick={() => {
                                setActiveId(l.id);
                                close();
                              }}
                              className={`menu-item flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left font-display text-sm ${
                                l.id === activeId ? "font-bold text-accent-ink" : "text-text"
                              }`}
                            >
                              <ListTile name={l.name} className="h-7 w-7 shrink-0 text-[11px]" />
                              <span className="min-w-0 flex-1 truncate">{l.name}</span>
                              <span className="shrink-0 font-display text-xs text-muted">
                                {l.wordCount}
                              </span>
                            </button>
                          ))}
                          <button
                            onClick={() => {
                              setShowCreate(true);
                              close();
                            }}
                            className="menu-item flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left font-display text-sm font-semibold text-text"
                          >
                            <PlusIcon className="h-4 w-4 shrink-0" />
                            Nouvelle liste
                          </button>

                          {stats && stats.total > 0 && (
                            <>
                              <div className="my-1 h-px bg-border" />
                              <p className="px-3 pb-1 pt-1.5 font-display text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                                Afficher
                              </p>
                              {FILTERS.map((f) => {
                                const n = f.id === "all" ? stats.total : stats[f.id];
                                const on = filter === f.id;
                                return (
                                  <button
                                    key={f.id}
                                    onClick={() => {
                                      setFilter(f.id);
                                      close();
                                    }}
                                    className={`menu-item flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left font-display text-sm ${
                                      on ? "font-bold text-accent-ink" : "text-text"
                                    }`}
                                  >
                                    <span className="flex-1">{f.label}</span>
                                    <span className="font-display text-xs text-muted">{n}</span>
                                  </button>
                                );
                              })}
                            </>
                          )}

                          <div className="my-1 h-px bg-border" />
                          <button
                            onClick={() => {
                              setNameDraft(activeList.name);
                              setEditingName(true);
                              close();
                            }}
                            className="menu-item block w-full rounded-[10px] px-3 py-2 text-left font-display text-sm text-text"
                          >
                            Renommer la liste
                          </button>
                          <button
                            onClick={() => {
                              setConfirmingDelete(true);
                              close();
                            }}
                            className="menu-item flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left font-display text-sm text-danger"
                          >
                            <TrashIcon className="h-4 w-4 shrink-0" />
                            Supprimer la liste
                          </button>
                        </>
                      )}
                    </Dropdown>
                  </div>
                </div>
              )}

              <div className="space-y-2.5">
                {words === null ? (
                  wordsFailed ? (
                    <LoadFailure
                      message="Impossible d'afficher les mots de cette liste."
                      onRetry={retryWords}
                      secondary={
                        <button
                          type="button"
                          onClick={() => setActiveId(null)}
                          className="rounded-xl border border-border px-4 py-2 font-display text-sm font-semibold text-muted transition-colors hover:border-muted hover:text-text"
                        >
                          Mes listes
                        </button>
                      }
                    />
                  ) : (
                    // Autant de lignes que la liste a de mots (le rail les a
                    // déjà comptés) : la page ne change pas de hauteur à
                    // l'arrivée des mots.
                    <WordRowsSkeleton rows={Math.min(Math.max(activeList.wordCount, 1), 8)} />
                  )
                ) : words.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
                    <p className="font-display text-sm text-muted">
                      Liste vide. Tape un mot russe : sa traduction, sa translittération et son
                      accent tonique te sont proposés.
                    </p>
                    {!showAdd && (
                      <button
                        onClick={() => setShowAdd(true)}
                        className="btn btn-primary btn-sheen mt-4 rounded-xl px-4 py-2 font-display text-sm"
                      >
                        Ajouter un premier mot
                      </button>
                    )}
                  </div>
                ) : visible && visible.length === 0 ? (
                  <p className="px-2 py-6 font-display text-sm text-muted">
                    Aucun mot ne correspond.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {visible?.map((w) => (
                      <WordCard
                        key={w.id}
                        word={w}
                        onDelete={removeWord}
                        onEdit={setEditing}
                        onFocusChange={changeFocus}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* AJOUTER UN MOT PASSE PAR UN DIALOGUE, PLEIN ÉCRAN SUR TÉLÉPHONE.
          Le formulaire s'ouvrait en ligne, en tête de liste : il repoussait
          les mots vers le bas au moment précis où on venait en consulter un
          pour savoir s'il y était déjà, et sur un téléphone le clavier
          virtuel en cachait la moitié. En feuille, il a l'écran entier et
          le clavier ne fait que pousser son contenu.

          IL SE REFERME SUR UN AJOUT RÉUSSI. Il restait ouvert et se vidait,
          pour enchaîner plusieurs mots sans rouvrir — sauf que sur un
          téléphone on se retrouvait devant un formulaire vide, clavier
          toujours ouvert, et qu'il fallait viser la croix pour revenir à sa
          liste et voir le mot qu'on venait d'ajouter. Le mot apparaît en tête
          de liste : la feuille qui se referme dessus est la confirmation. */}
      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        variant="sheet"
        title="Ajouter un mot"
        description="Tape en russe ou en français — la traduction, l'accent tonique et la prononciation suivent."
      >
        <AddWordForm bare onAdd={handleAdd} onDone={() => setShowAdd(false)} />
      </Modal>

      {/* MODIFIER UN MOT : la même feuille que l'ajout, pour le même geste —
          remplir deux langues — mais partant de ce qui est enregistré. On ne
          pouvait jusqu'ici que supprimer un mot mal saisi et le retaper, en
          perdant au passage son historique de révision. */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        variant="sheet"
        title="Modifier le mot"
        description="Corrige le russe, la traduction ou la prononciation — l'accent tonique est reposé à l'enregistrement."
      >
        {editing && (
          <EditWordForm
            key={editing.id}
            word={editing}
            onSave={saveEdit}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>

      {/* LA SUPPRESSION D'UNE LISTE PASSE PAR UN DIALOGUE, depuis qu'elle est
          entrée dans un menu : une confirmation en ligne dans la barre
          d'outils aurait fait sauter la mise en page, et un geste
          irréversible mérite mieux qu'un second bouton au même endroit que
          le premier. */}
      <Modal
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title="Supprimer cette liste ?"
        description={
          activeList
            ? `« ${activeList.name} » et ses ${activeList.wordCount} mot${activeList.wordCount === 1 ? "" : "s"} seront perdus. C'est définitif.`
            : undefined
        }
        icon={
          <span
            aria-hidden
            className="flex h-14 w-14 items-center justify-center rounded-xl bg-danger/12 text-danger"
          >
            <TrashIcon className="h-6 w-6" />
          </span>
        }
      >
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmingDelete(false)}
            className="rounded-xl border border-border px-4 py-2.5 font-display text-sm font-semibold text-muted transition-colors hover:border-muted hover:text-text"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={removeList}
            className="btn rounded-xl bg-danger px-5 py-2.5 font-display text-sm font-semibold text-on-tint transition-[filter] hover:brightness-110"
          >
            Supprimer
          </button>
        </div>
      </Modal>

      <Modal
        open={showCreate}
        onClose={closeCreate}
        title="Nouvelle liste"
        description="Un thème, un chapitre de manuel, les mots d'un film — ce qui te sert à regrouper."
        icon={
          // La tuile que la liste portera dans la colonne de gauche, avec sa
          // couleur déjà calculée depuis le nom tapé. Le dialogue montre son
          // résultat pendant qu'on le remplit, au lieu de le décrire.
          newName.trim() ? (
            <ListTile name={newName} className="h-14 w-14 text-xl" />
          ) : (
            <span
              aria-hidden
              className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-border text-2xl text-muted/60"
            >
              +
            </span>
          )
        }
      >
        <form onSubmit={submitNewList}>
          <label className="block">
            <span className="mb-1.5 block font-display text-xs font-semibold uppercase tracking-wide text-muted">
              Nom de la liste
            </span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Vocabulaire du voyage"
              maxLength={80}
              className="w-full rounded-xl border border-border bg-bg px-4 py-3 font-display text-base text-text placeholder:text-muted/50 field-focus focus:outline-none"
            />
          </label>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="font-display text-xs text-muted">Idées :</span>
            {LIST_IDEAS.map((idea) => (
              <button
                key={idea}
                type="button"
                onClick={() => setNewName(idea)}
                className="rounded-full border border-border px-2.5 py-1 font-display text-xs text-muted transition-colors hover:bg-accent/10 hover:border-accent/35 hover:text-accent-ink"
              >
                {idea}
              </button>
            ))}
          </div>

          {/* Qui ne sait pas encore quels mots apprendre n'a pas à les
              chercher : la banque sait lesquels sont les plus courants. */}
          <button
            type="button"
            onClick={() => {
              closeCreate();
              setShowPacks(true);
            }}
            className="mt-4 font-display text-sm font-semibold text-accent-ink underline-offset-4 hover:underline"
          >
            Ou partir d&apos;un paquet de mots tout prêt →
          </button>

          <div className="mt-6 flex justify-end gap-2 border-t border-border pt-5">
            <button
              type="button"
              onClick={closeCreate}
              className="rounded-xl border border-border px-4 py-2.5 font-display text-sm font-semibold text-muted transition-colors hover:border-muted hover:text-text"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="btn btn-primary btn-sheen rounded-xl px-5 py-2.5 font-display text-sm disabled:cursor-not-allowed disabled:opacity-40"
            >
              {creating ? "Création…" : "Créer la liste"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={showPacks}
        onClose={() => setShowPacks(false)}
        title="Paquets de départ"
        description="Des listes toutes faites, à compléter ensuite avec tes propres mots."
      >
        <StarterPacks onImported={importedPack} />
      </Modal>
    </div>
  );
}

/** La flèche de retour vers la liste des listes, sur téléphone. */
function BackGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

/** La loupe de la barre d'outils, fermée comme ouverte. */
function SearchGlyph({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

/** La croix qui referme la recherche. */
function CloseGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="h-4 w-4"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** Le triangle de « Réviser » : le seul bouton plein de la barre. */
function PlayGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  );
}

/** Les trois points des actions secondaires. */
function MoreDots() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

/** Un chargement qui a échoué, avec de quoi le relancer. */
function LoadFailure({
  message,
  onRetry,
  secondary,
}: {
  message: string;
  onRetry: () => void;
  secondary?: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-danger/40 bg-danger/5 px-5 py-6 text-center"
    >
      <p className="font-display text-sm text-danger">{message}</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="btn btn-primary rounded-xl px-4 py-2 font-display text-sm"
        >
          Réessayer
        </button>
        {secondary}
      </div>
    </div>
  );
}

function EmptyState({
  onCreate,
  onImported,
}: {
  onCreate: () => void;
  onImported: (list: VocabListSummary, added: number) => void;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-bg2 p-6 text-center sm:p-14">
      <p className="font-display text-lg font-bold">Commence ton vocabulaire</p>
      <p className="mx-auto mt-2 max-w-md font-display text-sm leading-relaxed text-muted">
        Crée une liste, tape un mot russe : sa traduction, sa translittération et son accent tonique
        te sont proposés. Tu gardes ce qui te convient, tu réécris le reste.
      </p>
      <button
        onClick={onCreate}
        className="btn btn-primary btn-sheen mt-6 rounded-xl px-5 py-2.5 font-display text-sm"
      >
        Créer ma première liste
      </button>

      {/* PAR QUOI COMMENCER. Une page vide demande de savoir quels mots
          valent la peine d'être appris ; la banque le sait, elle. */}
      <div className="mt-10 border-t border-border pt-8 text-left">
        <p className="font-display text-base font-bold">Ou pars d&apos;un paquet tout prêt</p>
        <div className="mt-3">
          <StarterPacks onImported={onImported} />
        </div>
      </div>
    </div>
  );
}
