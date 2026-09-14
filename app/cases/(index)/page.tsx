import Link from "next/link";
import { CASE_MIX_COLORS, CASE_MIX_GRADIENT, CASE_MIX_VARS } from "@/lib/grammar/case-mix-style";
import SectionLabel from "@/components/ui/SectionLabel";
import { CASES_BY_LEARNING_ORDER } from "@/lib/grammar/cases";
import type { Metadata } from "next";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumb, graph } from "@/lib/seo/structured-data";
import { loadLevelEstimate, type CaseMastery } from "@/lib/progress/level-estimate";
import { CEFR_LEVELS, type CefrLevel } from "@/lib/supabase/types";

type Badge = { label: string; className: string } | null;

/**
 * Pastille par cas : elle combine le programme (à quel niveau ce cas entre
 * normalement en scène) et la pratique réelle (ce qui est déjà solide).
 * Aucun cas n'est verrouillé — un curieux clique et travaille ce qu'il veut,
 * il est seulement prévenu de ce qui n'est pas encore de saison.
 */
function badgeFor(introducedAt: CefrLevel, level: CefrLevel | undefined, mastery: CaseMastery | undefined): Badge {
  if (mastery?.state === "solid") {
    return { label: "solide", className: "border-success/50 bg-success/10 text-success" };
  }
  if (!level) return null; // niveau inconnu : aucune recommandation
  const gap = CEFR_LEVELS.indexOf(introducedAt) - CEFR_LEVELS.indexOf(level);
  if (gap <= 0) {
    return mastery && mastery.attempts > 0
      ? { label: "en cours", className: "border-accent/50 bg-accent/10 text-accent-ink" }
      : { label: "à commencer", className: "border-accent/50 bg-accent/10 text-accent-ink" };
  }
  if (gap === 1) {
    return { label: "prochaine étape", className: "border-border bg-bg3 text-muted" };
  }
  return { label: `plus tard · ${introducedAt}`, className: "border-border bg-bg3 text-muted" };
}

/**
 * « Les 6 cas russes » plutôt que « Cas » : c'est la requête, et c'est le
 * seul titre qui dit à la fois de quelle langue et de quoi il s'agit. Le
 * chiffre y est parce qu'il est ce que les gens cherchent d'abord à savoir.
 */
export const metadata: Metadata = {
  title: "Les 6 cas russes : guide complet des déclinaisons + exercices",
  description:
    "Nominatif, génitif, datif, accusatif, instrumental, prépositionnel : ce que chaque cas " +
    "exprime, ses déclencheurs et ses terminaisons. Avec exercices corrigés.",
  alternates: { canonical: "/cases" },
  openGraph: {
    type: "website",
    url: "/cases",
    title: "Les 6 cas russes : guide complet des déclinaisons",
    description:
      "Ce que chaque cas exprime, ses déclencheurs, et les tableaux de terminaisons.",
  },
};

export default async function CasesPage() {
  let level: CefrLevel | undefined;
  let masteryByCase = new Map<string, CaseMastery>();

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const [{ data: profile }, estimate] = await Promise.all([
        supabase.from("profiles").select("level").eq("id", user.id).single(),
        loadLevelEstimate(supabase, user.id),
      ]);
      level = profile?.level;
      masteryByCase = new Map(estimate.cases.map((c) => [c.caseId, c]));
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 sm:py-16">
      <JsonLd
        data={graph(
          breadcrumb([
            { name: "Privetik", path: "/" },
            { name: "Les cas russes", path: "/cases" },
          ])
        )}
      />
      <SectionLabel color="accent2">Падежи</SectionLabel>
      {/* « 6 » EN CHIFFRES ET « RUSSES » EXPLICITE. On écrit « les six cas »
          quand on est déjà dans une app de russe ; on tape « les 6 cas
          russes » quand on les cherche. Le H1 doit être la seconde version —
          c'est la seule que quelqu'un qui ne connaît pas encore le site
          formule. */}
      <h1 className="mb-3 font-display text-3xl font-extrabold sm:text-4xl tracking-tight">
        Les 6 cas russes
      </h1>
      <p className="mb-12 max-w-2xl font-display leading-relaxed text-muted">
        Choisis celui que tu veux travailler : ils sont rangés dans l&apos;ordre où on les apprend,
        pas dans celui des grammaires russes. Rien n&apos;est verrouillé : les pastilles indiquent seulement ce qui est de saison
        pour toi{level ? ` (niveau ${level})` : ""}.
      </p>

      {/* LE MÉLANGE EST MIS EN AVANT, PAS RANGÉ À CÔTÉ. C'est l'exercice qui
          ressemble le plus à la lecture — reconnaître le cas avant la
          terminaison — et il passait pour une note sous le chapô. Il porte
          les couleurs des six cas, comme sa page. */}
      <Link
        href="/cases/melange"
        className="group mb-8 -mt-4 block rounded-[20px] p-[1.5px] transition-transform duration-200 hover:-translate-y-0.5"
        style={{ backgroundImage: CASE_MIX_GRADIENT }}
      >
        <span className="flex flex-col gap-4 rounded-[18.5px] bg-bg2 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="flex min-w-0 flex-1 items-center gap-4">
            <span aria-hidden className="grid h-12 w-12 shrink-0 grid-cols-3 content-center gap-1.5 rounded-xl bg-bg3 p-2">
              {CASE_MIX_COLORS.map((color) => (
                <span key={color} className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
              ))}
            </span>
            <span className="min-w-0">
              <span className="block font-display text-lg font-bold">Cas mélangés</span>
              <span className="block font-display text-sm leading-snug text-muted">
                Les six cas dans la même série, sans savoir d&apos;avance lequel employer : c&apos;est
                ainsi qu&apos;on les rencontre en lisant.
              </span>
            </span>
          </span>
          <span
            className="mix-tint btn btn-primary btn-mix btn-sheen self-start rounded-[10px] px-5 py-2.5 font-display text-sm sm:self-auto"
            style={CASE_MIX_VARS}
          >
            S&apos;entraîner →
          </span>
        </span>
      </Link>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {CASES_BY_LEARNING_ORDER.map((c, index) => {
          const mastery = masteryByCase.get(c.id);
          const badge = badgeFor(c.introducedAt, level, mastery);
          const accuracy =
            mastery?.accuracy !== null && mastery?.accuracy !== undefined
              ? Math.round(mastery.accuracy * 100)
              : null;
          return (
            <Link
              key={c.id}
              href={`/cases/${c.id}`}
              className="group flex items-start gap-4 rounded-2xl surface-interactive p-6 hover:-translate-y-1 hover:"
            >
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-display text-lg font-bold text-white"
                style={{ background: c.color }}
              >
                {index + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-display text-xs font-semibold uppercase tracking-wide text-muted">
                    {c.question}
                  </p>
                  {badge && (
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 font-display text-[11px] font-semibold ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  )}
                </div>
                <h2 className="font-display text-xl font-bold">
                  {c.nameRu} <span className="font-normal text-muted">· {c.nameFr}</span>
                </h2>
                <p className="mt-1 font-display text-sm leading-relaxed text-muted">{c.usage}</p>
                {mastery && mastery.attempts > 0 && (
                  <p className="mt-2 font-display text-xs text-muted">
                    {accuracy}% de réussite · {mastery.masteredTriggers}/{mastery.totalTriggers}{" "}
                    déclencheurs maîtrisés
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
