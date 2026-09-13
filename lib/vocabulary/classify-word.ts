import { heuristicClassify } from "@/lib/vocabulary/grammar-classify";
import { getAnthropic, MODEL_FAST, textFromMessage, parseJsonResponse } from "@/lib/ai/client";
import { consumeQuota, recordTokens } from "@/lib/ai/quota";
import { vocabGrammarSystemPrompt } from "@/lib/ai/prompts";
import type { createClient } from "@/lib/supabase/server";

/**
 * Classification grammaticale d'un mot de liste — SERVEUR UNIQUEMENT.
 *
 * Sortie de app/api/vocab/words le jour où un mot a pu être MODIFIÉ : la
 * route de modification doit reclasser le mot quand son russe change, et
 * une copie de cette logique aurait fini par diverger de celle de l'ajout.
 *
 * Heuristique locale d'abord (déterministe), puis un appel IA bon marché
 * pour combler ce qu'elle ne peut pas déduire (surtout l'animacité, et le
 * genre français qui ne se déduit d'aucune règle — arbitraire d'une langue à
 * l'autre). Information d'affichage et de révision : elle n'alimente PAS le
 * module « Cas », qui ne décline que la banque curée et vérifiée
 * (lib/grammar/nouns-data.ts). Ne bloque JAMAIS l'enregistrement du mot : un
 * échec IA laisse simplement les colonnes grammaticales à null.
 */

interface AiGrammar {
  gender: "masculine" | "feminine" | "neuter";
  animacy: "animate" | "inanimate";
  stem_type: "hard" | "soft" | "mixed";
  indeclinable: boolean;
  french_gender: "m" | "f";
}

type Db = Awaited<ReturnType<typeof createClient>>;

export async function classifyWord(supabase: Db, ru: string, fr: string) {
  const heuristic = heuristicClassify(ru);
  const fallback = {
    gender: heuristic.gender,
    animacy: null,
    stem_type: heuristic.stemType,
    indeclinable: false,
    french_gender: null,
  };

  // Hors quota, on garde l'heuristique locale : le mot est enregistré avec
  // le genre et le type de radical qu'elle sait déduire, et seules
  // l'animacité et le genre français restent nuls — exactement ce que fait
  // le `catch` ci-dessous quand l'IA est indisponible.
  const quota = await consumeQuota(supabase, "classify");
  if (!quota.allowed) return fallback;

  try {
    const msg = await getAnthropic().messages.create({
      model: MODEL_FAST,
      max_tokens: 150,
      system: vocabGrammarSystemPrompt(ru, fr),
      messages: [{ role: "user", content: "Classifie ce mot." }],
    });
    await recordTokens(supabase, "classify", msg.usage);
    const ai = parseJsonResponse<AiGrammar>(textFromMessage(msg));
    return {
      gender: heuristic.gender ?? ai.gender,
      animacy: ai.animacy,
      stem_type: heuristic.stemType ?? ai.stem_type,
      indeclinable: ai.indeclinable,
      french_gender: ai.french_gender,
    };
  } catch {
    return fallback;
  }
}
