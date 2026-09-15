import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/layout/Logo";
import SectionLabel from "@/components/ui/SectionLabel";
import Spotlight from "@/components/ui/Spotlight";
import AlphabetBand from "@/components/marketing/AlphabetBand";
import FeatureShowcase from "@/components/marketing/FeatureShowcase";
import { CrownIcon } from "@/components/ui/CrownIcon";
import {
  ArrowRightIcon,
  BookIcon,
  CheckIcon,
  FlameIcon,
  SpeakerIcon,
  TargetIcon,
  TextIcon,
} from "@/components/ui/icons";
import { getNoun, NOUNS } from "@/lib/grammar/nouns-data";
import { declineNoun } from "@/lib/grammar/decline";
import { LESSONS, TOTAL_LESSONS, TOTAL_MINUTES, UNITS } from "@/lib/courses/catalog";
import { TOTAL_SKILLS } from "@/lib/exercises/catalog";
import { PRICE_LABEL, PRICE_PER_DAY } from "@/lib/billing/price";
import { CEFR_LEVELS } from "@/lib/supabase/types";
import JsonLd from "@/components/seo/JsonLd";
import { course, graph, organization, website } from "@/lib/seo/structured-data";

/**
 * La page d'accueil, et donc la page de conversion.
 *
 * UNE PROMESSE QU'ON COMPREND EN TROIS SECONDES. L'accroche disait « pour de
 * vrai, cas après cas » : juste, mais elle parlait à quelqu'un qui sait déjà
 * ce qu'est un cas. Celle-ci dit ce que cherche celui qui arrive — apprendre
 * le russe en entier, dans l'ordre, sans se perdre — et le reste de la page
 * le prouve dans le même ordre : ce que fait l'app (la vitrine), comment on
 * progresse (la méthode), jusqu'où (le programme), pourquoi ici (les
 * différences), combien (les tarifs), et ce qui retient encore (les
 * questions).
 *
 * MONTRER PLUTÔT QUE DÉCRIRE. Un seul exemple de génitif résumait l'app à une
 * table de déclinaison. La vitrine en fait défiler cinq écrans : les cas,
 * les textes à soi, la voix, les verbes, le parcours.
 *
 * DES CHIFFRES CALCULÉS, JAMAIS ÉCRITS EN DUR. Leçons, heures, exercices,
 * noms vérifiés, niveaux et prix sortent du contenu réel : une page de vente
 * dont les chiffres se périment toute seule ment au bout de trois mois. Et
 * pas de témoignage ni de note inventés — rien sur cette page n'est à croire
 * sur parole.
 *
 * PAS DE VIDÉO. Le lecteur restait une affiche au bouton désactivé tant
 * qu'aucun fichier n'existait : un appel à l'action mort au milieu de la
 * page. Le composant est gardé ; il reviendra avec une vidéo.
 */

/**
 * L'accueil ne redéfinit ni titre ni description : ceux du layout sont
 * écrits POUR lui, et les répéter ici créerait deux endroits à corriger le
 * jour où l'accroche change.
 *
 * Il déclare en revanche sa propre adresse canonique. Elle venait du layout,
 * ce qui marchait par accident : la même déclaration descendait aussi dans
 * toutes les autres pages, à qui elle disait d'être des doubles de
 * l'accueil. Ici, elle ne parle que de l'accueil, et elle est vraie.
 */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/** Les quatorze unités, en trois étapes : ce qu'on construit, dans l'ordre. */
const STAGES = [
  {
    from: 0,
    to: 4,
    step: "Étape 1",
    title: "Les fondations",
    body: "Lire le cyrillique, prononcer juste, former tes premières phrases, puis découvrir les six cas et l'adjectif.",
  },
  {
    from: 4,
    to: 9,
    step: "Étape 2",
    title: "La grammaire qui fait la différence",
    body: "Pronoms, conjugaison, aspect, verbes de mouvement, participes : là où les autres méthodes s'arrêtent.",
  },
  {
    from: 9,
    to: 14,
    step: "Étape 3",
    title: "Vers une langue naturelle",
    body: "Nombres et dates, prépositions, construction de la phrase, formation des mots et registres de la langue vivante.",
  },
] as const;

