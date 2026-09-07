"use client";

import SpeakButton from "@/components/vocabulary/SpeakButton";
import { speakFr, speakRu } from "@/lib/vocabulary/speech";

/**
 * Écouter le mot, dans les deux langues, pendant une révision.
 *
 * LA PRONONCIATION N'ÉTAIT NULLE PART DANS LES MODES ÉCRITS. Les cartes de
 * liste ont un haut-parleur par langue depuis toujours ; les révisions,
 * elles, n'en avaient aucun — sauf le mode Voix, qui est bâti autour. On
 * pouvait donc réviser cent mots sans jamais entendre aucun d'eux, dans
 * une app dont la prononciation est l'argument principal.
 *
 * APRÈS LA RÉPONSE, comme l'explication. Un haut-parleur posé à côté de la
 * question dirait la réponse à qui appuie : c'est exactement le défaut que
 * PROMPT_LANG a corrigé dans le mode Voix, où « Écouter » jouait le mot
 * russe alors qu'on demandait de le produire. La règle est la même ici, et
 * `only` la porte : tant que la réponse n'est pas connue, on ne propose que
 * la langue de la CONSIGNE.
 *
 * DES PASTILLES NOMMÉES, et non le pictogramme seul des cartes de liste.
 * Deux raisons : la carte retournée est elle-même un bouton, qui ne peut
 * pas en contenir un second ; et à ce moment-là les deux langues sont à
 * l'écran, donc un haut-parleur muet ne dirait pas laquelle il prononce.
 *
 * Le son vient d'ElevenLabs via /api/tts, mis en cache pour tout le monde :
 * un mot déjà entendu par n'importe quel apprenant repart du CDN, sans
 * attente ni quota. L'accent tonique du mot ne gêne pas — il est retiré
 * avant la synthèse et avant le calcul de la clé de cache.
 */
export default function PronunciationRow({
  ru,
  fr,
  /** Une seule langue tant que la réponse n'est pas connue. */
  only,
  className = "",
}: {
  ru: string;
  fr: string;
  only?: "ru" | "fr";
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center justify-center gap-2 sm:gap-2.5 ${className}`}>
      {only !== "fr" && (
        <SpeakButton
          text="Russe"
          label={`Écouter ${ru} en russe`}
          title="Écouter la prononciation russe"
          onSpeak={() => speakRu(ru)}
        />
      )}
      {only !== "ru" && (
        <SpeakButton
          text="Français"
          label={`Écouter ${fr} en français`}
          title="Écouter la prononciation française"
          onSpeak={() => speakFr(fr)}
        />
      )}
    </div>
  );
}
