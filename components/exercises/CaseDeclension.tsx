"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { CaseInfo } from "@/lib/grammar/types";
import { CefrLevel } from "@/lib/supabase/types";
import {
  CaseExercise,
  answeredWithVariant,
  checkAnswer,
} from "@/lib/grammar/exercise-generator";
import { nounsForLevel } from "@/lib/grammar/nouns-data";
import type { Noun } from "@/lib/grammar/types";
import {
  caseExerciseIds,
  caseRecentKey,
  pickCaseExercise,
  type CaseTab,
} from "@/lib/grammar/case-draw";
import { BulbIcon } from "@/components/ui/icons";
import PaywallNotice from "@/components/ui/PaywallNotice";
import { usePracticeAttempt } from "@/lib/practice/attempt-client";
import { rememberDraw } from "@/lib/practice/recent";
import {
  CaseNumberMode,
  getCaseNumber,
  getCaseNumberOnServer,
  setCaseNumber,
  subscribeCaseNumber,
} from "@/lib/storage";

// Les onglets du module. Le type vient de lib/grammar/case-draw : c'est
// lui qui sait ce que chacun tire.
type Tab = CaseTab;
type Feedback = {
  status: "correct" | "incorrect" | "revealed";
  exercise: CaseExercise;
  picked?: string;
  reason?: string | null;
} | null;
type TriggerStats = Record<string, { attempts: number; correct: number }>;
type CaseAccuracy = Record<string, number>; // clé = `${caseId}:${gender}`

/**
 * Deux longueurs par onglet.
 *
 * « Déclinaison isolée » à lui seul mange la moitié de la barre sur un
 * écran de 375 px : les quatre pastilles passaient à la ligne, et « Chiffres »
 * se retrouvait seul sur un second rang à l'intérieur d'un conteneur
 * arrondi en gélule — ce qui donnait l'impression d'un bouton égaré plutôt
 * que d'un sélecteur. La version courte tient sur une ligne ; le mot
 * « déclinaison » ne manque pas, la page entière parle de déclinaison.
 */
const TAB_LABEL: Record<Tab, { full: string; short: string }> = {
  isolated: { full: "Déclinaison isolée", short: "Isolée" },
  sentence: { full: "Phrase", short: "Phrase" },
  mcq: { full: "QCM", short: "QCM" },
  numeral: { full: "Chiffres", short: "Chiffres" },
};

/**
 * Le sélecteur de nombre.
 *
 * CE QU'IL DÉBLOQUE. La banque porte les douze formes de chaque nom, mais
 * le nombre ne venait que du gabarit de phrase, et six gabarits sur 136
 * demandaient le pluriel — tous au nominatif ou au génitif. Le datif,
 * l'accusatif, l'instrumental et le prépositionnel n'avaient donc aucun
 * exercice au pluriel : ni « стола́ми », ni « детьми́ », ni « друзья́ми »,
 * les formes mêmes pour lesquelles on ouvre une grammaire.
 *
 * « Mélange » par défaut : c'est ce qu'on rencontre en lisant, et le
 * contraste singulier/pluriel est justement ce qui s'apprend. Les deux
 * autres servent à travailler un nombre qu'on rate.
 */
const NUMBER_LABEL: Record<CaseNumberMode, { full: string; short: string }> = {
  singular: { full: "Singulier", short: "Sing." },
  plural: { full: "Pluriel", short: "Plur." },
  mixed: { full: "Mélange", short: "Mix" },
};

const GENDER_LABEL: Record<string, string> = {
  masculine: "masc.",
  feminine: "fém.",
  neuter: "neutre",
};

const COUNT_FORM_LABEL: Record<string, string> = {
  "nom-sg": "1 (et 21, 31…) → nominatif singulier",
  "gen-sg": "2-4 (et 22-24…) → génitif singulier",
  "gen-pl": "0, 5-20, 25-30… → génitif pluriel",
};

