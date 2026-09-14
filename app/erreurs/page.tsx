import type { Metadata } from "next";
import Link from "next/link";
import ErrorsPractice from "@/components/exercises/ErrorsPractice";

export const metadata: Metadata = {
  title: "Mes erreurs",
  robots: { index: false, follow: false },
};

/**
 * « Mes erreurs » — page de compte (protégée par proxy.ts, comme toute route
 * qui n'est pas déclarée publique).
 */
export default function ErrorsPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-8 sm:py-16">
      <Link
        href="/exercices"
        className="mb-6 inline-block font-display text-xs font-semibold uppercase tracking-wide text-muted hover:text-accent-ink"
      >
        ← Exercices
      </Link>
      <h1 className="mb-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Mes erreurs</h1>
      <p className="mb-7 max-w-2xl font-display leading-relaxed text-muted sm:mb-10">
        Ce que tu as raté ces trente derniers jours et pas encore réussi depuis, dans tous les modules.
        Retrouver une réponse le lendemain la fixe bien mieux que la relire juste après l&apos;erreur :
        une réponse juste ici lève l&apos;erreur, une réponse fausse la garde pour la prochaine fois.
      </p>
      <ErrorsPractice />
    </div>
  );
}
