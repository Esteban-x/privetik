import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { countFocus, type Reviewable } from "@/lib/vocabulary/focus";
import { newWordsAllowance } from "@/lib/vocabulary/new-words";

// Listes de vocabulaire personnelles (page /vocabulary). Protégées par
// RLS (auth.uid() = user_id) : chaque requête ne voit que ses propres listes.

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  // Trois lectures indépendantes, lancées ensemble plutôt qu'en cascade : la
  // page ne montre plus seulement des noms de listes mais l'état de chacune
  // (combien de mots mis de côté, combien la file proposera), ce qui est
  // justement ce qui fait choisir par où commencer.
  const [{ data, error }, { data: words }, { data: cards }, allowance] = await Promise.all([
    supabase.from("vocab_lists").select("id, name, created_at").order("created_at", { ascending: true }),
    supabase.from("vocab_words").select("id, list_id, focus").eq("user_id", user.id),
    supabase
      .from("srs_cards")
      .select("card_id, repetitions, ease_factor, due_at")
      .eq("user_id", user.id),
    // La limite de nouveaux mots est celle de l'apprenant, pas d'une liste :
    // chaque badge dit ce que la liste proposerait si on l'ouvrait maintenant.
    newWordsAllowance(supabase, user.id),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const cardByWord = new Map((cards ?? []).map((c) => [c.card_id, c]));
  const now = Date.now();
  // Regroupé par liste puis compté avec countFocus — la même fonction que la
  // file de révision et que la barre d'avancement, pour que le badge du rail
  // annonce exactement ce que la session proposera.
  const byList = new Map<string, Reviewable[]>();
  for (const w of words ?? []) {
    const card = cardByWord.get(w.id);
    const bucket = byList.get(w.list_id) ?? [];
    bucket.push({
      focus: w.focus,
      srs: card
        ? {
            repetitions: card.repetitions,
            easeFactor: card.ease_factor,
            dueAt: new Date(card.due_at).getTime(),
          }
        : null,
    });
    byList.set(w.list_id, bucket);
  }

  const lists = (data ?? []).map((l) => {
    const stat = countFocus(byList.get(l.id) ?? [], now, allowance);
    return {
      id: l.id,
      name: l.name,
      createdAt: l.created_at,
      wordCount: stat.total,
      knownCount: stat.known,
      priorityCount: stat.priority,
      dueCount: stat.due,
    };
  });

  return NextResponse.json({ lists });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!name) return NextResponse.json({ error: "Nom de liste requis" }, { status: 400 });

  const { data, error } = await supabase
    .from("vocab_lists")
    .insert({ user_id: user.id, name })
    .select("id, name, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    list: {
      id: data.id,
      name: data.name,
      createdAt: data.created_at,
      wordCount: 0,
      knownCount: 0,
      priorityCount: 0,
      dueCount: 0,
    },
  });
}
