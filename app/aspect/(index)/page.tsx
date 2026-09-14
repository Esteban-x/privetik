import Link from "next/link";
import SectionLabel from "@/components/ui/SectionLabel";
import TimelineDiagram from "@/components/aspect/TimelineDiagram";
import { ASPECT_SKILLS } from "@/lib/aspect/exercises";
import { ASPECT_PAIRS, FORMATION_LABEL, type PairFormation } from "@/lib/aspect/verbs";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export const metadata = {
  title: "Aspect verbal",
};

const SKILL_COLOR: Record<string, string> = {
  past: "#1C6E5C",
  markers: "#B5762A",
  future: "#8B2FA0",
  imperative: "#2456A6",
  pairs: "#6F4A2E",
};

const SKILL_SCHEMA = {
  past: "result",
  markers: "repetition",
  future: "sequence",
  imperative: "process",
  pairs: "duration",
} as const;

const FORMATION_ORDER: PairFormation[] = ["prefixe", "suffixe", "suppletion"];

export default async function AspectHub() {
  const progress = new Map<string, { attempts: number; correct: number }>();

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("aspect_progress")
        .select("skill_id, attempts, correct")
        .eq("user_id", user.id);
      for (const row of data ?? []) {
        progress.set(row.skill_id, { attempts: row.attempts, correct: row.correct });
      }
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 sm:py-16">
      <SectionLabel color="accent2">Вид глагола</SectionLabel>
      <h1 className="mb-3 font-display text-3xl font-extrabold sm:text-4xl tracking-tight">Aspect verbal</h1>
      <p className="mb-7 sm:mb-10 max-w-2xl font-display leading-relaxed text-muted">
        Le français n&apos;a pas cette catégorie, alors il la remplace par imparfait / passé
        composé — ce qui marche une fois sur deux, et installe donc une erreur au lieu d&apos;un
        doute. L&apos;aspect ne dit pas QUAND l&apos;action a lieu, mais quelle forme elle a dans le
        temps.
      </p>

      {/* L'opposition fondatrice, montrée avant d'être expliquée. */}
      <div className="mb-12 grid grid-cols-1 gap-4 rounded-[20px] surface p-7 sm:grid-cols-2">
        <figure className="flex flex-col items-center">
          <TimelineDiagram schema="process" />
          <figcaption className="mt-2 text-center font-display text-sm">
            <span className="font-bold">Я реша́л зада́чу</span>
            <span className="block text-muted">
              imperfectif — je planchais dessus, sans dire si j&apos;y suis arrivé
            </span>
          </figcaption>
        </figure>
        <figure className="flex flex-col items-center">
          <TimelineDiagram schema="result" />
          <figcaption className="mt-2 text-center font-display text-sm">
            <span className="font-bold">Я реши́л зада́чу</span>
            <span className="block text-muted">
              perfectif — la borne est atteinte, le problème est résolu
            </span>
          </figcaption>
        </figure>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ASPECT_SKILLS.map((skill) => {
          const stat = progress.get(skill.id);
          const accuracy =
            stat && stat.attempts > 0 ? Math.round((stat.correct / stat.attempts) * 100) : null;
          return (
            <Link
              key={skill.id}
              href={`/aspect/${skill.id}`}
              className="group rounded-2xl surface-interactive p-6 hover:-translate-y-1 hover:"
            >
              <div className="flex items-start gap-4">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-display text-xs font-bold text-white"
                  style={{ background: SKILL_COLOR[skill.id] }}
                >
                  {skill.level}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-display text-xl font-bold">{skill.title}</h2>
                    {accuracy !== null && (
                      <span
                        className={`shrink-0 font-display text-xs font-bold ${
                          accuracy < 60 ? "text-danger" : "text-success"
                        }`}
                      >
                        {accuracy}%
                      </span>
                    )}
                  </div>
                  <p className="mt-1 font-display text-sm leading-relaxed text-muted">
                    {skill.summary}
                  </p>
                  {stat && stat.attempts > 0 && (
                    <p className="mt-2 font-display text-xs text-muted">{stat.attempts} réponses</p>
                  )}
                </div>
              </div>
              <div className="mt-4 flex justify-center opacity-70 transition-opacity group-hover:opacity-100">
                <TimelineDiagram schema={SKILL_SCHEMA[skill.id]} className="h-[64px]" />
              </div>
            </Link>
          );
        })}
      </div>

      <div className="mt-10 sm:mt-14">
        <SectionLabel color="accent">Les paires</SectionLabel>
        <p className="mb-4 max-w-2xl font-display text-sm leading-relaxed text-muted">
          Trois procédés, dont un qui n&apos;en est pas un : certaines paires n&apos;ont aucun
          rapport de forme et s&apos;apprennent telles quelles.
        </p>
        <div className="space-y-6">
          {FORMATION_ORDER.map((formation) => {
            const pairs = ASPECT_PAIRS.filter((p) => p.formation === formation);
            return (
              <div key={formation}>
                <p className="mb-2 font-display text-xs font-semibold uppercase tracking-wide text-muted">
                  {FORMATION_LABEL[formation]} · {pairs.length}
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {pairs.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-baseline justify-between gap-2 rounded-xl surface px-4 py-2.5"
                    >
                      <span className="font-display text-sm">
                        <span className="text-muted">{p.imperfective}</span>
                        <span className="mx-1.5 text-muted/60">→</span>
                        <span className="font-bold text-accent-ink">{p.perfective}</span>
                      </span>
                      <span className="shrink-0 font-display text-xs text-muted">
                        {p.translation}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
