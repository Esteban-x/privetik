import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findLesson, LESSONS, neighbours } from "@/lib/courses/catalog";
import LessonBody, { sectionAnchor } from "@/components/courses/LessonBody";
import { LessonReadBadge, LessonReadToggle, ReadingProgress } from "@/components/courses/LessonTools";
import { TargetIcon } from "@/components/ui/icons";
import LessonQuiz from "@/components/courses/LessonQuiz";
import { buildLessonQuiz } from "@/lib/courses/quiz";
import { LevelChip } from "@/components/courses/CourseExplorer";
import type { Section } from "@/lib/courses/types";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumb, graph, learningResource } from "@/lib/seo/structured-data";

/** Toutes les leçons sont connues à la compilation : autant les prérendre. */
export function generateStaticParams() {
  return LESSONS.map(({ lesson }) => ({ slug: lesson.slug }));
}

/**
 * Le titre d'une leçon, tel qu'un moteur l'affiche.
 *
 * « — Privetik » N'EST PLUS ÉCRIT ICI : le gabarit du layout l'ajoute. Il
 * l'était, ce qui donnait « … — Cours de russe — Privetik — Privetik ».
 *
 * « cours de russe » est accolé au titre parce que les titres de leçon sont
 * grammaticaux (« Le génitif de négation », « L'aspect au passé ») et ne
 * disent nulle part de quelle langue il s'agit — or c'est le mot que les
 * gens tapent.
 *
 * SAUF QUAND LA LEÇON DIT ELLE-MÊME COMMENT ELLE VEUT ÊTRE TITRÉE. Le suffixe
 * automatique suppose que le titre de la leçon est aussi le terme cherché.
 * C'est vrai presque partout, et faux pour une poignée de leçons dont le nom
 * savant n'est pas le nom courant : `lesson.seo` est là pour ces cas-là, et
 * il remplace le titre au lieu de s'y ajouter — sans quoi on obtiendrait le
 * mot « russe » deux fois dans la même ligne.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const found = findLesson(slug);
  if (!found) return { title: "Leçon introuvable", robots: { index: false, follow: true } };

  const { lesson, unit } = found;
  const title = lesson.seo?.title ?? `${lesson.title} — cours de russe`;
  const description = lesson.seo?.description ?? lesson.summary;
  return {
    title,
    description,
    alternates: { canonical: `/cours/${lesson.slug}` },
    openGraph: {
      type: "article",
      url: `/cours/${lesson.slug}`,
      title,
      description,
      section: unit.title,
    },
  };
}

export default async function LessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = findLesson(slug);
  if (!found) notFound();

  const { lesson, unit } = found;
  const { previous, next } = neighbours(slug);
  // Calculé au prérendu, semé par le slug : le même quiz pour tous.
  const quiz = buildLessonQuiz(lesson, unit);
  const toc = lesson.sections
    .map((section, i) => ({ label: tocLabel(section), anchor: sectionAnchor(i) }))
    .filter((entry): entry is { label: string; anchor: string } => entry.label !== null);

  return (
    <>
      {/* Une leçon est une ressource pédagogique, pas un billet de blog :
          `LearningResource` le dit, avec sa durée et son niveau CECRL. */}
      <JsonLd
        data={graph(
          learningResource({
            slug: lesson.slug,
            title: lesson.title,
            summary: lesson.summary,
            minutes: lesson.minutes,
            level: lesson.level,
            unitTitle: unit.title,
          }),
          // Sur 127 pages profondes, c'est le fil d'Ariane qui rend le
          // résultat lisible : « Privetik › Cours › L'alphabet cyrillique »
          // au lieu d'une URL tronquée au milieu du slug.
          breadcrumb([
            { name: "Privetik", path: "/" },
            { name: "Cours de russe", path: "/cours" },
            { name: lesson.title, path: `/cours/${lesson.slug}` },
          ])
        )}
      />

      <ReadingProgress />

      <div className="mx-auto max-w-6xl px-6 py-10">
        <Link
          href="/cours"
          className="mb-8 inline-block font-display text-xs font-semibold uppercase tracking-wide text-muted transition-colors hover:text-accent-ink"
        >
          ← Tous les cours
        </Link>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_220px]">
          <article className="min-w-0">
            {/* ── En-tête de la leçon ──────────────────────────── */}
            <header className="mb-7 sm:mb-10 border-b border-border pb-8">
              <div className="mb-3 flex flex-wrap items-center gap-2.5">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: unit.color }}
                />
                <span className="font-display text-xs font-bold uppercase tracking-[0.08em] text-muted">
                  {unit.title}
                </span>
                <LevelChip level={lesson.level} />
                <span className="font-display text-xs text-muted">{lesson.minutes} min</span>
              </div>

              <h1 className="font-display text-3xl font-extrabold sm:text-4xl leading-tight tracking-tight">
                {lesson.title}
              </h1>
              <p className="mt-1.5 font-display text-lg text-accent2">{lesson.titleRu}</p>
              <p className="mt-4 max-w-2xl font-display leading-relaxed text-muted">
                {lesson.summary}
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                <LessonReadBadge slug={lesson.slug} />
                {lesson.practice?.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="btn btn-primary btn-sheen inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-display text-sm"
                  >
                    {link.label}
                    <span aria-hidden>→</span>
                  </Link>
                ))}
              </div>
            </header>

            <LessonBody sections={lesson.sections} />

            {/* ── Se tester avant de cocher ─────────────────────── */}
            {quiz.length > 0 && <LessonQuiz slug={lesson.slug} questions={quiz} />}

            {/* ── Cocher la leçon, une fois lue ────────────────── */}
            {/* EN BAS, PAS EN TÊTE. On coche une leçon après l'avoir lue : sous
                le titre, la coche se présentait avant la première ligne, et il
                fallait remonter toute la page pour la trouver une fois arrivé
                au bout. La tête garde le rappel « Leçon lue » quand elle l'est. */}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl surface px-5 py-4">
              <p className="font-display text-sm text-muted">Arrivé au bout de la leçon&nbsp;?</p>
              <LessonReadToggle slug={lesson.slug} />
            </div>

            {/* ── Aller travailler ce qu'on vient de lire ──────── */}
            {/* UN APPEL, PAS UNE NOTE DE BAS DE PAGE. C'était un encadré pâle
                aux liens discrets : on finissait la leçon sans voir qu'un
                exercice l'attendait. Pas de `.btn` pour les liens : il interdit
                le retour à la ligne, et « Exercice : ce qu'on entend vraiment »
                déborderait d'un écran de téléphone. */}
            {lesson.practice && lesson.practice.length > 0 && (
              <section
                aria-labelledby="practice-now"
                className="relative mt-6 overflow-hidden rounded-3xl border border-accent/40 bg-accent/10 px-6 py-7 sm:px-8"
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-accent/20 blur-3xl"
                />
                <div className="relative flex items-start gap-4">
                  <span
                    aria-hidden
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-float"
                    style={{ backgroundImage: "var(--grad-accent)" }}
                  >
                    <TargetIcon className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <h2 id="practice-now" className="font-display text-xl font-extrabold tracking-tight sm:text-2xl">
                      Maintenant, pratique
                    </h2>
                    <p className="mt-1 max-w-xl font-display text-sm leading-relaxed text-muted">
                      Une règle lue s&apos;oublie ; une règle appliquée vingt fois reste. Ces exercices
                      portent exactement sur ce que cette leçon vient d&apos;expliquer.
                    </p>
                  </div>
                </div>
                <div className="relative mt-5 flex flex-wrap gap-3">
                  {lesson.practice.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="inline-flex max-w-full items-center gap-2 rounded-xl px-5 py-3 font-display text-sm font-bold text-white shadow-float transition-[filter,transform] duration-200 hover:-translate-y-0.5 hover:brightness-110"
                      style={{ backgroundImage: "var(--grad-accent)" }}
                    >
                      <span className="min-w-0">{link.label}</span>
                      <span aria-hidden>→</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* ── Leçon précédente / suivante ──────────────────── */}
            <nav className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {previous ? (
                <Link
                  href={`/cours/${previous.lesson.slug}`}
                  className="group rounded-2xl surface-interactive px-5 py-4"
                >
                  <span className="block font-display text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                    ← Précédent
                  </span>
                  <span className="mt-1 block font-display text-sm font-bold transition-colors group-hover:text-accent-ink">
                    {previous.lesson.title}
                  </span>
                </Link>
              ) : (
                <span />
              )}
              {next && (
                <Link
                  href={`/cours/${next.lesson.slug}`}
                  className="group rounded-2xl surface-interactive px-5 py-4 text-right sm:col-start-2"
                >
                  <span className="block font-display text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                    Suivant →
                  </span>
                  <span className="mt-1 block font-display text-sm font-bold transition-colors group-hover:text-accent-ink">
                    {next.lesson.title}
                  </span>
                </Link>
              )}
            </nav>
          </article>

          {/* ── Sommaire ─────────────────────────────────────────── */}
          {toc.length > 1 && (
            <aside className="hidden lg:block">
              <div className="sticky top-[calc(var(--nav-h)+1.5rem)]">
                <p className="mb-3 font-display text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                  Dans cette leçon
                </p>
                <ul className="space-y-1.5 border-l border-border pl-4">
                  {toc.map((entry) => (
                    <li key={entry.anchor}>
                      <a
                        href={`#${entry.anchor}`}
                        className="block font-display text-xs leading-snug text-muted transition-colors hover:text-accent-ink"
                      >
                        {entry.label}
                      </a>
                    </li>
                  ))}
                </ul>
                {lesson.keywords.length > 0 && (
                  <div className="mt-8">
                    <p className="mb-2 font-display text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                      Mots-clés
                    </p>
                    <p className="font-display text-xs leading-relaxed text-muted/80">
                      {lesson.keywords.join(" · ")}
                    </p>
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Ce qu'un bloc affiche dans le sommaire. Les blocs sans titre ont un nom
 * fixe (« Piège », « À retenir ») ; un paragraphe d'introduction sans titre,
 * lui, n'a rien à y faire — il se lit d'office.
 */
function tocLabel(section: Section): string | null {
  if (section.title) return section.title;
  if (section.kind === "pitfall") return "Piège";
  if (section.kind === "keypoints") return "À retenir";
  return null;
}
