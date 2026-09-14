import Link from "next/link";
import SectionLabel from "@/components/ui/SectionLabel";
import { PARTICIPLE_SKILLS } from "@/lib/participles/exercises";
import { PARTICIPLE_VERBS } from "@/lib/participles/verbs";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export const metadata = {
  title: "Participes et gérondifs",
};

const SKILL_COLOR: Record<string, string> = {
  active: "#1C6E5C",
  passive: "#8B2FA0",
  short: "#B5762A",
  gerund: "#2456A6",
  subject: "#6F4A2E",
};

/** Les transformations qui résument le module, montrées d'emblée. */
const SHOWCASE = [
  {
    expanded: "Челове́к, кото́рый чита́ет кни́гу",
    compressed: "челове́к, чита́ющий кни́гу",
    label: "participe actif",
  },
  {
    expanded: "Кни́га, кото́рую написа́л Толсто́й",
    compressed: "кни́га, напи́санная Толсты́м",
    label: "participe passif",
  },
  {
    expanded: "Когда́ он зако́нчил рабо́ту, он ушёл",
    compressed: "зако́нчив рабо́ту, он ушёл",
    label: "gérondif",
  },
];

export default async function ParticiplesHub() {
  const progress = new Map<string, { attempts: number; correct: number }>();

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("participle_progress")
        .select("skill_id, attempts, correct")
        .eq("user_id", user.id);
      for (const row of data ?? []) {
        progress.set(row.skill_id, { attempts: row.attempts, correct: row.correct });
      }
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 sm:py-16">
      <SectionLabel color="accent2">Причастия и деепричастия</SectionLabel>
      <h1 className="mb-3 font-display text-3xl font-extrabold sm:text-4xl tracking-tight">
        Participes et gérondifs
      </h1>
      <p className="mb-7 sm:mb-10 max-w-2xl font-display leading-relaxed text-muted">
        Le russe comprime une subordonnée entière en un seul mot : « челове́к,{" "}
        <span className="text-text">кото́рый чита́ет</span> кни́гу » devient « челове́к,{" "}
        <span className="text-text">чита́ющий</span> кни́гу ». Le français a la même forme —
        « l&apos;homme lisant un livre » — mais invariable, et réservée à l&apos;écrit soutenu. En
        russe elle s&apos;accorde comme un adjectif, et elle est partout.
      </p>

      <div className="mb-12 space-y-3 rounded-[20px] surface p-7">
        {SHOWCASE.map((s) => (
          <div key={s.label} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-display text-lg text-muted">{s.expanded}</span>
            <span className="font-display text-lg text-accent-ink">→</span>
            <span className="font-display text-lg font-bold">{s.compressed}</span>
            <span className="rounded-full border border-border px-2 py-0.5 font-display text-[11px] font-semibold uppercase tracking-wide text-muted">
              {s.label}
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {PARTICIPLE_SKILLS.map((skill) => {
          const stat = progress.get(skill.id);
          const accuracy =
            stat && stat.attempts > 0 ? Math.round((stat.correct / stat.attempts) * 100) : null;
          return (
            <Link
              key={skill.id}
              href={`/participles/${skill.id}`}
              className="group flex items-start gap-4 rounded-2xl surface-interactive p-6 hover:-translate-y-1 hover:"
            >
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
            </Link>
          );
        })}
      </div>

      <div className="mt-10 sm:mt-14">
        <SectionLabel color="accent">Tableau des formes</SectionLabel>
        <p className="mb-4 max-w-2xl font-display text-sm leading-relaxed text-muted">
          Un tiret signale un trou réel de la langue, pas un oubli : « писа́ть » n&apos;a pas de
          gérondif imperfectif usuel, un verbe intransitif n&apos;a pas de participe passif.
        </p>
        <div className="overflow-hidden overflow-x-auto rounded-2xl border border-border">
          <table className="w-full border-collapse font-display text-sm">
            <thead>
              <tr className="border-b border-border bg-bg3">
                {["Verbe", "Actif présent", "Actif passé", "Passif passé", "Gérondif imp.", "Gérondif perf."].map(
                  (h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-4 py-3 text-left font-semibold uppercase tracking-wide text-muted"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="bg-bg2">
              {PARTICIPLE_VERBS.map((v) => (
                <tr key={v.id} className="border-b border-border last:border-0">
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="font-bold">{v.imperfective}</span>
                    <span className="ml-2 text-xs text-muted">{v.translation}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-accent-ink">{v.activePresent}</td>
                  <td className="whitespace-nowrap px-4 py-3">{v.activePastImp}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{v.passivePast ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{v.gerundImp ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{v.gerundPerf ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
