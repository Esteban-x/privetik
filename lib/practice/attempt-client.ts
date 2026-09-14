"use client";

import { useState } from "react";
import { exhaustedQuota, quotaErrorFrom, type QuotaInfo } from "@/lib/billing/quota-client";

/**
 * Le péage de pratique, côté écran — partagé par les six modules
 * d'exercices, qui envoient tous la même chose au même endroit.
 *
 * TROIS ISSUES, ET IL FAUT LES DISTINGUER. Jusqu'ici chaque module avait un
 * `catch` unique : « serveur indisponible, on corrige en local ». Un 429 y
 * serait tombé comme une panne, et le plafond n'aurait bloqué personne —
 * l'apprenant aurait continué indéfiniment avec la correction locale. D'où
 * le tri :
 *   - `verdict`  : le serveur a tranché, on affiche son résultat ;
 *   - `blocked`  : plafond atteint, l'écran devient l'abonnement ;
 *   - `offline`  : panne réseau ou visiteur non connecté — la correction
 *                  locale reprend la main, comme avant.
 */

export interface PracticeBlock {
  quota: QuotaInfo;
  message: string;
}

export type AttemptOutcome =
  | { kind: "verdict"; data: Record<string, unknown> }
  | { kind: "blocked" }
  | { kind: "offline" };

interface Allowance {
  plan: "free" | "premium";
  cap: number;
  remaining: number;
}

export function usePracticeAttempt(endpoint: string, feature = "practice") {
  const [blocked, setBlocked] = useState<PracticeBlock | null>(null);
  // Le dernier exercice autorisé a été rendu : on garde le refus tout prêt
  // sans l'afficher encore. L'apprenant doit d'abord voir sa correction.
  const [lastOne, setLastOne] = useState<PracticeBlock | null>(null);

  /**
   * `target` remplace la route du hook pour cet envoi seulement : « Mes
   * erreurs » mêle des exercices de six modules, chacun corrigé par la sienne,
   * sous un seul péage — il est le même pour tous.
   */
  async function submit(body: unknown, target: string = endpoint): Promise<AttemptOutcome> {
    try {
      const res = await fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      // Le refus de quota AVANT l'erreur générique : un 429 est une réponse
      // normale, pas un incident, et il appelle un écran d'abonnement.
      const quota = quotaErrorFrom(res, data);
      if (quota) {
        setBlocked({ quota: quota.quota, message: quota.message });
        return { kind: "blocked" };
      }
      if (!res.ok) return { kind: "offline" };

      const allowance = data.quota as Allowance | undefined;
      if (allowance && allowance.remaining <= 0) {
        setLastOne(exhaustedQuota(feature, allowance.plan, allowance.cap));
      }
      return { kind: "verdict", data };
    } catch {
      return { kind: "offline" };
    }
  }

  /**
   * À appeler au moment de tirer l'exercice suivant. `true` = il n'y en aura
   * pas : l'écran d'abonnement prend la place, sans qu'un 21e exercice ait
   * eu besoin d'être servi puis refusé une fois répondu.
   */
  function stopHere(): boolean {
    if (!lastOne) return false;
    setBlocked(lastOne);
    return true;
  }

  return { blocked, submit, stopHere };
}
