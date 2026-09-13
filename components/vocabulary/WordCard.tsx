"use client";

import { useState } from "react";
import type { CustomVocabWord } from "@/lib/vocabulary/custom";
import { FOCUS_META, FOCUS_ORDER, type Focus } from "@/lib/vocabulary/focus";
import { speakFr, speakRu } from "@/lib/vocabulary/speech";
import SpeakButton from "@/components/vocabulary/SpeakButton";
import WordExplanation from "@/components/vocabulary/WordExplanation";
import AiSpark from "@/components/ui/AiSpark";
import Dropdown, { Chevron } from "@/components/ui/Dropdown";

/**
 * Un mot, en carte.
 *
 * CE QUI RESTE À DÉCOUVERT : les deux langues, et « Expliquer ». Le reste —
 * le rangement du mot, sa modification, sa suppression — vit dans le bouton
 * de droite.
 *
 * QUATRE FORMES ONT PRÉCÉDÉ CELLE-CI, et chacune corrigeait la précédente :
 *
 * 1. Trois rangées empilées (commandes, langues, sélecteur de rangement) :
 *    130 px par mot, dont la moitié en boutons.
 * 2. Tout replié derrière un « ⋯ ». Compact, mais un appui de plus pour
 *    expliquer un mot, qui est le geste le plus fréquent de la carte.
 * 3. Tout à découvert sur la ligne du libellé : les commandes y flottaient
 *    dans une bande à part, et sur téléphone, où ce libellé est masqué,
 *    elles se retrouvaient seules dans un bandeau vide.
 * 4. Tout à découvert sur la ligne des mots. Mieux, mais le sélecteur à
 *    trois segments changeait de largeur selon le rangement actif, donc la
 *    colonne de droite ondulait le long de la liste.
 *
 * D'OÙ LE BOUTON QUI PORTE SON PROPRE ÉTAT. Il affiche le signe du
 * rangement courant (★ à travailler, • normal, ✓ acquis) et l'ouvre au clic.
 * Il a une largeur constante, donc la colonne s'aligne ; il dit l'état sans
 * qu'un second marqueur ait à le répéter ailleurs ; et il n'est pas un
 * « ⋯ », qui n'aurait rien annoncé de ce qu'il contient.
 *
 * Sous 640 px, les commandes passent sous les mots plutôt que de les
 * comprimer ; entre 640 et 1024, « Expliquer » se réduit à son étincelle,
 * parce qu'à cette largeur c'est lui qui écrase les deux colonnes de texte.
 *
 * Ce qui n'y figure toujours pas : le genre et l'animacité. Ils étaient
 * réglables ici, ce qui revenait à demander à l'apprenant de corriger la
 * classification — or s'il savait que « спаси́бо » n'est pas un nom neutre
 * inanimé, il n'aurait pas besoin de l'app.
 */

