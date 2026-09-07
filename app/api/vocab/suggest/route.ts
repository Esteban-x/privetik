import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnthropic, MODEL_FAST, textFromMessage, parseJsonResponse } from "@/lib/ai/client";
import { consumeQuota, recordTokens } from "@/lib/ai/quota";
import { isPhrase, translationSuggestionPrompt } from "@/lib/ai/prompts";
import { NOUNS, getNoun } from "@/lib/grammar/nouns-data";
import { exactEntry } from "@/lib/vocabulary/autocomplete";
import { transliterate } from "@/lib/vocabulary/transliterate";
import { accentRu } from "@/lib/vocabulary/accent";
import { FIELD_MAX, TRANSLIT_MAX } from "@/lib/vocabulary/limits";

/**
 * L'autre moitié d'un mot, proposée pendant la saisie.
 *
 * DANS LES DEUX SENS : on tape un mot russe entendu quelque part et on
 * reçoit sa traduction ; on tape un mot français et on reçoit le mot russe.
 * Restreindre la saisie au russe supposait qu'on part toujours de ce qu'on a
 * entendu, jamais de ce qu'on veut savoir dire.
 *
 * PROPOSITION, jamais décision : le formulaire la présente comme telle et la
 * première frappe de l'apprenant la remplace. Rien de ce qui sort d'ici
 * n'alimente le moteur de déclinaison — la banque curée reste la seule
 * source des formes (lib/grammar/nouns-data.ts).
 *
 * La banque est consultée AVANT le modèle, dans les deux sens : ses 451 noms
 * ont une traduction relue à la main et un accent tonique vérifié, donc pour
 * eux la meilleure réponse est gratuite, instantanée et meilleure que ce que
 * l'IA proposerait.
 */

/**
 * Ce que le modèle rend — tout est facultatif, parce que la consigne varie.
 * Sur une phrase il ne renvoie que la traduction : le côté saisi, sa
 * translittération et sa nature se déduisent ici sans lui. Chaque champ est
 * de toute façon vérifié avec `typeof` avant d'être lu, ces types ne
 * décrivant qu'une intention.
 */
interface AiSuggestion {
  ru?: string;
  fr?: string;
  transliteration?: string;
  partOfSpeech?: string;
  confident?: boolean;
}

const GENDER_LABEL: Record<string, string> = {
  masculine: "nom masculin",
  feminine: "nom féminin",
  neuter: "nom neutre",
};

/** Casse, espaces, accent tonique et ё/е mis de côté pour la comparaison. */
function normalizeRu(word: string): string {
  return word.trim().toLowerCase().replace(/́/g, "").replace(/ё/g, "е");
}

