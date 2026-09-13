"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CaseWhy, GlossedWord, ReadingText } from "@/lib/reading/texts";
import { CASES, CASES_BY_LEARNING_ORDER } from "@/lib/grammar/cases";
import type { CaseId, CaseInfo } from "@/lib/grammar/types";
import { caseHint } from "@/lib/reading/case-hints";
import { completeReadingText, explainSentenceCases } from "@/lib/reading/client";
import { isQuotaError, type QuotaInfo } from "@/lib/billing/quota-client";
import { speakRu } from "@/lib/vocabulary/speech";
import SpeakButton from "@/components/vocabulary/SpeakButton";
import AiSpark from "@/components/ui/AiSpark";
import PaywallNotice from "@/components/ui/PaywallNotice";
import { LoadingDots } from "@/components/ui/Skeleton";
import { CheckIcon, CrossIcon } from "@/components/ui/icons";

/**
 * Le lecteur des cas.
 *
 * CE QUE LE MODULE EST DEVENU. Il s'appelait « Lecture » et faisait ce que
 * font toutes les liseuses : une traduction au clic, des mots colorés. On
 * lisait le texte, on voyait les couleurs, et on ne savait toujours pas
 * POURQUOI « шко́ле » était au prépositionnel. Le texte sert maintenant à ça :
 *
 *   LIRE          chaque mot décliné porte la couleur de son cas ; le toucher
 *                 ouvre son analyse — cas, nombre, forme du dictionnaire, et
 *                 surtout la raison de ce cas dans cette phrase. La légende
 *                 compte les cas du texte et sait n'en montrer qu'un.
 *   DEVINER       les couleurs disparaissent ; on touche un mot souligné et on
 *                 choisit son cas. L'explication suit la réponse, jamais avant.
 *
 * LA RAISON VIENT DE TROIS SOURCES, DE LA PLUS SÛRE À LA MOINS SÛRE :
 *   1. une explication écrite et relue à la main (textes de la bibliothèque) ;
 *   2. une règle, quand le mot qui gouverne le cas est une préposition ou un
 *      mot de quantité juste devant (lib/reading/case-hints.ts) — gratuite ;
 *   3. l'IA, à la demande, pour la phrase entière (app/api/reading/explain) —
 *      traduction comprise, puis gardée dans le texte.
 * L'écran dit toujours laquelle il montre.
 */

type Mode = "read" | "quiz";

type SentenceHelp =
  | { status: "loading" }
  | { status: "done"; translation: string | null; words: Record<string, CaseWhy> }
  | { status: "error"; message: string }
  | { status: "quota"; quota: QuotaInfo; message: string };

const CASE_BY_ID = Object.fromEntries(CASES.map((c) => [c.id, c])) as Record<CaseId, CaseInfo>;

/** La TTS ne sait prononcer qu'une phrase courte (voir app/api/tts). */
const SENTENCE_AUDIO_MAX = 120;

function keyOf(s: number, w: number): string {
  return `${s}-${w}`;
}

/**
 * « le génitif », « l'accusatif ». Le nom du cas était collé derrière « le »,
 * et l'écran affichait « Revoir le accusatif » et « le instrumental ».
 */
function theCase(info: CaseInfo): string {
  const name = info.nameFr.toLowerCase();
  return /^[aeiouyéèê]/.test(name) ? `l'${name}` : `le ${name}`;
}

/** Le mot sans la ponctuation qui lui est collée : « школе. » → « школе ». */
function cleanWord(ru: string): string {
  return ru.replace(/^[^\p{L}\d]+|[^\p{L}\d́]+$/gu, "");
}

