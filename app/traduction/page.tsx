import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import SectionLabel from "@/components/ui/SectionLabel";
import TranslationPractice from "@/components/translation/TranslationPractice";
import {
  isTranslationLevel,
  itemsForLevel,
  seededShuffle,
  TRANSLATION_LEVELS,
  translationLevelFor,
  type PublicTranslationItem,
} from "@/lib/translation/items";
import { startOfUtcDay } from "@/lib/vocabulary/new-words";

export const metadata: Metadata = {
  title: "Traduire en russe",
  robots: { index: false, follow: false },
};

/**
 * Traduire des phrases entières. Page de compte : la correction demande un
 * serveur (et parfois le modèle), elle n'a pas de repli hors connexion.
 */
export default async function TranslationPage({
  searchParams,
}: {
  searchParams: Promise<{ niveau?: string }>;
}) {
  if (!isSupabaseConfigured()) redirect("/login");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/traduction");

  const { niveau } = await searchParams;
  const [{ data: profile }, { data: progress }] = await Promise.all([
    supabase.from("profiles").select("level").eq("id", user.id).single(),
    supabase
      .from("exercise_progress")
      .select("skill_id, attempts, correct")
      .eq("user_id", user.id)
      .eq("module_id", "translation"),
  ]);
  const level = isTranslationLevel(niveau)
    ? niveau
    : translationLevelFor((profile as { level?: string | null } | null)?.level);

  // L'ordre change chaque jour, et reste le même d'un rechargement à l'autre.
  // eslint-disable-next-line react-hooks/purity
  const day = startOfUtcDay(Date.now());
  const items: PublicTranslationItem[] = seededShuffle(itemsForLevel(level), `${user.id}:${day}:${level}`).map(
    // Le russe reste ici : il n'arrive au navigateur qu'avec la correction.
    ({ ru: _reference, ...rest }) => rest
  );
  const accuracyOf = (lvl: string) => {
    const row = (progress ?? []).find((r) => r.skill_id === lvl);
    return row && row.attempts > 0 ? Math.round((row.correct / row.attempts) * 100) : null;
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 sm:py-12">
      <Link
        href="/exercices"
        className="mb-6 inline-block font-display text-xs font-semibold uppercase tracking-wide text-muted hover:text-accent-ink"
      >
        ← Exercices
      </Link>
      <SectionLabel>Перевод</SectionLabel>
      <h1 className="mb-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Traduire en russe</h1>
      <p className="mb-6 max-w-2xl font-display leading-relaxed text-muted">
        Chaque module isole une difficulté ; ici, tout se décide dans la même phrase — le cas, l&apos;aspect,
        l&apos;accord, l&apos;ordre des mots. Ta phrase est comparée à la référence, puis relue par l&apos;IA
        quand elle la dit autrement.
      </p>

      <nav aria-label="Niveau" className="mb-6 flex flex-wrap gap-2">
        {TRANSLATION_LEVELS.map((lvl) => {
          const accuracy = accuracyOf(lvl);
          const active = lvl === level;
          return (
            <Link
              key={lvl}
              href={`/traduction?niveau=${lvl}`}
              aria-current={active ? "page" : undefined}
              className={`rounded-full border px-3.5 py-1.5 font-display text-xs font-semibold transition-colors ${
                active
                  ? "border-accent bg-accent text-white"
                  : "border-border bg-bg2 text-muted hover:border-accent/35 hover:text-accent-ink"
              }`}
            >
              {lvl} · {itemsForLevel(lvl).length} phrases{accuracy !== null ? ` · ${accuracy} %` : ""}
            </Link>
          );
        })}
      </nav>

      <TranslationPractice key={level} items={items} />
    </div>
  );
}
