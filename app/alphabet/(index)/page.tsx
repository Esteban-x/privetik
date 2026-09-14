import type { Metadata } from "next";
import Link from "next/link";
import ModuleHub from "@/components/exercises/ModuleHub";
import { ALPHABET_SKILLS } from "@/lib/alphabet/exercises";
import { loadModuleProgress } from "@/lib/exercises/progress";
import { SKILL_COLORS } from "@/lib/exercises/colors";

/**
 * CETTE PAGE ET LA LEÇON NE VISENT PAS LA MÊME RECHERCHE.
 *
 * Elles portent toutes deux sur l'alphabet, et elles se seraient fait
 * concurrence si on les avait titrées pareil — deux de nos pages sur une
 * seule requête, aucune des deux ne gagne. Le partage suit l'intention :
 * /cours/alphabet-cyrillique répond à « alphabet russe prononciation »,
 * quelqu'un qui veut LIRE le tableau ; cette page-ci répond à « apprendre
 * l'alphabet russe », quelqu'un qui veut S'ENTRAÎNER. D'où « exercices »
 * dans le titre, qui est aussi ce que la page contient réellement.
 */
export const metadata: Metadata = {
  title: "Apprendre l'alphabet russe : exercices de lecture et d'écriture",
  description:
    "S'entraîner à lire les 33 lettres du cyrillique, une par une puis en mots entiers — " +
    "à commencer par les six qui ressemblent à des lettres latines et se lisent autrement.",
  alternates: { canonical: "/alphabet" },
  openGraph: {
    type: "website",
    url: "/alphabet",
    title: "Apprendre l'alphabet russe : exercices de lecture",
    description:
      "Les 33 lettres en exercices, et les six qui font toutes les erreurs de lecture des débuts.",
  },
};

/** Les six lettres qui font toutes les erreurs de lecture des débuts. */
const TRAPS = [
  { letter: "В в", eye: "b", real: "v", word: "во́дка" },
  { letter: "Н н", eye: "h", real: "n", word: "но́мер" },
  { letter: "Р р", eye: "p", real: "r", word: "Росси́я" },
  { letter: "С с", eye: "c", real: "s", word: "суп" },
  { letter: "У у", eye: "y", real: "ou", word: "у́лица" },
  { letter: "Х х", eye: "x", real: "kh", word: "хорошо́" },
];

export default async function AlphabetHub() {
  const progress = await loadModuleProgress("alphabet");

  return (
    <ModuleHub
      labelRu="Чтение и письмо"
      title="L'alphabet russe"
      intro={
        <>
          Avant toute grammaire, il faut déchiffrer. Le cyrillique s&apos;apprend en une soirée —
          sauf six lettres, qui ressemblent à des lettres latines et se lisent autrement. Ce sont
          elles qui font lire <span className="text-text">« pectopah »</span> là où il est écrit
          « restaurant », et elles reviennent dès qu&apos;on cesse d&apos;épeler pour reconnaître
          la silhouette des mots.
        </>
      }
      skills={ALPHABET_SKILLS}
      basePath="/alphabet"
      colors={SKILL_COLORS.alphabet}
      progress={progress}
      lesson={{ href: "/cours/alphabet-cyrillique", label: "Lire la leçon d'abord" }}
    >
      <div className="mb-7 sm:mb-10 overflow-hidden overflow-x-auto rounded-[20px] border border-border">
        <table className="w-full border-collapse font-display text-sm">
          <thead>
            <tr className="border-b border-border bg-bg3">
              <th className="whitespace-nowrap px-4 py-3 text-left font-semibold uppercase tracking-wide text-muted">
                Lettre
              </th>
              <th className="whitespace-nowrap px-4 py-3 text-left font-semibold uppercase tracking-wide text-muted">
                L&apos;œil lit
              </th>
              <th className="whitespace-nowrap px-4 py-3 text-left font-semibold uppercase tracking-wide text-muted">
                Il faut lire
              </th>
              <th className="whitespace-nowrap px-4 py-3 text-left font-semibold uppercase tracking-wide text-muted">
                Mot témoin
              </th>
            </tr>
          </thead>
          <tbody className="bg-bg2">
            {TRAPS.map((trap) => (
              <tr key={trap.letter} className="border-b border-border last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-lg font-bold">{trap.letter}</td>
                <td className="whitespace-nowrap px-4 py-3 text-danger line-through">{trap.eye}</td>
                <td className="whitespace-nowrap px-4 py-3 font-bold text-success">{trap.real}</td>
                <td className="whitespace-nowrap px-4 py-3 text-accent2">{trap.word}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/*
        Lire les lettres ne suffit pas à prononcer les mots : entre les deux
        il y a l'accent tonique et la réduction des voyelles, que ce module
        ne travaille pas. Le lien est là pour l'apprenant qui bute là-dessus
        — et accessoirement parce qu'un guide qu'aucune page de produit ne
        cite reste une page isolée.
      */}
      <p className="mb-7 sm:mb-10 font-display text-sm leading-relaxed text-muted">
        Savoir lire les lettres ne suffit pas encore à prononcer les mots :{" "}
        <Link
          href="/guides/prononciation-du-russe"
          className="font-semibold text-accent-ink hover:underline"
        >
          les cinq règles de la prononciation russe
        </Link>{" "}
        expliquent pourquoi « молоко » s&apos;entend « malako ».
      </p>
    </ModuleHub>
  );
}
