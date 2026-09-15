import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAnthropic, MODEL_FAST, textFromMessage, parseJsonResponse } from "@/lib/ai/client";
import { consumeQuota, quotaDeniedResponse, recordTokens, refundQuota } from "@/lib/ai/quota";
import { readingTranslationPrompt } from "@/lib/ai/prompts";
import { checkFrenchText, detectTextLanguage } from "@/lib/reading/manual";

/**
 * Traduire en russe un texte que l'apprenant écrit en français, pendant
 * qu'il l'écrit. La traduction revient dans un champ qu'il peut retoucher,
 * puis part à l'annotation comme un texte collé.
 *
 * DÉCOMPTÉ SUR `suggest`, PAS SUR `reading`. C'est la traduction automatique
 * du formulaire de vocabulaire, au même prix, et elle part à chaque pause de
 * frappe : prise sur `reading`, dont le plan gratuit n'a que deux unités à
 * vie, la première phrase aurait épuisé la découverte avant l'annotation.
 * Un poste à part demandait une ligne de `plan_limits`, donc une migration —
 * et tant qu'elle n'est pas appliquée, `consume_ai_quota` refuse tout le
 * monde (voir lib/ai/quota.ts, échec fermé).
 *
 * RIEN N'EST ENREGISTRÉ ICI. C'est l'annotation qui enregistre le texte et
 * décompte `reading`, comme pour un texte collé.
 */
export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim() : "";
  // Jugé AVANT le quota, avec la règle du client : une saisie refusée ne coûte rien.
  const checked = checkFrenchText(text);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  const quota = await consumeQuota(supabase, "suggest");
  if (!quota.allowed) return quotaDeniedResponse(quota);

  try {
    const msg = await getAnthropic().messages.create({
      model: MODEL_FAST,
      max_tokens: 4096,
      system: readingTranslationPrompt(),
      messages: [{ role: "user", content: text }],
    });
    if (msg.stop_reason === "max_tokens") {
      console.error("reading translate: réponse tronquée par max_tokens");
    }
    await recordTokens(supabase, "suggest", msg.usage);

    const raw = parseJsonResponse<{ ru?: unknown }>(textFromMessage(msg));
    // L'accent tonique est retiré s'il est venu malgré la consigne : les
    // textes collés n'en portent pas, et l'annotation lit le mot sans lui.
    const ru = typeof raw?.ru === "string" ? raw.ru.replace(/́/g, "").trim() : "";
    if (detectTextLanguage(ru) !== "ru") {
      console.error("reading translate: réponse sans russe", JSON.stringify(ru.slice(0, 120)));
      await refundQuota(supabase, "suggest");
      return NextResponse.json({ error: "Traduction indisponible pour le moment." }, { status: 502 });
    }
    return NextResponse.json({ ru });
  } catch (err) {
    console.error("reading translate route error", err);
    await refundQuota(supabase, "suggest");
    return NextResponse.json({ error: "Traduction indisponible pour le moment." }, { status: 502 });
  }
}
