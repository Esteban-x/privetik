import { notFound } from "next/navigation";
import Link from "next/link";
import { CASE_MIX_VARS } from "@/lib/grammar/case-mix-style";
// La page lit la session (niveau CEFR) : elle est rendue à la demande.
// Un generateStaticParams n'y changeait rien — le build la marquait déjà
// dynamique — il donnait juste l'illusion d'un prérendu.
import type { Metadata } from "next";
import { CASES, getCase } from "@/lib/grammar/cases";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumb, graph, grammarResource } from "@/lib/seo/structured-data";
import CaseDeclension from "@/components/exercises/CaseDeclension";
import { lessonForPractice } from "@/lib/courses/practice-lessons";
import ReferenceTable from "@/components/exercises/ReferenceTable";
import TriggerReference from "@/components/exercises/TriggerReference";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { CefrLevel } from "@/lib/supabase/types";

// `undefined` (déconnecté, ou Supabase non configuré) = pas de biais côté
// sélection de déclencheurs, comportement inchangé.
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

/** Les six pages sont connues à la compilation. */
export function generateStaticParams() {
  return CASES.map((c) => ({ caseSlug: c.id }));
}

/**
 * Le titre porte le nom français ET « russe ».
 *
 * « Génitif » seul est ambigu — le latin, l'allemand et le grec en ont un.
 * « Le génitif russe » est la requête réelle, et c'est aussi ce qui distingue
 * la page des dizaines de fiches de grammaire latine qui occupent le terme.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ caseSlug: string }>;
}): Promise<Metadata> {
  const { caseSlug } = await params;
  const caseInfo = getCase(caseSlug);
  if (!caseInfo) return { title: "Cas introuvable", robots: { index: false, follow: true } };

  // Calibré sur « prépositionnel », le plus long des six : au-delà de 70
  // signes, Google réécrit le titre lui-même et on perd la main dessus.
  const title = `Le ${caseInfo.nameFr.toLowerCase()} russe : emplois et terminaisons`;
  // Composée pour tenir sous 160 caractères quel que soit le cas : `usage`
  // fait 40 à 60 signes selon les six, et le reste est calibré sur le plus
  // long d'entre eux.
  const description =
    `${caseInfo.usage} Ses déclencheurs, ses terminaisons aux trois genres, ` +
    `et des exercices corrigés. Question : ${caseInfo.question}`;

  return {
    title,
    description,
    alternates: { canonical: `/cases/${caseInfo.id}` },
    openGraph: { type: "article", url: `/cases/${caseInfo.id}`, title, description },
  };
}

export default async function CasePracticePage({
  params,
}: {
  params: Promise<{ caseSlug: string }>;
}) {
  const { caseSlug } = await params;
  const caseInfo = getCase(caseSlug);
  if (!caseInfo) notFound();

  // Niveau CEFR de l'utilisateur : biaise le tirage des déclencheurs
  // (lib/grammar/exercise-selector.ts) vers l'essentiel pour un débutant,
  // sans jamais exclure totalement le reste.
  const { signedIn, level: userLevel } = await getViewer();

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 sm:py-16">
      <JsonLd
        data={graph(
          grammarResource({
            path: `/cases/${caseInfo.id}`,
            name: `Le ${caseInfo.nameFr.toLowerCase()} russe (${caseInfo.nameRu})`,
            description: caseInfo.usage,
            teaches: `Déclinaison russe — ${caseInfo.nameFr}`,
          }),
          breadcrumb([
            { name: "Privetik", path: "/" },
            { name: "Les cas russes", path: "/cases" },
            { name: caseInfo.nameFr, path: `/cases/${caseInfo.id}` },
          ])
        )}
      />
      <Link
        href="/cases"
        className="mb-6 inline-block font-display text-xs font-semibold uppercase tracking-wide text-muted hover:text-accent-ink"
      >
        ← Tous les cas
      </Link>

      {/* LE NOM FRANÇAIS EST PASSÉ DANS LE H1. Il vivait dans un <span>
          voisin : la page du génitif avait donc pour titre principal
          « Родительный », c'est-à-dire le seul mot que personne ne tape.
          L'arrangement visuel ne change pas — le russe reste en gros, le
          français à côté — mais les deux sont désormais dans le même
          élément, et « russe » y est écrit. */}
      <h1 className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
        <span>{caseInfo.nameRu}</span>
        <span className="font-display text-xl font-normal text-muted">
          {caseInfo.nameFr} russe
        </span>
      </h1>
      <p className="mb-7 sm:mb-10 max-w-2xl font-display leading-relaxed text-muted">{caseInfo.usage}</p>

      <CaseDeclension
        caseInfo={caseInfo}
        userLevel={userLevel}
        signedIn={signedIn}
        lesson={lessonForPractice(`/cases/${caseInfo.id}`)}
      />

      {/* Ici le cas est connu d'avance ; le mélange demande de le reconnaître.
          Un vrai bouton, aux couleurs des six cas : un lien bleu sous la carte
          d'exercice passait inaperçu. Libellé court — `.btn` ne passe pas à la
          ligne —, le détail vit dans la phrase à côté. */}
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href="/cases/melange"
          className="mix-tint btn btn-primary btn-mix btn-sheen rounded-[10px] px-5 py-2.5 font-display text-sm"
          style={CASE_MIX_VARS}
        >
          Cas mélangés →
        </Link>
        <span className="font-display text-sm text-muted">
          Reconnaître {/^[aeiouy]/.test(caseInfo.nameFr.toLowerCase()) ? "l'" : "le "}
          {caseInfo.nameFr.toLowerCase()} parmi les autres cas.
        </span>
      </div>

      <div className="mt-10 sm:mt-14">
        <TriggerReference targetCase={caseInfo.id} color={caseInfo.color} />
      </div>

      <div className="mt-10 sm:mt-14">
        <ReferenceTable targetCase={caseInfo.id} />
      </div>
    </div>
  );
}
