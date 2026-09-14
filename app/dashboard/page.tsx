import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { CASES } from "@/lib/grammar/cases";
import { Profile } from "@/lib/supabase/types";
import SectionLabel from "@/components/ui/SectionLabel";
import StreakDots from "@/components/dashboard/StreakDots";
import { countFocus } from "@/lib/vocabulary/focus";
import { newWordsAllowance } from "@/lib/vocabulary/new-words";
import { loadLevelEstimate } from "@/lib/progress/level-estimate";
import { CEFR_LEVELS } from "@/lib/supabase/types";
import { ERROR_KINDS, ERROR_WINDOW_DAYS, isDueError, pendingErrors } from "@/lib/practice/errors";

/**
 * En dessous, la précision récente d'un cas dit trop peu : trois réponses
 * justes ne font pas 100 % de maîtrise. On garde alors le cumul.
 */
const RECENT_CASE_MIN = 8;

/**
 * Le titre de l'onglet.
 *
 * SANS LUI, LA PAGE PORTE CELUI DE L'ACCUEIL. Le layout racine définit un
 * `title.default`, et Next le donne à toute page qui n'en déclare pas —
 * cette page affichait donc « Apprendre le russe : cours, déclinaisons et
 * exercices », comme l'accueil, comme un onglet sur deux. Quelqu'un qui
 * travaille avec quatre onglets ouverts ne peut plus les distinguer, et un
 * favori enregistré ici ne dit pas ce qu'il ouvre.
 *
 * Sans « — Privetik » : le gabarit du layout l'ajoute.
 */
export const metadata: Metadata = {
  title: "Tableau de bord",
};

