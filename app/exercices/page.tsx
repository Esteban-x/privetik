import Link from "next/link";
import SectionLabel from "@/components/ui/SectionLabel";
import ExerciseExplorer, { type ModuleCard } from "@/components/exercises/ExerciseExplorer";
import { EXERCISE_MODULES, FAMILY_ORDER, moduleLevels, TOTAL_SKILLS } from "@/lib/exercises/catalog";
import { loadAllProgress } from "@/lib/exercises/progress";

/**
 * DEPUIS QUE LA PAGE EST PUBLIQUE (voir proxy.ts), elle est indexable — et
 * une page indexable sans adresse canonique hérite de celle du layout, donc
 * se déclare comme un double de l'accueil. `npm run check:seo` refuse ce
 * cas, à raison.
 *
 * Le titre porte les chiffres parce que c'est ce que la page prouve : huit
 * modules, du déchiffrage au participe. C'est aussi ce qu'un visiteur venu
 * de la barre de navigation vient vérifier.
 */
export const metadata = {
  title: "Exercices de russe : 8 modules corrigés, de A0 à C1",
  description:
    "Déclinaison, conjugaison, aspect, verbes de mouvement, participes, nombres : huit modules corrigés à la règle, avec l'erreur expliquée à chaque fois.",
  alternates: { canonical: "/exercices" },
  openGraph: {
    type: "website",
    url: "/exercices",
    title: "Exercices de russe : 8 modules corrigés, de A0 à C1",
    description:
      "Déclinaison, aspect, verbes de mouvement, participes, alphabet, nombres, conjugaison : " +
      "chaque exercice corrige, explique l'erreur et renvoie à la leçon qui va avec.",
  },
};

/**
 * L'accueil des exercices.
 *
 * Le menu déroulant de la barre suffisait tant qu'il y avait cinq modules.
 * Avec huit, et des familles distinctes, il fallait une page : celle-ci
 * montre tout, avec la progression de chacun, et laisse entrer directement
 * dans une compétence précise.
 */
export default async function ExercisesPage() {
  const progress = await loadAllProgress();

  const modules: ModuleCard[] = EXERCISE_MODULES.map((entry) => {
    const stats = progress[entry.id] ?? {};
    let attempts = 0;
    let correct = 0;
    for (const skill of entry.skills) {
      attempts += stats[skill.id]?.attempts ?? 0;
      correct += stats[skill.id]?.correct ?? 0;
    }
    return {
      id: entry.id,
      href: entry.href,
      title: entry.title,
      titleRu: entry.titleRu,
      blurb: entry.blurb,
      family: entry.family,
      color: entry.color,
      levels: moduleLevels(entry),
      skills: entry.skills,
      lesson: entry.lesson,
      attempts,
      correct,
    };
  });

  const worked = modules.filter((m) => m.attempts > 0).length;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 sm:py-12">
      <div className="mb-8">
        <SectionLabel>Упражнения</SectionLabel>
        <h1 className="mb-3 font-display text-3xl font-extrabold sm:text-4xl tracking-tight">Exercices</h1>
        <p className="max-w-2xl font-display leading-relaxed text-muted">
          Tout ce qui se pratique, au même endroit. Chaque exercice corrige, explique l&apos;erreur
          et retient ta précision ; chacun renvoie à la leçon qui lui correspond. Commence par ce qui
          bloque — la lecture, un cas, l&apos;aspect — plutôt que par le début.
        </p>
      </div>

      <div className="mb-8 flex flex-wrap gap-x-8 gap-y-3">
        <Stat value={String(EXERCISE_MODULES.length)} label="modules" />
        <Stat value={String(TOTAL_SKILLS)} label="exercices" />
        <Stat value="A0 → C1" label="du déchiffrage au participe" />
        {worked > 0 && <Stat value={`${worked}/${EXERCISE_MODULES.length}`} label="déjà travaillés" />}
      </div>

      {/* Hors catalogue : ni banque ni compétences, des phrases entières
          corrigées par le serveur — voir lib/translation/items.ts. */}
      <Link
        href="/traduction"
        className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-[20px] surface-interactive p-5 hover:-translate-y-0.5"
      >
        <div className="min-w-0">
          <p className="font-display text-base font-bold">Traduire des phrases entières</p>
          <p className="mt-0.5 max-w-2xl font-display text-sm leading-snug text-muted">
            Du français vers le russe : ce que les modules font travailler séparément, réuni dans une phrase —
            comparée à la référence, puis relue par l&apos;IA quand tu la dis autrement.
          </p>
        </div>
        <span className="shrink-0 font-display text-sm font-semibold text-accent-ink">Traduire →</span>
      </Link>

      <ExerciseExplorer modules={modules} families={FAMILY_ORDER} />
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-display text-2xl font-extrabold tracking-tight">{value}</p>
      <p className="font-display text-xs text-muted">{label}</p>
    </div>
  );
}
