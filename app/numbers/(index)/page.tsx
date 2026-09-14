import type { Metadata } from "next";
import ModuleHub from "@/components/exercises/ModuleHub";
import { NUMBER_SKILLS } from "@/lib/numbers/exercises";
import { loadModuleProgress } from "@/lib/exercises/progress";
import { SKILL_COLORS } from "@/lib/exercises/colors";

export const metadata: Metadata = {
  title: "Les nombres en russe : compter et accorder le nom",
  description:
    "Compter en russe, et surtout accorder ce qui suit : 1 appelle le nominatif, 2 à 4 le " +
    "génitif singulier, 5 et plus le génitif pluriel. Avec l'heure et les dates.",
  alternates: { canonical: "/numbers" },
  openGraph: {
    type: "website",
    url: "/numbers",
    title: "Les nombres en russe : compter et accorder le nom",
    description: "La règle d'accord après un chiffre, l'heure, les dates et les ordinaux.",
  },
};

/** Les trois zones d'accord, montrées avant d'être expliquées. */
const ZONES = [
  { number: "1, 21, 31…", form: "nominatif singulier", example: "два́дцать оди́н дом" },
  { number: "2, 3, 4, 22…", form: "génitif singulier", example: "два́дцать два до́ма" },
  { number: "5 à 20, 25…", form: "génitif pluriel", example: "два́дцать пять домо́в" },
  { number: "11, 12, 13, 14", form: "génitif pluriel", example: "оди́ннадцать домо́в" },
];

export default async function NumbersHub() {
  const progress = await loadModuleProgress("numbers");

  return (
    <ModuleHub
      labelRu="Числительные"
      title="Les nombres en russe"
      intro={
        <>
          Compter en russe, ce n&apos;est pas apprendre des nombres : c&apos;est apprendre ce
          qu&apos;ils font au mot suivant. Le même nom prend trois formes selon le{" "}
          <span className="text-text">dernier chiffre</span> du nombre qui le précède. Et
          l&apos;heure se compte à l&apos;intérieur de l&apos;heure en cours, ce qui décale d&apos;un
          cran tous les réflexes français.
        </>
      }
      skills={NUMBER_SKILLS}
      basePath="/numbers"
      colors={SKILL_COLORS.numbers}
      progress={progress}
      lesson={{ href: "/cours/accord-apres-les-nombres", label: "Lire la leçon d'abord" }}
    >
      <div className="mb-7 sm:mb-10 overflow-hidden overflow-x-auto rounded-[20px] border border-border">
        <table className="w-full border-collapse font-display text-sm">
          <thead>
            <tr className="border-b border-border bg-bg3">
              <th className="whitespace-nowrap px-4 py-3 text-left font-semibold uppercase tracking-wide text-muted">
                Le nombre finit par
              </th>
              <th className="whitespace-nowrap px-4 py-3 text-left font-semibold uppercase tracking-wide text-muted">
                Le nom se met au
              </th>
              <th className="whitespace-nowrap px-4 py-3 text-left font-semibold uppercase tracking-wide text-muted">
                Exemple
              </th>
            </tr>
          </thead>
          <tbody className="bg-bg2">
            {ZONES.map((zone) => (
              <tr key={zone.number} className="border-b border-border last:border-0">
                <td className="whitespace-nowrap px-4 py-3 font-bold">{zone.number}</td>
                <td className="whitespace-nowrap px-4 py-3 text-muted">{zone.form}</td>
                <td className="whitespace-nowrap px-4 py-3 text-accent2">{zone.example}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ModuleHub>
  );
}