export default async function DashboardPage() {
  if (!isSupabaseConfigured()) redirect("/login");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard");

  const { data: profile } = (await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single()) as { data: Profile | null };

  if (profile && !profile.onboarded) redirect("/onboarding");

  // Activité des 7 derniers jours pour le graphe et le compteur.
  // Server Component asynchrone rendu à la demande : lire l'horloge y est
  // le comportement voulu. La règle de pureté vise les rendus client, qui
  // peuvent se rejouer — ce n'est pas le cas ici.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const since = new Date(now - 7 * 864e5).toISOString();
  // Indépendantes les unes des autres (portent chacune sur une table
  // différente) : lancées en parallèle plutôt qu'en séquence pour ne pas
  // cumuler leurs latences réseau au chargement du tableau de bord.
  const [
    { data: activity },
    { data: caseProg },
    { data: vocabWords },
    { data: srsRows },
    newAllowance,
    { data: recentAttempts },
  ] = await Promise.all([
    supabase
      .from("activity_log")
      .select("kind, correct, created_at")
      .eq("user_id", user.id)
      .gte("created_at", since),
    supabase.from("case_progress").select("case_id, attempts, correct").eq("user_id", user.id),
    supabase.from("vocab_words").select("id, focus").eq("user_id", user.id),
    supabase
      .from("srs_cards")
      .select("card_id, repetitions, ease_factor, due_at")
      .eq("user_id", user.id),
    newWordsAllowance(supabase, user.id, now),
    // Un mois de réponses corrigées : les erreurs en attente, et la précision
    // RÉCENTE par cas. Même lecture que /api/errors.
    supabase
      .from("activity_log")
      .select("kind, correct, created_at, meta")
      .eq("user_id", user.id)
      .in("kind", Object.keys(ERROR_KINDS))
      .gte("created_at", new Date(now - ERROR_WINDOW_DAYS * 864e5).toISOString())
      .order("created_at", { ascending: true })
      .limit(3000),
  ]);

  const errors = pendingErrors(recentAttempts ?? []);
  const dueErrors = errors.filter((e) => isDueError(e, now)).length;

  // Niveau de PRATIQUE, à côté du niveau TESTÉ : l'un mesure ce que la
  // progression démontre au fil des centaines de réponses produites, l'autre
  // est une photo prise une fois en QCM. Voir lib/progress/level-estimate.ts.
  const estimate = await loadLevelEstimate(supabase, user.id);
  const testedLevel = profile?.level ?? "A0";
  const practiceAhead =
    estimate.meaningful && CEFR_LEVELS.indexOf(estimate.level) > CEFR_LEVELS.indexOf(testedLevel);

  const acts = activity ?? [];
  const totalAttempts = acts.filter((a) => a.correct !== null).length;
  const correctAttempts = acts.filter((a) => a.correct === true).length;
  const accuracy = totalAttempts ? Math.round((correctAttempts / totalAttempts) * 100) : 0;

  // Précision par cas — RÉCENTE quand le mois en dit assez.
  //
  // Le cumul ne bougeait plus : 90 % obtenus il y a six mois restaient 90 %
  // après six mois sans ouvrir le génitif. Or c'est l'oubli qu'on veut voir.
  // Sur les trente derniers jours, une barre baisse quand on décroche, et
  // remonte dès qu'on reprend. Sans assez de réponses récentes, le cumul
  // reste affiché, marqué comme tel.
  const recentByCase = new Map<string, { attempts: number; correct: number }>();
  for (const a of recentAttempts ?? []) {
    const caseId = a.kind === "case" ? (a.meta as { caseId?: unknown } | null)?.caseId : null;
    if (typeof caseId !== "string" || a.correct === null) continue;
    const stat = recentByCase.get(caseId) ?? { attempts: 0, correct: 0 };
    stat.attempts += 1;
    if (a.correct) stat.correct += 1;
    recentByCase.set(caseId, stat);
  }
  const caseAccuracy: Record<string, { pct: number; recent: boolean; practiced: boolean }> = {};
  for (const c of CASES) {
    const recent = recentByCase.get(c.id);
    if (recent && recent.attempts >= RECENT_CASE_MIN) {
      caseAccuracy[c.id] = {
        pct: Math.round((recent.correct / recent.attempts) * 100),
        recent: true,
        practiced: true,
      };
      continue;
    }
    const rows = (caseProg ?? []).filter((r) => r.case_id === c.id);
    const att = rows.reduce((s, r) => s + (r.attempts ?? 0), 0);
    const cor = rows.reduce((s, r) => s + (r.correct ?? 0), 0);
    caseAccuracy[c.id] = { pct: att ? Math.round((cor / att) * 100) : 0, recent: false, practiced: att > 0 };
  }
  const staleCases = CASES.filter((c) => caseAccuracy[c.id].practiced && !caseAccuracy[c.id].recent);

  // Vocabulaire : ce que l'apprenant a lui-même rangé, pas ce que le SM-2
  // aurait déduit de ses réussites. countFocus est la même fonction que celle
  // de /vocabulary et de la file de révision — le tableau de bord ne peut
  // donc pas annoncer un nombre que la page des listes contredit.
  const cardByWord = new Map((srsRows ?? []).map((r) => [r.card_id, r]));
  const vocab = countFocus(
    (vocabWords ?? []).map((w) => {
      const card = cardByWord.get(w.id);
      return {
        focus: w.focus,
        srs: card
          ? {
              repetitions: card.repetitions,
              easeFactor: card.ease_factor,
              dueAt: new Date(card.due_at).getTime(),
            }
          : null,
      };
    }),
    now,
    newAllowance
  );
  const vocabTotal = vocab.total;
  const vocabKnown = vocab.known;
  const vocabDue = vocab.due;
  const vocabPct = vocabTotal ? Math.round((vocabKnown / vocabTotal) * 100) : 0;

  const name = profile?.display_name?.split(" ")[0] ?? "toi";

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 sm:py-12">
      <div className="mb-7 sm:mb-10">
        <SectionLabel>Tableau de bord</SectionLabel>
        <h1 className="font-display text-3xl font-extrabold sm:text-4xl tracking-tight">
          Привет, {name}
        </h1>
      </div>

      {/* Cartes de stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Niveau testé" value={testedLevel} accent />
        <StatCard label="Série" value={`${profile?.streak_count ?? 0} j`} />
        <StatCard label="XP total" value={String(profile?.xp ?? 0)} />
        <StatCard label="Précision (7j)" value={`${accuracy}%`} />
      </div>

      {/* Niveau de pratique : la seule mesure qui bouge sans cérémonie */}
      {estimate.meaningful && (
        <div className="mt-6 rounded-[20px] surface p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-display text-sm font-semibold text-muted">Niveau de pratique</p>
              <p className="mt-1 font-display text-xs leading-relaxed text-muted">
                Déduit de ce que tu produis réellement dans les exercices, pas d&apos;un test.
              </p>
            </div>
            <span className="font-display text-3xl font-extrabold text-accent2">
              {estimate.level}
            </span>
          </div>

          <div className="space-y-2.5">
            {estimate.tiers.map((t) => {
              const pct = t.total ? Math.round((t.mastered / t.total) * 100) : 0;
              const label =
                t.tier === "basic" ? "Essentiels" : t.tier === "intermediate" ? "Courants" : "Avancés";
              return (
                <div key={t.tier} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 font-display text-sm font-semibold">{label}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-border">
                    <div
                      className="h-full rounded-full bg-accent2 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-16 text-right font-display text-xs text-muted">
                    {t.mastered}/{t.total}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Couverture du programme : les cas ne sont pas toute la
              grammaire, et un module jamais travaillé plafonne l'estimation. */}
          <div className="mt-5 border-t border-border pt-4">
            <p className="font-display text-xs font-semibold uppercase tracking-wide text-muted">
              Couverture du programme
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {estimate.modules.map((m) => (
                <Link
                  key={m.id}
                  href={m.href}
                  className={`rounded-full border px-3 py-1 font-display text-xs font-semibold transition-colors ${
                    m.state === "solid"
                      ? "border-success/50 bg-success/10 text-success"
                      : m.state === "started"
                        ? "border-accent/50 bg-accent/10 text-accent-ink"
                        : "border-border bg-bg3 text-muted hover:bg-accent/10 hover:border-accent/35 hover:text-accent-ink"
                  }`}
                >
                  {m.label} · {m.solidSkills}/{m.totalSkills}
                </Link>
              ))}
            </div>
          </div>

          {estimate.blockedBy && (
            <p className="mt-4 font-display text-xs leading-relaxed text-muted">
              Ta maîtrise des cas justifierait{" "}
              <span className="font-semibold text-text">{estimate.depthLevel}</span>, mais
              l&apos;estimation reste à {estimate.level} : les cas ne sont pas toute la grammaire, et{" "}
              <Link href={estimate.blockedBy.href} className="font-semibold text-accent-ink hover:underline">
                {estimate.blockedBy.label.toLowerCase()}
              </Link>{" "}
              n&apos;a pas encore été {estimate.blockedBy.state === "untouched" ? "abordé" : "consolidé"}.
            </p>
          )}

          {practiceAhead && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-accent/40 bg-accent/10 px-4 py-3">
              <p className="font-display text-sm text-text">
                Ta pratique te situe en <span className="font-semibold text-accent-ink">{estimate.level}</span>,
                au-dessus de ton niveau testé ({testedLevel}).
              </p>
              <Link
                href="/level-test"
                className="btn btn-primary btn-sheen shrink-0 rounded-[10px] px-4 py-2 font-display text-sm"
              >
                Repasser le test
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Mes erreurs : ce qui a été raté et pas encore réussi depuis */}
      {errors.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[20px] surface p-6">
          <div className="min-w-0">
            <p className="font-display text-sm font-semibold text-muted">Mes erreurs</p>
            <p className="mt-1 font-display text-lg font-bold">
              {errors.length} exercice{errors.length > 1 ? "s" : ""} à refaire
            </p>
            <p className="mt-0.5 font-display text-xs leading-relaxed text-muted">
              {dueErrors > 0
                ? `Dont ${dueErrors} raté${dueErrors > 1 ? "s" : ""} avant aujourd'hui : le bon moment pour ${dueErrors > 1 ? "les" : "le"} retrouver.`
                : "Ratés aujourd'hui : ils seront encore mieux fixés si tu les refais demain."}
            </p>
          </div>
          <Link
            href="/erreurs"
            className="btn btn-primary btn-sheen shrink-0 rounded-[10px] px-5 py-2.5 font-display text-sm"
          >
            Refaire
          </Link>
        </div>
      )}

      {/* Série */}
      <div className="mt-6 rounded-[20px] surface p-6">
        <p className="font-display text-sm font-semibold text-muted">Cette semaine</p>
        <div className="mt-3">
          <StreakDots activity={acts} now={now} />
        </div>
      </div>

      {/* Maîtrise par cas */}
      <div className="mt-6 rounded-[20px] surface p-6">
        <div className="mb-1 flex items-center justify-between gap-3">
          <p className="font-display text-sm font-semibold text-muted">Maîtrise des cas</p>
          <Link href="/cases/melange" className="shrink-0 font-display text-xs font-semibold text-accent-ink hover:underline">
            Cas mélangés →
          </Link>
        </div>
        <p className="mb-4 font-display text-xs leading-relaxed text-muted">
          Sur tes {ERROR_WINDOW_DAYS} derniers jours : une précision ancienne ne dit plus ce que tu sais aujourd&apos;hui.
        </p>
        <div className="space-y-3">
          {CASES.map((c) => (
            <div key={c.id} className="flex items-center gap-3">
              <span className="w-32 shrink-0 font-display text-sm font-semibold">
                {c.nameRu}
              </span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-border">
                <div
                  className={`h-full rounded-full transition-all ${caseAccuracy[c.id].recent ? "" : "opacity-40"}`}
                  style={{ width: `${caseAccuracy[c.id].pct}%`, background: c.color }}
                />
              </div>
              <span className="w-10 text-right font-display text-xs text-muted">
                {caseAccuracy[c.id].pct}%
              </span>
            </div>
          ))}
        </div>
        {staleCases.length > 0 && (
          <p className="mt-4 font-display text-xs leading-relaxed text-muted">
            En pâle, faute de pratique récente, la précision de toujours :{" "}
            {staleCases.map((c) => c.nameFr.toLowerCase()).join(", ")}. À rafraîchir.
          </p>
        )}
      </div>

      {/* Progression du vocabulaire */}
      <div className="mt-6 rounded-[20px] surface p-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="font-display text-sm font-semibold text-muted">Progression du vocabulaire</p>
          <Link href="/vocabulary/review" className="font-display text-xs font-semibold text-accent-ink hover:underline">
            Réviser →
          </Link>
        </div>
        {vocabTotal === 0 ? (
          <p className="font-display text-sm text-muted">
            Pas encore de mots — crée une liste dans{" "}
            <Link href="/vocabulary" className="text-accent-ink hover:underline">
              Vocabulaire
            </Link>
            .
          </p>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-display text-sm">
                {vocabKnown} / {vocabTotal} mots acquis
              </span>
              <span className="font-display text-xs text-muted">
                {vocabDue > 0 ? `${vocabDue} à revoir aujourd'hui` : "Rien à revoir aujourd'hui"}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-success transition-all"
                style={{ width: `${vocabPct}%` }}
              />
            </div>
          </>
        )}
      </div>

      {/* Accès rapides */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickLink href="/cours" title="Cours" desc="La règle, expliquée" />
        <QuickLink href="/exercices" title="Exercices" desc="Huit modules" />
        <QuickLink href="/vocabulary/review" title="Vocabulaire" desc="Révision espacée" />
        <QuickLink href="/reading" title="Lire les cas" desc="Textes annotés" />
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-[20px] surface p-5">
      <p className="font-display text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p
        className={`mt-1 font-display text-3xl font-extrabold ${accent ? "text-accent-ink" : "text-text"}`}
      >
        {value}
      </p>
    </div>
  );
}

function QuickLink({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="rounded-[20px] surface-interactive p-5 hover:-translate-y-1"
    >
      <p className="font-display text-lg font-bold">{title}</p>
      <p className="mt-0.5 font-display text-sm text-muted">{desc}</p>
    </Link>
  );
}
