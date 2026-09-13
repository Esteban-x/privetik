"use client";

import { useState } from "react";
import { CheckIcon } from "@/components/ui/icons";
import type { PlanSource } from "@/lib/billing/plans";
import { CrownIcon } from "@/components/ui/CrownIcon";

interface Props {
  isPremium: boolean;
  source: PlanSource | null;
  expiresAt: string | null;
  /** false si les clés Stripe manquent : on n'affiche alors aucun bouton. */
  stripeReady: boolean;
  /** Les plafonds journaliers de la formule découverte, lus en base. */
  caps: { practice: number; vocabReview: number };
}

/**
 * L'état de l'abonnement, et le seul bouton pour en changer.
 *
 * UN SEUL BOUTON, DÉTERMINÉ PAR L'ÉTAT : abonné → portail Stripe (carte,
 * factures, résiliation) ; gratuit → Checkout. Un bêta-testeur n'a ni l'un
 * ni l'autre — il n'a pas d'abonnement à gérer, et lui proposer d'en
 * prendre un serait absurde.
 */
export default function PlanSettings({
  isPremium,
  source,
  expiresAt,
  stripeReady,
  caps,
}: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(endpoint: "checkout" | "portal") {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/billing/${endpoint}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error ?? "indisponible");
      window.location.href = data.url;
    } catch {
      setError("Stripe est indisponible pour le moment. Réessaie dans un instant.");
      setPending(false);
    }
  }

  const granted = source === "grant";
  const echeance = expiresAt
    ? new Date(expiresAt).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  // UN ABONNÉ NE DOIT PAS LIRE SON STATUT, IL DOIT LE VOIR. La version
  // précédente disait « Abonnement actif : … » en texte blanc dans la même
  // carte grise que les réglages de mot de passe — rien ne distinguait le
  // fait d'avoir payé du fait de ne pas avoir payé. Les deux états ont
  // maintenant des cartes visuellement opposées.
  if (isPremium) {
    return (
      <section className="pro-surface overflow-hidden rounded-[20px] p-6">
        <div className="flex items-start gap-4">
          <span
            aria-hidden
            className="pro-gradient flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
          >
            <CrownIcon size={26} />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-bold">Privetik Pro</h2>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-0.5 font-display text-[11px] font-bold uppercase tracking-wide text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                {granted ? "Offert" : "Actif"}
              </span>
            </div>

            <p className="mt-1.5 font-display text-sm leading-relaxed text-muted">
              {granted ? (
                <>
                  Accès complet offert{echeance ? ` jusqu'au ${echeance}` : ""}. Merci de
                  tester l&apos;application — tes retours sur le russe valent tout
                  l&apos;or du monde.
                </>
              ) : echeance ? (
                <>
                  Ton abonnement prend fin le {echeance}. L&apos;accès complet reste
                  ouvert jusque-là.
                </>
              ) : (
                <>
                  Exercices et révisions sans compteur, textes générés,
                  explications de mots : tout est ouvert.
                </>
              )}
            </p>

            <ul className="mt-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {[
                "Exercices et révisions sans compteur",
                "Textes générés pour travailler un cas",
                "Explications de mots détaillées",
                "Exercices de cas sur mesure",
                "Prononciation illimitée",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <CheckIcon className="h-3.5 w-3.5 shrink-0 text-accent-ink" />
                  <span className="font-display text-[13px] text-text/90">{item}</span>
                </li>
              ))}
            </ul>

            {stripeReady && !granted && (
              <button
                onClick={() => go("portal")}
                disabled={pending}
                className="btn btn-outline mt-5 h-10 rounded-xl px-4 font-display text-sm font-semibold"
              >
                {pending ? "Ouverture…" : "Gérer mon abonnement"}
              </button>
            )}
            {error && (
              <p role="alert" className="mt-3 font-display text-sm text-danger">
                {error}
              </p>
            )}
          </div>
        </div>
      </section>
    );
  }

  // LA MÊME CARTE, DANS LES DEUX ÉTATS. La version gratuite était une
  // carte grise ordinaire pendant que l'abonné avait une carte tricolore :
  // les deux ne se ressemblaient pas assez pour qu'on comprenne qu'il
  // s'agit du même objet à deux moments différents. Elle reprend donc la
  // même structure — pictogramme, titre, pastille d'état, liste — avec
  // seulement le nécessaire en moins : la couronne est éteinte plutôt
  // qu'allumée, et la liste montre ce qu'on N'A PAS.
  return (
    <section className="pro-surface overflow-hidden rounded-[20px] p-6">
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-bg3 text-muted"
        >
          <CrownIcon size={26} mono />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-bold">Privetik Pro</h2>
            <span className="rounded-full border border-border px-2.5 py-0.5 font-display text-[11px] font-bold uppercase tracking-wide text-muted">
              Non actif
            </span>
          </div>

          {/* CETTE PHRASE DOIT DIRE LE COMPTEUR. Elle annonçait « la révision
              de vocabulaire est déjà complète » — ce qui était vrai avant les
              plafonds de pratique, et ne l'est plus. Un apprenant bloqué au
              21e exercice qui relit ici qu&apos;il a tout, conclut à une panne,
              pas à une limite. */}
          <p className="mt-1.5 font-display text-sm leading-relaxed text-muted">
            Les cours, l&apos;alphabet, les tables et le test de niveau sont ouverts
            sans compteur. La formule découverte s&apos;arrête à {caps.practice} exercices
            et {caps.vocabReview} révisions par jour ; l&apos;abonnement lève la limite et
            ouvre ce qui est rédigé pour toi.
          </p>

          <ul className="mt-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {[
              "Exercices et révisions sans compteur",
              "Textes générés pour travailler un cas",
              "Explications de mots détaillées",
              "Exercices de cas sur mesure",
              "Prononciation illimitée",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-border"
                />
                <span className="font-display text-[13px] text-muted">{item}</span>
              </li>
            ))}
          </ul>

          {/* TOUJOURS « PASSER À », JAMAIS « GÉRER ». On est sur la carte
              d'un compte GRATUIT : il n'y a rien à gérer, et proposer de
              gérer un abonnement qu'on n'a pas est incompréhensible. Le cas
              qui avait motivé la nuance était celui d'un ancien abonné
              (client Stripe existant, plan retombé à gratuit) — mais lui non
              plus n'a rien à gérer : ce qu'il lui faut est une NOUVELLE
              souscription. D'où `checkout` dans tous les cas ; Stripe
              réutilise son client existant, la route le lui passe déjà. */}
          {stripeReady && !granted && (
            <button
              onClick={() => go("checkout")}
              disabled={pending}
              className="pro-gradient mt-5 inline-flex h-11 items-center gap-2 rounded-xl px-5 font-display text-sm font-thin disabled:opacity-60"
            >
              
              {pending ? "Ouverture…" : "Passer à Privetik Pro"}
            </button>
          )}

          {error && (
            <p role="alert" className="mt-3 font-display text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
