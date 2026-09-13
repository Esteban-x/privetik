import type { Metadata } from "next";
import Link from "next/link";
import SectionLabel from "@/components/ui/SectionLabel";
import { READING_TEXTS } from "@/lib/reading/texts";
import { countCases } from "@/lib/reading/stats";
import CaseCounts from "@/components/exercises/CaseCounts";
import ReadingGeneratorSection from "@/components/exercises/ReadingGeneratorSection";
import ReadingPreview from "@/components/exercises/ReadingPreview";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

/**
 * Le titre de l'onglet.
 *
 * SANS LUI, LA PAGE PORTE CELUI DE L'ACCUEIL. Le layout racine définit un
 * `title.default`, et Next le donne à toute page qui n'en déclare pas.
 *
 * Sans « — Privetik » : le gabarit du layout l'ajoute.
 */
export const metadata: Metadata = {
  title: "Lire les cas : textes russes annotés et expliqués",
  description:
    "Des textes russes courts où chaque mot décliné dit son cas, et pourquoi. Touche un mot " +
    "pour l'explication ou devine les cas. Un texte complet à essayer sans compte.",
  // LA PAGE EST PUBLIQUE DEPUIS QU'ELLE MONTRE UN APERÇU (voir proxy.ts) :
  // sans adresse canonique elle hériterait de celle du layout et se
  // déclarerait comme un double de l'accueil. `check:seo` refuse ce cas.
  alternates: { canonical: "/reading" },
  openGraph: {
    type: "website",
    url: "/reading",
    title: "Lire les cas : textes russes annotés et expliqués",
    description:
      "Chaque nom décliné porte la couleur de son cas et la raison de ce cas — " +
      "la préposition, le verbe ou la quantité qui l'impose.",
  },
};

/**
 * DEUX PAGES SOUS UNE SEULE ADRESSE.
 *
 * Un membre arrive dans son espace : le générateur, ses textes, la
 * bibliothèque. Un visiteur reçoit une démonstration plutôt qu'une
 * redirection sèche vers /login — c'est la session qui décide.
 *
 * L'ADRESSE RESTE /reading alors que le module s'appelle désormais « Lire les
 * cas » : elle est au sitemap, dans robots.txt, dans les liens des cours et
 * dans les favoris. Changer le nom ne justifiait pas de casser tout ce qui y
 * mène.
 *
 * DANS UN GROUPE `(index)` pour garder son squelette sans l'imposer aux
 * textes, qui ont le leur.
 */
export default async function ReadingHub() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return <ReadingPreview />;
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 sm:py-16">
      <SectionLabel>Падежи в тексте</SectionLabel>
      <h1 className="mb-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
        Lire les cas
      </h1>
      <p className="mb-8 max-w-2xl font-display leading-relaxed text-muted">
        Des textes où chaque mot décliné porte la couleur de son cas. Touche un mot&nbsp;: tu vois
        son cas, sa forme du dictionnaire et <span className="text-text">pourquoi</span> il est à ce
        cas. Passe en mode «&nbsp;Deviner les cas&nbsp;» pour t&apos;entraîner à les reconnaître.
      </p>

      <ReadingGeneratorSection />

      <SectionLabel color="accent">Bibliothèque — expliquée à la main</SectionLabel>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {READING_TEXTS.map((t) => (
          <Link
            key={t.id}
            href={`/reading/${t.id}`}
            className="rounded-2xl surface-interactive p-6 hover:-translate-y-0.5"
          >
            <div className="flex items-center gap-2">
              <span className="inline-block rounded-full border border-border px-2.5 py-0.5 font-display text-xs font-semibold text-muted">
                {t.level}
              </span>
              <span className="font-display text-xs text-muted">{t.sentences.length} phrases</span>
            </div>
            <h2 className="mt-3 font-display text-2xl font-bold">{t.title}</h2>
            <CaseCounts counts={countCases(t.sentences)} />
          </Link>
        ))}
      </div>
    </div>
  );
}
