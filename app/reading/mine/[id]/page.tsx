import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { isUuid } from "@/lib/api/validate";
import CaseReader from "@/components/exercises/CaseReader";
import DeleteReadingTextButton from "@/components/exercises/DeleteReadingTextButton";
import type { ReadingText } from "@/lib/reading/texts";

/**
 * UN TITRE FIXE, ET NON CELUI DU TEXTE.
 *
 * Le titre réel est en base, et le nommer dans l'onglet demanderait une
 * seconde requête Supabase — `generateMetadata` s'exécute avant la page et
 * ne partage rien avec elle. Une requête de plus à chaque ouverture pour
 * nommer un onglet ne vaut pas son prix ; « Mon texte » suffit à distinguer
 * la page, ce qu'elle ne faisait pas du tout : faute de métadonnée, elle
 * portait le `title.default` du layout racine, donc le titre de l'accueil.
 *
 * Sans « — Privetik » : le gabarit du layout l'ajoute.
 */
export const metadata: Metadata = {
  title: "Mon texte",
};

export default async function MyReadingTextPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  if (!isSupabaseConfigured()) redirect("/login");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/reading/mine/${id}`);

  const { data } = await supabase
    .from("reading_texts")
    .select("id, title, title_fr, level, sentences")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!data) notFound();

  const text: ReadingText = {
    id: data.id,
    title: data.title,
    level: data.level,
    sentences: data.sentences,
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 sm:py-16">
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link
          href="/reading"
          className="inline-block font-display text-xs font-semibold uppercase tracking-wide text-muted hover:text-accent-ink"
        >
          ← Tous les textes
        </Link>
        <DeleteReadingTextButton id={text.id} />
      </div>

      <div className="mb-8">
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-border px-2.5 py-0.5 font-display text-xs font-semibold text-muted">
            {text.level}
          </span>
          <h1 className="font-display text-3xl font-extrabold sm:text-4xl tracking-tight">{text.title}</h1>
        </div>
        {data.title_fr && (
          <p className="mt-2 font-display text-sm text-muted">{data.title_fr}</p>
        )}
      </div>

      <CaseReader text={text} />
    </div>
  );
}
