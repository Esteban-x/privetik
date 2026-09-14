import Link from "next/link";
import SectionLabel from "@/components/ui/SectionLabel";

export type StepState = "todo" | "done" | "empty";

export interface SessionStep {
  key: string;
  title: string;
  detail: string;
  href: string;
  action: string;
  state: StepState;
  minutes: number;
  aside?: { href: string; label: string };
}

/** L'affichage de la séance du jour — les étapes sont choisies par app/seance/page.tsx. */
export default function DailySessionView({ steps }: { steps: SessionStep[] }) {
  const todo = steps.filter((s) => s.state === "todo");
  const minutes = todo.reduce((sum, s) => sum + s.minutes, 0);
  const next = todo[0];

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 sm:py-12">
      <SectionLabel>Занятие дня</SectionLabel>
      <h1 className="mb-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Séance du jour</h1>
      <p className="mb-6 max-w-2xl font-display leading-relaxed text-muted">
        Ce qui compte aujourd&apos;hui, dans l&apos;ordre où ça rapporte le plus : retrouver ce qui
        s&apos;oublie, puis travailler ce qui résiste, puis lire.
      </p>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-[20px] surface p-5">
        <p className="font-display text-sm text-muted">
          {todo.length === 0 ? (
            <span className="font-semibold text-success">Séance terminée — à demain.</span>
          ) : (
            <>
              <span className="font-semibold text-text">
                {todo.length} étape{todo.length > 1 ? "s" : ""}
              </span>{" "}
              · environ {minutes} min
            </>
          )}
        </p>
        {next && (
          <Link
            href={next.href}
            className="btn btn-primary btn-sheen rounded-[10px] px-5 py-2.5 font-display text-sm"
          >
            Commencer
          </Link>
        )}
      </div>

      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className={`flex gap-4 rounded-[20px] border p-5 ${
              step.state === "todo" ? "surface border-border" : "border-border/60 bg-bg2/40"
            }`}
          >
            <span
              aria-hidden
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold ${
                step.state === "todo" ? "bg-accent/15 text-accent-ink" : "bg-success/15 text-success"
              }`}
            >
              {step.state === "todo" ? index + 1 : "✓"}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`font-display font-bold ${step.state === "todo" ? "" : "text-muted"}`}>
                {step.title}
                {step.state === "done" && <span className="sr-only"> (fait)</span>}
              </p>
              <p className="mt-1 font-display text-sm leading-relaxed text-muted">{step.detail}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                {step.state === "todo" ? (
                  <Link
                    href={step.href}
                    className="btn btn-outline rounded-[10px] px-4 py-2 font-display text-sm font-semibold"
                  >
                    {step.action}
                  </Link>
                ) : (
                  <Link href={step.href} className="font-display text-sm font-semibold text-accent-ink hover:underline">
                    {step.action} quand même
                  </Link>
                )}
                {step.state === "todo" && (
                  <span className="font-display text-xs text-muted">~{step.minutes} min</span>
                )}
                {step.aside && step.state === "todo" && (
                  <Link
                    href={step.aside.href}
                    className="font-display text-xs font-semibold text-muted hover:text-accent-ink"
                  >
                    La leçon d&apos;abord : {step.aside.label}
                  </Link>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
