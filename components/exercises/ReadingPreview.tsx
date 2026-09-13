import Link from "next/link";
import SectionLabel from "@/components/ui/SectionLabel";
import CaseReader from "@/components/exercises/CaseReader";
import CaseCounts from "@/components/exercises/CaseCounts";
import { PreviewCta } from "@/components/vocabulary/VocabularyPreview";
import { READING_TEXTS } from "@/lib/reading/texts";
import { countCases } from "@/lib/reading/stats";
import { BulbIcon, ListIcon, StarIcon, TargetIcon } from "@/components/ui/icons";

/**
 * /reading pour quelqu'un qui n'a pas de compte.
 *
 * MÊME RAISON QUE VocabularyPreview : la barre annonce le module à tout le
 * monde, et la redirection vers /login n'apprenait rien de ce qu'il y a
 * derrière. La démonstration est ici facile — et convaincante — parce que
 * la bibliothèque est du contenu STATIQUE, annoté et expliqué à la main dans
 * lib/reading/texts.ts.
 *
 * C'EST LE VRAI LECTEUR QU'ON MONTRE, pas une capture : les mots qui
 * s'expliquent, la légende qui filtre, le mode « Deviner les cas ». Seuls
 * sont retirés (`readOnly`) l'enregistrement de fin de texte et l'appel à
 * l'IA, qui demandent un compte.
 *
 * POURQUOI OFFRIR LE PREMIER TEXTE EN ENTIER. Il fait quatre phrases de
 * niveau A1. Ce qui se vend ici n'est pas le texte, c'est le GESTE : toucher
 * un mot et comprendre pourquoi il est à ce cas.
 */

const FEATURES = [
  {
    Icon: BulbIcon,
    title: "Pourquoi ce cas, pas un autre",
    body: "Chaque mot décliné s'explique : la préposition qui le gouverne, le verbe qui l'exige, la quantité qui impose le génitif. C'est ce que tu viens d'essayer ci-dessus.",
  },
  {
    Icon: TargetIcon,
    title: "Deviner les cas",
    body: "Les couleurs s'effacent : touche un mot souligné, choisis son cas, et l'explication arrive avec ta réponse.",
  },
  {
    Icon: StarIcon,
    title: "Un texte pour chaque cas",
    body: "Choisis le cas à travailler, et l'app écrit un texte à ton niveau qui l'emploie souvent — avec une explication de l'IA pour chaque phrase. C'est la fonctionnalité de l'abonnement.",
  },
  {
    Icon: ListIcon,
    title: "Tes textes restent",
    body: "Ceux que tu fais générer sont gardés, explications comprises : rouvrir un texte ne coûte rien.",
  },
];

export default function ReadingPreview() {
  const [demo, ...rest] = READING_TEXTS;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 sm:py-14">
      <SectionLabel>Падежи в тексте</SectionLabel>
      <h1 className="mb-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
        Comprendre les cas en lisant
      </h1>
      <p className="mb-10 max-w-2xl font-display leading-relaxed text-muted">
        Chaque mot décliné porte la couleur de son cas. Touche-le&nbsp;: tu vois lequel, et surtout
        pourquoi — la préposition, le verbe ou la quantité qui l&apos;impose. Voici le premier texte,
        en entier.
      </p>

      <CaseReader text={demo} readOnly />

      <div className="mt-14">
        <SectionLabel color="accent">Ce que le compte ouvre</SectionLabel>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FEATURES.map(({ Icon, title, body }) => (
            <div key={title} className="rounded-2xl surface p-6">
              <span
                aria-hidden
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/12 text-accent-ink"
              >
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-display text-base font-bold">{title}</h3>
              <p className="mt-1.5 font-display text-sm leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </div>

      {rest.length > 0 && (
        <div className="mt-14">
          <SectionLabel>Le reste de la bibliothèque</SectionLabel>
          <p className="mb-5 max-w-2xl font-display text-sm leading-relaxed text-muted">
            {rest.length} autre{rest.length > 1 ? "s" : ""} texte{rest.length > 1 ? "s" : ""}{" "}
            expliqué{rest.length > 1 ? "s" : ""} mot à mot, avec un compte.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {rest.map((t) => (
              // Le `next` mène au texte lui-même : après inscription,
              // l'apprenant retombe sur celui qu'il avait choisi, pas sur un
              // tableau de bord dont il n'a rien à faire.
              <Link
                key={t.id}
                href={`/login?next=${encodeURIComponent(`/reading/${t.id}`)}`}
                className="rounded-2xl surface-interactive p-6 hover:-translate-y-0.5"
              >
                <div className="flex items-center gap-2">
                  <span className="inline-block rounded-full border border-border px-2.5 py-0.5 font-display text-xs font-semibold text-muted">
                    {t.level}
                  </span>
                  <span className="font-display text-xs text-muted">{t.sentences.length} phrases</span>
                </div>
                <h3 className="mt-3 font-display text-xl font-bold">{t.title}</h3>
                <CaseCounts counts={countCases(t.sentences)} />
              </Link>
            ))}
          </div>
        </div>
      )}

      <PreviewCta
        title="Ouvre la bibliothèque"
        body="Le compte est gratuit et donne accès aux textes de la bibliothèque, expliqués mot à mot. Les textes générés pour un cas font partie de l'abonnement — deux à l'essai, pour juger."
      />
    </div>
  );
}
