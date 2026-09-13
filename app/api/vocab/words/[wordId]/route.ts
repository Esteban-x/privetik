import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/api/validate";
import { focusOf, isFocus } from "@/lib/vocabulary/focus";
import { accentRu } from "@/lib/vocabulary/accent";
import { transliterate } from "@/lib/vocabulary/transliterate";
import { wordKey } from "@/lib/vocabulary/duplicate";
import { classifyWord } from "@/lib/vocabulary/classify-word";
import { FIELD_MAX, TRANSLIT_MAX } from "@/lib/vocabulary/limits";

/** `undefined` = champ absent de la requête ; "" = champ envoyé vide. */
function field(body: Record<string, unknown>, key: string, max: number): string | undefined {
  const value = body[key];
  if (typeof value !== "string") return undefined;
  return value.trim().slice(0, max);
}

const WORD_COLUMNS =
  "id, ru, transliteration, fr, example_ru, example_fr, gender, animacy, stem_type, indeclinable, french_gender, focus";

/**
 * Modifier un mot : son russe, sa traduction, sa prononciation écrite, son
 * exemple — ou son rangement.
 *
 * LA ROUTE EXISTAIT, L'ÉCRAN NON, ET ELLE N'ÉTAIT PAS PRÊTE À SERVIR. Elle
 * écrivait `null` dans `ru` pour un champ envoyé vide — une colonne NOT NULL,
 * donc une 500 brute — et elle enregistrait un russe modifié tel quel : sans
 * accent tonique, avec la translittération de l'ANCIEN mot, la fiche
 * d'explication de l'ancien mot, et sans vérifier qu'il n'existait pas déjà
 * dans la liste. Corriger une faute de frappe fabriquait ainsi un mot
 * incohérent, ou un doublon que l'ajout aurait refusé.
 *
 * Elle suit désormais les mêmes règles que l'ajout (app/api/vocab/words) :
 * accent posé au serveur, translittération recalculée quand le client n'en
 * fournit pas, doublon refusé en 409, classification refaite. Et elle RENVOIE
 * le mot enregistré, puisque c'est le serveur qui a posé l'accent.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ wordId: string }> }
) {
  const { wordId } = await params;
  if (!isUuid(wordId)) return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await request.json().catch(() => ({}));

  const { data: current } = await supabase
    .from("vocab_words")
    .select("id, list_id, ru, fr, transliteration")
    .eq("id", wordId)
    .eq("user_id", user.id)
    .single();
  if (!current) return NextResponse.json({ error: "Mot introuvable" }, { status: 404 });

  const update: Record<string, unknown> = {};

  // Priorité de révision. Validée ici plutôt que laissée à la contrainte
  // SQL, pour renvoyer un 400 lisible au lieu d'une erreur Postgres.
  if (body.focus !== undefined) {
    if (!isFocus(body.focus)) {
      return NextResponse.json({ error: "Priorité inconnue" }, { status: 400 });
    }
    update.focus = body.focus;
  }

  const rawRu = field(body, "ru", FIELD_MAX);
  const rawFr = field(body, "fr", FIELD_MAX);
  if (rawRu === "") {
    return NextResponse.json({ error: "Le mot russe ne peut pas être vide." }, { status: 400 });
  }
  if (rawFr === "") {
    return NextResponse.json({ error: "La traduction ne peut pas être vide." }, { status: 400 });
  }

  let ru: string = current.ru;
  let ruChanged = false;
  if (rawRu !== undefined && rawRu !== current.ru) {
    const accented = accentRu(rawRu) || rawRu;
    // Le doublon se juge sur la clé repliée, comme à l'ajout : poser ou
    // retirer un accent ne change pas le mot, et ne doit pas se heurter à
    // lui-même.
    if (wordKey(accented) !== wordKey(current.ru)) {
      const { data: siblings } = await supabase
        .from("vocab_words")
        .select("id, ru, fr")
        .eq("list_id", current.list_id)
        .eq("user_id", user.id);
      const twin = (siblings ?? []).find((w) => w.id !== wordId && wordKey(w.ru) === wordKey(accented));
      if (twin) {
        return NextResponse.json(
          {
            error: `« ${twin.ru} » est déjà dans cette liste.`,
            duplicate: { id: twin.id, ru: twin.ru, fr: twin.fr },
          },
          { status: 409 }
        );
      }
    }
    ru = accented;
    ruChanged = accented !== current.ru;
    update.ru = accented;
  }

  let fr: string = current.fr;
  const frChanged = rawFr !== undefined && rawFr !== current.fr;
  if (frChanged && rawFr) {
    fr = rawFr;
    update.fr = rawFr;
  }

  // La prononciation écrite suit le russe. Envoyée vide, elle est
  // recalculée ; absente alors que le russe change, aussi — sinon le mot
  // corrigé garderait la lecture de l'ancien.
  const rawTranslit = field(body, "transliteration", TRANSLIT_MAX);
  if (rawTranslit !== undefined) {
    update.transliteration = rawTranslit || transliterate(ru) || null;
  } else if (ruChanged) {
    update.transliteration = transliterate(ru) || null;
  }

  const exampleRu = field(body, "exampleRu", 300);
  const exampleFr = field(body, "exampleFr", 300);
  if (exampleRu !== undefined) update.example_ru = accentRu(exampleRu) || null;
  if (exampleFr !== undefined) update.example_fr = exampleFr || null;

  // La fiche d'explication parlait de l'ancien mot : on l'oublie, elle sera
  // rédigée pour le nouveau à la prochaine demande.
  if (ruChanged || frChanged) update.explanation = null;
  // Le genre et l'animacité se lisent sur le russe : un autre mot, une
  // autre classification.
  if (ruChanged) Object.assign(update, await classifyWord(supabase, ru, fr));

  // Rien de modifié : ce n'est pas une erreur — le formulaire a été
  // enregistré tel qu'il était. On renvoie le mot, comme pour le reste.
  const { data, error } =
    Object.keys(update).length > 0
      ? await supabase
          .from("vocab_words")
          .update(update)
          .eq("id", wordId)
          .eq("user_id", user.id)
          .select(WORD_COLUMNS)
          .single()
      : await supabase
          .from("vocab_words")
          .select(WORD_COLUMNS)
          .eq("id", wordId)
          .eq("user_id", user.id)
          .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Mot introuvable" }, { status: 500 });
  }

  // La carte de révision garde une copie du mot, lue par le journal : elle
  // doit dire la même chose que la liste.
  if (ruChanged || frChanged) {
    await supabase
      .from("srs_cards")
      .update({ word_ru: data.ru, word_fr: data.fr })
      .eq("user_id", user.id)
      .eq("card_id", wordId);
  }

  return NextResponse.json({
    ok: true,
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
      focus: focusOf(data),
    },
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ wordId: string }> }
) {
  const { wordId } = await params;
  if (!isUuid(wordId)) return NextResponse.json({ error: "Identifiant invalide" }, { status: 400 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  // Nettoie la carte SRS associée si elle existe (pas de clé étrangère —
  // card_id sert aussi aux mots du catalogue intégré).
  await supabase.from("srs_cards").delete().eq("user_id", user.id).eq("card_id", wordId);

  const { error } = await supabase
    .from("vocab_words")
    .delete()
    .eq("id", wordId)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
