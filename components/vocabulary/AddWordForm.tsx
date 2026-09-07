"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  suggestTranslation,
  type AddOutcome,
  type TranslationSuggestion,
} from "@/lib/vocabulary/custom";
import { nearMiss, type NearMiss } from "@/lib/vocabulary/autocomplete";
import { loadAddWordFirstSide, saveAddWordFirstSide } from "@/lib/storage";
import { LoadingDots } from "@/components/ui/Skeleton";
import AiSpark from "@/components/ui/AiSpark";
import { PlusIcon, SwapIcon } from "@/components/ui/icons";
import Link from "next/link";
import { NOUNS } from "@/lib/grammar/nouns-data";
import CompletionList from "@/components/vocabulary/CompletionList";
import { completeFr, completeRu, type Completion } from "@/lib/vocabulary/autocomplete";
import { transliterate } from "@/lib/vocabulary/transliterate";
import { FIELD_MAX, TRANSLIT_MAX } from "@/lib/vocabulary/limits";
import { speakFr, speakRu } from "@/lib/vocabulary/speech";
import SpeakButton from "@/components/vocabulary/SpeakButton";
import DictateButton from "@/components/vocabulary/DictateButton";

/**
   * Ajout d'un mot, dans le sens qu'on veut.
   *
   * DEUX PORTES D'ENTRÉE. On tape un mot russe entendu quelque part et sa
   * traduction arrive ; on tape un mot français et c'est le mot russe qui
   * arrive. Le champ rempli en premier décide du sens, et une flèche entre les
   * deux le montre. N'accepter que le russe supposait qu'on part toujours de
   * ce qu'on a entendu, jamais de ce qu'on cherche à dire.
   *
   * LA SUGGESTION REMPLIT, ELLE NE VERROUILLE PAS. Tant que l'apprenant n'a
   * pas touché le champ d'en face, celui-ci porte un liseré et un badge ; sa
   * première frappe le fait basculer en « la sienne » et la proposition ne
   * revient plus. Écrire soi-même ne demande donc aucun geste — c'est le
   * comportement par défaut d'un champ de texte, la suggestion se contente de
   * le pré-remplir.
   *
   * COÛT : un appel par mot saisi, déclenché après une pause de frappe et
   * annulé si la saisie repart. Les 451 noms de la banque curée répondent sans
   * appel du tout, côté serveur, dans les deux sens.
   */

const DEBOUNCE_MS = 650;
/** Taille de la banque curée, citée dans le message de refus. */
const NOUN_COUNT = NOUNS.length;

