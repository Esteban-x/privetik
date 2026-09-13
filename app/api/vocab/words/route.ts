import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classifyWord } from "@/lib/vocabulary/classify-word";
import { wordKey } from "@/lib/vocabulary/duplicate";
import { accentRu } from "@/lib/vocabulary/accent";
import { transliterate } from "@/lib/vocabulary/transliterate";
import { FIELD_MAX, TRANSLIT_MAX } from "@/lib/vocabulary/limits";

function field(body: Record<string, unknown>, key: string, max: number): string | null {
  const value = body[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed || null;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const listId = typeof body.listId === "string" ? body.listId : "";
  // ─── L'ACCENT TONIQUE SE POSE ICI, PAS DANS LE FORMULAIRE ───────
  //
  // Le formulaire ne réécrit jamais le champ que l'apprenant a rempli
  // lui-même, et il a raison : écraser sa saisie par la suggestion serait
  // le contraire de « garde la tienne ». Mais l'accent n'est pas une
  // correction — il n'ajoute aucune lettre et ne change aucun mot ;
  // replié, le résultat est exactement ce qui a été tapé (c'est la
  // définition même de wordKey). Le mot reste le sien, il gagne sa
  // lecture.
  //
  // AU SERVEUR, donc, où tous les chemins d'ajout se rejoignent — menu de
  // complétion, suggestion du modèle, ou saisie entière à la main, qui
  // était le seul à enregistrer un mot nu. Et jamais sur ce que les
  // banques ne savent pas trancher : voir lib/vocabulary/accent.ts.
  const ru = accentRu(field(body, "ru", FIELD_MAX) ?? "") || null;
  const fr = field(body, "fr", FIELD_MAX);
  if (!listId || !ru || !fr) {
    return NextResponse.json({ error: "listId, ru et fr sont requis" }, { status: 400 });
  }

  // RLS empêcherait de toute façon l'insertion sous un list_id qui n'est pas
  // le nôtre (la policy vérifie user_id, pas list_id) — on vérifie donc
  // explicitement que la liste nous appartient avant d'y ajouter un mot.
  const { data: list } = await supabase
    .from("vocab_lists")
    .select("id")
    .eq("id", listId)
    .eq("user_id", user.id)
    .single();
  if (!list) return NextResponse.json({ error: "Liste introuvable" }, { status: 404 });

  // ─── LE MÊME MOT DEUX FOIS ─────────────────────────────────────
  //
  // Rien ne l'empêchait : la liste acceptait « книга » autant de fois qu'on
  // l'ajoutait, et les doublons ressortaient ensuite un par un en révision,
  // chacun avec sa propre carte SRS. L'apprenant révisait le même mot trois
  // fois en croyant avancer.
  //
  // LA COMPARAISON SE FAIT EN JS, PAS EN SQL. La clé replie l'accent
  // tonique — la banque écrit « кни́га », l'apprenant tape « книга » — et
  // aucune collation Postgres ne connaît cette équivalence-là. La liste
  // d'un apprenant tient de toute façon dans une requête.
  const key = wordKey(ru);
  const { data: siblings } = await supabase
    .from("vocab_words")
    .select("id, ru, fr")
    .eq("list_id", listId)
    .eq("user_id", user.id);

  const twin = (siblings ?? []).find((w) => wordKey(w.ru) === key);
  if (twin) {
    // 409, et non 400 : la requête est bien formée, c'est l'état qui s'y
    // oppose. Le client distingue les deux (voir DuplicateWordError).
    return NextResponse.json(
      {
        error: `« ${twin.ru} » est déjà dans cette liste.`,
        duplicate: { id: twin.id, ru: twin.ru, fr: twin.fr },
      },
      { status: 409 }
    );
  }

  // AILLEURS DANS LES AUTRES LISTES : on n'interdit pas. Ranger « вода »
  // dans « Cuisine » ET dans « Voyage » est un choix légitime, et le
  // refuser obligerait à se souvenir de tout ce qu'on a déjà noté. On le
  // SIGNALE, c'est tout — l'apprenant décide.
  const { data: elsewhere } = await supabase
    .from("vocab_words")
    .select("ru, vocab_lists(name)")
    .eq("user_id", user.id)
    .neq("list_id", listId);

  const alsoIn = (elsewhere ?? [])
    .filter((w) => wordKey(w.ru) === key)
    .map((w) => {
      const list = w.vocab_lists as { name?: string } | { name?: string }[] | null;
      return (Array.isArray(list) ? list[0]?.name : list?.name) ?? null;
    })
    .filter((name): name is string => Boolean(name));

  const grammar = await classifyWord(supabase, ru, fr);

  const { data, error } = await supabase
    .from("vocab_words")
    .insert({
      list_id: listId,
      user_id: user.id,
      ru,
      fr,
      // LA TRANSLITTÉRATION SE DÉDUIT DE L'ACCENT (voir transliterate.ts) :
      // sans lui, aucune réduction vocalique n'est appliquée et « хорошо́ »
      // ne peut pas donner « kharacho ». Elle est donc recalculée ici quand
      // le client n'en fournit pas — le cas, précisément, de la saisie
      // manuelle qui n'est passée ni par la complétion ni par le modèle.
      // Ce qu'il fournit n'est jamais écrasé : l'apprenant peut écrire sa
      // propre prononciation.
      //
      // TRANSLIT_MAX, ET NON 100 : la prononciation écrite suit le russe, et
      // le russe va jusqu'à FIELD_MAX. Coupée au centième caractère, une
      // phrase perdait sa lecture aux trois quarts — sans que rien ne le
      // signale, puisque le champ, lui, l'affichait entière.
      transliteration:
        field(body, "transliteration", TRANSLIT_MAX) ?? (transliterate(ru) || null),
      example_ru: accentRu(field(body, "exampleRu", 300) ?? "") || null,
      example_fr: field(body, "exampleFr", 300),
      gender: grammar.gender,
      animacy: grammar.animacy,
      stem_type: grammar.stem_type,
      indeclinable: grammar.indeclinable,
      french_gender: grammar.french_gender,
    })
    .select(
      "id, ru, transliteration, fr, example_ru, example_fr, gender, animacy, stem_type, indeclinable, french_gender"
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    // Les autres listes où ce mot figure déjà, s'il y en a : le formulaire
    // le dit après l'ajout, sans rien bloquer.
    alsoIn: alsoIn.length ? [...new Set(alsoIn)] : undefined,
    word: {
      id: data.id,
      ru: data.ru,
      transliteration: data.transliteration,
      fr: data.fr,
      exampleRu: data.example_ru,
      exampleFr: data.example_fr,
      gender: data.gender,
      animacy: data.animacy,
      stemType: data.stem_type,
      indeclinable: data.indeclinable,
      frenchGender: data.french_gender,
      // Un mot ajouté part « normal » : c'est l'apprenant qui le range
      // ensuite, rien ne le fait pour lui.
      focus: "normal" as const,
      srs: null,
    },
  });
}
