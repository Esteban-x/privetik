import VocabularyWorkspace from "@/components/vocabulary/VocabularyWorkspace";
import VocabularyPreview from "@/components/vocabulary/VocabularyPreview";
import { isUuid } from "@/lib/api/validate";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export const metadata = {
  title: "Vocabulaire russe : listes et répétition espacée",
  description:
    "Tes listes de mots russes, quatre modes de révision et une répétition espacée qui décide " +
    "quand te remontrer chaque mot. À essayer sans compte.",
  // Voir la note équivalente dans app/reading/page.tsx : page publique,
  // donc adresse canonique obligatoire (`npm run check:seo`).
  alternates: { canonical: "/vocabulary" },
  openGraph: {
    type: "website",
    url: "/vocabulary",
    title: "Vocabulaire russe : listes et répétition espacée",
    description:
      "Cartes, QCM, frappe et prononciation sur tes propres listes, avec une répétition " +
      "espacée qui décide seule de ce qui revient aujourd'hui.",
  },
};

// `?list=` ouvre directement une liste : c'est ce que /vocabulary/lists/[id]
// faisait avec une page entière, et ce qu'un lien partagé doit continuer de
// pouvoir viser.
export default async function VocabularyPage({
  searchParams,
}: {
  searchParams: Promise<{ list?: string }>;
}) {
  // Même partage qu'en lecture : l'espace personnel pour un abonné, une
  // démonstration pour un visiteur — voir app/reading/page.tsx.
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return <VocabularyPreview />;
  }

  const { list } = await searchParams;
  return <VocabularyWorkspace initialListId={list && isUuid(list) ? list : undefined} />;
}