export default function AddWordForm({
  onAdd,
  /**
   * Retire la carte et l'en-tête du formulaire.
   *
   * QUAND IL EST DANS UN DIALOGUE, celui-ci porte déjà un fond, un
   * rembourrage et un titre : les laisser ici donnait une carte dans une
   * carte, deux rembourrages empilés et « Ajouter un mot » écrit deux fois
   * à trois centimètres d'intervalle.
   */
  bare = false,
  /**
   * Appelé après un ajout RÉUSSI — la feuille se referme dessus.
   *
   * Le formulaire restait ouvert et se vidait, pour enchaîner sans rouvrir.
   * Sur un téléphone, ça laissait l'apprenant devant un formulaire vide avec
   * le clavier toujours là : il fallait viser la croix pour revenir à sa
   * liste et vérifier que le mot y était. Refermer répond au geste — le mot
   * apparaît en tête de liste, ce qui est la meilleure confirmation
   * possible.
   *
   * Facultatif : sans lui le formulaire garde l'ancien comportement, et
   * c'est alors la ligne « ✓ ajouté » du pied qui accuse réception.
   */
  onDone,
}: {
  onAdd: (word: {
    ru: string;
    fr: string;
    transliteration?: string;
  }) => Promise<AddOutcome>;
  bare?: boolean;
  onDone?: () => void;
}) {
  const [ru, setRu] = useState("");
  const [fr, setFr] = useState("");
  /**
     * Quelle langue occupe la PREMIÈRE colonne. Purement visuel : `ru` et
     * `fr` restent chacun leur langue, seul l'ordre d'affichage change — un
     * échange des valeurs transformerait « спасибо/merci » en
     * « merci/спасибо », ce qui serait faux.
     *
     * Le choix est mémorisé : quelqu'un qui part systématiquement du
     * français ne doit pas le redire à chaque mot.
     */
  const [frFirst, setFrFirst] = useState(() => loadAddWordFirstSide() === "fr");
  const [transliteration, setTransliteration] = useState("");
  const [showTranslit, setShowTranslit] = useState(false);

  const [suggestion, setSuggestion] = useState<TranslationSuggestion | null>(null);
  /**
   * Motif d'un REFUS de suggestion, distinct d'une absence de résultat.
   *
   * Sans cette distinction, un compte gratuit — pour lequel la suggestion
   * automatique est fermée — voyait le champ d'en face rester vide, sans
   * rien pour dire s'il s'agissait d'un mot introuvable, d'une panne, ou
   * d'une fonctionnalité qu'il n'a pas. C'est le pire des trois états : on
   * ne peut ni corriger, ni réessayer, ni comprendre.
   */
  const [blocked, setBlocked] = useState<{ upgrade: boolean } | null>(null);

  /**
   * La complétion locale, calculée à CHAQUE FRAPPE sans réseau ni token.
   *
   * Elle ne remplace pas la suggestion du modèle, elle la précède : la
   * banque curée répond en une fraction de milliseconde pour les 583 mots
   * qu'elle connaît — avec l'accent tonique correct et une traduction relue
   * à la main — pendant que le modèle, lui, sert la longue traîne après la
   * pause de frappe. Deux mécanismes, deux rôles.
   */
  const [openList, setOpenList] = useState<"ru" | "fr" | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const completions = useMemo(() => {
    if (openList === "ru") return completeRu(ru);
    if (openList === "fr") return completeFr(fr);
    return [];
  }, [openList, ru, fr]);

  /**
   * La paire retenue dans le menu de complétion, sous la forme « ru|fr ».
   *
   * ELLE EST EN ÉTAT, PAS EN REF, et c'est imposé par le compilateur React :
   * `pick` est appelée depuis un composant enfant, donc tout ce qu'elle
   * touche en sort. Muter une ref depuis là ferait considérer cette ref
   * comme figée PARTOUT, y compris dans `reset()` — le compilateur refusait
   * la construction pour cette raison. L'état, lui, se met à jour d'où l'on
   * veut.
   *
   * Son rôle : empêcher l'effet de suggestion de repartir sur une paire
   * qu'on vient de choisir dans la banque, laquelle a déjà répondu, et
   * mieux que le modèle ne le ferait.
   */
  const [pickedPair, setPickedPair] = useState<string | null>(null);

  /** Insère une proposition dans LES DEUX champs : c'est une paire. */
  function pick(item: Completion) {
    setRu(item.ru);
    setFr(item.fr);
    // La banque porte l'accent tonique : la prononciation se calcule, elle ne
    // se demande à personne. Sans ça, les mots CONNUS étaient les seuls à
    // n'avoir aucune version phonétique — le serveur les servait avec
    // `transliteration: null`, et le menu de complétion n'en posait aucune.
    if (!translitOwned) setTransliteration(transliterate(item.ru));
    setPickedPair(`${item.ru}|${item.fr}`);
    setFilled(null);
    setSuggestion(null);
    setBlocked(null);
    setOpenList(null);
    setActiveIndex(0);
  }

  /**
   * Le clavier du champ.
   *
   * TAB COMPLÈTE, et c'est le geste demandé. Il faut donc le détourner de
   * son rôle habituel — passer au champ suivant — mais UNIQUEMENT quand une
   * proposition est affichée : sinon on emprisonnerait la tabulation dans
   * le formulaire, ce qui est l'un des pires défauts d'accessibilité qu'on
   * puisse introduire.
   */
  function onFieldKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>, side: "ru" | "fr") {
    // ENTRÉE ENVOIE, ELLE NE SAUTE PAS DE LIGNE. Le champ est un
    // <textarea> parce qu'il doit grandir ; il reste une ligne de
    // saisie, et un retour chariot n'a rien à faire dans un mot ni dans
    // une expression. (Quand la liste de complétions est ouverte, le
    // bloc ci-dessous intercepte Entrée avant, pour choisir.)
    if (openList !== side || completions.length === 0) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        e.currentTarget.form?.requestSubmit();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % completions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + completions.length) % completions.length);
    } else if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      pick(completions[activeIndex]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpenList(null);
    }
  }
  const [suggesting, setSuggesting] = useState(false);
  /** Le champ actuellement rempli par une proposition, s'il y en a un. */
  const [filled, setFilled] = useState<"ru" | "fr" | null>(null);
  /** Le champ que l'apprenant pilote — sert aussi à orienter la flèche. */
  const [driver, setDriver] = useState<"ru" | "fr" | null>(null);

  const [submitting, setSubmitting] = useState(false);
  /**
   * LE RÉSULTAT DU DERNIER ENVOI, refus compris.
   *
   * C'était `justAdded`, qui ne savait dire que « ✓ ajouté » : un ajout
   * refusé ne disait donc rien du tout, et le formulaire se contentait de
   * ne pas se fermer. On ajoutait deux fois le même mot sans jamais
   * l'apprendre.
   */
  const [notice, setNotice] = useState<{ kind: "added" | "refused"; text: string } | null>(null);
  /**
   * LA DÉTECTION S'ARRÊTE DÈS QUE L'APPRENANT A TRANCHÉ LUI-MÊME.
   *
   * S'il actionne le bouton d'inversion, c'est qu'il veut ce sens-là —
   * y compris pour écrire du latin dans le champ russe, ce qui est le cas de
   * quelqu'un qui note une translittération à la main. Reculer aussitôt
   * derrière lui donnerait un formulaire qui se bat contre son utilisateur,
   * et c'est le seul défaut qu'une détection automatique ne se fait jamais
   * pardonner. Le verrou saute au mot suivant (voir `reset`).
   */
  const autoDetect = useRef(true);
  const firstInput = useRef<HTMLTextAreaElement>(null);
  // « L'apprenant a-t-il écrit dans ce champ ? » est une information de
  // saisie : en refs, elles sont lues à jour dans le callback de la requête
  // sans le relancer à chaque frappe.
  const ruTouched = useRef(false);
  const frTouched = useRef(false);
  /**
   * La translittération est-elle CELLE DE L'APPRENANT ?
   *
   * En état et non en ref, contrairement à ses deux voisines, et pour la même
   * raison que `pickedPair` : elle est lue depuis `pick`, appelée par le menu
   * de complétion — un composant enfant. Le compilateur React considère alors
   * la ref comme figée PARTOUT et refuse la construction. L'état, lui, se lit
   * et s'écrit d'où l'on veut.
   */
  const [translitOwned, setTranslitOwned] = useState(false);
  /** Dernière requête émise, pour ne pas la rejouer quand elle se remplit. */
  const lastQuery = useRef("");
  /**
   * Numéro de la dernière requête lancée. Une réponse dont le numéro n'est
   * plus celui-ci est périmée : on la jette. C'est ce compteur qui remplace
   * l'annulation — voir la note dans l'effet ci-dessous.
   */
  const requestId = useRef(0);
  /**
   * Nombre de requêtes réellement en vol.
   *
   * SÉPARÉ DU NUMÉRO, et c'est nécessaire : le numéro dit QUELLE réponse
   * compte, ce compteur dit S'IL FAUT ENCORE ATTENDRE. Les confondre laisse
   * l'indicateur de chargement allumé pour toujours dès qu'une réponse est
   * jetée sans qu'une autre lui succède — par exemple quand l'apprenant
   * efface jusqu'à une seule lettre pendant qu'une requête est partie.
   */
  const inFlight = useRef(0);

  function toggleFirstSide() {
    const next = !frFirst;
    autoDetect.current = false;
    setFrFirst(next);
    saveAddWordFirstSide(next ? "fr" : "ru");
    // LE FOCUS APRÈS LE RENDU, pas pendant. `firstInput` ne désignera le
    // nouveau premier champ qu'une fois React repassé : appelé tout de
    // suite, `focus()` visait encore l'ANCIEN premier champ, ce qui donnait
    // l'impression que le curseur — et donc le texte qu'on continuait de
    // taper — restait du mauvais côté après l'inversion.
    requestAnimationFrame(() => firstInput.current?.focus());
  }

  useEffect(() => {
    // Un seul champ touché : c'est lui qui pilote. Les deux touchés : il n'y
    // a plus rien à proposer.
    const side =
      ruTouched.current && !frTouched.current
        ? "ru"
        : frTouched.current && !ruTouched.current
          ? "fr"
          : null;
    if (!side) return;
    const word = (side === "ru" ? ru : fr).trim();
    const query = `${side}:${word}`;
    // Le remplissage du champ d'en face rejoue cet effet : sans cette garde
    // on redemanderait la même chose en boucle.
    if (word.length < 2 || query === lastQuery.current) return;
    // Paire choisie dans la banque : rien à demander au modèle.
    if (pickedPair === `${ru}|${fr}`) return;

    // NUMÉROTATION PLUTÔT QU'ANNULATION — le modèle des traducteurs à
    // saisie continue.
    //
    // Deux tentatives avec `AbortController` ont laissé fuir un
    // `AbortError` jusqu'à l'écran : une requête annulée REJETTE, et ce
    // rejet peut surgir à plusieurs endroits (la requête, la lecture du
    // corps, la couche de transport du framework). Il suffit d'un chemin
    // oublié pour que l'erreur remonte, et se battre garde après garde
    // revenait à traiter le symptôme.
    //
    // Ici, plus rien n'est annulé : chaque requête reçoit un NUMÉRO, et sa
    // réponse n'est prise en compte que si ce numéro est encore le dernier
    // émis. Une réponse périmée est simplement ignorée. Aucune promesse
    // n'est jamais rejetée par nous, donc aucune ne peut fuir — c'est une
    // propriété de la structure, pas d'un filet.
    //
    // Le prix : une requête abandonnée va au bout de son aller-retour.
    // Compte tenu de la temporisation de frappe (650 ms), c'est au plus un
    // appel par pause réellement marquée — la banque curée répondant en
    // plus sans modèle pour ses 451 noms.
    const id = ++requestId.current;

    const timer = setTimeout(async () => {
      lastQuery.current = query;
      inFlight.current += 1;
      setSuggesting(true);

      let data: Awaited<ReturnType<typeof suggestTranslation>> | null = null;
      try {
        data = await suggestTranslation(word, side);
      } catch {
        // Réseau, serveur, réponse illisible : la suggestion est un
        // confort, jamais un prérequis. On ne signale rien.
      } finally {
        // L'indicateur s'éteint dès que PLUS RIEN n'est en vol — que la
        // réponse ait servi ou non. C'est ce qui évite des points de
        // chargement qui tournent indéfiniment après une réponse jetée.
        inFlight.current -= 1;
        if (inFlight.current === 0) setSuggesting(false);
      }

      // LE TEST QUI REMPLACE L'ANNULATION. Une réponse qui n'est plus la
      // dernière attendue est jetée : une requête plus récente la
      // remplacera, ou l'apprenant a changé d'avis.
      if (id !== requestId.current) return;
      if (!data) return;
      setBlocked(data.quota ? { upgrade: data.quota.upgrade } : null);
      setSuggestion(data.suggestion);
      if (!data.suggestion) return;

      // Pré-remplissage : uniquement dans le champ d'en face, et uniquement
      // s'il n'a pas été touché. Écraser ce que l'apprenant a écrit serait
      // exactement le contraire de « garder la sienne ».
      if (side === "ru" && !frTouched.current) {
        setFr(data.suggestion.fr);
        setFilled("fr");
      } else if (side === "fr" && !ruTouched.current) {
        setRu(data.suggestion.ru);
        setFilled("ru");
      }
      if (data.suggestion.transliteration && !translitOwned) {
        setTransliteration(data.suggestion.transliteration);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      // Invalide la requête en vol : sa réponse arrivera peut-être, elle
      // ne sera plus la dernière. C'est tout ce que faisait `abort()`, sans
      // le rejet.
      requestId.current += 1;
    };
  }, [ru, fr, pickedPair, translitOwned]);

  function reset() {
    setRu("");
    setFr("");
    setTransliteration("");
    setSuggestion(null);
    setBlocked(null);
    setPickedPair(null);
    setFilled(null);
    setDriver(null);
    setShowTranslit(false);
    ruTouched.current = false;
    frTouched.current = false;
    setTranslitOwned(false);
    autoDetect.current = true;
    lastQuery.current = "";
    firstInput.current?.focus();
  }

  function edit(side: "ru" | "fr", value: string) {
    // ── Reconnaissance de l'écriture ────────────────────────────────
    // Le texte passe de l'autre côté, et l'ordre des champs suit pour que
    // le curseur reste là où l'apprenant regarde. Trois garde-fous : le
    // verrou ci-dessus, l'autre champ doit être VIDE — on ne détruit pas ce
    // qui est déjà écrit — et il faut deux caractères, sinon la première
    // lettre ferait sauter la mise en page à chaque frappe.
    const other = side === "ru" ? fr : ru;
    if (
      autoDetect.current &&
      other.trim() === "" &&
      value.trim().length >= 2 &&
      wrongScript(side, value)
    ) {
      const moved = side === "ru" ? "fr" : "ru";
      if (moved === "fr") {
        setFr(value);
        setRu("");
      } else {
        setRu(value);
        setFr("");
      }
      ruTouched.current = moved === "ru";
      frTouched.current = moved === "fr";
      if (!translitOwned) {
        setTransliteration(moved === "ru" ? transliterate(value) : "");
      }
      // On NE MÉMORISE PAS ce sens comme préférence (`saveAddWordFirstSide`) :
      // c'est une correction sur ce mot-ci, pas un choix sur les suivants.
      setFrFirst(moved === "fr");
      setFilled(null);
      setDriver(moved);
      setSuggestion(null);
      setPickedPair(null);
      setOpenList(moved);
      setActiveIndex(0);
      // RIEN NE L'ANNONCE PAR ÉCRIT, ET C'EST SUFFISANT : les deux libellés
      // de l'en-tête échangent leur place sous les yeux, au même instant que
      // le texte, et le bouton d'inversion est à côté pour contredire. Une
      // ligne « français reconnu » disait ce qui se voyait déjà.
      //
      // Après le rendu, comme pour l'inversion manuelle : `firstInput` ne
      // désigne le nouveau premier champ qu'une fois React repassé.
      requestAnimationFrame(() => {
        const el = firstInput.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      });
      return;
    }

    const touched = side === "ru" ? ruTouched : frTouched;
    touched.current = value.length > 0;
    if (side === "ru") setRu(value);
    else setFr(value);
    // La prononciation suit la frappe côté russe. Elle reste une PROPOSITION :
    // la première frappe dans le champ de translittération l'y fige (voir
    // `translitOwned`), exactement comme pour la traduction.
    if (side === "ru" && !translitOwned) setTransliteration(transliterate(value));
    // Le champ redevient celui de l'apprenant dès qu'il y écrit.
    if (filled === side) setFilled(null);
    setDriver(
      ruTouched.current && !frTouched.current
        ? "ru"
        : frTouched.current && !ruTouched.current
          ? "fr"
          : null,
    );
    if (value.trim().length < 2) setSuggestion(null);
    // Chaque frappe rouvre la liste et repart de la première proposition :
    // garder l'index précédent pointerait sur un mot qui n'a plus rien à
    // voir avec ce qui est écrit.
    setOpenList(side);
    setActiveIndex(0);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ru.trim() || !fr.trim() || submitting) return;
    setSubmitting(true);
    setNotice(null);
    const outcome = await onAdd({
      ru: ru.trim(),
      fr: fr.trim(),
      transliteration: transliteration.trim() || undefined,
    });
    setSubmitting(false);

    if (outcome.status !== "added") {
      // LES CHAMPS RESTENT REMPLIS, et le formulaire ouvert. Un doublon
      // n'est pas une faute de frappe : on veut relire ce qu'on allait
      // ajouter, changer une lettre, ou renoncer. Les vider obligerait à
      // tout retaper pour corriger un caractère.
      setNotice({ kind: "refused", text: outcome.message });
      requestAnimationFrame(() => firstInput.current?.focus());
      return;
    }

    setNotice({ kind: "added", text: `« ${outcome.word.ru} » ajouté` });
    reset();
    // APRÈS `reset()`, pas avant : le formulaire doit repartir vide s'il
    // est rouvert. `reset()` redonne le focus au premier champ ; la modale
    // le reprendra en se démontant pour le rendre au bouton qui l'a
    // ouverte, ce qui referme aussi le clavier.
    onDone?.();
  }

  // Une seule marque, sur le champ concerné : d'où vient ce qui s'y trouve,
  // et si le modèle en répond. Le champ reste modifiable à la frappe — c'est
  // l'affordance, elle n'a pas besoin d'un bouton pour la répéter.
  const badge =
    suggestion && filled ? (
      suggestion.source === "bank" ? (
        <span
          className="rounded-full bg-success/15 px-2 py-0.5 font-display text-[10px] font-bold normal-case tracking-normal text-success"
          title="Traduction vérifiée à la main — celle qui sert aussi aux exercices de déclinaison"
        >
          ✓ vérifié
        </span>
      ) : (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-display text-[10px] font-bold normal-case tracking-normal ${
            suggestion.confident
              ? "bg-accent2/15 text-accent2"
              : "bg-accent2-deep/20 text-accent2-deep"
          }`}
          title={
            suggestion.confident
              ? "Proposition générée par l'IA — corrige-la si besoin"
              : "L'IA n'est pas sûre de cette traduction — vérifie-la"
          }
        >
          <AiSpark className="h-3 w-3" />
          {suggestion.confident ? "proposé" : "à vérifier"}
        </span>
      )
    ) : null;

  // Définis ici pour pouvoir être ORDONNÉS dans la grille. `firstInput`
  // suit l'ordre d'affichage : après un ajout, le curseur doit revenir dans
  // le champ par lequel l'apprenant commence, pas systématiquement le russe.
  /**
   * L'ORTHOGRAPHE APPROCHANTE, calculée pendant la frappe.
   *
   * Elle se tait pendant qu'on écrit (voir `nearMiss`) et ne parle que
   * lorsque le mot tapé ne commence aucun mot connu tout en ressemblant
   * beaucoup à l'un d'eux. Ce n'est jamais un verdict : l'index ne contient
   * qu'une fraction du russe, et « ce mot n'existe pas » serait faux le
   * plus souvent. C'est une question, à laquelle l'apprenant répond en
   * cliquant ou en ignorant.
   *
   * Elle se tait aussi quand le mot vient d'être CHOISI dans le menu ou
   * proposé par le modèle : dans ces deux cas, l'orthographe n'est pas de
   * l'apprenant et la mettre en doute n'aurait aucun sens.
   */
  const misspelling: NearMiss | null = useMemo(
    () => (filled === "ru" || pickedPair !== null ? null : nearMiss(ru)),
    [ru, filled, pickedPair]
  );

  /**
   * Un seul des deux côtés est rempli — l'ajout est donc impossible, et il
   * faut le dire. Voir la note au-dessus du bouton.
   */
  const halfFilled = Boolean(ru.trim()) !== Boolean(fr.trim());

  /** Remplace la saisie par la correction proposée, et referme la question. */
  function acceptCorrection(fix: NearMiss) {
    setRu(fix.ru);
    ruTouched.current = true;
    if (!translitOwned) setTransliteration(transliterate(fix.ru));
    // La traduction n'est écrasée que si l'apprenant n'a rien écrit lui-même :
    // il peut viser un autre sens du mot que celui de l'index.
    if (!frTouched.current) {
      setFr(fix.fr);
      setFilled("fr");
    }
    setOpenList(null);
    requestAnimationFrame(() => {
      const el = firstInput.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  const ruField = (
    <Field
      key="ru"
      inputRef={frFirst ? undefined : firstInput}
      label="Russe"
      value={ru}
      placeholder="спасибо"
      suggested={filled === "ru"}
      flagged={misspelling !== null}
      badge={filled === "ru" ? badge : null}
      loading={suggesting && driver === "fr"}
      onChange={(v) => edit("ru", v)}
      onKeyDown={(e) => onFieldKeyDown(e, "ru")}
      onFocus={() => setOpenList("ru")}
      onBlur={() => setOpenList(null)}
      listId="ru-completions"
      activeId={openList === "ru" && completions.length ? `ru-completions-${activeIndex}` : undefined}
      menu={
        openList === "ru" && completions.length > 0 ? (
          <CompletionList
            items={completions}
            activeIndex={activeIndex}
            onPick={(item) => pick(item)}
            onHover={setActiveIndex}
            onDismiss={() => setOpenList(null)}
            listId="ru-completions"
          />
        ) : undefined
      }
      actions={
        <>
          <DictateButton
            lang="ru-RU"
            label="Dicter le mot en russe"
            onResult={(text) => edit("ru", text)}
          />
          {ru.trim() && (
            <SpeakButton
              label={`Écouter ${ru.trim()} en russe`}
              title="Écouter la prononciation"
              onSpeak={() => speakRu(ru.trim())}
              className="flex h-7 w-7 items-center justify-center"
            />
          )}
        </>
      }
      spellCheck={false}
    />
  );

  const frField = (
    <Field
      key="fr"
      inputRef={frFirst ? firstInput : undefined}
      label="Français"
      value={fr}
      placeholder="merci"
      suggested={filled === "fr"}
      badge={filled === "fr" ? badge : null}
      loading={suggesting && driver === "ru"}
      onChange={(v) => edit("fr", v)}
      onKeyDown={(e) => onFieldKeyDown(e, "fr")}
      onFocus={() => setOpenList("fr")}
      onBlur={() => setOpenList(null)}
      listId="fr-completions"
      activeId={openList === "fr" && completions.length ? `fr-completions-${activeIndex}` : undefined}
      menu={
        openList === "fr" && completions.length > 0 ? (
          <CompletionList
            items={completions}
            activeIndex={activeIndex}
            onPick={(item) => pick(item)}
            onHover={setActiveIndex}
            onDismiss={() => setOpenList(null)}
            listId="fr-completions"
          />
        ) : undefined
      }
      actions={
        <>
          <DictateButton
            lang="fr-FR"
            label="Dicter le mot en français"
            onResult={(text) => edit("fr", text)}
          />
          {fr.trim() && (
            <SpeakButton
              label={`Écouter ${fr.trim()} en français`}
              title="Écouter la prononciation"
              onSpeak={() => speakFr(fr.trim())}
              className="flex h-7 w-7 items-center justify-center"
            />
          )}
        </>
      }
    />
  );

  return (
    // EN FEUILLE, LE FORMULAIRE PREND TOUTE LA HAUTEUR pour que son bouton
    // se cale en bas. Sans ça, les deux champs et le bouton s'entassaient en
    // haut d'un écran vide aux trois quarts, ce qui n'a l'air ni voulu ni
    // fini — et laissait le seul bouton d'action au milieu de nulle part,
    // hors de portée du pouce.
    <form
      onSubmit={submit}
      className={bare ? "flex min-h-full flex-col" : "surface rounded-2xl p-6"}
    >
      {bare ? null : (
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 text-accent-ink"
            >
              <PlusIcon className="h-[18px] w-[18px]" />
            </span>
            <h2 className="font-display text-base font-bold">Ajouter un mot</h2>
          </div>
          {notice && (
            <p
              role="status"
              className={`animate-fade-in font-display text-xs ${
                notice.kind === "added" ? "text-success" : "text-danger"
              }`}
            >
              {notice.kind === "added" ? `✓ ${notice.text}` : notice.text}
            </p>
          )}
        </div>
      )}

      {/* UN SEUL CADRE, DEUX CHAMPS EMPILÉS, LES LANGUES EN EN-TÊTE.
          C'est la disposition d'un traducteur, et elle règle d'un coup les
          trois défauts de la précédente : deux colonnes de 230 px qui
          n'utilisaient pas la largeur disponible, deux libellés à des
          hauteurs différentes dès que l'un des champs grandissait, et un
          bouton d'inversion coincé entre les deux, aligné sur rien.

          Ici les deux langues sont sur la même ligne, à égale distance du
          bouton qui les échange, et chaque champ prend toute la largeur. */}
      <div className="field-focus-within overflow-hidden rounded-2xl border border-border bg-bg transition-shadow duration-200">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <span className="flex-1 font-display text-xs font-semibold uppercase tracking-wide text-muted">
            {frFirst ? "Français" : "Russe"}
          </span>
          <button
            type="button"
            onClick={toggleFirstSide}
            aria-label={frFirst ? "Commencer par le russe" : "Commencer par le français"}
            title={frFirst ? "Commencer par le russe" : "Commencer par le français"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full surface-interactive text-muted duration-200 hover:scale-110 hover:text-accent-ink active:scale-95"
            style={{ transitionTimingFunction: "var(--ease)" }}
          >
            <SwapIcon className="h-4 w-4" />
          </button>
          <span className="flex-1 text-right font-display text-xs font-semibold uppercase tracking-wide text-muted">
            {frFirst ? "Russe" : "Français"}
          </span>
        </div>

        {frFirst ? frField : ruField}
        <div className="h-px bg-border" />
        {frFirst ? ruField : frField}
      </div>

      {/* « Vouliez-vous dire… ? », SOUS LE CADRE ET NON DANS LE MENU.
          Le menu de complétion propose des mots à choisir ; celui-ci met en
          doute ce qui est déjà écrit. Les confondre ferait passer la
          correction pour une suggestion de plus, au milieu de cinq autres.

          FORMULÉ EN QUESTION, jamais en verdict : l'index ne connaît qu'une
          fraction du russe, et un mot absent n'est pas un mot faux. On
          propose, l'apprenant tranche — ou ignore et ajoute son mot tel
          quel, ce que rien n'empêche. */}
      {misspelling && (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 font-display text-xs text-muted">
          <span className="text-danger">Orthographe à vérifier —</span>
          voulais-tu écrire
          <button
            type="button"
            onClick={() => acceptCorrection(misspelling)}
            className="rounded-md bg-accent/10 px-1.5 py-0.5 font-semibold text-accent-ink underline-offset-2 hover:underline"
          >
            {misspelling.ru}
          </button>
          <span className="text-muted/80">({misspelling.fr}) ?</span>
        </p>
      )}

      {/* Une ligne, pas un bloc : c'est une information de contexte pendant
          la saisie, pas un mur. Le formulaire reste entièrement utilisable —
          on écrit simplement les deux côtés soi-même. */}
      {blocked && (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 font-display text-xs text-muted">
          <AiSpark className="h-3.5 w-3.5 shrink-0 text-accent2" />
          {blocked.upgrade ? (
            <>
              La traduction automatique fait partie de{" "}
              <Link
                href="/premium"
                className="font-semibold text-accent-ink underline-offset-2 hover:underline"
              >
                Privetik Pro
              </Link>
              . Les {NOUN_COUNT} mots de la banque restent proposés gratuitement.
            </>
          ) : (
            <>Plafond de suggestions atteint pour aujourd&apos;hui. Écris la traduction toi-même.</>
          )}
        </p>
      )}

      {showTranslit ? (
        <label className="mt-3 block">
          <span className="mb-1.5 block font-display text-xs font-semibold uppercase tracking-wide text-muted">
            Translittération
          </span>
          <input
            value={transliteration}
            onChange={(e) => {
              setTranslitOwned(e.target.value.length > 0);
              setTransliteration(e.target.value);
            }}
            placeholder="spassiba"
            autoComplete="off"
            maxLength={TRANSLIT_MAX}
            className="w-full rounded-xl surface px-3.5 py-2.5 font-display text-sm text-text placeholder:text-muted/50 field-focus focus:outline-none"
          />
        </label>
      ) : (
        <button
          type="button"
          onClick={() => setShowTranslit(true)}
          className="mt-3 font-display text-xs font-semibold text-muted underline-offset-2 hover:text-accent-ink hover:underline"
        >
          + Translittération
          {transliteration && <span className="ml-1.5 text-accent2">({transliteration})</span>}
        </button>
      )}

      {/* Le bouton ne se réécrit pas en « Ajout… » : le libellé et les points
         se croisent en fondu au même endroit, sans que la largeur du texte
         ni la hauteur de la ligne ne bougent. Remplacer le mot faisait
         clignoter le bouton à chaque ajout.

         LES POINTS SONT EN POSITION ABSOLUE, PAS DANS UNE CASE DE GRILLE.
         La version précédente empilait les deux dans la même cellule d'un
         `grid place-items-center` — sauf que `grid` n'a jamais pris effet :
         `.btn` déclare `display: inline-flex` dans une règle HORS COUCHE,
         et une règle non layerisée l'emporte sur n'importe quel utilitaire
         Tailwind, qui vit dans `@layer utilities`. Le bouton était donc une
         rangée flex, les points invisibles y occupaient leur largeur plus le
         `gap` de 8 px, et le libellé s'en trouvait décalé d'une dizaine de
         pixels vers la gauche — visible, et inexplicable tant qu'on lisait
         les classes plutôt que la cascade.

         Sorti du flux, il ne reste qu'un seul enfant à centrer, et c'est
         `.btn` lui-même qui s'en charge. */}
      {/* Le pied ci-dessous se cale en bas (`mt-auto`) ; cet espaceur garantit
          l'écart minimal avec ce qui précède quand le formulaire est court. */}
      {bare && <div aria-hidden className="h-6 shrink-0" />}

      {/* LE BOUTON SUIT LES CHAMPS, IL NE FLOTTE PAS DEVANT.
          `sticky bottom-0` le gardait bien visible au-dessus du clavier — au
          prix de le poser SUR le champ de traduction, c'est-à-dire sur la
          seule chose qu'on est venu lire. Un bouton qu'on voit toujours ne
          vaut rien s'il masque la réponse ; des deux défauts, celui-là était
          le pire.

          `mt-auto` seul donne les deux comportements voulus, parce que le
          formulaire est une colonne en `min-h-full` : quand la feuille est
          plus haute que le contenu — pas de clavier — il reste du vide à
          répartir, et le bouton descend au bas de la feuille, à portée du
          pouce. Quand le contenu déborde — clavier ouvert — il n'y a plus
          rien à répartir, et le bouton se range juste sous les champs,
          quitte à être entamé par le bord du clavier. C'est ce qu'on veut :
          entamé, mais vu.

          Pour qu'il le reste, c'est le HAUT qui a maigri — l'en-tête du
          dialogue se replie tant que le clavier est là (`data-kb`, dans
          Modal), et le plancher des champs tombe à 80 px sur téléphone. */}
      <div className={bare ? "mt-auto" : "mt-5"}>
        {/* Le résultat du dernier ajout est ANNONCÉ ICI, à côté du bouton qui
            vient de servir — c'est là que le regard est. En tête de
            formulaire, il se retrouvait hors champ au moment précis où il
            avait quelque chose à dire. */}
        {bare && notice && (
          <p
            role="status"
            className={`animate-fade-in mb-2 text-center font-display text-sm ${
              notice.kind === "added" ? "text-success" : "text-danger"
            }`}
          >
            {notice.kind === "added" ? `✓ ${notice.text}` : notice.text}
          </p>
        )}
        {/* POURQUOI LE BOUTON EST ÉTEINT.
            Il l'était sans un mot. Un côté rempli, l'autre vide — le cas
            exact d'une traduction automatique qui n'a rien rendu — et le
            bouton ne répondait plus au clic : ni message, ni champ signalé,
            rien qui relie les deux. Il ne restait qu'à conclure que l'ajout
            était cassé, alors qu'il manquait la moitié d'en face.

            Seulement quand UN SEUL côté est rempli : les deux vides, le
            formulaire n'a rien à réclamer, on vient de l'ouvrir. Et pas
            pendant qu'une suggestion est en route — elle va peut-être
            remplir ce champ toute seule, une seconde plus tard. */}
        {halfFilled && !suggesting && !(bare && notice) && (
          <p className="mb-2 text-center font-display text-xs text-muted">
            {ru.trim()
              ? "Il manque la traduction française pour ajouter ce mot."
              : "Il manque le mot russe pour ajouter cette paire."}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting || !ru.trim() || !fr.trim()}
          aria-busy={submitting}
          className={`btn btn-primary btn-sheen h-12 w-full rounded-xl px-4 font-display text-sm ${
            submitting ? "cursor-wait" : "disabled:cursor-not-allowed disabled:opacity-40"
          }`}
        >
          <span
            className={`transition-[opacity,transform] duration-200 ${
              submitting ? "-translate-y-1 opacity-0" : "translate-y-0 opacity-100"
            }`}
          >
            Ajouter le mot
          </span>
          <span
            aria-hidden
            className={`absolute inset-0 flex items-center justify-center gap-1.5 transition-[opacity,transform] duration-200 ${
              submitting ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
            }`}
          >
            <span className="dot-pulse h-1.5 w-1.5 rounded-full bg-white [animation-delay:0ms]" />
            <span className="dot-pulse h-1.5 w-1.5 rounded-full bg-white [animation-delay:160ms]" />
            <span className="dot-pulse h-1.5 w-1.5 rounded-full bg-white [animation-delay:320ms]" />
          </span>
        </button>
      </div>
    </form>
  );
}

/**
 * Reconnaître la langue tapée, ici, tient à l'ALPHABET.
 *
 * Pas de modèle, pas d'appel réseau, pas de liste de mots : le russe s'écrit
 * en cyrillique et le français en latin, et c'est vrai de la première lettre.
 * Un détecteur statistique serait plus lent, faillible sur deux caractères,
 * et n'apporterait rien sur cette paire de langues précise.
 *
 * `à-ö` et `ø-ÿ` plutôt que `à-ÿ` : la plage complète contient × (U+00D7) et
 * ÷ (U+00F7), qui ne sont pas des lettres.
 */
const CYRILLIC = /[\u0400-\u04FF]/;
const LATIN = /[a-zà-öø-ÿ]/i;

/**
 * Le texte est-il dans la MAUVAISE écriture pour ce champ ?
 *
 * Il faut les deux moitiés : du latin ET pas de cyrillique. Sans la seconde,
 * « спасибо (spassiba) » — du russe avec sa translittération entre
 * parenthèses — serait déclaré français.
 */
function wrongScript(side: "ru" | "fr", value: string): boolean {
  return side === "ru"
    ? LATIN.test(value) && !CYRILLIC.test(value)
    : CYRILLIC.test(value) && !LATIN.test(value);
}

/**
 * La taille du texte décroît avec sa longueur, comme dans un traducteur.
 *
 * POURQUOI PAS UNE TAILLE FIXE. Un mot de six lettres dans un champ pleine
 * largeur a besoin d'air ; une phrase de trois lignes a besoin de tenir.
 * Servir la même taille aux deux, c'est choisir lequel des deux cas sera
 * mal servi. Les paliers sont larges : la taille change une fois, pas à
 * chaque frappe.
 */
function sizeFor(value: string): string {
  if (value.length > 160) return "text-sm";
  if (value.length > 80) return "text-base";
  return "text-lg";
}

/**
 * `useLayoutEffect` côté navigateur, `useEffect` au rendu serveur.
 *
 * La hauteur doit être posée AVANT la peinture, sinon un collage de trois
 * lignes s'affiche une image sur une seule, puis saute. Mais React avertit
 * si `useLayoutEffect` s'exécute au rendu serveur, où il ne peut rien
 * mesurer — d'où l'aiguillage, fait une seule fois au chargement du module.
 */
const useIsoLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;

/**
 * La hauteur suit le contenu, jusqu'au plafond posé par `max-h-64`.
 *
 * LA RÉFÉRENCE EST CRÉÉE ICI et rendue à l'appelant, plutôt que reçue en
 * paramètre : le compilateur React traite les paramètres d'une fonction
 * comme non modifiables, et écrire dans le nœud qu'ils désignent lui fait
 * signaler « `box` cannot be modified ». Née dans le hook, elle lui
 * appartient.
 */
function useAutoSize(value: string) {
  const box = useRef<HTMLTextAreaElement>(null);
  useIsoLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    // Remis à zéro d'abord : sans ça, `scrollHeight` ne redescend jamais
    // quand on efface du texte, puisqu'il inclut la hauteur déjà imposée.
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return box;
}

/** Deux références sur un même nœud : celle du parent, et la nôtre. */
function mergeRefs(
  outer: React.RefObject<HTMLTextAreaElement | null> | undefined,
  inner: React.RefObject<HTMLTextAreaElement | null>
) {
  return (el: HTMLTextAreaElement | null) => {
    inner.current = el;
    if (outer) outer.current = el;
  };
}

function Field({
  inputRef,
  label,
  value,
  placeholder,
  suggested,
  badge,
  loading,
  onChange,
  onKeyDown,
  onBlur,
  onFocus,
  menu,
  actions,
  activeId,
  listId,
  spellCheck = true,
  flagged = false,
}: {
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  label: string;
  value: string;
  placeholder: string;
  suggested: boolean;
  badge: React.ReactNode;
  loading: boolean;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onBlur?: () => void;
  onFocus?: () => void;
  /** Le menu de complétion, positionné par le <label> relatif. */
  menu?: React.ReactNode;
  /** Micro et haut-parleur, en bas à droite du champ. */
  actions?: React.ReactNode;
  activeId?: string;
  listId?: string;
  spellCheck?: boolean;
  /** Une correction est proposée : le champ le montre au lieu de le taire. */
  flagged?: boolean;
}) {
  const box = useAutoSize(value);

  return (
    // `relative` : c'est ce bloc qui ancre le menu de complétion.
    //
    // UN <div>, PLUS UN <label>, et c'est ce qui rend le menu utilisable au
    // doigt. Un <label> renvoie TOUT clic reçu vers son champ : le bouton
    // « Fermer » du menu, qui vit dedans, refocalisait donc le textarea —
    // dont le `onFocus` rouvre aussitôt la liste qu'on venait de fermer. Ce
    // <label> n'avait de toute façon aucun texte à porter : le libellé de
    // chaque champ est en en-tête du cadre, et l'accessibilité passe par
    // l'`aria-label` du textarea.
    //
    // NI BORDURE NI LIBELLÉ ICI. Les deux champs vivent maintenant dans un
    // cadre commun, avec les deux langues et le bouton d'inversion dans une
    // barre au-dessus — la disposition de Yandex Traducteur. Chaque champ
    // portait avant son propre libellé et sa propre bordure : à deux, ça
    // faisait quatre traits et deux titres pour une seule paire, et rien
    // n'alignait le bouton d'inversion, coincé entre deux boîtes de hauteurs
    // différentes.
    <div className="relative">
      <textarea
        ref={mergeRefs(inputRef, box)}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        onFocus={onFocus}
        // `autoComplete="off"` ne suffit pas à écarter le menu du
        // navigateur sur Chrome ; `role="combobox"` le fait, et c'est de
        // toute façon le rôle correct pour un champ qui pilote une liste.
        role={menu ? "combobox" : undefined}
        aria-expanded={menu ? true : undefined}
        aria-controls={listId}
        aria-activedescendant={activeId}
        aria-autocomplete={menu ? "list" : undefined}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={spellCheck}
        maxLength={FIELD_MAX}
        /* Le focus se signale par un ANNEAU en plus de la bordure : sur un
           champ, la seule bordure qui change de teinte est trop discrète
           pour dire où l'on tape, surtout en thème clair. L'anneau est en
           `box-shadow`, donc il ne déplace rien.

           `resize-none` et `overflow-hidden` : la hauteur est pilotée par
           le contenu (voir `useAutoSize`), pas par la poignée du navigateur
           ni par une barre de défilement interne. */
        aria-label={label}
        /* `resize-none` et `overflow-hidden` : la hauteur est pilotée par le
           contenu (voir `useAutoSize`), pas par la poignée du navigateur ni
           par une barre de défilement interne.

           `min-h-[112px]` : la taille d'un champ dit ce qu'on attend dedans.
           À 48 px il annonçait un mot ; les gens y collent des expressions
           entières, et c'est très bien.

           SOUS 640 px LE PLANCHER TOMBE À 80 px — la hauteur qu'une seule
           ligne occupe déjà avec ses commandes, donc le champ y prend
           exactement la taille de ce qu'il contient, et grandit avec lui.
           Les 30 px d'air en trop se payaient deux fois, sur un écran où il
           ne reste que ~370 px au-dessus du clavier, et c'est le bouton de
           validation qui les payait. */
        /* `pb-11` quand le champ porte des commandes : elles flottent en bas
           à droite, et sans cette réserve une expression longue passerait
           dessous. */
        className={`block max-h-64 min-h-[80px] w-full resize-none overflow-hidden px-4 pt-3.5 font-display leading-snug sm:min-h-[112px] text-text placeholder:text-muted/50 focus:bg-accent/[0.045] focus:outline-none ${
          actions ? "pb-11" : "pb-3.5"
        } ${sizeFor(value)} ${
          flagged
            ? "bg-danger/[0.06] decoration-danger decoration-wavy underline decoration-2 underline-offset-4"
            : suggested
              ? "bg-accent2/[0.06]"
              : "bg-transparent"
        }`}
      />
      {/* Le badge — « proposé », ou les points d'attente — flotte en haut à
          droite du champ. Dans le flux, il aurait poussé le texte ou réservé
          une ligne vide en permanence. */}
      {(loading || badge) && (
        <span className="pointer-events-none absolute right-3 top-3 font-display text-[11px]">
          {loading ? <LoadingDots label="" /> : badge}
        </span>
      )}
      {/* Micro et haut-parleur EN BAS DU CHAMP, pas dans une barre d'outils
          commune : chacun agit sur SA langue, et à deux champs une barre
          unique obligerait à dire laquelle à chaque fois. */}
      {actions && (
        <span className="absolute bottom-2 right-2 flex items-center gap-0.5">{actions}</span>
      )}
      {menu}
    </div>
  );
}
