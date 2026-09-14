import type { Metadata } from "next";
import ModuleHub from "@/components/exercises/ModuleHub";
import { CONJUGATION_SKILLS } from "@/lib/conjugation/exercises";
import { VERBS } from "@/lib/conjugation/verbs";
import { loadModuleProgress } from "@/lib/exercises/progress";
import { SKILL_COLORS } from "@/lib/exercises/colors";

export const metadata: Metadata = {
  title: "Conjugaison russe : présent, passé, futur et les deux groupes",
  description:
    "Conjuguer un verbe russe au présent, au passé et au futur : les deux groupes, la voyelle " +
    "qui les sépare et les irréguliers courants. Tableaux complets.",
  alternates: { canonical: "/conjugation" },
  openGraph: {
    type: "website",
    url: "/conjugation",
    title: "Conjugaison russe : présent, passé, futur et les deux groupes",
    description: "Présent, passé, futur — et la voyelle qui sépare les deux groupes.",
  },
};

/** Les deux modèles côte à côte : c'est la voyelle qui les sépare. */
const SHOWCASE = [
  { person: "я", first: "чита́ю", second: "говорю́" },
  { person: "ты", first: "чита́ешь", second: "говори́шь" },
  { person: "он / она́", first: "чита́ет", second: "говори́т" },
  { person: "мы", first: "чита́ем", second: "говори́м" },
  { person: "вы", first: "чита́ете", second: "говори́те" },
  { person: "они́", first: "чита́ют", second: "говоря́т" },
];

export default async function ConjugationHub() {
  const progress = await loadModuleProgress("conjugation");

  return (
    <ModuleHub
      labelRu="Спряжение глаголов"
      title="La conjugaison russe"
      intro={
        <>
          Le russe n&apos;a que deux conjugaisons et trois temps — beaucoup moins que le français.
          La difficulté est ailleurs : l&apos;infinitif ne dit pas à quelle conjugaison le verbe
          appartient (<span className="text-text">чита́ть</span> fait чита́ю mais{" "}
          <span className="text-text">писа́ть</span> fait пишу́), une consonne change parfois dans
          le radical, et l&apos;accent se déplace sans prévenir. {VERBS.length} verbes courants,
          leurs formes vérifiées une par une.
        </>
      }
      skills={CONJUGATION_SKILLS}
      basePath="/conjugation"
      colors={SKILL_COLORS.conjugation}
      progress={progress}
      lesson={{ href: "/cours/present-premiere-conjugaison", label: "Lire la leçon d'abord" }}
    >
      <div className="mb-7 sm:mb-10 overflow-hidden overflow-x-auto rounded-[20px] border border-border">
        <table className="w-full border-collapse font-display text-sm">
          <thead>
            <tr className="border-b border-border bg-bg3">
              <th className="whitespace-nowrap px-4 py-3 text-left font-semibold uppercase tracking-wide text-muted">
                Personne
              </th>
              <th className="whitespace-nowrap px-4 py-3 text-left font-semibold uppercase tracking-wide text-muted">
                1ʳᵉ conjugaison · чита́ть
              </th>
              <th className="whitespace-nowrap px-4 py-3 text-left font-semibold uppercase tracking-wide text-muted">
                2ᵉ conjugaison · говори́ть
              </th>
            </tr>
          </thead>
          <tbody className="bg-bg2">
            {SHOWCASE.map((row) => (
              <tr key={row.person} className="border-b border-border last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-muted">{row.person}</td>
                <td className="whitespace-nowrap px-4 py-3 font-bold">{row.first}</td>
                <td className="whitespace-nowrap px-4 py-3 font-bold text-accent2">{row.second}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ModuleHub>
  );
}