export default function WordCard({
  word,
  onDelete,
  onEdit,
  onFocusChange,
}: {
  word: CustomVocabWord;
  onDelete: (wordId: string) => void;
  /** Ouvre la feuille de modification du mot. */
  onEdit: (word: CustomVocabWord) => void;
  onFocusChange: (wordId: string, focus: Focus) => void;
}) {
  const [explaining, setExplaining] = useState(false);
  /**
   * La fiche a-t-elle DÉJÀ été demandée ?
   *
   * Une fois ouverte, elle reste montée et on se contente de la cacher. La
   * démonter à chaque repli relançait la requête à chaque réouverture : le
   * serveur la sert de son cache, mais l'écran repassait quand même par
   * « Le professeur rédige… » pour finir par réafficher exactement le même
   * texte. Replier et déplier doit être instantané — c'est un geste de
   * lecture, pas un rechargement.
   */
  const [everExplained, setEverExplained] = useState(false);
  // Confirmation en deux temps : la suppression emporte aussi l'historique
  // de révision du mot, qui ne se récupère pas. Elle se joue dans la même
  // rangée, sans déplier la carte ni ouvrir de fenêtre.
  const [confirming, setConfirming] = useState(false);

  // UN MOT MODIFIÉ N'A PLUS LA MÊME FICHE. Celle qui restait montée parlait
  // de l'ancien mot : on la replie et on l'oublie, elle sera redemandée pour
  // le nouveau (le serveur a vidé son cache au même moment).
  const text = `${word.ru}|${word.fr}`;
  const [seenText, setSeenText] = useState(text);
  if (text !== seenText) {
    setSeenText(text);
    setExplaining(false);
    setEverExplained(false);
  }

  const meta = FOCUS_META[word.focus];

  return (
    <div
      className={`rounded-2xl border bg-bg2 transition-colors ${
        explaining ? "border-accent2/40" : "border-border hover:bg-bg3"
      }`}
    >
      <div className="px-4 py-3">
        {/* Le libellé est identique sur CHAQUE carte — toutes les listes vont
            du russe au français — donc il ne distingue rien : c'est une
            étiquette de colonne recopiée sur chaque ligne. Il gagne sa place
            sur grand écran, où les deux langues sont côte à côte et où rien
            d'autre ne dit laquelle est laquelle ; sur téléphone elles
            s'empilent et l'alphabet suffit. */}
        <span className="mb-1.5 hidden font-display text-[11px] font-semibold uppercase tracking-[0.06em] text-muted/70 sm:block">
          Russe → Français
        </span>

        {/* LES COMMANDES SONT SUR LA LIGNE DES MOTS, PAS AU-DESSUS.
            Elles ont d'abord été posées sur la ligne du libellé : sur grand
            écran elles flottaient dans une bande à part, sans rapport visuel
            avec le mot qu'elles règlent, et sur téléphone — où ce libellé
            n'existe pas — elles se retrouvaient seules dans un bandeau vide
            en haut de chaque carte.

            Le groupe a maintenant une largeur CONSTANTE : trois cases de
            28 px, un bouton dont le texte ne change jamais, une corbeille.
            C'est ce qui fait que la colonne de droite s'aligne d'une carte à
            l'autre — l'irrégularité entre les lignes est ce qui se voyait le
            plus. */}
        {/* LES COMMANDES SONT DANS LA MÊME RANGÉE QUE LES MOTS, y compris
            sous 640 px où elles passaient en dessous. Cette ligne
            supplémentaire coûtait environ 40 px par carte — sur une liste de
            cinquante mots, deux écrans entiers de vide, alors que toute la
            refonte visait à en gagner. Calées en haut (`items-start`), elles
            se logent dans la hauteur du bloc de texte : la carte retombe de
            ~128 à ~88 px sur téléphone. */}
        <div className="flex items-start gap-3 sm:items-center sm:gap-4">
          {/* Les deux langues à égalité, comme dans un dictionnaire ouvert.
              La translittération passe SOUS le mot russe : à côté, elle se
              collait à l'accent tonique de la dernière voyelle. */}
          <div className="grid min-w-0 flex-1 grid-cols-1 items-baseline gap-x-6 gap-y-0.5 sm:grid-cols-2">
            <div className="min-w-0">
              <p className="flex min-w-0 items-baseline gap-1.5 font-display text-lg font-bold leading-snug">
                <span className="min-w-0">{word.ru}</span>
                <SpeakButton
                  label={`Écouter ${word.ru} en russe`}
                  title="Écouter en russe"
                  onSpeak={() => speakRu(word.ru)}
                />
              </p>
              {word.transliteration && (
                <p className="font-display text-xs leading-snug text-muted/80">
                  {word.transliteration}
                </p>
              )}
            </div>
            <p className="flex min-w-0 items-baseline gap-1.5 font-display text-lg leading-snug text-text/90">
              <span className="min-w-0">{word.fr}</span>
              <SpeakButton
                label={`Écouter ${word.fr} en français`}
                title="Écouter en français"
                onSpeak={() => speakFr(word.fr)}
              />
            </p>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => {
                setEverExplained(true);
                setExplaining((e) => !e);
              }}
              aria-expanded={explaining}
              aria-label={
                explaining ? `Masquer l'explication de ${word.ru}` : `Expliquer ${word.ru}`
              }
              title={explaining ? "Masquer l'explication" : "Expliquer ce mot avec l'IA"}
              className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2 font-display text-[11px] font-bold transition-colors lg:px-2.5 ${
                explaining
                  ? "border-accent2 bg-accent2/20 text-accent2"
                  : "border-accent2/40 bg-accent2/10 text-accent2 hover:border-accent2/50 hover:bg-accent2/20"
              }`}
            >
              <AiSpark className="h-3.5 w-3.5" />
              {/* Le mot n'apparaît qu'au-delà de 1024 px : entre 640 et 1024,
                  la carte a deux colonnes de texte à loger et c'est lui qui
                  les compresse en premier. */}
              <span className="hidden lg:inline">{explaining ? "Masquer" : "Expliquer"}</span>
            </button>

            {/* LE BOUTON PORTE LE RANGEMENT COURANT, il ne se contente pas
                d'ouvrir un menu. Un « ⋯ » n'aurait rien dit de l'état du mot,
                et il aurait fallu réafficher ce signe ailleurs sur la carte ;
                ici il EST le déclencheur.

                Largeur constante quel que soit le rangement — c'est
                exactement ce qui manquait au sélecteur à trois segments,
                dont la largeur suivait le libellé actif et faisait onduler
                la colonne de droite d'une carte à l'autre. */}
            <Dropdown
              button={
                <>
                  <span aria-hidden className={meta.text}>
                    {meta.icon}
                  </span>
                  <Chevron />
                </>
              }
              buttonClassName="hover-surface flex h-8 shrink-0 items-center gap-1 rounded-lg border border-border px-2 font-display text-[12px] text-muted"
              label={`${meta.label} — ranger, modifier ou supprimer ${word.ru}`}
              width="w-[220px]"
            >
              {(close) => (
                <>
                  <p className="px-3 pb-1 pt-1.5 font-display text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
                    Rangement
                  </p>
                  {FOCUS_ORDER.map((focus) => {
                    const item = FOCUS_META[focus];
                    const active = focus === word.focus;
                    return (
                      <button
                        key={focus}
                        type="button"
                        onClick={() => {
                          if (!active) onFocusChange(word.id, focus);
                          close();
                        }}
                        title={item.hint}
                        className={`menu-item flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left font-display text-sm ${
                          active ? "font-bold text-accent-ink" : "text-text"
                        }`}
                      >
                        <span aria-hidden className={`w-3 text-center ${item.text}`}>
                          {item.icon}
                        </span>
                        <span className="flex-1">{item.label}</span>
                        {active && <CheckMark />}
                      </button>
                    );
                  })}

                  <div className="my-1 h-px bg-border" />
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      onEdit(word);
                    }}
                    className="menu-item flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left font-display text-sm text-text"
                  >
                    <PencilGlyph />
                    Modifier le mot
                  </button>
                  {confirming ? (
                    <div className="px-3 py-2">
                      <p className="mb-2 font-display text-[12px] leading-snug text-muted">
                        Supprimer ce mot et son historique de révision&nbsp;?
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onDelete(word.id)}
                          autoFocus
                          className="rounded-lg bg-danger px-2.5 py-1 font-display text-[11px] font-bold text-on-tint"
                        >
                          Supprimer
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(false)}
                          className="font-display text-[11px] font-semibold text-muted hover:text-text"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(true)}
                      className="menu-item flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left font-display text-sm text-danger"
                    >
                      <TrashGlyph />
                      Supprimer le mot
                    </button>
                  )}
                </>
              )}
            </Dropdown>
          </div>
        </div>
      </div>

      {/* Montée dès la première demande, cachée ensuite plutôt que démontée :
          voir `everExplained`. */}
      {everExplained && (
        <div
          className={`animate-fade-in border-t border-border px-4 py-4 ${explaining ? "" : "hidden"}`}
        >
          <WordExplanation
            wordId={word.id}
            autoLoad
            onHide={() => setExplaining(false)}
          />
        </div>
      )}
    </div>
  );
}

/** Le crayon de l'entrée « modifier », au format d'un item de menu. */
function PencilGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
    >
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4" />
    </svg>
  );
}

/** La corbeille de l'entrée « supprimer », au format d'un item de menu. */
function TrashGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
    >
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" />
    </svg>
  );
}

/** La coche du rangement actif. */
function CheckMark() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5 shrink-0 text-accent-ink"
    >
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}
