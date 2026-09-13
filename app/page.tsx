import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/layout/Logo";
import SectionLabel from "@/components/ui/SectionLabel";
import Spotlight from "@/components/ui/Spotlight";
import AlphabetBand from "@/components/marketing/AlphabetBand";
import VideoPlayer from "@/components/marketing/VideoPlayer";
import { BookIcon, CheckIcon, SpeakerIcon } from "@/components/ui/icons";
import { CASES } from "@/lib/grammar/cases";
import { getNoun, NOUNS } from "@/lib/grammar/nouns-data";
import { declineNoun } from "@/lib/grammar/decline";
import { LESSONS, TOTAL_LESSONS, UNITS } from "@/lib/courses/catalog";
import JsonLd from "@/components/seo/JsonLd";
import { course, graph, organization, website } from "@/lib/seo/structured-data";

/**
 * La page d'accueil, et donc la page de conversion.
 *
 * CE QU'ELLE DOIT PROUVER, dans cet ordre : que l'app traite la partie du
 * russe qui fait abandonner (les cas, l'aspect, le mouvement), que ce
 * qu'elle enseigne est VÉRIFIÉ et non généré au hasard, et qu'on peut
 * l'essayer sans payer. Le reste — le nombre de leçons, les modules — vient
 * après, parce que personne n'achète un catalogue.
 *
 * Les chiffres affichés sont CALCULÉS depuis le contenu réel (catalogue des
 * cours, banque de noms) et non écrits en dur : une page de vente dont les
 * chiffres se périment toute seule est une page qui ment au bout de trois
 * mois.
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

export default function Home() {
  const demoNoun = getNoun("kniga") ?? NOUNS[0];
  const demoDecl = declineNoun(demoNoun, "genitive");

  // Les niveaux réellement couverts, lus dans le catalogue plutôt qu'écrits
  // en dur : le jour où une unité C2 disparaît, la donnée structurée suit.
  const levels = [...new Set(LESSONS.map(({ lesson }) => lesson.level))];

  return (
    <div className="overflow-x-clip">
      {/* Ce que les moteurs lisent : l'éditeur, le site, et surtout le fait
          que ceci EST un cours de russe — pas une page qui en parle. */}
      <JsonLd
        data={graph(
          organization(),
          website(),
          course({ lessons: TOTAL_LESSONS, levels })
        )}
      />

      {/* ════════ HÉRO ════════ */}
      <section className="relative">
        {/* Lumière d'ambiance. `-z-10` et `pointer-events-none` : purement
            décoratif, jamais dans le flux ni sous le curseur. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="glow -top-32 left-[8%] h-[420px] w-[420px]" style={{ background: "color-mix(in oklab, var(--flag-blue) 20%, transparent)" }} />
          <div className="glow -top-16 right-[5%] h-[360px] w-[360px]" style={{ background: "color-mix(in oklab, var(--flag-red) 13%, transparent)" }} />
        </div>

        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-6 py-12 sm:py-20 md:grid-cols-[1.05fr_1fr] md:py-28">
          <div>
            <div className="surface mb-6 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
              <span className="font-display text-xs font-semibold uppercase tracking-[0.08em] text-muted">
                Méthode complète · du cyrillique au littéraire
              </span>
            </div>

            {/* « Apprendre » EST LÀ POUR LA RECHERCHE, et il ne coûte rien à
                la phrase — le rythme et la chute sont les mêmes. Le H1 est le
                signal le plus fort de la page après le titre ; « Le russe
                pour de vrai » ne contenait ni le verbe que les gens tapent,
                ni rien qui dise qu'on peut l'apprendre ici. */}
            <h1 className="font-display text-5xl font-extrabold leading-[1.06] tracking-tight sm:text-6xl">
              Apprendre le russe
              <br />
              pour de vrai,{" "}
              <span className="text-flag">cas après cas.</span>
            </h1>

            <p className="mt-6 max-w-md font-display text-lg leading-relaxed text-muted">
              Les six cas, l&apos;aspect, les verbes de mouvement, les participes —
              tout ce que les applications généralistes te font sauter. Et aucune
              terminaison inventée&nbsp;: elles sont calculées et contrôlées, jamais
              devinées par une IA.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="btn btn-primary btn-sheen rounded-xl px-7 py-3.5 font-display text-[15px] font-semibold"
              >
                Commencer gratuitement
              </Link>
              <Link
                href="/premium"
                className="btn btn-outline rounded-xl px-7 py-3.5 font-display text-[15px] font-semibold text-text"
              >
                Voir les tarifs
              </Link>
            </div>

            {/* « Exercices en accès libre » n'est plus exact depuis que la
                formule découverte compte les exercices : cette ligne est la
                dernière chose lue avant de cliquer, elle ne peut pas promettre
                ce que le 21e exercice refusera. */}
            <p className="mt-4 font-display text-[13px] text-muted">
              Cours complets en accès libre, exercices quotidiens offerts. Sans
              carte bancaire.
            </p>
          </div>

          {/* Démonstration plutôt qu'illustration : ce cadre montre
              exactement ce que fait l'app, avec une vraie déclinaison sortie
              du moteur. */}
          <div className="relative mx-auto w-full max-w-[440px]">
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <span className="animate-float absolute -left-6 -top-6 select-none font-display text-[86px] font-extrabold leading-none text-accent2 opacity-[0.12]">
                Ж
              </span>
              <span className="animate-float-slow absolute -bottom-8 -right-6 select-none font-display text-[70px] font-extrabold leading-none text-accent-ink opacity-[0.12] [animation-delay:1s]">
                Я
              </span>
            </div>

            <Spotlight className="surface gradient-border relative z-10 rounded-[22px] p-6 shadow-float">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-accent2" />
                <span className="font-display text-xs font-semibold uppercase tracking-[0.06em] text-muted">
                  Родительный · Génitif
                </span>
              </div>

              <p className="mt-4 font-display text-[27px] font-bold leading-tight">
                У меня нет {demoDecl.form}.
              </p>
              <p className="mt-1 font-display text-[15px] text-muted">
                Je n&apos;ai pas de livre.
              </p>

              <div className="hairline my-5" />

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between rounded-xl border border-border bg-bg px-4 py-3 font-display text-sm text-muted">
                  <span>книга</span>
                  <span className="text-xs uppercase tracking-wide">nominatif</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-accent/45 bg-accent/12 px-4 py-3 font-display text-sm shadow-glow">
                  <span className="font-semibold">{demoDecl.form}</span>
                  <span className="flex items-center gap-2 text-xs uppercase tracking-wide text-accent-ink">
                    génitif <span className="text-sm">✓</span>
                  </span>
                </div>
              </div>

              <p className="mt-4 font-display text-[12px] leading-relaxed text-muted">
                Cette terminaison n&apos;a pas été devinée&nbsp;: elle est calculée,
                puis contrôlée sur {NOUNS.length} noms.
              </p>
            </Spotlight>
          </div>
        </div>
      </section>

      <AlphabetBand />

      {/* ════════ VIDÉO ════════ */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <VideoPlayer />
      </section>

      {/* ════════ CE QUI CHANGE ════════ */}
      <section className="border-y border-border bg-bg2/60 py-14 sm:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <SectionLabel>Ce qui change ici</SectionLabel>
          <h2 className="mb-4 max-w-2xl font-display text-[38px] font-extrabold leading-tight tracking-tight">
            La grammaire que les autres applications contournent
          </h2>
          <p className="mb-14 max-w-xl font-display leading-relaxed text-muted">
            On abandonne le russe sur les cas, pas sur le vocabulaire. C&apos;est
            donc là que Privetik met tout son travail.
          </p>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <Strength
              icon={<CheckIcon className="h-5 w-5" />}
              title="Vérifié, pas improvisé"
              body={`Une application qui se trompe d'une lettre t'apprend l'erreur, et tu la répètes pendant des mois. Ici, chaque terminaison est calculée puis recontrôlée à chaque mise en ligne. L'IA écrit la phrase d'exemple — jamais la terminaison.`}
            />
            <Strength
              icon={<BookIcon className="h-5 w-5" />}
              title="Les six cas, par déclencheur"
              body="Après « без », génitif. Après « к », datif. Tu t'entraînes déclencheur par déclencheur, sur des phrases qui veulent dire quelque chose — pas sur « la plume de ma tante »."
            />
            <Strength
              icon={<SpeakerIcon className="h-5 w-5" />}
              title="Prononcé par des natifs"
              body="Une voix russe pour le russe, une voix française pour le français. Fini le téléphone qui lit « здравствуйте » à la française et t'installe un accent qu'il faudra désapprendre."
            />
          </div>
        </div>
      </section>

      {/* ════════ MODULES ════════ */}
      <section className="mx-auto max-w-6xl px-6 py-14 sm:py-24">
        <SectionLabel>Le parcours</SectionLabel>
        <h2 className="mb-14 max-w-xl font-display text-[38px] font-extrabold tracking-tight">
          Lire la règle, puis la travailler
        </h2>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <ModuleCard
            href="/cours"
            glyph="К"
            title="Курс"
            subtitle="Le cours"
            description={`${TOTAL_LESSONS} leçons en ${UNITS.length} unités, de l'alphabet aux registres littéraires : la règle, son tableau, ses exemples traduits, et le piège où tombent les francophones.`}
          />
          <ModuleCard
            href="/exercices"
            glyph="Я"
            title="Упражнения"
            subtitle="Les exercices"
            description="Déchiffrage, déclinaison, conjugaison, aspect, mouvement, participes, nombres : chaque réponse est corrigée, l'erreur expliquée, et renvoyée à la leçon qui va avec."
          />
          <ModuleCard
            href="/vocabulary"
            glyph="С"
            title="Словарь"
            subtitle="Le vocabulaire"
            description="Tes listes à toi, remises devant toi au moment où tu allais les oublier, et prononcées à voix haute par une vraie voix russe."
          />
          <ModuleCard
            href="/reading"
            glyph="П"
            title="Падежи"
            subtitle="Lire les cas"
            description="Des textes où chaque mot décliné dit son cas. Touche-le : tu sais pourquoi il est à ce cas, et tu t'entraînes à les deviner."
          />
        </div>
      </section>

      {/* ════════ LES CAS ════════ */}
      <section className="border-y border-border bg-bg2/60 py-14 sm:py-24">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-14 px-6 md:grid-cols-2 md:items-center">
          <div>
            <SectionLabel color="accent">Pourquoi les cas d&apos;abord</SectionLabel>
            <h2 className="mb-4 font-display text-[38px] font-extrabold leading-tight tracking-tight">
              La mécanique avant le par cœur
            </h2>
            <p className="max-w-md font-display leading-relaxed text-muted">
              Le russe encode le rôle d&apos;un mot dans sa terminaison plutôt que
              dans l&apos;ordre des mots. Tant que cette mécanique n&apos;est pas
              acquise, aucun vocabulaire ne sert : on connaît les mots sans
              pouvoir les assembler.
            </p>
            <Link
              href="/cases"
              className="mt-7 inline-flex items-center gap-2 font-display text-sm font-bold text-accent-ink transition-transform hover:translate-x-1"
            >
              Travailler les cas <span aria-hidden>→</span>
            </Link>
          </div>

          <div className="surface rounded-[22px] p-8">
            <div className="flex flex-wrap gap-2.5">
              {CASES.map((c) => (
                <div
                  key={c.id}
                  className="hover-surface flex items-center gap-2.5 rounded-full border border-border px-4 py-2"
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                  <span className="font-display text-sm font-semibold">{c.nameRu}</span>
                  <span className="font-display text-xs text-muted">{c.question}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ════════ TARIF ════════ */}
      <section className="mx-auto max-w-4xl px-6 py-14 sm:py-24 text-center">
        <SectionLabel>Sans engagement</SectionLabel>
        <h2 className="mb-4 font-display text-[38px] font-extrabold tracking-tight">
          Essaie tout, paie seulement si ça te porte
        </h2>
        <p className="mx-auto mb-9 max-w-lg font-display leading-relaxed text-muted">
          Les {TOTAL_LESSONS} leçons, le test de niveau et les exercices de
          déclinaison sont ouverts sans payer. L&apos;abonnement ajoute les textes
          écrits à ton niveau, les fiches de mots et les exercices rédigés sur
          mesure.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/signup"
            className="btn btn-primary btn-sheen rounded-xl px-8 py-4 font-display text-base font-bold"
          >
            Créer un compte gratuit
          </Link>
          <Link
            href="/premium"
            className="btn btn-outline rounded-xl px-8 py-4 font-display text-base font-semibold text-text"
          >
            Comparer les formules
          </Link>
        </div>
      </section>

      {/* ════════ PIED ════════ */}
      <footer className="border-t border-border px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
<Logo size={24} />
            <span className="font-display text-sm text-muted">
              Privetik — apprendre le russe, à ton rythme.
            </span>
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

function Strength({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
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

function ModuleCard({
  href,
  glyph,
  title,
  subtitle,
  description,
}: {
  href: string;
  glyph: string;
  title: string;
  subtitle: string;
  description: string;
}) {
  return (
    <Link href={href} className="surface-interactive group block rounded-[20px] p-7">
      <span className="flex h-[52px] w-[52px] items-center justify-center rounded-xl bg-accent/12 font-display text-2xl font-bold text-accent-ink transition-colors group-hover:bg-accent/20">
        {glyph}
      </span>
      <p className="mt-4 font-display text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        {subtitle}
      </p>
      <h3 className="mt-1 font-display text-xl font-bold">{title}</h3>
      <p className="mt-2 font-display text-[15px] leading-relaxed text-muted">{description}</p>
      <span className="mt-4 inline-flex items-center gap-1.5 font-display text-xs font-bold uppercase tracking-wide text-accent-ink">
        Ouvrir
        <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">
          →
        </span>
      </span>
    </Link>
  );
}
