import Link from "next/link";
import type { Metadata } from "next";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumb, graph } from "@/lib/seo/structured-data";
import CaseMixPractice from "@/components/exercises/CaseMixPractice";
import { caseLessons } from "@/lib/courses/practice-lessons";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { CefrLevel } from "@/lib/supabase/types";

export const metadata: Metadata = {
  title: "Cas russes mélangés : trouver le bon cas",
  description:
    "Les six cas dans le même exercice : lire la phrase, repérer ce qui impose le cas, puis " +
    "écrire le mot à la bonne forme. Corrigé à chaque réponse.",
  alternates: { canonical: "/cases/melange" },
  openGraph: {
    type: "website",
    url: "/cases/melange",
    title: "Cas russes mélangés : trouver le bon cas",
    description: "Repérer le cas qu'une phrase demande, puis écrire la forme.",
  },
};

// Même lecture que la page d'un cas : le niveau décide des cas mélangés et
// des mots servis. Déconnecté, rien n'est biaisé.
async function getViewer(): Promise<{ signedIn: boolean; level?: CefrLevel }> {
  if (!isSupabaseConfigured()) return { signedIn: false };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { signedIn: false };
  const { data: profile } = await supabase.from("profiles").select("level").eq("id", user.id).single();
  return { signedIn: true, level: profile?.level };
}

export default async function CasesMixPage() {
  const { signedIn, level } = await getViewer();

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 sm:py-16">
      <JsonLd
        data={graph(
          breadcrumb([
            { name: "Privetik", path: "/" },
            { name: "Les cas russes", path: "/cases" },
            { name: "Cas mélangés", path: "/cases/melange" },
          ])
        )}
      />
      <Link
        href="/cases"
        className="mb-6 inline-block font-display text-xs font-semibold uppercase tracking-wide text-muted hover:text-accent-ink"
      >
        ← Tous les cas
      </Link>

      <h1 className="mb-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
        Cas mélangés
      </h1>
      <p className="mb-7 max-w-2xl font-display leading-relaxed text-muted sm:mb-10">
        Sur la page d&apos;un cas, on sait d&apos;avance lequel employer : il ne reste que la
        terminaison. Dans une vraie phrase, c&apos;est l&apos;inverse — il faut d&apos;abord
        reconnaître le cas. Ici, les cas déjà de saison pour toi
        {level ? ` (niveau ${level})` : ""} se mélangent, et c&apos;est à toi de trouver lequel la
        phrase demande.
      </p>

      <CaseMixPractice userLevel={level} signedIn={signedIn} lessons={caseLessons()} />
    </div>
  );
}
