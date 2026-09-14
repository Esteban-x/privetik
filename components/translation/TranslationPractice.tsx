"use client";

import Link from "next/link";
import { useState } from "react";
import type { PublicTranslationItem } from "@/lib/translation/items";
import { usePracticeAttempt } from "@/lib/practice/attempt-client";
import PaywallNotice from "@/components/ui/PaywallNotice";
import SpeakButton from "@/components/vocabulary/SpeakButton";
import { speakRu } from "@/lib/vocabulary/speech";

/** Une série : dix phrases, puis un bilan. */
const SERIES = 10;

interface Result {
  correct: boolean;
  revealed: boolean;
  exact: boolean;
  reference: string;
  reason: string | null;
  corrected: string | null;
  aiUnavailable: boolean;
}

/**
 * Traduire une phrase du français vers le russe (voir lib/translation/items.ts).
 *
 * La correction vient toujours du serveur : le navigateur ne connaît pas la
 * référence avant d'avoir répondu. Hors ligne, rien n'est donc corrigé ici —
 * la réponse reste à l'écran, prête à être renvoyée.
 */
export default function TranslationPractice({ items }: { items: PublicTranslationItem[] }) {
  const { blocked, submit, stopHere } = usePracticeAttempt("/api/translation/attempt");
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(0);
  const [right, setRight] = useState(0);
  const [recap, setRecap] = useState(false);

  if (blocked) {
    return <PaywallNotice quota={blocked.quota} message={blocked.message} what="les exercices" />;
  }
  if (items.length === 0) {
    return (
      <p className="rounded-2xl surface px-5 py-6 font-display text-sm text-muted">
        Aucune phrase à ce niveau pour l&apos;instant.
      </p>
    );
  }

  const item = items[index % items.length];

  async function check(revealed = false) {
    if (checking || result || (!revealed && !answer.trim())) return;
    setChecking(true);
    setFailed(false);
    const outcome = await submit({ itemId: item.id, answer, revealed });
    setChecking(false);
    if (outcome.kind === "blocked") return;
    if (outcome.kind === "offline") {
      setFailed(true);
      return;
    }
    const data = outcome.data as unknown as Result;
    setResult(data);
    setDone((n) => n + 1);
    if (data.correct) setRight((n) => n + 1);
  }

  function next() {
    if (done >= SERIES) {
      setRecap(true);
      return;
    }
    if (stopHere()) return;
    setIndex((i) => i + 1);
    setAnswer("");
    setResult(null);
  }

  function newSeries() {
    setRecap(false);
    setDone(0);
    setRight(0);
    setIndex((i) => i + 1);
    setAnswer("");
    setResult(null);
  }

  return (
    <div className="overflow-hidden rounded-[20px] surface">
      <div className="flex items-center justify-between gap-3 bg-accent px-6 py-3.5 text-white">
        <p className="font-display text-sm font-bold uppercase tracking-wide">Traduire</p>
        <p className="font-display text-xs font-semibold">
          {Math.min(done + (result || recap ? 0 : 1), SERIES)}/{SERIES} · {right} juste{right > 1 ? "s" : ""}
        </p>
      </div>

      {recap ? (
        <div className="px-6 py-7">
          <p className="font-display text-xs font-semibold uppercase tracking-wide text-muted">Bilan de la série</p>
          <p className="mt-1 font-display text-3xl font-extrabold">
            {right} / {SERIES}
          </p>
          <p className="mt-2 max-w-xl font-display text-sm leading-relaxed text-muted">
            {right >= 8
              ? "Des phrases entières, justes : c'est tout ce que les modules font travailler séparément, réuni."
              : "Les phrases ratées montrent où ça coince — un cas, un aspect, un accord. Le module correspondant le fait travailler seul."}
          </p>
          <button
            type="button"
            onClick={newSeries}
            className="btn btn-primary btn-sheen mt-5 rounded-[10px] px-5 py-2.5 font-display text-sm"
          >
            Nouvelle série →
          </button>
        </div>
      ) : (
        <div className="px-6 py-6">
          <p className="font-display text-xs font-semibold uppercase tracking-wide text-muted">Traduis en russe</p>
          <p className="mt-2 font-display text-2xl font-bold leading-snug">{item.fr}</p>

          <textarea
            lang="ru"
            rows={2}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (result) next();
                else void check();
              }
            }}
            readOnly={Boolean(result) || checking}
            placeholder="Пиши здесь…"
            autoComplete="off"
            spellCheck={false}
            className={`field-focus mt-5 w-full resize-none rounded-[10px] border border-border bg-bg px-4 py-3 font-display text-xl text-text outline-none placeholder:text-muted/60 ${
              result || checking ? "opacity-70" : ""
            }`}
          />

          {failed && (
            <p role="alert" className="mt-3 font-display text-sm text-danger">
              Correction impossible pour le moment — vérifie ta connexion et réessaie.
            </p>
          )}

          {result && (
            <div
              role="status"
              className={`mt-4 rounded-[12px] border px-4 py-3 ${
                result.revealed
                  ? "border-border bg-bg3"
                  : result.correct
                    ? "border-success/50 bg-success/10"
                    : "border-danger/50 bg-danger/10"
              }`}
            >
              <p
                className={`font-display text-sm font-bold uppercase ${
                  result.revealed ? "text-text" : result.correct ? "text-success" : "text-danger"
                }`}
              >
                {result.revealed ? "Réponse" : result.correct ? "✓ Juste" : "✗ Pas tout à fait"}
              </p>
              {result.reason && !result.revealed && (
                <p className="mt-1 font-display text-sm leading-relaxed text-text">{result.reason}</p>
              )}
              {result.corrected && (
                <p className="mt-2 font-display text-sm text-muted">
                  Ta phrase, corrigée : <span lang="ru" className="font-semibold text-text">{result.corrected}</span>
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="font-display text-sm text-muted">
                  {result.correct && !result.exact ? "La référence le dit ainsi : " : "Référence : "}
                  <span lang="ru" className="font-display text-base font-bold text-text">
                    {result.reference}
                  </span>
                </p>
                <SpeakButton label="Écouter la référence" title="Écouter" onSpeak={() => speakRu(result.reference)} />
              </div>
              {result.aiUnavailable && (
                <p className="mt-2 font-display text-xs leading-relaxed text-muted">
                  Le second avis automatique n&apos;est pas disponible : seule la référence a tranché. Si ta phrase
                  dit la même chose autrement, compare-la.
                </p>
              )}
              <p className="mt-2 font-display text-xs text-muted">
                Vue dans :{" "}
                <Link href={item.source.href} className="font-semibold text-accent-ink hover:underline">
                  {item.source.label}
                </Link>
              </p>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {result ? (
              <button
                type="button"
                onClick={next}
                className="btn btn-primary btn-sheen rounded-[10px] px-5 py-2.5 font-display text-sm"
              >
                {done >= SERIES ? "Voir le bilan →" : "Suivant →"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => check()}
                  disabled={checking || !answer.trim()}
                  className="btn btn-primary btn-sheen rounded-[10px] px-5 py-2.5 font-display text-sm disabled:opacity-60"
                >
                  {checking ? "Vérification…" : "Vérifier"}
                </button>
                <button
                  type="button"
                  onClick={() => check(true)}
                  disabled={checking}
                  className="rounded-[10px] border border-border px-4 py-2.5 font-display text-sm font-semibold text-muted transition-colors hover:text-text disabled:opacity-60"
                >
                  Je ne sais pas — voir la réponse
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
