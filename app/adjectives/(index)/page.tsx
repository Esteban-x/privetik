import Link from "next/link";
import SectionLabel from "@/components/ui/SectionLabel";
import { ADJECTIVE_SKILLS } from "@/lib/adjectives/exercises";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export const metadata = {
  title: "Accord de l'adjectif",
};

const SKILL_COLOR: Record<string, string> = {
  nominative: "#1C6E5C",
  spelling: "#B5762A",
  accusative: "#8B2FA0",
  oblique: "#2456A6",
  plural: "#6F4A2E",
};

/** Le tableau que le module tient en trois lignes : un adjectif, trois genres. */
const SHOWCASE = [
  { gender: "masculin", noun: "дом", forms: ["но́вый", "но́вого", "но́вому", "но́вым", "но́вом"] },
  { gender: "féminin", noun: "кни́га", forms: ["но́вая", "но́вой", "но́вой", "но́вой", "но́вой"] },
  { gender: "neutre", noun: "письмо́", forms: ["но́вое", "но́вого", "но́вому", "но́вым", "но́вом"] },
  { gender: "pluriel", noun: "дома́", forms: ["но́вые", "но́вых", "но́вым", "но́выми", "но́вых"] },
];
const SHOWCASE_CASES = ["nom.", "gén.", "dat.", "instr.", "prép."];

export default async function AdjectivesHub() {
  const progress = new Map<string, { attempts: number; correct: number }>();

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("adjective_progress")
        .select("skill_id, attempts, correct")
        .eq("user_id", user.id);
      for (const row of data ?? []) {
        progress.set(row.skill_id, { attempts: row.attempts, correct: row.correct });
      }
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 sm:py-16">
      <SectionLabel color="accent2">Согласование прилагательных</SectionLabel>
      <h1 className="mb-3 font-display text-3xl font-extrabold sm:text-4xl tracking-tight">
        Accord de l&apos;adjectif
      </h1>
      <p className="mb-7 sm:mb-10 max-w-2xl font-display leading-relaxed text-muted">
        En français, un adjectif s&apos;accorde en genre et en nombre — quatre formes. En russe il
        s&apos;accorde aussi en <span className="text-text">cas</span>, et le genre a trois valeurs :
        vingt-quatre cases, dont beaucoup se répètent. Le travail n&apos;est pas d&apos;apprendre le
        tableau, c&apos;est de repérer, dans une phrase, ce sur quoi l&apos;adjectif s&apos;accorde.
      </p>

      <div className="mb-12 overflow-hidden overflow-x-auto rounded-[20px] border border-border">
        <table className="w-full border-collapse font-display text-sm">
          <thead>
            <tr className="border-b border-border bg-bg3">
              <th className="whitespace-nowrap px-4 py-3 text-left font-semibold uppercase tracking-wide text-muted">
                но́вый +
              </th>
              {SHOWCASE_CASES.map((c) => (
                <th
                  key={c}
                  className="whitespace-nowrap px-4 py-3 text-left font-semibold uppercase tracking-wide text-muted"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-bg2">
            {SHOWCASE.map((row) => (
              <tr key={row.gender} className="border-b border-border last:border-0">
                <td className="whitespace-nowrap px-4 py-3">
                  <span className="font-bold">{row.noun}</span>
                  <span className="ml-2 text-xs text-muted">{row.gender}</span>
                </td>
                {row.forms.map((f, i) => (
                  <td
                    key={`${row.gender}-${SHOWCASE_CASES[i]}`}
                    className={`whitespace-nowrap px-4 py-3 ${i === 0 ? "text-accent-ink" : "text-muted"}`}
                  >
                    {f}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ADJECTIVE_SKILLS.map((skill) => {
          const stat = progress.get(skill.id);
          const accuracy =
            stat && stat.attempts > 0 ? Math.round((stat.correct / stat.attempts) * 100) : null;
          return (
            <Link
              key={skill.id}
              href={`/adjectives/${skill.id}`}
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
    </div>
  );
}
