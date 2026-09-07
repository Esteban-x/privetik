import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/api/validate";
import { focusOf } from "@/lib/vocabulary/focus";

// Détail d'une liste (mots + état SRS pour la reprise en carte). RLS filtre
// déjà par propriétaire ; les .eq("id", listId) / .eq("list_id", listId)
// évitent en plus de renvoyer une liste entière si l'id n'existe pas.

export async function GET(
  request: Request,
  { params }: { params: Promise<{ listId: string }> }
) {
  const { listId } = await params;
  if (!isUuid(listId)) return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { data: list, error: listError } = await supabase
    .from("vocab_lists")
    .select("id, name, created_at")
    .eq("id", listId)
    // Filtre explicite en plus de RLS (cohérent avec PATCH/DELETE
    // ci-dessous) : ne dépend pas uniquement d'une policy pour empêcher
    // de lire la liste d'un autre utilisateur si son id est deviné.
    .eq("user_id", user.id)
    .single();
  // Ne logge PAS listError : "liste introuvable/pas à moi" est un cas
  // normal (id deviné, liste supprimée), pas une anomalie serveur.
  if (listError || !list) return NextResponse.json({ error: "Liste introuvable" }, { status: 404 });

  const { data: words, error: wordsError } = await supabase
    .from("vocab_words")
    .select(
      "id, ru, transliteration, fr, example_ru, example_fr, gender, animacy, stem_type, indeclinable, french_gender, focus, created_at"
    )
    .eq("list_id", listId)
    // LE DERNIER AJOUTÉ EN PREMIER. Le mot qu'on vient d'ajouter est celui
    // qu'on veut relire, et sous cinquante autres il fallait le chercher.
    // Le formulaire le posait déjà en tête (VocabularyWorkspace), mais
    // seulement dans l'état local : au rechargement suivant, l'ordre
    // chronologique le renvoyait tout en bas — le mot changeait de place
    // sans que rien ne l'ait déplacé.
    //
    // La file de révision, elle, ne s'en trouve pas réordonnée : elle trie
    // par degré de maîtrise (reviewQueue), et cet ordre-ci ne départage que
    // les ex æquo.
    .order("created_at", { ascending: false });
  if (wordsError) {
    // Erreur DB inattendue (ex. colonne manquante si les migrations n'ont
    // pas été appliquées, `npm run db:push`) — tracée ici, sinon invisible
    // côté serveur alors que le client ne voit qu'un message générique.
    console.error("GET /api/vocab/lists/[listId] échec vocab_words", wordsError);
    return NextResponse.json({ error: wordsError.message }, { status: 500 });
  }

  const wordIds = (words ?? []).map((w) => w.id);
  const { data: srsRows } = wordIds.length
    ? await supabase
        .from("srs_cards")
        .select("card_id, ease_factor, interval_days, repetitions, due_at, last_reviewed")
        .in("card_id", wordIds)
    : { data: [] };

  const srsByCardId = new Map((srsRows ?? []).map((r) => [r.card_id, r]));

  return NextResponse.json({
    list: { id: list.id, name: list.name, createdAt: list.created_at },
    words: (words ?? []).map((w) => {
      const srs = srsByCardId.get(w.id);
      return {
        id: w.id,
        ru: w.ru,
        transliteration: w.transliteration,
        fr: w.fr,
        exampleRu: w.example_ru,
        exampleFr: w.example_fr,
        gender: w.gender,
        animacy: w.animacy,
        stemType: w.stem_type,
        indeclinable: w.indeclinable,
        frenchGender: w.french_gender,
        focus: focusOf(w),
        srs: srs
          ? {
              easeFactor: srs.ease_factor,
              intervalDays: srs.interval_days,
              repetitions: srs.repetitions,
              dueAt: new Date(srs.due_at).getTime(),
              lastReviewedAt: srs.last_reviewed ? new Date(srs.last_reviewed).getTime() : null,
            }
          : null,
      };
    }),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ listId: string }> }
) {
  const { listId } = await params;
  if (!isUuid(listId)) return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!name) return NextResponse.json({ error: "Nom de liste requis" }, { status: 400 });

  const { error } = await supabase
    .from("vocab_lists")
    .update({ name })
    .eq("id", listId)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ listId: string }> }
) {
  const { listId } = await params;
  if (!isUuid(listId)) return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  // Les cartes SRS des mots de la liste ne sont pas liées par clé étrangère
  // (card_id sert aussi aux mots du catalogue intégré) : on les nettoie
  // explicitement pour ne pas laisser de lignes orphelines.
  const { data: words } = await supabase.from("vocab_words").select("id").eq("list_id", listId);
  const wordIds = (words ?? []).map((w) => w.id);
  if (wordIds.length) {
    await supabase.from("srs_cards").delete().eq("user_id", user.id).in("card_id", wordIds);
  }

  const { error } = await supabase
    .from("vocab_lists")
    .delete()
    .eq("id", listId)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
