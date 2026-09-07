"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import DirectionToggle from "@/components/exercises/DirectionToggle";
import SessionSummary from "@/components/exercises/SessionSummary";
import { loadDirection, saveDirection, type VocabDirection } from "@/lib/storage";
import {
  ANSWER_LANG,
  onSpeechBusy,
  prefetchRu,
  PROMPT_LANG,
  speakFr,
  speakIn,
  speakRu,
  useSpeechRecognition,
} from "@/lib/vocabulary/speech";
import { fetchDailyProgress } from "@/lib/vocabulary/custom";
import { matchesAnswer } from "@/lib/vocabulary/answer-check";
import { useReviewQueue } from "@/lib/vocabulary/useReviewQueue";
import PaywallNotice from "@/components/ui/PaywallNotice";
import AllKnownState from "@/components/vocabulary/AllKnownState";
import FocusControl from "@/components/vocabulary/FocusControl";
import ReviewExplanation from "@/components/vocabulary/ReviewExplanation";
import { ReviewCardSkeleton } from "@/components/ui/Skeleton";
import { MicIcon, SpeakerIcon } from "@/components/ui/icons";

export default function VoicePage() {
  return (
    <Suspense fallback={null}>
      <VoiceInner />
    </Suspense>
  );
}

function VoiceInner() {
  const searchParams = useSearchParams();
  const listId = searchParams.get("list");

  const [direction, setDirection] = useState<VocabDirection>(() =>
    loadDirection("voice", "ru-first")
  );
  function changeDirection(d: VocabDirection) {
    setDirection(d);
    saveDirection("voice", d);
  }

  const [revealed, setRevealed] = useState(false);
  const {
    blocked,
    current,
    review,
    reload,
    loading,
    loadError,
    listName,
    sessionIndex,
    sessionCorrect,
    noWordsAtAll,
    allKnown,
    currentFocus,
    setFocus,
  } = useReviewQueue(listId);
  const {
    supported: micSupported,
    listening,
    transcript,
    error: micError,
    start,
    stop,
    reset: resetSpeech,
  } = useSpeechRecognition(ANSWER_LANG[direction]);

  // La synthèse d'un mot INÉDIT demande une seconde et demie. Sur cette
  // page l'attente est la plus pénible de l'app : en mode écoute, le mot
  // part tout seul, et sans rien à l'écran l'apprenant fixe un bouton muet
  // sans savoir si quelque chose arrive.
  //
  // ABONNEMENT, et non état local : « une synthèse est en cours » vit dans
  // la couche audio, pas dans ce composant. La lecture automatique plus bas
  // part d'un effet — y poser un setState placerait une mise à jour dans le
  // corps synchrone de l'effet. Ici c'est la couche audio qui prévient, et
  // le setState a lieu dans son callback : le motif que React recommande.
  // Bénéfice au passage, l'indicateur couvre les deux boutons ET la lecture
  // automatique sans qu'aucun des trois n'ait à s'en occuper.
  const [loadingAudio, setLoadingAudio] = useState(false);
  useEffect(() => onSpeechBusy(setLoadingAudio), []);

  const [daily, setDaily] = useState<{ reviewedToday: number; goal: number } | null>(null);
  useEffect(() => {
    fetchDailyProgress().then(setDaily).catch(() => {});
  }, []);

  // Nouveau mot : efface la tentative précédente. Ajusté pendant le rendu
  // (plutôt que dans un effet) en comparant à l'id précédemment vu — pas de
  // rendu intermédiaire périmé.
  const [seenQuestionId, setSeenQuestionId] = useState(current?.id);
  if (current?.id !== seenQuestionId) {
    setSeenQuestionId(current?.id);
    setRevealed(false);
    // Le transcript du mot PRÉCÉDENT restait sous le nouveau : on validait
    // une réponse qu'on n'avait pas donnée.
    resetSpeech();
  }

  // Lecture automatique de la prononciation en mode écoute (ru-first) : reste
  // dans un effet, c'est un vrai effet de bord (audio) déclenché par le
  // changement de mot, pas un simple ajustement d'état React.
  useEffect(() => {
    if (!current) return;
    // LA CONSIGNE EST ÉNONCÉE, jamais écrite : c'est elle qu'il faut avoir
    // entendue pour répondre. Les deux sens se comportent donc pareil — seul
    // change ce qui est prononcé, le russe ou le français.
    void speakIn(PROMPT_LANG[direction], direction === "ru-first" ? current.ru : current.fr);
    // Le mot russe sera proposé à la révélation : on le prépare pendant que
    // l'apprenant cherche, sinon le son arrive après coup.
    if (direction === "fr-first") prefetchRu(current.ru);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  function handleReview(quality: Parameters<typeof review>[0]) {
    review(quality);
    setRevealed(false);
  }

  const backHref = listId ? `/vocabulary/lists/${listId}` : "/vocabulary/review";
  const backLabel = listId ? `← ${listName || "Liste"}` : "← Révision";

  // Le plafond de révisions du plan gratuit passe AVANT tout le reste :
  // une fois atteint, il n'y a plus ni carte à charger ni file à résumer.
  if (blocked) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8 sm:py-16">
        <PaywallNotice
          quota={blocked.quota}
          message={blocked.message}
          what="la révision du vocabulaire"
        />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-14 sm:py-24 text-center">
        <p className="font-display text-lg text-danger">{loadError}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8 sm:py-16">
        <ReviewCardSkeleton />
      </div>
    );
  }

  if (noWordsAtAll) {
    return <EmptyState />;
  }

  if (allKnown) {
    return <AllKnownState backHref={backHref} backLabel={backLabel} />;
  }

  if (!current) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-14 sm:py-24">
        <SessionSummary
          reviewed={sessionIndex}
          correct={sessionCorrect}
          goal={daily?.goal ?? 15}
          reviewedTodayTotal={(daily?.reviewedToday ?? 0) + sessionIndex}
          backHref={backHref}
          backLabel={backLabel}
          onRestart={reload}
        />
      </div>
    );
  }

  const listenAndRecall = direction === "ru-first";

  /**
   * Le transcript ressemble-t-il à la réponse attendue ?
   *
   * `matchesAnswer` est la même comparaison que le mode Frappe — elle
   * tolère les variantes (« voiture, auto »), les articles et les accents
   * français. Ici elle n'ALIMENTE RIEN : ni SRS, ni série, ni précision.
   * C'est un indice affiché à côté de ce qui a été entendu, et l'apprenant
   * garde le dernier mot, parce qu'une reconnaissance vocale se trompe
   * assez souvent pour qu'on ne lui confie pas une note.
   */
  /** Ce que « Écouter » prononce : la consigne, jamais la réponse. */
  const promptText = listenAndRecall ? current.ru : current.fr;

  const heardMatches =
    transcript.trim().length > 0 &&
    matchesAnswer(transcript, listenAndRecall ? current.fr : current.ru);

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 sm:py-16">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <Link
          href={backHref}
          className="font-display text-xs font-semibold uppercase tracking-wide text-muted hover:text-accent-ink"
        >
          {backLabel}
        </Link>
        <DirectionToggle direction={direction} onChange={changeDirection} />
      </div>

      <p className="mb-4 text-center font-display text-xs font-semibold uppercase tracking-wide text-muted">
        {current.theme} · mot {sessionIndex + 1}
      </p>

      {/* Le même sélecteur que sur la carte d'une liste, à la même place
          dans le geste : ce que l'apprenant décide ici vaut pour toutes les
          révisions à venir. */}
      <div className="mb-4 flex justify-center">
        <FocusControl value={currentFocus} word={current.ru} onChange={setFocus} />
      </div>

      <div className="rounded-[20px] surface p-6 text-center shadow-float sm:p-8">
        <p className="font-display text-sm text-muted">
          {listenAndRecall
            ? "Écoute le mot russe, et dis son sens en français :"
            : "Écoute le mot français, et dis-le en russe :"}
        </p>

        {/* RIEN N'EST ÉCRIT, DANS AUCUN DES DEUX SENS : c'est ce qui fait de
            ce mode un exercice ORAL plutôt qu'une carte avec un micro à côté.

            « Écoute et devine » cachait déjà son mot russe, et l'énonçait.
            « Dis ce mot en russe » affichait sa consigne française — on
            lisait donc une étiquette et on traduisait, exactement ce que fait
            le mode Cartes. Il n'y avait plus rien à retrouver à l'oreille, et
            le seul apport du mode, entendre puis produire, disparaissait.

            La consigne se PRONONCE maintenant des deux côtés. Ce qui reste à
            l'écran est un point d'interrogation, de même taille dans les deux
            cas, pour que les commandes tombent au même endroit quand on
            change de sens. Le texte apparaît à la révélation, avec la
            réponse — c'est là qu'on vérifie, pas avant. */}
        <p className="mt-2 font-display text-3xl font-bold text-muted/40" aria-hidden>
          ?
        </p>

        {/* Deux pastilles de même forme, même largeur, même rangée : écouter
            et parler sont deux gestes de même rang. L'ancienne carte opposait
            un disque de 80 px d'un côté à un lien souligné de l'autre, et le
            bouton d'enregistrement n'avait pas de `flex` — son pictogramme et
            son libellé ne s'alignaient pas.

            « ÉCOUTER » DIT LA CONSIGNE, JAMAIS LA RÉPONSE. Il jouait le mot
            russe dans les deux sens. En « dis ce mot en russe », le russe est
            précisément ce qu'on demande de produire : le bouton soufflait
            donc la réponse, et à hauteur de première étape — une pastille de
            même poids que « Dire en russe », qu'on presse naturellement en
            premier. Il joue maintenant ce qui est demandé : le russe quand
            on doit deviner le sens, le français quand on doit dire le mot
            russe. La prononciation russe reste à un clic, mais APRÈS la
            révélation, là où l'entendre s'appelle apprendre et non tricher. */}
        <div className={`mt-6 grid gap-2 sm:gap-2.5 ${micSupported ? "grid-cols-2" : "grid-cols-1"}`}>
          <button
            onClick={() => void speakIn(PROMPT_LANG[direction], promptText)}
            aria-busy={loadingAudio}
            aria-label={listenAndRecall ? "Écouter le mot russe" : "Écouter le mot français"}
            className="relative inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-border px-3 py-2.5 font-display text-[13px] font-semibold text-text transition-colors hover:border-accent/35 hover:bg-accent/10 sm:gap-2 sm:px-5 sm:text-sm"
          >
            {/* L'anneau est POSÉ SUR le bouton et ne le remplace pas : la
                cible de clic garde sa taille pendant l'attente. */}
            {loadingAudio && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-accent/25"
              />
            )}
            <SpeakerIcon className="h-4 w-4 shrink-0" />
            {/* En dessous de 640 px, « Préparation… » ne tient pas : l'anneau
                qui pulse dit déjà l'attente, le mot est donc superflu là. */}
            <span className="min-[360px]:hidden">Écouter</span>
            <span className="hidden min-[360px]:inline">
              {loadingAudio ? "Préparation…" : "Écouter"}
            </span>
          </button>

          {/* Sans micro, « Écouter » prend toute la largeur plutôt que de
              laisser une demi-carte vide à côté de lui. */}
          {micSupported && (
            <button
              onClick={listening ? stop : start}
              aria-pressed={listening}
              className={`inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-2.5 font-display text-[13px] font-semibold transition-colors sm:gap-2 sm:px-5 sm:text-sm ${
                listening
                  ? "border-accent2 bg-accent2/10 text-accent2"
                  : "border-border text-text hover:border-accent/35 hover:bg-accent/10"
              }`}
            >
              <MicIcon className={`h-4 w-4 shrink-0 ${listening ? "wave-pulse" : ""}`} />
              {listening ? (
                "J’écoute…"
              ) : (
                <>
                  {/* La LANGUE reste dite dans les deux cas — c'est elle qui
                      manquait à l'origine. Seul le verbe disparaît quand la
                      place manque : la consigne au-dessus le porte déjà. */}
                  <span className="min-[360px]:hidden">{listenAndRecall ? "Français" : "Russe"}</span>
                  <span className="hidden min-[360px]:inline">
                    {listenAndRecall ? "Dire en français" : "Dire en russe"}
                  </span>
                </>
              )}
            </button>
          )}
        </div>

        {/* CE QUI A ÉTÉ ENTENDU, ET LA MAIN RENDUE À L'APPRENANT.
            Le transcript s'affichait comme une remarque en passant, sans
            suite : il fallait ensuite aller chercher « Révéler la réponse »
            plus bas, comme si on n'avait rien dit. Il devient une étape —
            on valide, ou on recommence.

            LE RAPPROCHEMENT EST UN INDICE, PAS UNE NOTE. La reconnaissance
            se trompe sur un accent, une syllabe avalée, un homophone ; lui
            laisser le dernier mot noterait le micro et non l'apprenant.
            C'est pour ça que « Valider » ne fait que RÉVÉLER : les quatre
            boutons de qualité restent le seul jugement enregistré. */}
        {transcript && !revealed && (
          <div className="mt-4 rounded-xl border border-border bg-bg p-4">
            <p className="font-display text-sm text-muted">
              J&apos;ai entendu : <span className="font-semibold text-text">« {transcript} »</span>
            </p>
            <p
              className={`mt-1 font-display text-xs font-semibold ${
                heardMatches ? "text-success" : "text-muted"
              }`}
            >
              {heardMatches
                ? "✓ Ça correspond à la réponse attendue."
                : "Je ne retrouve pas la réponse attendue — mais je peux avoir mal entendu."}
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button
                onClick={() => setRevealed(true)}
                className="btn btn-primary rounded-full px-5 py-2 font-display text-sm font-semibold"
              >
                Valider
              </button>
              <button
                onClick={start}
                className="rounded-full border border-border px-5 py-2 font-display text-sm font-semibold text-text transition-colors hover:border-accent/35 hover:bg-accent/10"
              >
                Redire
              </button>
            </div>
          </div>
        )}

        {/* CE QUI A EMPÊCHÉ L'ÉCOUTE, ÉCRIT. Le micro qui refuse de démarrer
            ne disait rien : le bouton s'allumait et restait allumé. */}
        {micError && <p className="mt-3 font-display text-sm text-danger">{micError}</p>}

        {!micSupported && (
          <p className="mt-4 font-display text-xs text-muted">
            L&apos;enregistrement vocal n&apos;est pas disponible sur ce navigateur (essaie Chrome
            ou Edge) — tu peux quand même écouter et t&apos;auto-évaluer.
          </p>
        )}

        {/* « Révéler la réponse » S'EFFACE DÈS QU'ON A PARLÉ : le « Valider »
            de l'encadré ci-dessus fait exactement la même chose, et deux
            boutons pour un seul geste font hésiter sur ce qui les distingue.
            Il reste pour qui n'utilise pas le micro — ou n'en a pas. */}
        {!revealed ? (
          !transcript && (
            <button
              onClick={() => setRevealed(true)}
              className="btn btn-primary btn-sheen mt-8 w-full rounded-[10px] py-3 font-display text-sm"
            >
              Révéler la réponse
            </button>
          )
        ) : (
          <div className="mt-6 rounded-xl border border-accent/40 bg-accent/10 p-4 text-left">
            <div className="flex items-center gap-2">
              <p className="font-display text-2xl font-bold text-accent-ink">{current.ru}</p>
              {/* La prononciation russe vit ICI depuis qu'elle a quitté la
                  rangée du haut : à côté de la réponse, une fois qu'elle est
                  connue. C'est le moment où l'entendre sert à quelque chose. */}
              <button
                onClick={() => void speakRu(current.ru)}
                aria-busy={loadingAudio}
                aria-label="Écouter la prononciation russe"
                title="Écouter la prononciation"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-accent-ink transition-colors hover:bg-accent/15"
              >
                <SpeakerIcon className="h-4 w-4" />
              </button>
            </div>
            <p className="font-display text-sm text-muted">{current.transliteration}</p>
            {/* La consigne n'ayant jamais été écrite, elle s'affiche ICI :
                sans elle on ne saurait pas ce qu'on vient de rater.

                ET ELLE S'ÉCOUTE AUSSI. Le russe avait son haut-parleur
                depuis que la prononciation a quitté la rangée du haut ; le
                français n'en avait aucun, alors que dans le sens
                « dis ce mot en russe » c'est LUI qu'on vient d'entendre en
                consigne et qu'on peut vouloir réentendre après coup. */}
            <div className="mt-2 flex items-center gap-2">
              <p className="font-display text-base">{current.fr}</p>
              <button
                onClick={() => void speakFr(current.fr)}
                aria-busy={loadingAudio}
                aria-label="Écouter la prononciation française"
                title="Écouter la prononciation"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-accent-ink transition-colors hover:bg-accent/15"
              >
                <SpeakerIcon className="h-4 w-4" />
              </button>
            </div>
            {current.example && (
              <p className="mt-3 font-display text-sm text-muted">
                {current.example.ru} <span className="italic">— {current.example.fr}</span>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Sous la carte, comme en mode Cartes : le mode est oral, mais une
          fois le mot dit et révélé, savoir ce qu'il porte vaut autant
          qu'ailleurs. */}
      {revealed && <ReviewExplanation wordId={current.id} />}

      {revealed && (
        <div className="mt-6 grid grid-cols-4 gap-1.5 sm:gap-2.5">
          <QualityButton label="À revoir" color="var(--color-accent2-deep)" onClick={() => handleReview(1)} />
          <QualityButton label="Difficile" color="var(--color-accent2)" onClick={() => handleReview(3)} />
          <QualityButton label="Bien" color="var(--color-accent-ink)" onClick={() => handleReview(4)} />
          <QualityButton label="Facile" color="var(--color-success)" onClick={() => handleReview(5)} />
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-md px-6 py-14 sm:py-24 text-center">
      <p className="font-display text-lg font-semibold">Aucun mot à réviser pour l&apos;instant</p>
      <p className="mt-2 font-display text-sm text-muted">
        Choisis des thèmes dans ton{" "}
        <Link href="/account" className="text-accent-ink hover:underline">
          profil
        </Link>{" "}
        pour obtenir des mots tout faits, ou crée ta propre liste.
      </p>
      <Link
        href="/vocabulary"
        className="btn btn-primary btn-sheen mt-5 inline-block rounded-[10px] px-5 py-2.5 font-display text-sm"
      >
        Aller à mes listes
      </Link>
    </div>
  );
}

function QualityButton({
  label,
  color,
  onClick,
}: {
  label: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-[10px] px-1 py-3 font-display text-[11px] font-semibold whitespace-nowrap text-on-tint transition-opacity hover:opacity-90 sm:text-xs"
      style={{ background: color }}
    >
      {label}
    </button>
  );
}