const byLevel = (a: string, b: string) =>
  CEFR_LEVELS.indexOf(a as (typeof CEFR_LEVELS)[number]) -
  CEFR_LEVELS.indexOf(b as (typeof CEFR_LEVELS)[number]);

export default function Home() {
  const demoNoun = getNoun("kniga") ?? NOUNS[0];
  const genitiveForm = declineNoun(demoNoun, "genitive").form;

  // Les niveaux réellement couverts, lus dans le catalogue plutôt qu'écrits
  // en dur : le jour où une unité C2 disparaît, la donnée structurée suit.
  const levels = [...new Set(LESSONS.map(({ lesson }) => lesson.level))].sort(byLevel);
  const hours = Math.round(TOTAL_MINUTES / 60);
  const averageMinutes = Math.round(TOTAL_MINUTES / TOTAL_LESSONS);

  const casesUnit = UNITS.find((unit) => unit.slug === "les-six-cas") ?? UNITS[0];
  const showcase = {
    genitiveForm,
    totalLessons: TOTAL_LESSONS,
    unitNumber: UNITS.indexOf(casesUnit) + 1,
    unitTitle: casesUnit.title,
    unitLessonCount: casesUnit.lessons.length,
    lessons: casesUnit.lessons.map((lesson) => ({ title: lesson.title, minutes: lesson.minutes })),
  };

  // Le nombre de leçons, pas une fourchette de niveaux : chaque unité mêle
  // des leçons de plusieurs niveaux, et « Étape 1 · A0 → B2 » aurait promis
  // du B2 dans les fondations.
  const stages = STAGES.map((stage) => {
    const units = UNITS.slice(stage.from, stage.to);
    return { ...stage, units, lessonCount: units.reduce((sum, unit) => sum + unit.lessons.length, 0) };
  });

  const stats = [
    { value: `${TOTAL_LESSONS}`, label: "leçons structurées" },
    { value: `${hours} h`, label: "de cours détaillés" },
    { value: `${TOTAL_SKILLS}`, label: "types d'exercices corrigés" },
    { value: `${NOUNS.length}`, label: "noms relus un par un" },
  ];

  const faqs = [
    {
      q: "Je pars de zéro : je ne sais même pas lire le cyrillique.",
      a: "C'est exactement par là que commence le parcours. La première unité t'apprend l'alphabet, les sons et l'accent tonique, avec des exercices de lecture et de dictée : tu lis tes premiers mots avant d'aborder la grammaire.",
    },
    {
      q: "Est-ce vraiment gratuit ?",
      a: `Oui. Les ${TOTAL_LESSONS} leçons, le test de niveau et des exercices chaque jour sont gratuits, sans carte bancaire. Pro lève les compteurs quotidiens et ajoute ce qui est rédigé pour toi : textes, fiches de mots, exercices sur mesure.`,
    },
    {
      q: "Jusqu'à quel niveau peut-on aller ?",
      a: `Le programme va du tout premier mot jusqu'aux participes, à la formation des mots et aux registres de la langue écrite : ses leçons couvrent les niveaux ${levels[0]} à ${levels[levels.length - 1]} du cadre européen.`,
    },
    {
      q: "Combien de temps faut-il y consacrer ?",
      a: `Une leçon se lit en ${averageMinutes} minutes en moyenne, et une série d'exercices compte dix questions. Un quart d'heure par jour suffit pour avancer régulièrement.`,
    },
    {
      q: "Puis-je résilier Pro quand je veux ?",
      a: "Oui, en un clic depuis ton compte. L'accès reste ouvert jusqu'à la fin du mois déjà payé.",
    },
  ];

  return (
    <div className="overflow-x-clip">
      {/* Ce que les moteurs lisent : l'éditeur, le site, et surtout le fait
          que ceci EST un cours de russe — pas une page qui en parle. */}
      <JsonLd data={graph(organization(), website(), course({ lessons: TOTAL_LESSONS, levels }))} />

      {/* ════════ HÉRO ════════ */}
      <section className="relative">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div
            className="glow -top-40 left-[4%] h-[520px] w-[520px]"
            style={{ background: "color-mix(in oklab, var(--flag-blue) 22%, transparent)" }}
          />
          <div
            className="glow -top-10 right-[2%] h-[420px] w-[420px]"
            style={{ background: "color-mix(in oklab, var(--flag-red) 12%, transparent)" }}
          />
        </div>

        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 pb-12 pt-10 sm:pb-16 sm:pt-16 lg:grid-cols-[1.02fr_1fr] lg:gap-14 lg:pb-20 lg:pt-20">
          <div>
            <div className="surface mb-6 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
              <span className="font-display text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                Méthode complète · du cyrillique au russe littéraire
              </span>
            </div>

            {/* « Apprendre le russe » reste en tête du H1 : c'est ce que les
                gens tapent, et le signal le plus fort de la page après le
                titre. La promesse suit — tout, et dans l'ordre. */}
            <h1 className="font-display text-[44px] font-extrabold leading-[1.04] tracking-tight text-balance sm:text-6xl lg:text-[66px]">
              Apprendre le russe <span className="text-flag">de A à Z</span>, étape par étape.
            </h1>

            <p className="mt-6 max-w-xl font-display text-lg leading-relaxed text-muted">
              Un parcours structuré de {TOTAL_LESSONS} leçons, de l&apos;alphabet aux textes
              littéraires. Chaque règle expliquée simplement, chaque réponse corrigée, et chaque
              erreur reliée à la leçon qui l&apos;explique.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="btn btn-primary btn-sheen rounded-xl px-7 py-4 font-display text-[15px] font-bold"
              >
                Commencer gratuitement
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
              <Link
                href="/cours"
                className="btn btn-outline rounded-xl px-7 py-4 font-display text-[15px] font-semibold text-text"
              >
                Voir le programme
              </Link>
            </div>

            {/* Ce qui lève les dernières objections, lu juste avant de
                cliquer. « Exercices en accès libre » n'est plus écrit : la
                formule découverte les compte, et cette ligne ne peut pas
                promettre ce que le 21e exercice refusera. */}
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 font-display text-[13px] text-muted">
              {["Gratuit pour commencer", "Sans carte bancaire", `Les ${TOTAL_LESSONS} leçons en accès libre`].map(
                (item) => (
                  <li key={item} className="inline-flex items-center gap-1.5">
                    <CheckIcon className="h-3.5 w-3.5 shrink-0 text-success" />
                    {item}
                  </li>
                ),
              )}
            </ul>
          </div>

          <div className="relative mx-auto w-full max-w-[500px] lg:max-w-none">
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <span className="animate-float absolute -left-8 -top-10 select-none font-display text-[92px] font-extrabold leading-none text-accent2 opacity-[0.1]">
                Ж
              </span>
              <span className="animate-float-slow absolute -right-6 bottom-16 select-none font-display text-[74px] font-extrabold leading-none text-accent-ink opacity-[0.1] [animation-delay:1s]">
                Я
              </span>
            </div>
            <FeatureShowcase data={showcase} />
          </div>
        </div>

        {/* Des preuves qu'on peut vérifier, pas des superlatifs. */}
        <div className="mx-auto max-w-6xl px-6 pb-4">
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[20px] border border-border bg-border sm:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="flex flex-col-reverse justify-end bg-bg px-5 py-5 sm:px-6 sm:py-6">
                <dt className="mt-1 font-display text-[13px] leading-snug text-muted">{stat.label}</dt>
                <dd className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <AlphabetBand />

      {/* ════════ LA MÉTHODE ════════ */}
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-6 sm:pb-24">
        <div className="mx-auto max-w-2xl text-center">
          <SectionLabel>La méthode</SectionLabel>
          <h2 className="font-display text-4xl font-extrabold leading-tight tracking-tight text-balance sm:text-5xl">
            Comprendre, pratiquer, retenir
          </h2>
          <p className="mt-4 font-display text-lg leading-relaxed text-muted">
            Chaque notion suit le même chemin, de la première lecture au réflexe.
          </p>
        </div>

        <ol className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">
          <Step
            number="01"
            icon={<BookIcon className="h-5 w-5" />}
            title="Comprends la règle"
            body={`Une leçon de ${averageMinutes} minutes en moyenne : la règle en clair, son tableau, des exemples traduits et le piège où tombent les francophones.`}
          />
          <Step
            number="02"
            icon={<TargetIcon className="h-5 w-5" />}
            title="Pratique aussitôt"
            body="Des exercices sur exactement ce que tu viens de lire. Chaque réponse est corrigée, et une erreur te renvoie à la leçon qui l'explique."
          />
          <Step
            number="03"
            icon={<FlameIcon className="h-5 w-5" />}
            title="Retiens pour de bon"
            body="Tes erreurs reviennent le lendemain, tes mots au moment où tu allais les oublier. C'est ainsi qu'une règle devient un réflexe."
          />
        </ol>
      </section>

      {/* ════════ LE PROGRAMME ════════ */}
      <section className="border-y border-border bg-bg2/60 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-2xl">
              <SectionLabel>Le programme</SectionLabel>
              <h2 className="font-display text-4xl font-extrabold leading-tight tracking-tight text-balance sm:text-5xl">
                De la première lettre au russe littéraire
              </h2>
              <p className="mt-4 font-display text-lg leading-relaxed text-muted">
                {UNITS.length} unités et {TOTAL_LESSONS} leçons, dans l&apos;ordre où elles
                s&apos;appuient les unes sur les autres. Tu sais toujours ce que tu as acquis, et ce
                qui vient ensuite.
              </p>
            </div>
            <Link
              href="/cours"
              className="btn btn-outline shrink-0 rounded-xl px-6 py-3.5 font-display text-sm font-semibold text-text"
            >
              Explorer les leçons
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-5 lg:grid-cols-3">
            {stages.map((stage) => (
              <div key={stage.step} className="surface flex flex-col rounded-[22px] p-7">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-display text-xs font-bold uppercase tracking-[0.08em] text-accent2">
                    {stage.step}
                  </span>
                  <span className="rounded-full border border-border px-2.5 py-0.5 font-display text-xs font-semibold text-muted">
                    {stage.lessonCount} leçons
                  </span>
                </div>
                <h3 className="mt-3 font-display text-xl font-bold">{stage.title}</h3>
                <p className="mt-2 font-display text-[15px] leading-relaxed text-muted">{stage.body}</p>
                <ul className="mt-6 space-y-2.5 border-t border-border pt-5">
                  {stage.units.map((unit) => (
                    <li key={unit.slug} className="flex items-center gap-3">
                      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: unit.color }} />
                      <span className="min-w-0 flex-1 font-display text-sm font-semibold">{unit.title}</span>
                      <span className="shrink-0 font-display text-xs text-muted">{unit.lessons.length} leçons</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════ POURQUOI ICI ════════ */}
      <section className="mx-auto max-w-6xl px-6 py-16 sm:py-24">
        <div className="max-w-2xl">
          <SectionLabel>Pourquoi Privetik</SectionLabel>
          <h2 className="font-display text-4xl font-extrabold leading-tight tracking-tight text-balance sm:text-5xl">
            Ce que les applications généralistes laissent de côté
          </h2>
          <p className="mt-4 font-display text-lg leading-relaxed text-muted">
            On n&apos;abandonne pas le russe sur le vocabulaire, mais sur les cas, l&apos;aspect et les
            verbes de mouvement. C&apos;est là que Privetik met tout son travail.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2">
          <Strength
            icon={<CheckIcon className="h-5 w-5" />}
            title="Vérifié, jamais improvisé"
            body={`Chaque terminaison est calculée à partir de ${NOUNS.length} noms relus un par un, puis recontrôlée à chaque mise en ligne. L'IA rédige des exemples — jamais la terminaison attendue.`}
          />
          <Strength
            icon={<TargetIcon className="h-5 w-5" />}
            title="La grammaire qui bloque, enfin travaillée"
            body="Les six cas déclencheur par déclencheur, l'aspect sur une frise, les verbes de mouvement par schéma — sur des phrases qui veulent dire quelque chose."
          />
          <Strength
            icon={<SpeakerIcon className="h-5 w-5" />}
            title="Le russe à l'oreille, dès le premier jour"
            body="Chaque mot, et même chaque phrase à trou, lu par une voix russe naturelle — le français par une voix française. Tu prends le bon accent tout de suite."
          />
          <Strength
            icon={<TextIcon className="h-5 w-5" />}
            title="Tes propres textes, annotés"
            body="Écris en français ou colle un message, un article, une chanson : il est traduit, chaque mot décliné dit son cas, et chaque phrase peut s'expliquer."
          />
        </div>
      </section>

      {/* ════════ TARIFS ════════ */}
      <section className="border-y border-border bg-bg2/60 py-16 sm:py-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="mx-auto max-w-3xl text-center">
            <SectionLabel>Tarifs</SectionLabel>
            <h2 className="font-display text-4xl font-extrabold leading-tight tracking-tight text-balance sm:text-5xl">
              Commence gratuitement, passe à Pro quand tu accélères
            </h2>
            <p className="mt-4 font-display text-lg leading-relaxed text-muted">
              Aucune carte bancaire pour commencer. Pro est sans engagement.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 items-stretch gap-5 md:grid-cols-2">
            <div className="surface flex flex-col rounded-[22px] p-7 sm:p-8">
              <h3 className="font-display text-lg font-bold">Découverte</h3>
              <p className="mt-1 font-display text-sm text-muted">Pour découvrir la méthode.</p>
              <p className="mt-5 font-display text-4xl font-extrabold tracking-tight">
                0 €
                <span className="ml-1.5 font-display text-sm font-semibold text-muted">pour toujours</span>
              </p>
              <div className="hairline my-6" />
              <ul className="space-y-3">
                <PlanItem>Les {TOTAL_LESSONS} leçons du cours, en entier</PlanItem>
                <PlanItem>Des exercices et des révisions chaque jour</PlanItem>
                <PlanItem>Test de niveau et suivi de progression</PlanItem>
                <PlanItem>Prononciation par une voix russe naturelle</PlanItem>
              </ul>
              <Link
                href="/signup"
                className="btn btn-outline mt-8 rounded-xl px-6 py-3.5 font-display text-[15px] font-semibold text-text"
              >
                Créer un compte gratuit
              </Link>
            </div>

            <Spotlight className="pro-surface gradient-border flex flex-col rounded-[22px] p-7 sm:p-8">
              <div className="flex items-start gap-3">
                <span aria-hidden className="pro-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
                  <CrownIcon size={22} />
                </span>
                <div>
                  <h3 className="font-display text-lg font-bold">Privetik Pro</h3>
                  <p className="font-display text-sm text-muted">Pour apprendre le russe sérieusement.</p>
                </div>
              </div>
              <p className="mt-5 font-display text-4xl font-extrabold tracking-tight">
                {PRICE_LABEL}
                <span className="ml-1.5 font-display text-sm font-semibold text-muted">par mois</span>
              </p>
              <p className="mt-1 font-display text-[13px] text-muted">
                soit {PRICE_PER_DAY} par jour · résiliable en un clic
              </p>
              <div className="hairline my-6" />
              <ul className="space-y-3">
                <PlanItem strong>Tout ce que contient Découverte</PlanItem>
                <PlanItem strong>Exercices et révisions sans compteur quotidien</PlanItem>
                <PlanItem strong>Tes textes annotés et expliqués, autant que tu en lis</PlanItem>
                <PlanItem strong>Fiches de mots et exercices rédigés sur mesure</PlanItem>
              </ul>
              <Link
                href="/premium"
                className="btn btn-primary btn-sheen mt-8 rounded-xl px-6 py-3.5 font-display text-[15px] font-bold"
              >
                Découvrir Pro
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </Spotlight>
          </div>
        </div>
      </section>

      {/* ════════ QUESTIONS ════════ */}
      <section className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
        <div className="text-center">
          <SectionLabel>Questions fréquentes</SectionLabel>
          <h2 className="font-display text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Avant de commencer
          </h2>
        </div>
        {/* `<details>` : ouvert au clavier, lisible sans JavaScript, et
            indexé en entier par les moteurs. */}
        <div className="mt-10 space-y-3">
          {faqs.map((item) => (
            <details key={item.q} className="group surface rounded-2xl px-5 py-4 sm:px-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-base font-semibold [&::-webkit-details-marker]:hidden">
                {item.q}
                <span
                  aria-hidden
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-muted transition-transform duration-300 group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 font-display text-[15px] leading-relaxed text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ════════ DERNIER APPEL ════════ */}
      <section className="px-6 pb-20 sm:pb-28">
        <div className="surface gradient-border relative mx-auto max-w-6xl overflow-hidden rounded-[28px] px-6 py-14 text-center sm:px-12 sm:py-20">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div
              className="glow -left-24 -top-24 h-80 w-80"
              style={{ background: "color-mix(in oklab, var(--flag-blue) 26%, transparent)" }}
            />
            <div
              className="glow -bottom-28 -right-16 h-80 w-80"
              style={{ background: "color-mix(in oklab, var(--flag-red) 16%, transparent)" }}
            />
          </div>
          <div className="relative">
            <h2 className="mx-auto max-w-3xl font-display text-4xl font-extrabold leading-tight tracking-tight text-balance sm:text-5xl">
              Ta première leçon prend {averageMinutes}&nbsp;minutes.
            </h2>
            <p className="mx-auto mt-4 max-w-xl font-display text-lg leading-relaxed text-muted">
              Crée ton compte, lis l&apos;alphabet, fais ton premier exercice : tu sauras tout de
              suite si la méthode est faite pour toi.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link
                href="/signup"
                className="btn btn-primary btn-sheen rounded-xl px-8 py-4 font-display text-base font-bold"
              >
                Commencer gratuitement
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
              <Link
                href="/cours"
                className="btn btn-outline rounded-xl px-8 py-4 font-display text-base font-semibold text-text"
              >
                Voir le programme
              </Link>
            </div>
            <p className="mt-5 font-display text-[13px] text-muted">Gratuit · Sans carte bancaire</p>
          </div>
        </div>
      </section>

      {/* ════════ PIED ════════ */}
      <footer className="border-t border-border px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Logo size={24} />
            <span className="font-display text-sm text-muted">Privetik — apprendre le russe, étape par étape.</span>
          </div>
          <div className="flex items-center gap-5 font-display text-sm text-muted">
            {/* LE SEUL LIEN VERS LES GUIDES DE TOUT LE SITE. Ils sont
                volontairement hors barre et hors bandeau — ils ne font pas
                partie du produit. Mais quatre pages qu'aucun lien ne
                désigne sont quatre pages orphelines : un moteur les trouve
                par le plan du site sans jamais comprendre qu'elles
                appartiennent à ce domaine-ci. Une ligne en pied de page
                suffit à les rattacher, et ne gêne personne. */}
            <Link href="/guides" className="transition-colors hover:text-accent-ink">
              Guides
            </Link>
            <Link href="/premium" className="transition-colors hover:text-accent-ink">
              Tarifs
            </Link>
            <span>© {new Date().getFullYear()} Privetik</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Step({
  number,
  icon,
  title,
  body,
}: {
  number: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li>
      <Spotlight className="surface h-full rounded-[22px] p-7">
        <div className="flex items-center justify-between">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/12 text-accent-ink">
            {icon}
          </span>
          <span aria-hidden className="font-display text-5xl font-extrabold leading-none tracking-tight text-muted/15">
            {number}
          </span>
        </div>
        <h3 className="mt-5 font-display text-xl font-bold">{title}</h3>
        <p className="mt-2 font-display text-[15px] leading-relaxed text-muted">{body}</p>
      </Spotlight>
    </li>
  );
}

function Strength({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <Spotlight className="surface rounded-[20px] p-7">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/12 text-accent-ink">
        {icon}
      </span>
      <h3 className="mt-4 font-display text-lg font-bold">{title}</h3>
      <p className="mt-2 font-display text-[15px] leading-relaxed text-muted">{body}</p>
    </Spotlight>
  );
}

function PlanItem({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <li className="flex items-start gap-2.5 font-display text-[15px] leading-snug">
      <CheckIcon className={`mt-0.5 h-4 w-4 shrink-0 ${strong ? "text-accent-ink" : "text-success"}`} />
      <span className={strong ? "text-text" : "text-muted"}>{children}</span>
    </li>
  );
}
