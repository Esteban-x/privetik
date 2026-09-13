import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { READING_TEXTS, getReadingText } from "@/lib/reading/texts";
import CaseReader from "@/components/exercises/CaseReader";

export function generateStaticParams() {
  return READING_TEXTS.map((t) => ({ textId: t.id }));
}

/**
 * Le titre de l'onglet, pris au texte lu.
 *
 * SANS LUI, LA PAGE PORTAIT CELUI DE L'ACCUEIL : le layout racine définit un
 * `title.default`, que Next donne à toute page qui n'en déclare pas. Les
 * textes s'ouvrent souvent à plusieurs, et ils affichaient tous le même
 * onglet — celui de l'accueil.
 *
 * Sans « — Privetik » : le gabarit du layout l'ajoute.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ textId: string }>;
}): Promise<Metadata> {
  const { textId } = await params;
  const text = getReadingText(textId);
  return { title: text ? text.title : "Texte introuvable" };
}

export default async function ReadingTextPage({
  params,
}: {
  params: Promise<{ textId: string }>;
}) {
  const { textId } = await params;
  const text = getReadingText(textId);
  if (!text) notFound();

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 sm:py-16">
      <Link
        href="/reading"
        className="mb-6 inline-block font-display text-xs font-semibold uppercase tracking-wide text-muted hover:text-accent-ink"
      >
        ← Tous les textes
      </Link>

      <div className="mb-8 flex items-center gap-3">
        <span className="rounded-full border border-border px-2.5 py-0.5 font-display text-xs font-semibold text-muted">
          {text.level}
        </span>
        <h1 className="font-display text-3xl font-extrabold sm:text-4xl tracking-tight">{text.title}</h1>
      </div>

      <CaseReader text={text} />
    </div>
  );
}
