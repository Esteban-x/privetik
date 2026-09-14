import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { loadAllProgress } from "@/lib/exercises/progress";
import { countFocus } from "@/lib/vocabulary/focus";
import { newWordsAllowance, startOfUtcDay } from "@/lib/vocabulary/new-words";
import { ERROR_KINDS, ERROR_WINDOW_DAYS, isDueError, pendingErrors } from "@/lib/practice/errors";
import {
  answeredToday,
  pickFocusSkill,
  pickReadingText,
  SERIES_ATTEMPTS,
  type FocusSkill,
} from "@/lib/practice/daily-session";
import type { CefrLevel } from "@/lib/supabase/types";
import DailySessionView, { type SessionStep } from "@/components/session/DailySessionView";

export const metadata: Metadata = {
  title: "Séance du jour",
  robots: { index: false, follow: false },
};

/**
 * La séance du jour (voir lib/practice/daily-session.ts pour les choix).
 * Page de compte : protégée par proxy.ts.
 */
export default async function DailySessionPage() {
  if (!isSupabaseConfigured()) redirect("/login");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/seance");

  // Server Component rendu à la demande : lire l'horloge y est voulu.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const today = startOfUtcDay(now);

  const [
    { data: profile },
    progress,
    { data: words },
    { data: cards },
    newAllowance,
    { data: attempts },
    { data: readings },
    { count: reviewedToday },
  ] = await Promise.all([
    supabase.from("profiles").select("level").eq("id", user.id).single(),
    loadAllProgress(),
    supabase.from("vocab_words").select("id, focus").eq("user_id", user.id),
    supabase.from("srs_cards").select("card_id, repetitions, ease_factor, due_at").eq("user_id", user.id),
    newWordsAllowance(supabase, user.id, now),
    supabase
      .from("activity_log")
      .select("kind, correct, created_at, meta")
      .eq("user_id", user.id)
      .in("kind", Object.keys(ERROR_KINDS))
      .gte("created_at", new Date(now - ERROR_WINDOW_DAYS * 864e5).toISOString())
      .order("created_at", { ascending: true })
      .limit(3000),
    supabase
      .from("activity_log")
      .select("created_at, meta")
      .eq("user_id", user.id)
      .eq("kind", "reading")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("activity_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("kind", "vocab")
      .gte("created_at", today),
  ]);

  const level = ((profile as { level?: CefrLevel | null } | null)?.level ?? "A1") as CefrLevel;
  const logged = attempts ?? [];
  const steps: SessionStep[] = [];

  // 1. Le vocabulaire échu.
  const cardByWord = new Map((cards ?? []).map((c) => [c.card_id, c]));
  const vocab = countFocus(
    (words ?? []).map((w) => {
      const card = cardByWord.get(w.id);
      return {
        focus: w.focus,
        srs: card
          ? { repetitions: card.repetitions, easeFactor: card.ease_factor, dueAt: new Date(card.due_at).getTime() }
          : null,
      };
    }),
    now,
    newAllowance
  );
  const reviewed = (reviewedToday ?? 0) > 0;
  if (vocab.total === 0) {
    steps.push({
      key: "vocab",
      title: "Commencer ton vocabulaire",
      detail: "Ajoute un paquet de départ : les mots les plus courants, dix nouveaux par jour.",
      href: "/vocabulary",
      action: "Choisir un paquet",
      state: "todo",
      minutes: 3,
    });
  } else {
    steps.push({
      key: "vocab",
      title: "Réviser tes mots",
      detail:
        vocab.due > 0
          ? `${vocab.due} carte${vocab.due > 1 ? "s" : ""} à revoir aujourd'hui. La répétition espacée ne tient que si l'on révise le jour dit.`
          : reviewed
            ? "Révisions du jour faites."
            : "Rien d'échu aujourd'hui.",
      href: "/vocabulary/review",
      action: "Réviser",
      state: vocab.due > 0 ? "todo" : reviewed ? "done" : "empty",
      minutes: Math.min(15, Math.max(2, Math.ceil(vocab.due / 4))),
    });
  }

  // 2. Les erreurs des jours précédents.
  const dueErrors = pendingErrors(logged).filter((e) => isDueError(e, now)).length;
  steps.push({
    key: "errors",
    title: "Refaire tes erreurs",
    detail:
      dueErrors > 0
        ? `${dueErrors} exercice${dueErrors > 1 ? "s" : ""} raté${dueErrors > 1 ? "s" : ""} les jours précédents. C'est le lendemain qu'une réponse retrouvée se fixe.`
        : "Aucune erreur des jours précédents en attente.",
    href: "/erreurs",
    action: "Refaire",
    state: dueErrors > 0 ? "todo" : "empty",
    minutes: Math.min(15, Math.max(2, Math.ceil(dueErrors / 2))),
  });

  // 3. Une compétence ciblée.
  const focus = pickFocusSkill(progress, level);
  if (focus) {
    const answered = answeredToday(logged, focus, today);
    steps.push({
      key: "skill",
      title: focusTitle(focus),
      detail: focusDetail(focus, answered),
      href: focus.href,
      action: answered > 0 ? "Continuer" : "Une série",
      state: answered >= SERIES_ATTEMPTS ? "done" : "todo",
      minutes: 5,
      aside: focus.reason === "next" ? focus.module.lesson : undefined,
    });
  }

  // 4. Un texte à lire.
  const finished = new Set<string>();
  let readToday = false;
  for (const row of readings ?? []) {
    const textId = (row.meta as { textId?: unknown } | null)?.textId;
    if (typeof textId === "string") finished.add(textId);
    if (row.created_at >= today) readToday = true;
  }
  const text = pickReadingText(level, finished);
  steps.push({
    key: "reading",
    title: readToday ? "Lire un texte" : text ? `Lire « ${text.title} »` : "Lire un texte à ton niveau",
    detail: readToday
      ? "Texte du jour terminé."
      : text
        ? `${text.level} · touche un mot pour voir son cas et pourquoi, puis joue « Deviner les cas ».`
        : "Tu as lu toute la bibliothèque : génère un texte sur le thème de ton choix.",
    href: text && !readToday ? `/reading/${text.id}` : "/reading",
    action: "Lire",
    state: readToday ? "done" : "todo",
    minutes: 8,
  });

  return <DailySessionView steps={steps} />;
}

function focusTitle(focus: FocusSkill): string {
  switch (focus.reason) {
    case "weak":
      return `Consolider : ${focus.skill.title}`;
    case "stale":
      return `Rafraîchir : ${focus.skill.title}`;
    case "next":
      return `Découvrir : ${focus.skill.title}`;
  }
}

function focusDetail(focus: FocusSkill, answered: number): string {
  const done =
    answered >= SERIES_ATTEMPTS
      ? " Série du jour faite."
      : answered > 0
        ? ` ${answered}/${SERIES_ATTEMPTS} aujourd'hui.`
        : "";
  switch (focus.reason) {
    case "weak":
      return `${focus.module.title} · ${focus.accuracy} % de réussite : c'est ta compétence la plus fragile, là où une série rapporte le plus.${done}`;
    case "stale":
      return `${focus.module.title} · maîtrisé, mais pas pratiqué depuis plus de trois semaines — avant que ça ne s'efface.${done}`;
    case "next":
      return `${focus.module.title} · ${focus.skill.level} — la prochaine compétence à ta portée.${done}`;
  }
}