export default function CaseReader({
  text,
  onCompleted,
  readOnly = false,
}: {
  text: ReadingText;
  /**
   * Quand le parent le fournit, c'est LUI qui décide de la suite (le
   * générateur referme le texte). Sans lui — pages /reading/[id] et
   * /reading/mine/[id], où le texte EST la page — le bouton se contente de
   * passer à l'état « terminé » sur place.
   */
  onCompleted?: () => void;
  /**
   * La démonstration servie aux visiteurs (voir ReadingPreview) : ni
   * enregistrement de fin de texte, ni appel à l'IA, qui demandent un compte.
   * Le reste est le vrai lecteur — les explications relues de la
   * bibliothèque et le mode « Deviner » compris.
   */
  readOnly?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("read");
  const [active, setActive] = useState<{ s: number; w: number } | null>(null);
  const [highlight, setHighlight] = useState<CaseId | null>(null);
  const [answers, setAnswers] = useState<Record<string, CaseId>>({});
  const [help, setHelp] = useState<Record<number, SentenceHelp>>({});
  const [completion, setCompletion] = useState<"idle" | "saving" | "done">("idle");

  // Un nouveau texte repart de zéro — comparaison pendant le rendu plutôt
  // qu'un effet (même motif que `seenPathname` dans NavBar).
  const [seenTextId, setSeenTextId] = useState(text.id);
  if (text.id !== seenTextId) {
    setSeenTextId(text.id);
    setMode("read");
    setActive(null);
    setHighlight(null);
    setAnswers({});
    setHelp({});
    setCompletion("idle");
  }

  const tagged = useMemo(
    () =>
      text.sentences.flatMap((sentence, s) =>
        sentence.map((word, w) => ({ s, w, word })).filter((item) => Boolean(item.word.case))
      ),
    [text]
  );

  const casesPresent = useMemo(() => {
    const counts = new Map<CaseId, number>();
    for (const { word } of tagged) counts.set(word.case!, (counts.get(word.case!) ?? 0) + 1);
    return CASES.filter((c) => counts.has(c.id)).map((info) => ({
      info,
      count: counts.get(info.id)!,
    }));
  }, [tagged]);

  const unverifiedCount = tagged.filter(({ word }) => word.caseStatus === "unverified").length;

  // LE QUIZ NE PORTE QUE SUR CE QUI A ÉTÉ VÉRIFIÉ, quand il y en a assez :
  // compter faux la réponse d'un apprenant contre une analyse que rien n'a
  // confirmée, c'est le noter contre le modèle. Un texte presque entièrement
  // invérifiable garde tous ses mots, faute de mieux — et la légende le dit.
  const quizItems = useMemo(() => {
    const verified = tagged.filter(({ word }) => word.caseStatus !== "unverified");
    return verified.length >= 3 ? verified : tagged;
  }, [tagged]);
  const quizKeys = useMemo(() => new Set(quizItems.map(({ s, w }) => keyOf(s, w))), [quizItems]);
  const answeredCount = quizItems.filter(({ s, w }) => answers[keyOf(s, w)]).length;
  const foundCount = quizItems.filter(({ s, w, word }) => answers[keyOf(s, w)] === word.case).length;
  const quizDone = quizItems.length > 0 && answeredCount === quizItems.length;

  // Un texte affiché sans avoir été enregistré n'a pas d'identifiant à
  // transmettre : la route relit le texte en base, jamais celui du client.
  const canAskAi = !readOnly && text.id !== "ai-generated";

  // Échap referme l'analyse, comme n'importe quel panneau.
  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setActive(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  // Le panneau s'ouvre sous la phrase : sur téléphone, il pouvait naître
  // sous le bord de l'écran sans que rien ne l'indique.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active?.s, active?.w]);

  function select(s: number, w: number) {
    setActive((current) => (current && current.s === s && current.w === w ? null : { s, w }));
  }

  function changeMode(next: Mode) {
    setMode(next);
    setActive(null);
    setHighlight(null);
  }

  function answer(key: string, caseId: CaseId) {
    // La première réponse compte : on ne corrige pas après avoir vu la solution.
    setAnswers((prev) => (prev[key] ? prev : { ...prev, [key]: caseId }));
  }

  async function explain(s: number) {
    setHelp((prev) => ({ ...prev, [s]: { status: "loading" } }));
    try {
      const result = await explainSentenceCases(text.id, s);
      setHelp((prev) => ({
        ...prev,
        [s]: { status: "done", translation: result.translation, words: result.words },
      }));
    } catch (err) {
      setHelp((prev) => ({
        ...prev,
        [s]: isQuotaError(err)
          ? { status: "quota", quota: err.quota, message: err.message }
          : {
              status: "error",
              message:
                err instanceof Error && err.message !== "Erreur réseau"
                  ? err.message
                  : "Explication indisponible pour le moment.",
            },
      }));
    }
  }

  async function markDone() {
    if (completion !== "idle") return;
    setCompletion("saving");
    try {
      await completeReadingText({
        textId: text.id,
        level: text.level,
        ...(answeredCount > 0 ? { found: foundCount, total: quizItems.length } : {}),
      });
    } catch {
      // best-effort, comme le reste du suivi de progression de l'app
    }
    setCompletion("done");
    onCompleted?.();
  }

  function renderWord(word: GlossedWord, s: number, w: number) {
    const key = keyOf(s, w);
    if (!word.gloss) return <span key={key}>{word.ru} </span>;

    const isActive = active?.s === s && active?.w === w;
    const info = word.case ? CASE_BY_ID[word.case] : undefined;
    const inQuiz = mode === "quiz" && quizKeys.has(key);
    const picked = answers[key];
    const colored = Boolean(info) && (mode === "read" || (inQuiz && Boolean(picked)));
    const dimmed = mode === "read" && highlight !== null && word.case !== highlight;

    const underline = colored
      ? `border-b-[3px] ${word.caseStatus === "unverified" ? "border-dashed" : ""}`
      : inQuiz
        ? "border-b-[3px] border-dashed border-muted/50"
        : "border-b-2 border-dotted border-accent2/40";
    const feedback = inQuiz && picked ? (picked === word.case ? "bg-success/12" : "bg-danger/12") : "";

    return (
      <span key={key}>
        <button
          type="button"
          onClick={() => select(s, w)}
          aria-expanded={isActive}
          className={`rounded-sm pb-0.5 transition-[background-color,opacity] duration-200 ${underline} ${feedback} ${
            isActive ? "bg-[var(--surface-active)]" : "hover:bg-[var(--surface-hover)]"
          } ${dimmed ? "opacity-35" : ""}`}
          style={colored && info ? { borderColor: info.color } : undefined}
        >
          {word.ru}
        </button>{" "}
      </span>
    );
  }

  const noCases = tagged.length === 0;

  return (
    <div className="rounded-[20px] surface shadow-float">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5 sm:px-8">
        {noCases ? (
          <p className="font-display text-xs text-muted">Aucun mot décliné n&apos;est annoté dans ce texte.</p>
        ) : (
          <div
            role="tablist"
            aria-label="Façon de lire le texte"
            className="inline-flex rounded-[10px] border border-border bg-bg p-1"
          >
            {(["read", "quiz"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => changeMode(m)}
                className={`rounded-lg px-3 py-1.5 font-display text-xs font-semibold transition-colors ${
                  mode === m ? "bg-accent text-white" : "text-muted hover:text-text"
                }`}
              >
                {m === "read" ? "Lire" : "Deviner les cas"}
              </button>
            ))}
          </div>
        )}
        {!noCases && (
          <p className="font-display text-xs font-semibold text-muted">
            {mode === "quiz"
              ? `${foundCount} / ${quizItems.length} trouvé${foundCount > 1 ? "s" : ""}`
              : `${tagged.length} mot${tagged.length > 1 ? "s" : ""} décliné${tagged.length > 1 ? "s" : ""}`}
          </p>
        )}
      </div>

      {!noCases && mode === "read" && (
        <div className="px-5 pt-4 sm:px-8">
          {/* LA LÉGENDE EST UN FILTRE. Neuf génitifs et deux datifs ne se
              lisent pas pareil qu'un texte « coloré » : toucher un cas n'en
              laisse que les mots allumés, et le compte dit ce que le texte
              travaille vraiment. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {casesPresent.map(({ info, count }) => {
              const on = highlight === info.id;
              return (
                <button
                  key={info.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setHighlight(on ? null : info.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-display text-xs font-semibold transition-colors ${
                    on ? "text-white" : "border-border text-muted hover:text-text"
                  }`}
                  style={on ? { backgroundColor: info.color, borderColor: info.color } : undefined}
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: on ? "#fff" : info.color }}
                  />
                  {info.nameFr}
                  <span className={on ? "text-white/80" : "text-muted/70"}>{count}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 font-display text-xs leading-relaxed text-muted">
            Touche un mot pour voir son cas et la raison de ce cas.
            {highlight ? " Touche à nouveau le cas pour tout réafficher." : ""}
          </p>
          {unverifiedCount > 0 && (
            <p className="mt-1 font-display text-[11px] leading-relaxed text-muted">
              Soulignement plein : cas confirmé par le dictionnaire de déclinaisons. Pointillé (
              {unverifiedCount} mot{unverifiedCount > 1 ? "s" : ""}) : analyse que l&apos;app n&apos;a
              pas pu vérifier — à prendre comme une indication.
            </p>
          )}
        </div>
      )}

      {!noCases && mode === "quiz" && (
        <div className="px-5 pt-4 sm:px-8">
          <p className="font-display text-sm leading-relaxed text-muted">
            Chaque mot souligné en tirets porte un cas. Touche-le et choisis lequel : l&apos;explication
            arrive avec ta réponse.
          </p>
          {quizDone && (
            <div
              role="status"
              className="animate-fade-in mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3"
            >
              <p className="font-display text-sm text-text">
                <span className="font-bold">
                  {foundCount} / {quizItems.length}
                </span>{" "}
                cas trouvés du premier coup.
              </p>
              <button
                type="button"
                onClick={() => {
                  setAnswers({});
                  setActive(null);
                }}
                className="font-display text-sm font-semibold text-accent-ink underline-offset-2 hover:underline"
              >
                Recommencer
              </button>
            </div>
          )}
        </div>
      )}

      <div className="space-y-5 px-5 py-6 font-display text-xl leading-[1.9] sm:px-8 sm:text-2xl">
        {text.sentences.map((sentence, s) => {
          const activeWord = active?.s === s ? sentence[active.w] : undefined;
          const state = help[s];
          const aiWords = state?.status === "done" ? state.words : undefined;
          return (
            <div key={s}>
              <p>{sentence.map((word, w) => renderWord(word, s, w))}</p>
              {activeWord && active && (
                <WordPanel
                  panelRef={panelRef}
                  sentence={sentence}
                  index={active.w}
                  word={activeWord}
                  inQuiz={mode === "quiz" && quizKeys.has(keyOf(s, active.w))}
                  picked={answers[keyOf(s, active.w)]}
                  onAnswer={(caseId) => answer(keyOf(s, active.w), caseId)}
                  onClose={() => setActive(null)}
                  why={activeWord.why ?? aiWords?.[String(active.w)]}
                  translation={
                    sentence[0]?.sentenceFr ?? (state?.status === "done" ? state.translation : null)
                  }
                  help={state}
                  canAskAi={canAskAi}
                  onExplain={() => explain(s)}
                />
              )}
            </div>
          );
        })}
      </div>

      {!readOnly && (
        <div className="flex justify-end border-t border-border px-5 py-4 sm:px-8">
          {completion === "done" ? (
            <span className="font-display text-sm font-semibold text-accent-ink">✓ Texte terminé</span>
          ) : (
            <button
              onClick={markDone}
              disabled={completion === "saving"}
              className="btn btn-primary btn-sheen rounded-[10px] px-5 py-2.5 font-display text-sm disabled:opacity-60"
            >
              {completion === "saving" ? "…" : "J'ai terminé ce texte"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** L'analyse d'un mot, ouverte sous sa phrase. */
function WordPanel({
  panelRef,
  sentence,
  index,
  word,
  inQuiz,
  picked,
  onAnswer,
  onClose,
  why,
  translation,
  help,
  canAskAi,
  onExplain,
}: {
  panelRef: React.RefObject<HTMLDivElement | null>;
  sentence: GlossedWord[];
  index: number;
  word: GlossedWord;
  inQuiz: boolean;
  picked: CaseId | undefined;
  onAnswer: (caseId: CaseId) => void;
  onClose: () => void;
  why: CaseWhy | undefined;
  translation: string | null | undefined;
  help: SentenceHelp | undefined;
  canAskAi: boolean;
  onExplain: () => void;
}) {
  const info = word.case ? CASE_BY_ID[word.case] : undefined;
  const bare = cleanWord(word.ru);
  const asking = inQuiz && !picked;
  const unverified = word.caseStatus === "unverified";
  const sentenceText = sentence.map((x) => x.ru).join(" ");

  return (
    <div
      ref={panelRef}
      role="region"
      aria-label={`Analyse de ${bare}`}
      className="animate-fade-in mt-3 rounded-2xl border border-border bg-bg p-4 text-left font-display text-base leading-normal sm:p-5"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xl font-bold">
            <span className="min-w-0">{bare}</span>
            <SpeakButton label={`Écouter ${bare}`} title="Écouter le mot" onSpeak={() => speakRu(bare)} />
          </p>
          <p className="mt-0.5 text-sm text-muted">
            {word.gloss}
            {!asking && why?.lemma && why.lemma.toLowerCase() !== bare.toLowerCase() && (
              <>
                {" "}
                · forme du dictionnaire : <span className="font-semibold text-text">{why.lemma}</span>
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer l'analyse"
          className="hover-surface flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted"
        >
          <CrossIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {!info ? (
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Ce mot ne porte pas de cas ici : verbe, préposition, adverbe ou mot invariable.
        </p>
      ) : asking ? (
        <div className="mt-4">
          <p className="text-sm font-semibold">À quel cas est ce mot&nbsp;?</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CASES_BY_LEARNING_ORDER.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onAnswer(c.id)}
                className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-left transition-colors hover:border-accent/35 hover:bg-accent/10"
              >
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: c.color }}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{c.nameFr}</span>
                  <span className="block text-[11px] text-muted">{c.question}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {inQuiz && picked && (
            <p
              className={`mt-3 flex items-center gap-2 text-sm font-semibold ${
                picked === word.case ? "text-success" : "text-danger"
              }`}
            >
              {picked === word.case ? (
                <CheckIcon className="h-4 w-4 shrink-0" />
              ) : (
                <CrossIcon className="h-3.5 w-3.5 shrink-0" />
              )}
              {picked === word.case
                ? "Bien vu."
                : `Tu as répondu « ${CASE_BY_ID[picked].nameFr.toLowerCase()} ».`}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold text-white"
              style={{ backgroundColor: info.color }}
            >
              {info.nameFr}
              {why?.number && !why.disputed && ` · ${why.number === "plural" ? "pluriel" : "singulier"}`}
            </span>
            <span className="text-xs text-muted">{info.question}</span>
            {unverified && (
              <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
                analyse non vérifiée
              </span>
            )}
          </div>

          <div className="mt-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
              Pourquoi ce cas&nbsp;?
            </p>
            <WhyBody
              sentence={sentence}
              index={index}
              info={info}
              why={why}
              unverified={unverified}
              help={help}
              canAskAi={canAskAi}
              onExplain={onExplain}
            />
            <Link
              href={`/cases/${info.id}`}
              className="mt-3 inline-block text-xs font-semibold text-accent-ink underline-offset-2 hover:underline"
            >
              Revoir {theCase(info)} →
            </Link>
          </div>
        </>
      )}

      {/* La traduction de la phrase n'arrive qu'APRÈS la réponse en mode
          « Deviner » : « à l'école » souffle presque le prépositionnel. */}
      {!asking && (translation || sentenceText.length <= SENTENCE_AUDIO_MAX) && (
        <div className="mt-4 flex flex-wrap items-start gap-3 border-t border-border pt-3">
          {translation && (
            <p className="min-w-0 flex-1 text-sm leading-relaxed">
              <span className="text-muted">Toute la phrase : </span>
              {translation}
            </p>
          )}
          {sentenceText.length <= SENTENCE_AUDIO_MAX && (
            <SpeakButton
              text="Phrase"
              label="Écouter la phrase en russe"
              title="Écouter la phrase"
              onSpeak={() => speakRu(sentenceText)}
              className={translation ? "" : "ml-auto"}
            />
          )}
        </div>
      )}
    </div>
  );
}

/** La raison du cas : relue, calculée, ou demandée à l'IA — et ce qu'on en montre. */
function WhyBody({
  sentence,
  index,
  info,
  why,
  unverified,
  help,
  canAskAi,
  onExplain,
}: {
  sentence: GlossedWord[];
  index: number;
  info: CaseInfo;
  why: CaseWhy | undefined;
  unverified: boolean;
  help: SentenceHelp | undefined;
  canAskAi: boolean;
  onExplain: () => void;
}) {
  const hint = caseHint(sentence, index);
  const caseName = info.nameFr.toLowerCase();

  const fallback = hint ? (
    <p className="mt-1.5 text-sm leading-relaxed text-text">
      <span className="font-semibold">
        « {hint.trigger} » + {caseName}
      </span>{" "}
      : {hint.meaning}.
    </p>
  ) : (
    <p className="mt-1.5 text-sm leading-relaxed text-muted">
      En général, {theCase(info)} sert à ceci — {info.usage}
    </p>
  );

  // L'IA A LU UN AUTRE CAS. Sa justification défend ce cas-là : montrée comme
  // la raison du cas annoncé, elle enseignerait une contradiction.
  if (why?.disputed) {
    const other = CASE_BY_ID[why.disputed].nameFr.toLowerCase();
    return unverified ? (
      <>
        <p className="mt-1.5 text-sm leading-relaxed text-text">
          L&apos;IA lit plutôt ici un <span className="font-semibold">{other}</span> : l&apos;analyse de
          ce mot est incertaine.
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted">{why.reason}</p>
      </>
    ) : (
      <>
        {fallback}
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          Ce cas est confirmé par le dictionnaire de déclinaisons ; l&apos;IA y lisait un {other}, son
          explication n&apos;est donc pas montrée.
        </p>
      </>
    );
  }

  if (why) {
    return (
      <>
        {why.trigger && (
          <p className="mt-1.5 text-sm">
            <span className="text-muted">Imposé par </span>
            <span className="font-semibold">« {why.trigger} »</span>
          </p>
        )}
        <p className="mt-1.5 text-sm leading-relaxed text-text">{why.reason}</p>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
          {why.source === "ai" ? (
            <>
              <AiSpark className="h-3 w-3 shrink-0 text-accent2" />
              Expliqué par l&apos;IA — le commentaire d&apos;un professeur, pas une référence.
            </>
          ) : (
            <>
              <CheckIcon className="h-3 w-3 shrink-0 text-success" />
              Explication relue à la main.
            </>
          )}
        </p>
      </>
    );
  }

  return (
    <>
      {fallback}
      {canAskAi && (
        <AiHelp state={help} onExplain={onExplain} />
      )}
    </>
  );
}

function AiHelp({ state, onExplain }: { state: SentenceHelp | undefined; onExplain: () => void }) {
  if (!state) {
    return (
      <button
        type="button"
        onClick={onExplain}
        className="mt-3 inline-flex items-center gap-2 rounded-xl border border-accent2/40 bg-accent2/10 px-3.5 py-2 text-xs font-bold text-accent2 transition-colors hover:border-accent2/50 hover:bg-accent2/20"
      >
        <AiSpark className="h-4 w-4" />
        Expliquer cette phrase avec l&apos;IA
      </button>
    );
  }
  if (state.status === "loading") {
    return (
      <div className="mt-3 rounded-xl border border-accent2/30 bg-accent2/5 px-4 py-3">
        <LoadingDots label="Le professeur analyse la phrase…" />
      </div>
    );
  }
  if (state.status === "quota") {
    return (
      <div className="mt-3">
        <PaywallNotice quota={state.quota} message={state.message} what="les explications de l'IA" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <button
        type="button"
        onClick={onExplain}
        className="mt-3 inline-flex items-center gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3.5 py-2 text-xs font-semibold text-danger"
      >
        {state.message} — réessayer
      </button>
    );
  }
  // La phrase a été expliquée, mais pas ce mot : le modèle l'a omis, ou son
  // explication n'a pas passé les contrôles.
  return (
    <p className="mt-2 text-xs leading-relaxed text-muted">
      L&apos;IA n&apos;a pas su justifier ce mot-là ; l&apos;indication ci-dessus reste valable.
    </p>
  );
}
