import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPack, packSummary, packWords, STARTER_PACKS } from "@/lib/vocabulary/packs";
import { wordKey } from "@/lib/vocabulary/duplicate";
import { transliterate } from "@/lib/vocabulary/transliterate";

/**
 * Les paquets de départ (voir lib/vocabulary/packs.ts).
 *
 * GET : ce qu'on montre avant d'ajouter — titre, niveau, les premiers mots.
 * Calculé ici : la banque de noms pèse trop lourd pour partir dans le bundle
 * de /vocabulary, qui n'en a besoin que pour six mots par paquet.
 */
export async function GET() {
  return NextResponse.json({ packs: STARTER_PACKS.map(packSummary) });
}

/**
 * POST { packId } : ajoute le paquet dans une liste à son nom, créée au
 * besoin.
 *
 * AJOUTER DEUX FOIS NE DOUBLE RIEN. La liste qui porte déjà le nom du paquet
 * est reprise, et un mot qui s'y trouve déjà est sauté — la même clé de
 * doublon que l'ajout à la main (wordKey, accent replié).
 *
 * AUCUN APPEL AU MODÈLE. L'ajout à la main classe chaque mot (genre,
 * animacité) avec l'IA en secours ; ici la banque les connaît déjà, relus.
 *
 * L'ORDRE DE LA BANQUE EST GARDÉ. La liste se lit du plus récent au plus
 * ancien, et c'est dans cet ordre que les nouveaux mots arrivent en
 * révision : les dates d'ajout décroissent donc avec la fréquence, pour que
 * le mot le plus courant passe en premier.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const pack = typeof body.packId === "string" ? getPack(body.packId) : undefined;
  if (!pack) return NextResponse.json({ error: "Paquet inconnu" }, { status: 404 });

  const { data: sameName } = await supabase
    .from("vocab_lists")
    .select("id, name, created_at")
    .eq("user_id", user.id)
    .eq("name", pack.title)
    .order("created_at", { ascending: true })
    .limit(1);

  let list = sameName?.[0] ?? null;
  if (!list) {
    const { data: created, error } = await supabase
      .from("vocab_lists")
      .insert({ user_id: user.id, name: pack.title })
      .select("id, name, created_at")
      .single();
    if (error || !created) {
      return NextResponse.json({ error: error?.message ?? "Liste non créée" }, { status: 500 });
    }
    list = created;
  }

  const { data: siblings } = await supabase
    .from("vocab_words")
    .select("ru")
    .eq("list_id", list.id)
    .eq("user_id", user.id);
  const taken = new Set((siblings ?? []).map((w) => wordKey(w.ru)));

  const base = Date.now();
  const rows = packWords(pack)
    .filter((word) => !taken.has(wordKey(word.ru)))
    .map((word, index) => ({
      list_id: list.id,
      user_id: user.id,
      ru: word.ru,
      fr: word.fr,
      transliteration: transliterate(word.ru) || null,
      gender: word.gender,
      animacy: word.animacy,
      indeclinable: false,
      french_gender: word.frenchGender,
      created_at: new Date(base - index).toISOString(),
    }));

  if (rows.length > 0) {
    const { error } = await supabase.from("vocab_words").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const wordCount = (siblings?.length ?? 0) + rows.length;
  return NextResponse.json({
    list: {
      id: list.id,
      name: list.name,
      createdAt: list.created_at,
      wordCount,
      knownCount: 0,
      priorityCount: 0,
      // Le décompte exact tient compte de la limite du jour : la liste le
      // recalcule au prochain chargement.
      dueCount: 0,
    },
    added: rows.length,
    skipped: pack.nouns.length - rows.length,
  });
}