/**
 * Construit l'exercice suivant.
 *
 * FONCTION PURE au sens React : aucun setState. Elle a longtemps été
 * asynchrone parce qu'un appel réseau rédigeait la phrase à la volée ; les
 * phrases sont maintenant écrites à la construction (voir
 * lib/grammar/trigger-templates.generated.ts) et il ne reste qu'un tirage.
 */
function buildExercise(
  tab: Tab,
  caseInfo: CaseInfo,
  triggerStats: TriggerStats,
  userLevel: CefrLevel | undefined,
  pool: Noun[],
  numberMode: CaseNumberMode,
): CaseExercise {
  // Plusieurs candidats, et le moins récemment vu l'emporte. Le tirage
  // lui-même n'est pas touché : `drawCaseCandidate` en reste seul maître.
  // Une clé par onglet, parce qu'un mot vu en « Isolée » n'est pas la
  // même chose qu'une phrase vue en « Phrase ».
  const key = caseRecentKey(caseInfo.id, tab);
  const exercise = pickCaseExercise({
    tab,
    caseId: caseInfo.id,
    triggerStats,
    level: userLevel,
    pool,
    numberMode,
  });
  rememberDraw(key, caseExerciseIds(exercise));
  return exercise;
}

export default function CaseDeclension({
  caseInfo,
  userLevel,
  signedIn,
}: {
  caseInfo: CaseInfo;
  userLevel?: CefrLevel;
  /**
   * La page est publique depuis qu'elle sert au référencement ; la carte
   * d'entraînement, elle, ne l'est pas. Voir `VisitorCard` plus bas.
   */
  signedIn: boolean;
}) {
  const tabs: Tab[] = useMemo(
    () =>
      caseInfo.id === "genitive"
        ? ["isolated", "sentence", "mcq", "numeral"]
        : ["isolated", "sentence", "mcq"],
    [caseInfo.id],
  );

  const [tab, setTab] = useState<Tab>("isolated");
  const numberMode = useSyncExternalStore(
    subscribeCaseNumber,
    getCaseNumber,
    getCaseNumberOnServer,
  );
  const [round, setRound] = useState(0); // incrémenté à chaque "Suivant"pour relancer le tirage
  const [exercise, setExercise] = useState<CaseExercise | null>(null);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [streak, setStreak] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [triggerStats, setTriggerStats] = useState<TriggerStats>({});
  // Vocabulaire adapté au niveau : décliner juste un mot qu'on ne comprend
  // pas n'apprend pas grand-chose. Le nom reste identifié par son id côté
  // serveur, donc la vérification de la réponse est inchangée.
  const pool = useMemo(() => nounsForLevel(userLevel), [userLevel]);
  const [caseAccuracy, setCaseAccuracy] = useState<CaseAccuracy>({});
  // Le plafond de pratique du plan gratuit. `blocked` remplace la carte
  // par l'écran d'abonnement ; `stopHere` l'anticipe d'un exercice pour ne
  // pas faire répondre à un exercice qui allait être refusé.
  // `submit` est renommé : le composant a déjà une fonction de ce nom, qui
  // valide le champ de saisie avant d'appeler `record`.
  const {
    blocked,
    submit: postAttempt,
    stopHere,
  } = usePracticeAttempt("/api/cases/attempt");

  // Progression serveur : pilote le tirage adaptatif (par déclencheur) et
  // l'indicateur de précision (par cas × genre). Source unique — le module
  // exige un compte (voir proxy.ts), il n'y a pas de mode hors-ligne à
  // couvrir avec un stockage local parallèle.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/cases/progress")
      .then((r) => r.json())
      .then(
        (data: {
          caseProgress?: { case_id: string; gender: string; attempts: number; correct: number }[];
          triggerProgress?: { trigger_id: string; attempts: number; correct: number }[];
        }) => {
          if (cancelled) return;
          const triggers: TriggerStats = {};
          for (const row of data.triggerProgress ?? []) {
            triggers[row.trigger_id] = { attempts: row.attempts, correct: row.correct };
          }
          setTriggerStats(triggers);

          const accuracy: CaseAccuracy = {};
          for (const row of data.caseProgress ?? []) {
            if (row.attempts > 0) {
              accuracy[`${row.case_id}:${row.gender}`] = Math.round(
                (row.correct / row.attempts) * 100,
              );
            }
          }
          setCaseAccuracy(accuracy);
        },
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Tirage de l'exercice. `exercise === null` sert d'état de chargement :
  // les gestionnaires de clic (onglet, "Suivant") le remettent à null, ce
  // qui relance cet effet et affiche le squelette entre-temps.
  useEffect(() => {
    let cancelled = false;
    // Le tirage est synchrone, mais le résultat reste appliqué au retour
    // d'une promesse : appeler setState dans le corps d'un effet déclenche
    // une cascade de rendus, et la règle react-hooks/set-state-in-effect
    // l'interdit. Voir la note de PracticeRunner, qui fait de même.
    Promise.resolve(
      buildExercise(tab, caseInfo, triggerStats, userLevel, pool, numberMode),
    ).then((ex) => {
      if (!cancelled) setExercise(ex);
    });
    return () => {
      cancelled = true;
    };
    // triggerStats/userLevel ne sont volontairement pas des dépendances :
    // ils biaisent le tirage suivant, ils ne doivent pas remplacer
    // l'exercice affiché quand la progression arrive du serveur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, caseInfo.id, round, pool, numberMode]);

  function nextExercise() {
    if (stopHere()) return;
    setFeedback(null);
    setInput("");
    setVerifying(false);
    setExercise(null);
    setRound((r) => r + 1);
  }

  function selectNumber(next: CaseNumberMode) {
    if (next === numberMode) return;
    setFeedback(null);
    setInput("");
    setVerifying(false);
    setExercise(null);
    setCaseNumber(next);
  }

  function selectTab(next: Tab) {
    if (next === tab) return;
    setFeedback(null);
    setInput("");
    setVerifying(false);
    setExercise(null);
    setTab(next);
  }

  /**
   * Envoie la réponse au serveur, qui recalcule lui-même la forme attendue
   * et tranche (avec, si besoin, une seconde lecture par l'IA). Le client
   * n'enregistre aucun verdict de son côté : il affiche celui du serveur,
   * donc l'écran et la base disent toujours la même chose.
   */
  async function record(
    userAnswer: string,
    options: { revealed?: boolean; optimistic?: boolean; multipleChoice?: boolean } = {},
  ) {
    if (!exercise) return;
    const { revealed = false, optimistic = false, multipleChoice = false } = options;

    if (optimistic) {
      // La comparaison locale a déjà dit "juste"et le serveur applique le
      // même calcul sur les mêmes données : afficher tout de suite évite
      // une latence réseau sur le chemin le plus fréquent.
      applyVerdict(true, revealed, userAnswer, null);
    } else {
      setVerifying(true);
    }

    const outcome = await postAttempt({
      targetCase: exercise.targetCase,
      nounId: exercise.noun.id,
      // L'ADJECTIF EST ENVOYÉ PAR SON IDENTIFIANT, comme le nom, et le
      // serveur recompose le groupe lui-même. Envoyer la forme attendue
      // reviendrait à laisser le client dicter la bonne réponse.
      adjectiveId: exercise.adjective?.id,
      triggerId: exercise.trigger?.id,
      plural: exercise.plural,
      userAnswer,
      revealed,
      // Contexte de la seconde lecture IA uniquement : le verdict, lui, est
      // recalculé côté serveur à partir du nom, du cas et du nombre.
      sentence: exercise.sentenceTemplate,
      // En QCM, la réponse est une des formes proposées : inutile de payer
      // une vérification IA pour un choix qu'on sait faux.
      multipleChoice,
    });
    setVerifying(false);

    // Plafond atteint. Le hook a déjà basculé l'écran sur l'abonnement, qui
    // remplace toute la carte — y compris le verdict optimiste éventuel :
    // cette tentative n'a pas été enregistrée, elle ne doit pas laisser un
    // « ✓ Correct » à l'écran.
    if (outcome.kind === "blocked") {
      setFeedback(null);
      return;
    }

    if (outcome.kind === "verdict") {
      const data = outcome.data as { caseAccuracy?: number; correct?: boolean; reason?: string };
      if (typeof data.caseAccuracy === "number") {
        setCaseAccuracy((prev) => ({
          ...prev,
          [`${exercise.targetCase}:${exercise.noun.gender}`]: data.caseAccuracy as number,
        }));
      }
      if (!optimistic) applyVerdict(data.correct === true, revealed, userAnswer, data.reason);
      return;
    }

    // Serveur indisponible : on affiche quand même un retour à partir du
    // calcul local, l'exercice reste utilisable même si la progression de
    // cette tentative est perdue.
    if (!optimistic) applyVerdict(checkAnswer(exercise, userAnswer), revealed, userAnswer, null);
  }

  function applyVerdict(
    isCorrect: boolean,
    revealed: boolean,
    picked: string,
    reason: string | null | undefined,
  ) {
    if (!exercise) return;
    setFeedback({
      status: revealed ? "revealed" : isCorrect ? "correct" : "incorrect",
      exercise,
      picked,
      reason,
    });
    setStreak((s) => (isCorrect && !revealed ? s + 1 : 0));
    // Le déclencheur vient d'être pratiqué : on met à jour le poids local
    // pour que le tirage suivant en tienne compte sans attendre un
    // rechargement de la progression serveur.
    const triggerId = exercise.trigger?.id;
    if (triggerId) {
      setTriggerStats((prev) => {
        const cur = prev[triggerId] ?? { attempts: 0, correct: 0 };
        return {
          ...prev,
          [triggerId]: {
            attempts: cur.attempts + 1,
            correct: cur.correct + (isCorrect ? 1 : 0),
          },
        };
      });
    }
  }

  function submit() {
    if (!exercise || !input.trim() || verifying || feedback) return;
    // Réponse déjà reconnue juste localement : affichage immédiat, le
    // serveur confirmera (même moteur, mêmes données). Sinon on attend son
    // verdict — c'est là qu'intervient la vérification IA, qui rattrape une
    // variante correcte que la comparaison de chaînes refuserait.
    record(input, { optimistic: checkAnswer(exercise, input) });
  }

  function selectOption(opt: string) {
    if (!exercise || feedback || verifying) return;
    record(opt, { optimistic: opt === exercise.correctForm, multipleChoice: true });
  }

  // Pour quelqu'un qui ne sait vraiment pas — évite de taper n'importe quoi
  // juste pour débloquer "Vérifier"et voir la réponse (ou, en QCM, de
  // cliquer une option au hasard). Compte comme un échec côté progression
  // (même logique que "incorrect": la maîtrise doit encore progresser sur
  // ce déclencheur), mais affiché sans le ton "faute"du rouge.
  function reveal() {
    if (!exercise || feedback || verifying) return;
    record("", { revealed: true });
  }

  const accuracy = exercise
    ? caseAccuracy[`${exercise.targetCase}:${exercise.noun.gender}`]
    : undefined;

  const isMcq = exercise?.kind === "trigger-mcq";
  const isSentenceLike =
    exercise?.kind === "sentence-fixed" || isMcq;

  // Le mot à décliner, sous sa forme du dictionnaire — affiché entre
  // parenthèses après la traduction. Sans lui, il fallait d'abord retrouver
  // le mot russe derrière « le discours » avant de pouvoir travailler la
  // désinence. « Déclinaison isolée » et « Chiffres » montrent déjà le mot
  // en gros au dessus, eux n'en ont pas besoin.
  //
  // Montré MÊME quand la forme attendue est déjà celle du dictionnaire —
  // 80% des tirages sur la page du nominatif, 64% sur celle de l'accusatif
  // (inanimé masculin, neutre, féminin en -ь). L'indice donne alors la
  // réponse, et c'est assumé : ces exercices n'ont jamais demandé de
  // transformation, et voir « речь -> речь » est précisément ce que le
  // syncrétisme de l'accusatif a à enseigner. Le masquer rendrait l'indice
  // absent là où il manque le plus.
  // Sur un groupe, l'indice porte les DEUX mots sous leur forme de
  // dictionnaire — « но́вая доро́га ». Ne montrer que le nom laisserait
  // l'adjectif à deviner, alors que l'exercice porte sur sa désinence, pas
  // sur le choix du mot : la traduction française le nomme déjà.
  const lemmaHint = !exercise || !isSentenceLike
    ? null
    : (exercise.promptRu ?? exercise.noun.forms.singular[0]);

  if (!signedIn) return <VisitorCard caseInfo={caseInfo} />;

  if (blocked) {
    return <PaywallNotice quota={blocked.quota} message={blocked.message} what="les exercices de déclinaison" />;
  }

  return (
    // LA COULEUR DU CAS EST POSÉE ICI, UNE FOIS. Elle descend par héritage
    // jusqu'au champ, au bouton et à la pastille de mode, qui la lisent
    // via `--case` (voir `.case-tint` dans globals.css). Passer
    // `caseInfo.color` en prop à chacun aurait donné trois chemins à tenir
    // à jour au lieu d'un, et surtout aucun moyen d'en dériver les nuances
    // claires et sombres sans les recalculer en JavaScript.
    <div
      className="case-tint overflow-hidden rounded-[20px] surface shadow-float"
      style={{ "--case": caseInfo.color } as React.CSSProperties}
    >
      {/* En-tête */}
      <div
        className="flex items-center justify-between gap-3 px-5 py-3 text-white sm:px-6 sm:py-3.5"
        style={{ background: caseInfo.color }}
      >
        <span className="min-w-0 truncate font-display text-[13px] font-semibold uppercase tracking-wide sm:text-sm">
          {caseInfo.nameRu} · {caseInfo.question}
        </span>
        <span className="shrink-0 font-display text-xs font-bold">Série : {streak}</span>
      </div>

      {/* Sélecteur de mode */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-5 py-3 sm:px-6 sm:py-3.5">
        {/* `rounded-2xl` en dessous de sm : si les pastilles finissent quand
            même par passer à la ligne (écran de 320 px), un conteneur à coins
            arrondis se lit comme un bloc de deux rangs, là où la gélule se
            lisait comme un bouton cassé. */}
        <div className="inline-flex flex-wrap rounded-2xl border border-border bg-bg p-1 sm:rounded-full">
          {tabs.map((t) => (
            <ModeButton key={t} active={tab === t} onClick={() => selectTab(t)}>
              <span className="sm:hidden">{TAB_LABEL[t].short}</span>
              <span className="hidden sm:inline">{TAB_LABEL[t].full}</span>
            </ModeButton>
          ))}
        </div>
        {/* Le nombre. Absent de l'onglet « Chiffres », dont le nombre est
            dicté par le cardinal lui-même (« 2 стола́ », « 5 столо́в ») et
            non par un choix d'entraînement. */}
        {tab !== "numeral" && (
          <div className="inline-flex flex-wrap rounded-2xl border border-border bg-bg p-1 sm:rounded-full">
            {(["singular", "plural", "mixed"] as CaseNumberMode[]).map((m) => (
              <ModeButton key={m} active={numberMode === m} onClick={() => selectNumber(m)}>
                <span className="sm:hidden">{NUMBER_LABEL[m].short}</span>
                <span className="hidden sm:inline">{NUMBER_LABEL[m].full}</span>
              </ModeButton>
            ))}
          </div>
        )}
        {exercise && accuracy !== undefined && (
          <span className="ml-auto shrink-0 font-display text-xs text-muted">
            Précision ({GENDER_LABEL[exercise.noun.gender]}) : {accuracy}%
          </span>
        )}
      </div>

      <div className="p-5 sm:p-7">
        {!exercise ? (
          <ExerciseSkeleton />
        ) : (
          <div key={`${tab}-${round}`} className="animate-fade-in">
            {exercise.trigger && (
              // `inline-flex` sans `flex-wrap` : la pastille prenait la
              // largeur de son contenu, quelle qu'elle soit. Un déclencheur
              // au sens long (« qui exprime l'absence de ») la poussait
              // au-delà du cadre, où `overflow-hidden` la coupait net.
              // Elle plie maintenant sur deux lignes — d'où `rounded-2xl`
              // sous sm, une gélule à deux rangs n'ayant pas de sens.
              <p className="mb-3 inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-2xl bg-bg3 px-3 py-1 font-display text-xs font-semibold text-muted sm:rounded-full">
                Déclencheur :<span style={{ color: caseInfo.color }}>{exercise.trigger.ru}</span>
                <span className="font-normal">— {exercise.trigger.meaningFr}</span>
              </p>
            )}

            {exercise.kind === "isolated" && (
              <div className="mb-6">
                {/* « ce mot » devient « ce groupe » quand il y en a deux :
                    la consigne dit ce qu'on attend, et sur un groupe on
                    attend DEUX désinences, pas une. */}
                <p className="font-display text-sm text-muted">
                  {exercise.targetCase === "nominative"
                    ? `Mets ${exercise.adjective ? "ce groupe" : "ce mot"} au pluriel :`
                    : `Décline ${exercise.adjective ? "ce groupe" : "ce mot"} :`}
                </p>
                <p className="font-display text-3xl font-bold">
                  {exercise.promptRu ?? exercise.noun.forms.singular[0]}
                  {" "}
                  <span className="font-display text-lg font-normal text-muted">
                    ({exercise.promptFr ?? exercise.noun.translation})
                  </span>
                </p>
              </div>
            )}

            {exercise.kind === "numeral" && exercise.numeral !== undefined && (
              <div className="mb-6">
                <p className="font-display text-sm text-muted">Accorde le nom avec le chiffre :</p>
                <p className="font-display text-3xl font-bold">
                  {exercise.numeral} + {exercise.noun.forms.singular[0]}
                  {" "}
                  <span className="font-display text-lg font-normal text-muted">
                    ({exercise.noun.translation})
                  </span>
                </p>
                {exercise.countForm && (
                  <p className="mt-2 font-display text-xs text-muted">
                    {COUNT_FORM_LABEL[exercise.countForm]}
                  </p>
                )}
              </div>
            )}

            {isSentenceLike && (
              <div className="mb-6">
                <p className="font-display text-sm text-muted">Complète la phrase :</p>
                <p className="font-display text-2xl font-bold">
                  {exercise.sentenceTemplate?.split("___")[0]}
                  <span className="inline-block min-w-[80px] border-b-2 border-accent">&nbsp;</span>
                  {exercise.sentenceTemplate?.split("___")[1]}
                </p>
                {/* Forme du dictionnaire du mot à décliner, juste après la
                    traduction — voir `lemmaHint`. */}
                <p className="mt-1 font-display text-sm italic text-muted">
                  {exercise.sentenceFr}
                  {lemmaHint && <span className="ml-2 not-italic text-accent2">({lemmaHint})</span>}
                </p>
              </div>
            )}

            {isMcq ? (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {exercise.options?.map((opt) => {
                  const isPicked = feedback?.picked === opt;
                  const isCorrectOpt = feedback && opt === exercise.correctForm;
                  return (
                    <button
                      key={opt}
                      onClick={() => selectOption(opt)}
                      disabled={!!feedback || verifying}
                      className={`rounded-[10px] border px-4 py-3 font-display text-lg font-semibold transition-colors ${
                        isCorrectOpt
                          ? "border-success bg-success/10 text-success"
                          : isPicked
                            ? "border-danger bg-danger/10 text-danger"
                            : "border-border bg-bg text-text hover:bg-accent/10 hover:border-accent/35"
                      } disabled:cursor-default`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            ) : (
              // 271 px de large sur un écran de 375 : le bouton « Vérifier »
              // en prenait 105 et laissait au champ de quoi afficher six
              // lettres. Empilés, le champ retrouve toute la largeur et le
              // bouton devient une cible au pouce, comme « Je ne sais pas »
              // juste en dessous.
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (feedback ? nextExercise() : submit())}
                  placeholder="Écris la réponse en russe…"
                  readOnly={verifying}
                  className={`field-focus field-case flex-1 rounded-[10px] border bg-bg px-4 py-3 font-display text-lg text-text outline-none placeholder:text-muted/60 ${
                    verifying ? "opacity-60" : ""
                  }`}
                  autoFocus
                />
                {feedback ? (
                  <button
                    onClick={nextExercise}
                    className="btn btn-primary btn-sheen rounded-[10px] bg-bg3 px-6 py-3 font-display text-sm text-text transition-colors"
                  >
                    Suivant →
                  </button>
                ) : (
                  <button
                    onClick={submit}
                    disabled={!input.trim() || verifying}
                    className="btn btn-primary btn-case btn-sheen rounded-[10px] px-6 py-3 font-display text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {verifying ? "Vérification…" : "Vérifier"}
                  </button>
                )}
              </div>
            )}

            {!feedback && (
              <button
                onClick={reveal}
                disabled={verifying}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-[10px] border border-border py-2.5 font-display text-sm font-semibold text-muted transition-colors hover:bg-accent2/10 hover:border-accent2/35 hover:text-accent2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <BulbIcon className="h-4 w-4 shrink-0" />
                Je ne sais pas — voir la réponse
              </button>
            )}

            {isMcq && feedback && (
              <button
                onClick={nextExercise}
                className="btn btn-primary btn-sheen mt-4 rounded-[10px] bg-bg3 px-6 py-3 font-display text-sm text-text transition-colors"
              >
                Suivant →
              </button>
            )}

            {feedback && (
              <div
                className={`mt-5 rounded-xl border p-4 ${
                  feedback.status === "correct"
                    ? "border-success bg-success/10"
                    : feedback.status === "revealed"
                      ? "border-border bg-bg3"
                      : "border-danger bg-danger/10"
                }`}
              >
                <p className="font-display text-sm font-bold uppercase tracking-wide">
                  {feedback.status === "correct"
                    ? "✓ Correct"
                    : feedback.status === "revealed"
                      ? "Réponse"
                      : "✗ Pas tout à fait"}
                </p>
                {/* Forme accentuée : l'accent tonique n'est jamais écrit en
                    russe courant, donc jamais exigé de l'apprenant (voir
                    normalizeAnswer), mais c'est l'information la plus utile
                    et la moins devinable pour un francophone — autant la
                    montrer chaque fois qu'on donne la réponse. */}
                <p className="mt-1 font-display text-xl font-bold">
                  {exercise.accentedForm ?? exercise.correctForm}
                </p>
                <p className="mt-1 font-display text-sm text-muted">{exercise.ruleApplied}</p>
                {/* La seconde forme du dictionnaire. Elle est acceptée comme
                    réponse ; la montrer, c'est transformer un « faux » évité
                    en quelque chose d'appris. On la nomme différemment selon
                    que l'apprenant vient de la taper ou non. */}
                {exercise.variantForm && (
                  <p className="mt-1 font-display text-sm text-muted">
                    {feedback.picked && answeredWithVariant(exercise, feedback.picked)
                      ? `Juste aussi — la forme la plus courante est ${exercise.accentedForm}.`
                      : `Juste aussi : ${exercise.variantForm}.`}
                  </p>
                )}
                {feedback.reason && (
                  <p className="mt-2 font-display text-sm text-muted">{feedback.reason}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Pendant le tirage (et l'appel IA du mode "Phrase") : plutôt que de laisser
// l'ancien exercice affiché avec juste un libellé changé (source de
// confusion — contenu et onglet ne correspondaient plus), un squelette qui
// épouse la forme du contenu à venir.
// Le squelette annonçait « Génération d'une phrase… » sur l'onglet Phrase.
// C'était faux pour tout le monde depuis que les phrases sont écrites à la
// construction, et ça l'était déjà avant pour les comptes gratuits, dont le
// quota de génération valait zéro : ils regardaient trois points clignoter
// pour un gabarit figé.
function ExerciseSkeleton() {
  return (
    <div className="animate-fade-in">
      <div className="mb-6 space-y-3">
        <div className="skeleton h-4 w-24 rounded-full" />
        <div className="skeleton h-8 w-4/5 rounded-lg" />
        <div className="skeleton h-4 w-2/5 rounded-lg" />
      </div>
      <div className="skeleton h-[50px] w-full rounded-[10px]" />
    </div>
  );
}

/**
 * Ce qu'un visiteur non connecté voit à la place de la carte d'entraînement.
 *
 * POURQUOI L'EXERCICE NE TOURNE PAS SANS COMPTE. Les six routes de
 * correction refusent un appel anonyme, et le composant retombe alors sur sa
 * correction locale — ce qui donnerait au visiteur un entraînement illimité
 * là où un compte gratuit est plafonné à vingt par jour. Se déconnecter
 * deviendrait la façon la plus simple de contourner le plafond.
 *
 * La page, elle, reste entièrement lisible : l'usage du cas, ses
 * déclencheurs et la table des terminaisons sont juste en dessous. C'est
 * cette matière-là qui répond à une recherche ; l'exercice est ce qu'on
 * vient chercher ENSUITE, et c'est le bon moment pour demander un compte.
 */
function VisitorCard({ caseInfo }: { caseInfo: CaseInfo }) {
  return (
    <div
      className="case-tint overflow-hidden rounded-[20px] surface shadow-float"
      style={{ "--case": caseInfo.color } as React.CSSProperties}
    >
      <div
        className="flex items-center justify-between gap-3 px-5 py-3 text-white sm:px-6 sm:py-3.5"
        style={{ background: caseInfo.color }}
      >
        <span className="min-w-0 truncate font-display text-[13px] font-semibold uppercase tracking-wide sm:text-sm">
          {caseInfo.nameRu} · {caseInfo.question}
        </span>
      </div>

      <div className="p-5 sm:p-7">
        <p className="font-display text-lg font-bold">
          S&apos;entraîner au {caseInfo.nameFr.toLowerCase()}
        </p>
        <p className="mt-2 max-w-xl font-display text-sm leading-relaxed text-muted">
          Décliner un mot, compléter une phrase, choisir la bonne forme — corrigé à chaque
          réponse par le moteur de règles, pas par un modèle qui devine. Le compte est gratuit
          et sert à retenir ce que vous ratez, pour vous le represser plus souvent.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/signup"
            className="btn btn-primary btn-case btn-sheen rounded-[10px] px-6 py-3 font-display text-sm"
          >
            Créer un compte gratuit
          </Link>
          <Link
            href="/login"
            className="btn btn-outline rounded-[10px] px-6 py-3 font-display text-sm font-semibold text-text"
          >
            J&apos;ai déjà un compte
          </Link>
        </div>
        <p className="mt-4 font-display text-xs text-muted">
          Le cours, les tableaux et cette page restent lisibles sans compte.
        </p>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-2.5 py-1.5 font-display text-xs font-semibold transition-colors sm:px-3.5 ${
        active ? "mode-case" : "text-muted hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}