/** Idem côté français : accents et article initial ignorés. */
function normalizeFr(word: string): string {
  return word
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^(?:l'|le |la |les |un |une |des )/, "")
    .trim();
}

/**
 * Sans ce plafond, Vercel coupe à dix secondes — une 504 sans corps, sans
 * trace, et qui ne se reproduit jamais en local. Voir la note détaillée dans
 * app/api/ai/reading/route.ts.
 *
 * 30 ET NON 15 depuis que le champ traduit des phrases : quinze secondes
 * suffisaient à un mot, et une réponse coupée en route est ici indiscernable
 * d'une absence de traduction.
 */
export const maxDuration = 30;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const from = body.from === "fr" ? "fr" : body.from === "ru" ? "ru" : null;
  // LE MÊME PLAFOND QUE LE CHAMP, et c'est tout l'objet de le tenir en un
  // seul endroit : à 100 caractères, une phrase collée dans le formulaire
  // arrivait ici amputée des deux tiers — traduite jusqu'au centième
  // caractère, coupée en plein mot, et donc inutilisable.
  const raw = typeof body.word === "string" ? body.word.trim().slice(0, FIELD_MAX) : "";
  if (!from || !raw) return NextResponse.json({ error: "Mot et sens requis" }, { status: 400 });

  // Rien à proposer tant qu'il n'y a pas au moins deux lettres du bon
  // alphabet : ça évite un appel par caractère tapé, et une saisie en latin
  // dans le champ russe (ou l'inverse) ne déclenche rien.
  const enough = from === "ru" ? /[Ѐ-ӿ]{2}/.test(raw) : /[A-Za-zÀ-ÿ]{2}/.test(raw);
  if (!enough) return NextResponse.json({ suggestion: null });

  // Les deux banques répondent à un MOT : leurs clés sont des entrées de
  // dictionnaire, et confronter un paragraphe à 451 noms ne peut rien
  // donner. On les saute plutôt que d'y frotter trois cents caractères.
  const phrase = isPhrase(raw);

  const known = phrase
    ? null
    : from === "ru"
      ? (() => {
          const key = normalizeRu(raw);
          return (
            getNoun(key) ??
            NOUNS.find(
              (n) => normalizeRu(n.lemma) === key || normalizeRu(n.forms.singular[0]) === key
            )
          );
        })()
      : (() => {
          const key = normalizeFr(raw);
          return NOUNS.find((n) => normalizeFr(n.translation) === key);
        })();

  if (known) {
    return NextResponse.json({
      suggestion: {
        ru: known.forms.singular[0],
        // Le français saisi n'est jamais réécrit : si l'apprenant a tapé
        // « la table », c'est « la table » qu'il veut dans sa liste.
        fr: from === "fr" ? raw : known.translation,
        // Calculée par règle, pas demandée au modèle : la banque porte
        // l'accent tonique, donc la lecture se déduit (voir transliterate).
        // Ce champ valait `null` ici, ce qui privait de prononciation
        // écrite exactement les mots les mieux vérifiés de l'app.
        transliteration: transliterate(known.forms.singular[0]) || null,
        partOfSpeech: GENDER_LABEL[known.gender] ?? null,
        confident: true,
        source: "bank" as const,
        from,
      },
    });
  }

  // ─── L'INDEX D'AUTOCOMPLÉTION, AVANT LE MODÈLE ───────────────────
  //
  // Il contient 1 750 mots, dont ceux que la banque des 451 noms n'a pas :
  // « приве́т », « спаси́бо », les verbes, les adjectifs. Sans cette
  // consultation, le modèle était interrogé pour des mots dont la réponse
  // était DÉJÀ CONNUE — et pouvait la contredire : un apprenant a tapé
  // « salut » et reçu « приват » là où l'index disait « приве́т ».
  //
  // Le client affiche déjà ces mots dans son menu de complétion. Que le
  // serveur réponde autre chose pour la même saisie est le pire des deux
  // mondes : deux sources qui se contredisent à l'écran.
  //
  // Correspondance EXACTE seulement : proposer un approchant à la place
  // d'une traduction demandée reproduirait le défaut qu'on corrige.
  const indexed = phrase ? null : exactEntry(raw, from);
  if (indexed) {
    return NextResponse.json({
      suggestion: {
        ru: indexed.ru,
        fr: from === "fr" ? raw : indexed.fr,
        transliteration: transliterate(indexed.ru) || null,
        partOfSpeech: null,
        confident: true,
        source: indexed.verified ? ("bank" as const) : ("ai" as const),
        from,
      },
    });
  }

  // Quota seulement ICI, une fois la banque épuisée : ses 451 noms relus à
  // la main restent proposés gratuitement à tout le monde, et pour eux la
  // réponse est de toute façon meilleure que celle du modèle.
  //
  // LE REFUS EST DIT, PAS TU. Il renvoyait `{ suggestion: null }`, c'est-à-
  // dire exactement ce que renvoie « je n'ai rien trouvé ». Résultat : sur
  // un compte gratuit, où cette fonctionnalité est fermée, le champ restait
  // vide sans que rien n'explique pourquoi — impossible de distinguer une
  // fonctionnalité absente d'une panne. On renvoie donc le motif, que le
  // formulaire affiche en une ligne discrète.
  const quota = await consumeQuota(supabase, "suggest");
  if (!quota.allowed) {
    return NextResponse.json({
      suggestion: null,
      quota: {
        reason: quota.reason ?? "daily",
        plan: quota.plan ?? "free",
        upgrade: quota.plan === "free" && quota.reason !== "burst",
      },
    });
  }

  // ─── LE PLAFOND DE SORTIE SUIT LA LONGUEUR DE L'ENTRÉE ─────────
  //
  // 200 jetons, c'est la juste mesure pour un mot et un mur pour une phrase.
  // Et un mur silencieux : la réponse coupée au plafond est un JSON tronqué,
  // donc illisible, donc `null` — le champ d'en face restait vide sans que
  // rien ne distingue « je n'ai pas trouvé » de « ma réponse ne tenait pas ».
  // C'est ce qui arrivait à tout texte un peu long.
  //
  // La consigne « phrase » ne fait plus recopier le côté déjà saisi (voir
  // phraseTranslationPrompt) : il ne reste qu'une traduction à produire, et
  // trois jetons par caractère tapé lui laissent une marge confortable, y
  // compris en cyrillique qui se découpe menu.
  const maxTokens = phrase ? Math.min(1500, 300 + raw.length * 3) : 200;

  try {
    const msg = await getAnthropic().messages.create({
      model: MODEL_FAST,
      max_tokens: maxTokens,
      system: translationSuggestionPrompt(raw, from),
      messages: [{ role: "user", content: "Propose une traduction." }],
    });
    await recordTokens(supabase, "suggest", msg.usage);
    const ai = parseJsonResponse<AiSuggestion>(textFromMessage(msg));

    const aiRu = typeof ai.ru === "string" ? ai.ru.trim().slice(0, FIELD_MAX) : "";
    const aiFr = typeof ai.fr === "string" ? ai.fr.trim().slice(0, FIELD_MAX) : "";

    // Le côté saisi par l'apprenant fait foi. Côté russe on accepte la
    // version accentuée du modèle, mais seulement si c'est bien le même mot :
    // un modèle qui « corrige » une faute de frappe changerait le mot qu'on
    // croit ajouter.
    //
    // SUR UNE PHRASE, LE MODÈLE NE RENVOIE QUE L'AUTRE CÔTÉ, et l'accent
    // tonique vient alors de l'index (lib/vocabulary/accent), qui s'abstient
    // là où il hésite plutôt que de deviner. C'est aussi ce qui donne sa
    // réduction vocalique à la translittération calculée plus bas : sans
    // accent, « хорошо » ne peut pas donner « kharacho ».
    let ru: string;
    if (phrase) ru = accentRu(from === "ru" ? raw : aiRu);
    else if (from === "ru") ru = normalizeRu(aiRu) === normalizeRu(raw) ? aiRu : raw;
    else ru = aiRu;
    const fr = from === "fr" ? raw : aiFr;
    if (!ru || !fr) return NextResponse.json({ suggestion: null });

    return NextResponse.json({
      suggestion: {
        ru,
        fr,
        // Le modèle d'abord, la règle en repli : sur un mot hors banque il
        // connaît des irrégularités que la règle ignore, mais il lui arrive
        // d'omettre le champ — et une prononciation calculée vaut mieux que
        // pas de prononciation du tout.
        transliteration:
          (typeof ai.transliteration === "string" && ai.transliteration.trim()
            ? ai.transliteration.trim().slice(0, TRANSLIT_MAX)
            : transliterate(ru)) || null,
        partOfSpeech:
          typeof ai.partOfSpeech === "string" ? ai.partOfSpeech.trim().slice(0, 40) : null,
        confident: ai.confident === true,
        source: "ai" as const,
        from,
      },
    });
  } catch (err) {
    // Pas de clé, quota, réseau : la suggestion est un confort, jamais un
    // prérequis. Le formulaire reste utilisable tel quel.
    console.error("vocab/suggest indisponible", err);
    return NextResponse.json({ suggestion: null });
  }
}
