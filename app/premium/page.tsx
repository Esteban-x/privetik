import type { Metadata } from "next";
import Link from "next/link";
import SectionLabel from "@/components/ui/SectionLabel";
import Spotlight from "@/components/ui/Spotlight";

import PricingCta from "@/components/marketing/PricingCta";
import { CrownIcon } from "@/components/ui/CrownIcon";
import { ArrowRightIcon, CheckIcon, CrossIcon } from "@/components/ui/icons";
import { resolvePlan } from "@/lib/billing/plans";
import { fetchFreeCaps } from "@/lib/billing/free-caps";
import JsonLd from "@/components/seo/JsonLd";
import { faq, graph, organization, subscriptionOffer } from "@/lib/seo/structured-data";
import { isStripeConfigured } from "@/lib/billing/stripe";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { TOTAL_LESSONS } from "@/lib/courses/catalog";
import { CASES } from "@/lib/grammar/cases";
import { declineNoun } from "@/lib/grammar/decline";
import { getNoun, NOUNS } from "@/lib/grammar/nouns-data";
import { TRIGGERS, triggersForCase } from "@/lib/grammar/triggers";
import { READING_LEVELS } from "@/lib/supabase/types";

/**
 * Le gabarit du layout ajoute « — Privetik » : le répéter ici donnait
 * « Tarifs — Privetik — Privetik ». Et « Tarifs » seul ne se cherche pas — la
 * requête réelle est « apprendre le russe prix » ou « cours de russe en
 * ligne tarif », d'où un titre qui contient la matière et non la rubrique.
 */
export const metadata: Metadata = {
  title: "Prix et abonnement du cours de russe",
  description:
    "Le cours, l'alphabet et les tables sont gratuits. L'abonnement lève le compteur quotidien " +
    "d'exercices et ouvre les textes générés pour travailler un cas. 16,99 €/mois.",
  alternates: { canonical: "/premium" },
  openGraph: {
    type: "website",
    url: "/premium",
    title: "Prix et abonnement — cours de russe en ligne",
    description:
      "Cours complet gratuit, 20 exercices par jour offerts. L'abonnement lève le compteur.",
  },
};

/**
 * La page tarifaire.
 *
 * ELLE MONTRE AVANT DE LISTER. Une liste à puces décrit un produit à qui le
 * connaît déjà ; elle ne donne envie de rien. Les trois quarts de cette page
 * sont donc des DÉMONSTRATIONS construites à partir du contenu réel du dépôt
 * — les niveaux de génération, les six cas, les déclencheurs, une
 * déclinaison sortie du moteur. Rien n'y est un exemple inventé pour la
 * vitrine : ce qu'on voit ici est littéralement ce que l'app produit.
 *
 * CE QUI N'EST PAS MONTRÉ, ET POURQUOI. On ne met aucune sortie de modèle en
 * exemple. Un texte « généré » recopié à la main dans le HTML serait une
 * promesse invérifiable, et la première génération réelle qui n'y ressemble
 * pas coûterait plus de confiance que l'exemple n'en aurait gagné. À la
 * place, on montre les COMMANDES qu'on obtient (niveau, longueur, forme, cas
 * ciblé) et la STRUCTURE de ce qui est rendu (les sept rubriques d'une
 * fiche) — deux choses qui, elles, sont garanties.
 *
 * ELLE PARLE EN FONCTIONNALITÉS, PAS EN QUOTAS. Les plafonds réels vivent
 * dans `plan_limits` et n'ont rien à faire ici : personne n'achète en
 * comparant des compteurs, et un chiffre affiché ici se périmerait au
 * premier UPDATE. Les seuls nombres qui apparaissent sont ceux qui SONT
 * l'offre — les deux textes de découverte, les vingt fiches — et ceux qui
 * sont calculés depuis le contenu (leçons, noms, déclencheurs).
 *
 * Publique : `/premium` est dans PUBLIC_PATHS du proxy, sinon un visiteur
 * non connecté serait renvoyé vers /login au moment précis où il envisage
 * de payer.
 */

const PRICE_EUR = 16.99;

const eur = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);

const PRICE = eur(PRICE_EUR);
/** Ramené au jour, le prix se compare à une dépense quotidienne banale — la
 *  seule échelle où « 17 € » cesse d'être un palier psychologique. Calculé,
 *  jamais écrit en dur : le jour où le tarif bouge, cette ligne suit. */
const PER_DAY = eur(Math.round((PRICE_EUR * 12 * 100) / 365) / 100);

/**
 * Les rubriques d'une fiche de mot.
 *
 * Reprises de l'interface `WordExplanation` (lib/vocabulary/explanation.ts).
 * Elles sont ici en clair plutôt qu'importées parce que ce sont des LIBELLÉS
 * de vitrine, pas la structure elle-même : les noms de champs (`pitfall`,
 * `collocations`) ne se montrent pas à un visiteur.
 */
const EXPLANATION_FIELDS = [
  ["Sens et nuance", "ce que le mot dit vraiment, pas sa traduction la plus courte"],
  ["Nature et registre", "courant, familier, soutenu — pour ne pas le placer de travers"],
  ["Exemples", "des phrases où le mot apparaît fléchi, avec leur traduction"],
  ["Collocations", "les mots avec lesquels il va habituellement"],
  ["Mots proches", "et la ligne qui dit ce qui les distingue"],
  ["Piège du francophone", "faux-ami, mauvaise préposition, mauvais aspect — ce sur quoi tu allais trébucher"],
] as const;

export default async function PremiumPage() {
  let authenticated = false;
  let plan = resolvePlan(null);
  // Les plafonds de la formule découverte, lus en base : la page de prix ne
  // recopie pas des chiffres qu'un UPDATE peut changer sans elle.
  let caps = await fetchFreeCaps(null);

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    authenticated = Boolean(user);
    caps = await fetchFreeCaps(supabase);
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("plan, plan_source, plan_expires_at")
        .eq("id", user.id)
        .single();
      plan = resolvePlan(profile);
    }
  }

  const FREE_PRACTICE_CAP = caps.practice;
  const FREE_REVIEW_CAP = caps.vocabReview;

  /**
   * Les questions de la FAQ, reprises telles qu'elles s'affichent plus bas.
   *
   * Elles sont recopiées ici plutôt qu'extraites du JSX : une extraction
   * automatique demanderait de restructurer <Faq> pour en sortir le texte, et
   * la seule contrainte de schema.org — que la question et la réponse soient
   * VISIBLES sur la page — se vérifie mieux à l'œil sur deux listes côte à
   * côte que dans une mécanique de partage.
   *
   * Toucher une question ci-dessous sans toucher celle d'en bas (ou
   * l'inverse) fait perdre la présentation enrichie. Elles vont par paires.
   */
  const faqEntries = [
    {
      question: "Je débute complètement. Est-ce que je dois m'abonner tout de suite ?",
      answer:
        `Non. Les ${TOTAL_LESSONS} leçons, l'alphabet et les tables sont ouverts sans compteur, ` +
        `et ${FREE_PRACTICE_CAP} exercices par jour suffisent aux premières séances. ` +
        "L'abonnement devient utile le jour où tu t'entraînes tous les jours.",
    },
    {
      question: "Que perd-on exactement en restant gratuit ?",
      answer:
        "Rien de la matière : les leçons, les tableaux, le test de niveau et tes listes de " +
        `vocabulaire restent entiers. La formule découverte s'arrête à ${FREE_PRACTICE_CAP} ` +
        "exercices et " +
        `${FREE_REVIEW_CAP} révisions par jour, et le compteur repart chaque nuit. Une ` +
        "réponse jugée fausse n'est pas relue par le modèle : la correction reste celle du " +
        "moteur de règles, sans la phrase qui explique l'erreur.",
    },
    {
      question: "L'IA peut-elle m'enseigner une forme fausse ?",
      answer:
        "Pas une déclinaison. Le modèle rédige la phrase ; la terminaison attendue, elle, est " +
        `calculée à partir de ${NOUNS.length} noms relus un par un.`,
    },
    {
      question: "Puis-je résilier quand je veux ?",
      answer:
        "Oui, depuis ton compte, en un clic. L'accès reste ouvert jusqu'à la fin du mois déjà " +
        "payé, puis retombe sur la formule gratuite.",
    },
    {
      question: "Que deviennent mes textes et mes fiches si j'arrête ?",
      answer:
        "Ils restent. Les textes générés et les fiches de mots déjà obtenues sont enregistrés sur " +
        "ton compte et restent consultables sans abonnement.",
    },
  ];

  // LA DÉMONSTRATION DE CONFIANCE. « отец » perd sa voyelle mobile dès le
  // génitif (отец → отца) : c'est exactement le genre de forme qu'un modèle
  // de langue produit faux une fois sur cinq, et que le moteur, lui, sort du
  // dictionnaire. Montrer un mot facile ne prouverait rien.
  const demoNoun = getNoun("otets") ?? NOUNS[0];
  const demoForms = CASES.map((c) => ({ case: c, result: declineNoun(demoNoun, c.id) }));
  const irregularCount = demoForms.filter((f) => f.result.isIrregular).length;

  // Un déclencheur réel par cas, le plus élémentaire de chacun — pris dans
  // la banque, jamais recopié : les 136 déclencheurs sont la matière même de
  // l'exercice rédigé, et ils bougent.
  const demoTriggers = CASES.map((c) => ({
    case: c,
    trigger: triggersForCase(c.id).find((t) => t.tier === "basic"),
  })).filter((t) => t.trigger);

  const cta = (
    <PricingCta
      authenticated={authenticated}
      isPremium={plan.isPremium}
      stripeReady={isStripeConfigured()}
      granted={plan.source === "grant"}
    />
  );

  return (
    // `slides` n'habille rien : c'est le marqueur que `html:has(.slides)`
    // cherche pour n'accrocher le défilement que sur cette page.
    <div className="slides overflow-x-clip">
      {/* L'offre et les questions, pour la présentation enrichie : le prix
          affiché à côté du lien, et les questions dépliables sous lui. */}
      <JsonLd data={graph(organization(), subscriptionOffer(PRICE_EUR), faq(faqEntries))} />

      {/* ════════ HÉRO ════════ */}
      <section className="slide relative">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div
            className="glow left-1/2 top-[-120px] h-[520px] w-[520px] -translate-x-1/2"
            style={{ background: "color-mix(in oklab, var(--flag-blue) 18%, transparent)" }}
          />
          <div
            className="glow right-[6%] top-[40px] h-[340px] w-[340px]"
            style={{ background: "color-mix(in oklab, var(--flag-red) 12%, transparent)" }}
          />
        </div>

        <div className="mx-auto max-w-3xl px-6 pb-16 pt-20 text-center">
          <h1 className="font-display text-[42px] font-extrabold leading-[1.08] tracking-tight sm:text-[52px]">
            Des textes et des exercices
            <br />
            <span className="text-flag">écrits pour toi.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl font-display text-lg leading-relaxed text-muted">
            Les cours et les tableaux sont gratuits, et le resteront. La
            formule découverte donne {FREE_PRACTICE_CAP} exercices et{" "}
            {FREE_REVIEW_CAP} révisions par jour — de quoi juger la méthode.
            L&apos;abonnement lève le compteur et paie ce qui doit être rédigé
            à neuf : tes textes de lecture, tes fiches de mots, tes phrases
            d&apos;entraînement.
          </p>

          <div className="mt-10 flex items-end justify-center gap-3">
            <span className="font-display text-[52px] font-extrabold leading-none tracking-tight">
              {PRICE}
            </span>
            <span className="pb-1.5 font-display text-base font-semibold text-muted">
              par mois
            </span>
          </div>
          <p className="mt-2 font-display text-[13px] text-muted">
            soit {PER_DAY} par jour — sans engagement
          </p>

          <div className="mx-auto mt-8 max-w-xs">{cta}</div>

          {/* LA RÉASSURANCE EST AU-DESSUS DE LA LIGNE DE FLOTTAISON, pas en
              petit sous le bouton. Les trois objections qui bloquent un
              paiement récurrent — l'engagement, la difficulté à partir, la
              perte de ce qu'on a produit — se lèvent avant qu'on ait eu à
              les formuler. */}
          <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5">
            {[
              "Sans engagement",
              "Résiliation en un clic",
              "Tes textes te restent",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2 font-display text-[13px] text-muted">
                <CheckIcon className="h-3.5 w-3.5 shrink-0 text-success" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Hors du bloc centré, sinon il compterait dans le centrage et
            décalerait tout le héros vers le haut. */}
        <div className="slide-cue pointer-events-none absolute inset-x-0 bottom-7 items-center justify-center">
          <ArrowRightIcon aria-hidden className="h-5 w-5 rotate-90 text-muted" />
        </div>
      </section>

      {/* ════════ CE QUE ÇA PRODUIT ════════ */}
      <section className="slide mx-auto max-w-6xl px-6 pb-24">
        <div className="mb-7 sm:mb-10 text-center">
          <SectionLabel color="accent">Concrètement</SectionLabel>
          <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Trois choses que l&apos;app écrit pour toi
          </h2>
          <p className="mx-auto mt-4 max-w-2xl font-display leading-relaxed text-muted">
            Elles ont un point commun : elles n&apos;existent pas avant que
            tu les demandes. C&apos;est ce qui les rend utiles — et ce qui
            fait qu&apos;elles se paient.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* ── La lecture ── */}
          <Spotlight className="surface flex flex-col rounded-[22px] p-7">
            <DemoHeading n={1}>Un texte à ta mesure</DemoHeading>
            <p className="mt-3 font-display text-[15px] leading-relaxed text-muted">
              Tu ne reçois pas « un texte de niveau intermédiaire ». Tu
              commandes le niveau, la longueur, la forme — récit, dialogue ou
              description — et le cas que tu veux voir revenir à chaque
              phrase.
            </p>

            <div className="mt-6 space-y-4">
              <div>
                <FieldLabel>Niveau</FieldLabel>
                <div className="flex flex-wrap gap-1.5">
                  {READING_LEVELS.map((lvl) => (
                    <span
                      key={lvl}
                      className="rounded-lg border border-border bg-bg px-2.5 py-1 font-display text-xs font-semibold text-muted"
                    >
                      {lvl}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <FieldLabel>Cas à faire travailler</FieldLabel>
                {/* Les six pastilles portent la couleur du cas — la même que
                    dans le module Cas. Le visiteur qui a déjà tourné dans
                    l'app reconnaît le code sans qu'on le lui explique. */}
                <div className="flex flex-wrap gap-1.5">
                  {CASES.map((c) => (
                    <span
                      key={c.id}
                      className="case-tint flex items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1 font-display text-xs font-semibold text-muted"
                      style={{ "--case": c.color } as React.CSSProperties}
                    >
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: "var(--case-hi)" }}
                      />
                      {c.nameFr}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <p className="mt-auto pt-6 font-display text-[13px] leading-relaxed text-muted/80">
              Chaque mot du texte est cliquable : la traduction s&apos;ouvre
              sans quitter la page, et le texte reste dans ton compte.
            </p>
          </Spotlight>

          {/* ── La fiche de mot ── */}
          <Spotlight className="surface flex flex-col rounded-[22px] p-7">
            <DemoHeading n={2}>Une fiche, pas une définition</DemoHeading>
            <p className="mt-3 font-display text-[15px] leading-relaxed text-muted">
              Un dictionnaire te donne un équivalent français. Il ne te dit
              pas dans quel registre le mot vit, avec quoi il se construit, ni
              pourquoi tu es sur le point de l&apos;employer de travers.
            </p>

            <ul className="mt-6 space-y-3">
              {EXPLANATION_FIELDS.map(([label, detail]) => (
                <li key={label} className="flex gap-3">
                  <span
                    aria-hidden
                    className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent2"
                  />
                  <span className="font-display text-[14px] leading-snug">
                    <span className="font-semibold">{label}</span>
                    <span className="text-muted"> — {detail}</span>
                  </span>
                </li>
              ))}
            </ul>

            <p className="mt-auto pt-6 font-display text-[13px] leading-relaxed text-muted/80">
              La fiche est enregistrée sur ton compte : tu la relis autant
              que tu veux, sans rien reconsommer.
            </p>
          </Spotlight>

          {/* ── L'exercice rédigé ── */}
          <Spotlight className="surface flex flex-col rounded-[22px] p-7">
            <DemoHeading n={3}>La phrase qui te manque</DemoHeading>
            <p className="mt-3 font-display text-[15px] leading-relaxed text-muted">
              Un cas ne s&apos;apprend pas en bloc : il s&apos;apprend
              déclencheur par déclencheur. L&apos;app en suit{" "}
              {TRIGGERS.length}, repère ceux que tu rates, et fait écrire une
              phrase neuve autour de celui-là.
            </p>

            <ul className="mt-6 space-y-2">
              {demoTriggers.map(({ case: c, trigger }) => (
                <li
                  key={c.id}
                  className="case-tint flex items-baseline gap-2.5 rounded-xl border border-border bg-bg px-3.5 py-2.5"
                  style={{ "--case": c.color } as React.CSSProperties}
                >
                  <span
                    className="font-display text-sm font-bold"
                    style={{ color: "var(--case-hi)" }}
                  >
                    {trigger!.ru}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-display text-xs text-muted">
                    {trigger!.meaningFr}
                  </span>
                </li>
              ))}
            </ul>

            <p className="mt-auto pt-6 font-display text-[13px] leading-relaxed text-muted/80">
              {demoTriggers.length} déclencheurs sur {TRIGGERS.length}, un par
              cas. La formule découverte les travaille aussi, dans la limite
              du jour — avec une phrase toujours identique.
            </p>
          </Spotlight>
        </div>
      </section>

      {/* ════════ LA CONFIANCE ════════ */}
      <section className="slide border-y border-border bg-bg2/60 py-12 sm:py-20">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 lg:grid-cols-[1fr_1.05fr]">
          <div>
            <SectionLabel color="accent2">La question qu&apos;on nous pose</SectionLabel>
            <h2 className="font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
              « Et si l&apos;IA m&apos;apprend une forme fausse&nbsp;? »
            </h2>
            <p className="mt-5 font-display text-lg leading-relaxed text-muted">
              Elle ne peut pas : elle n&apos;a jamais la main sur la
              grammaire. Le modèle écrit la phrase ; la terminaison, elle, est
              calculée — à partir de {NOUNS.length} noms dont chaque
              déclinaison a été vérifiée une par une.
            </p>
            <p className="mt-4 font-display text-[15px] leading-relaxed text-muted">
              Et c&apos;est le même calcul pour les deux formules. La
              justesse de la grammaire ne se paie pas — ce qui se paie, c&apos;est
              le travail de rédaction autour.
            </p>
          </div>

          {/* La preuve, pas l'affirmation : un mot dont le radical bouge,
              décliné ici même par le moteur au moment du rendu. */}
          <Spotlight className="surface gradient-border rounded-[22px] p-7 shadow-float">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-display text-2xl font-bold">{demoNoun.forms.singular[0]}</span>
              <span className="font-display text-sm text-muted">{demoNoun.translation}</span>
            </div>

            <div className="hairline my-5" />

            <ul className="space-y-1.5">
              {demoForms.map(({ case: c, result }) => (
                <li
                  key={c.id}
                  className="case-tint flex items-center gap-3 rounded-xl px-3 py-2"
                  style={{
                    "--case": c.color,
                    background: "color-mix(in oklab, var(--case) 9%, transparent)",
                  } as React.CSSProperties}
                >
                  <span
                    aria-hidden
                    className="h-6 w-1 shrink-0 rounded-full"
                    style={{ background: "var(--case-hi)" }}
                  />
                  <span className="w-28 shrink-0 font-display text-xs font-semibold uppercase tracking-wide text-muted">
                    {c.nameFr}
                  </span>
                  <span className="font-display text-lg font-bold">{result.accented}</span>
                </li>
              ))}
            </ul>

            {/* UN CONSTAT CHIFFRÉ PLUTÔT QU'UNE PASTILLE PAR LIGNE. « отец »
                perd son е dans cinq formes sur six : un badge « radical
                mobile » posé sur cinq lignes ne signale plus rien, il devient
                la décoration par défaut du tableau. Compté, le même fait
                redevient un argument. */}
            <p className="mt-5 font-display text-[13px] leading-relaxed text-muted">
              <span className="font-semibold text-text">
                {irregularCount} de ces {demoForms.length} formes perdent la
                voyelle du radical.
              </span>{" "}
              Le moteur le sait parce qu&apos;elle vient du dictionnaire ; un
              modèle de langue, lui, la devine. Elles ne sont pas recopiées
              dans cette page : elles sortent du moteur au moment où elle
              s&apos;affiche.
            </p>
          </Spotlight>
        </div>
      </section>

      {/* ════════ LES DEUX FORMULES ════════ */}
      <section className="slide mx-auto max-w-5xl px-6 py-14 sm:py-24">
        <div className="mb-7 sm:mb-10 text-center">
          <SectionLabel>Comparer</SectionLabel>
          <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Deux formules, aucune option à cocher
          </h2>
        </div>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[0.85fr_1fr]">
          {/* Gratuit. VOLONTAIREMENT PLUS ÉTROIT ET PLUS SOBRE que la carte
              d'à côté : à surfaces égales, l'œil compare deux offres
              équivalentes, et la découverte — qui a huit lignes cochées —
              gagne cette comparaison-là. Elle reste complète et honnête,
              simplement elle ne réclame pas l'attention. */}
          <div className="surface rounded-[22px] p-7">
            <h3 className="font-display text-lg font-bold">Découverte</h3>
            <p className="mt-1 font-display text-sm text-muted">
              Pour voir si la méthode te parle.
            </p>

            <p className="mt-5 font-display text-3xl font-extrabold tracking-tight">
              0 €
              <span className="ml-1.5 font-display text-sm font-semibold text-muted">
                pour toujours
              </span>
            </p>

            <div className="hairline my-6" />

            <ul className="space-y-2.5">
              <Feature included>Les {TOTAL_LESSONS} leçons du cours, en entier</Feature>
              <Feature included>Alphabet, chiffres, conjugaison, tables</Feature>
              <Feature included>Test de niveau et suivi de progression</Feature>
              <Feature included>
                {FREE_PRACTICE_CAP} exercices par jour, tous modules confondus
              </Feature>
              <Feature included>
                {FREE_REVIEW_CAP} révisions de vocabulaire par jour
              </Feature>
              <Feature included>Prononciation par voix natives</Feature>
              {/* CORRIGÉ : la suggestion de traduction a été ouverte au plan
                  gratuit (`plan_limits`, feature `suggest`). Elle figurait
                  encore ici barrée — un visiteur qui l'avait déjà utilisée
                  lisait donc, sur la page de paiement, que ce qu'il venait de
                  faire lui était interdit. */}
              <Feature included>Suggestion de traduction à la saisie</Feature>
              <Feature included>2 textes de lecture générés, 20 fiches de mots</Feature>
              <Feature>Exercices rédigés sur mesure</Feature>
              <Feature>Second avis sur une réponse jugée fausse</Feature>
            </ul>

            <div className="mt-7">
              <Link
                href={authenticated ? "/dashboard" : "/signup"}
                className="btn btn-outline block rounded-xl px-6 py-3.5 text-center font-display text-[15px] font-semibold text-text"
              >
                {authenticated ? "Aller au tableau de bord" : "Créer un compte gratuit"}
              </Link>
            </div>
          </div>

          {/* Pro. */}
          <Spotlight className="pro-surface gradient-border rounded-[22px] p-8">
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="pro-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
              >
                <CrownIcon size={24} />
              </span>
              <div>
                <h3 className="font-display text-xl font-bold">Privetik Pro</h3>
                <p className="font-display text-sm text-muted">
                  Pour apprendre le russe sérieusement.
                </p>
              </div>
            </div>

            <p className="mt-6 font-display text-3xl font-extrabold sm:text-4xl tracking-tight">
              {PRICE}
              <span className="ml-1.5 font-display text-base font-semibold text-muted">
                par mois
              </span>
            </p>
            <p className="mt-1 font-display text-[13px] text-muted">
              soit {PER_DAY} par jour · résiliable en un clic
            </p>

            <div className="hairline my-6" />

            <ul className="space-y-2.5">
              <Feature included strong>
                Tout ce que contient la formule gratuite
              </Feature>
              <Feature included strong>
                Exercices et révisions sans compteur quotidien
              </Feature>
              <Feature included strong>
                Tes textes de lecture, autant que tu en lis
              </Feature>
              <Feature included strong>
                Fiches de mots sans compteur, régénérables si la première ne
                te convient pas
              </Feature>
              <Feature included strong>
                Exercices de cas rédigés autour du déclencheur que tu rates
              </Feature>
              <Feature included strong>
                Second avis sur tes réponses jugées fausses : les variantes
                acceptables sont rattrapées
              </Feature>
              <Feature included strong>
                Prononciation par voix native de tous tes mots, sans y penser
              </Feature>
            </ul>

            <div className="mt-8">{cta}</div>

            <p className="mt-4 text-center font-display text-[12px] text-muted">
              Paiement sécurisé par Stripe. Aucune carte enregistrée chez nous.
            </p>
          </Spotlight>
        </div>
      </section>

      {/* ════════ LE PRIX ════════ */}
      <section className="slide border-y border-border bg-bg2/60 py-12 sm:py-20">
        <div className="mx-auto max-w-3xl px-6">
          <SectionLabel color="accent">Le prix</SectionLabel>
          <h2 className="font-display text-3xl font-extrabold tracking-tight">
            Pourquoi {PRICE} et pas 5 €
          </h2>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="surface rounded-[18px] p-6">
              <p className="font-display text-[13px] font-bold uppercase tracking-wide text-muted">
                Une heure de cours particulier
              </p>
              <p className="mt-2 font-display text-3xl font-extrabold tracking-tight">
                25 à 40 €
              </p>
              <p className="mt-2 font-display text-[14px] leading-relaxed text-muted">
                Une seule heure coûte deux mois d&apos;abonnement, et elle ne
                te suit pas le reste de la semaine.
              </p>
            </div>
            <div className="surface rounded-[18px] p-6">
              <p className="font-display text-[13px] font-bold uppercase tracking-wide text-muted">
                Privetik Pro, ramené au jour
              </p>
              <p className="mt-2 font-display text-3xl font-extrabold tracking-tight">
                {PER_DAY}
              </p>
              <p className="mt-2 font-display text-[14px] leading-relaxed text-muted">
                Pour un texte écrit à ton niveau, des fiches sur tes mots et
                des exercices sur ce qui te bloque.
              </p>
            </div>
          </div>

          {/* L'ARGUMENT DE COÛT RÉEL, dit franchement. C'est la seule réponse
              solide à « pourquoi pas moins cher » : sur ce produit, chaque
              usage coûte quelque chose au moment où il a lieu. Un tarif plus
              bas ne serait pas plus généreux, il forcerait à rationner
              exactement ce qu'on vient chercher. */}
          <p className="mt-6 font-display text-[15px] leading-relaxed text-muted">
            Un abonnement de logiciel classique coûte la même chose à dix
            usages qu&apos;à mille. Ici, non : chaque texte généré, chaque
            fiche, chaque phrase d&apos;exercice a un coût réel à la seconde
            où tu la demandes. Le prix n&apos;est pas une marge sur du
            logiciel — c&apos;est ce qui permet de ne pas te rationner.
          </p>
        </div>
      </section>

      {/* ════════ QUESTIONS ════════ */}
      <section className="slide py-12 sm:py-20">
        <div className="mx-auto max-w-3xl px-6">
          <SectionLabel>Questions</SectionLabel>
          <h2 className="mb-7 sm:mb-10 font-display text-3xl font-extrabold tracking-tight">
            Ce qu&apos;on nous demande avant de payer
          </h2>

          <div className="space-y-3">
            <Faq q="Je débute complètement. Est-ce que je dois m'abonner tout de suite ?">
              Non, et c&apos;est franc : commence gratuitement. Les{" "}
              {TOTAL_LESSONS} leçons, l&apos;alphabet et les tables sont
              ouverts sans compteur, et {FREE_PRACTICE_CAP} exercices par jour
              suffisent aux premières séances. L&apos;abonnement devient utile
              le jour où tu t&apos;entraînes tous les jours — et où tu as
              besoin de matière neuve : lire autre chose que les textes de la
              bibliothèque, travailler le déclencheur précis qui te résiste.
            </Faq>
            {/* LA RELECTURE EST NOMMÉE, parce qu'elle ne relève pas du
                rythme. Cette réponse disait « rien de la matière… ce qui
                change, c'est le rythme » — exact pour les plafonds, et
                incomplet : la formule découverte n'a pas le second avis du
                modèle sur une réponse jugée fausse (verify = 0 en base).
                L'apprenant y perd la phrase qui explique l'erreur, et le
                rattrapage d'une variante correcte que le moteur ne connaît
                pas. Le taire faisait de la page de prix une promesse un peu
                trop large ; le dire en fait un argument de plus. */}
            <Faq q="Que perd-on exactement en restant gratuit ?">
              Rien de la matière : les leçons, les tableaux, le test de niveau
              et tes listes de vocabulaire restent entiers, et la suggestion de
              traduction fonctionne aussi. Deux choses changent. Le rythme
              d&apos;abord : la formule découverte s&apos;arrête à{" "}
              {FREE_PRACTICE_CAP} exercices et {FREE_REVIEW_CAP} révisions par
              jour — le compteur repart chaque nuit. La correction ensuite :
              quand ta réponse est jugée fausse, elle n&apos;est pas relue par
              le modèle. Tu gardes la bonne forme et la règle qui la produit,
              tu perds la phrase qui explique ton erreur — et le rattrapage
              d&apos;une variante correcte que le moteur de règles ne connaît
              pas encore. L&apos;abonnement lève les deux, et ajoute ce qui est
              rédigé pour toi : textes de lecture, fiches de mots, phrases
              d&apos;exercice sur mesure.
            </Faq>
            <Faq q="L'IA peut-elle m'enseigner une forme fausse ?">
              Pas une déclinaison, non. Le modèle rédige la phrase française et
              russe ; la terminaison attendue, elle, est calculée — à partir de{" "}
              {NOUNS.length} noms relus un par un. Là où
              le modèle parle en son nom — la fiche d&apos;un mot, son
              commentaire de sens — l&apos;app le signale explicitement à
              l&apos;écran.
            </Faq>
            <Faq q="Puis-je résilier quand je veux ?">
              Oui, depuis ton compte, en un clic. L&apos;accès reste ouvert
              jusqu&apos;à la fin du mois déjà payé, puis retombe sur la
              formule gratuite. Aucune relance, aucun formulaire à remplir.
            </Faq>
            <Faq q="Que deviennent mes textes et mes fiches si j'arrête ?">
              Ils restent. Les textes générés et les fiches de mots déjà
              obtenues sont enregistrés sur ton compte : tu continues à les
              relire sans abonnement, comme tes listes de vocabulaire et ta
              progression.
            </Faq>
            <Faq q="Un mois suffit-il pour voir si ça marche ?">
              Largement. En un mois, tu peux générer plusieurs dizaines de
              textes, autant de fiches, et faire remonter tes points faibles
              sur les {TRIGGERS.length} déclencheurs. Si ça ne te sert pas, tu
              pars avant le renouvellement et tu gardes ce que tu as produit.
            </Faq>
          </div>
        </div>
      </section>

      {/* ════════ CLÔTURE ════════
          La page se terminait sur la dernière question : le visiteur convaincu
          par les réponses n'avait plus rien à cliquer et devait remonter. */}
      <section className="slide relative border-t border-border">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div
            className="glow bottom-[-160px] left-1/2 h-[420px] w-[420px] -translate-x-1/2"
            style={{ background: "color-mix(in oklab, var(--flag-blue) 16%, transparent)" }}
          />
        </div>
        <div className="mx-auto max-w-2xl px-6 py-12 sm:py-20 text-center">
          <h2 className="font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
            Arrête de deviner les terminaisons.
          </h2>
          <p className="mx-auto mt-4 max-w-lg font-display leading-relaxed text-muted">
            {PRICE} par mois, sans engagement. Tu gardes tes textes, tes
            fiches et ta progression même si tu pars.
          </p>
          <div className="mx-auto mt-8 max-w-xs">{cta}</div>
        </div>
      </section>
    </div>
  );
}

/** Le titre d'une carte de démonstration, numéroté pour qu'on lise les
 *  trois dans l'ordre plutôt que de les prendre pour des options. */
function DemoHeading({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/12 font-display text-[13px] font-bold text-accent-ink"
      >
        {n}
      </span>
      <h3 className="font-display text-lg font-bold leading-tight">{children}</h3>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 font-display text-[11px] font-bold uppercase tracking-[0.08em] text-muted/70">
      {children}
    </p>
  );
}

function Feature({
  children,
  included = false,
  strong = false,
}: {
  children: React.ReactNode;
  included?: boolean;
  strong?: boolean;
}) {
  return (
    <li className="flex items-start gap-2.5">
      {/* Icônes tracées plutôt que « ✓ » et « — » : le glyphe dépend de la
          police, son poids optique n'a rien à voir avec celui du texte, et il
          ne prend pas la couleur qu'on lui demande. */}
      <span
        aria-hidden
        className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${
          included ? "bg-success/15 text-success" : "bg-bg3 text-muted/50"
        }`}
      >
        {included ? (
          <CheckIcon className="h-2.5 w-2.5" strokeWidth={3} />
        ) : (
          <CrossIcon className="h-2.5 w-2.5" strokeWidth={3} />
        )}
      </span>
      <span
        className={`font-display text-[14px] leading-snug ${
          included
            ? strong
              ? "text-text"
              : "text-text/90"
            : "text-muted/60 line-through decoration-muted/40"
        }`}
      >
        {children}
      </span>
    </li>
  );
}

/**
 * `<details>` natif plutôt qu'un accordéon en React : le repli, le clavier,
 * le lecteur d'écran et la recherche dans la page fonctionnent sans une
 * ligne de JavaScript, et la réponse reste dans le HTML — donc indexable.
 */
function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="surface group rounded-[18px] px-6 py-5 [&[open]]:bg-bg2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display font-semibold marker:hidden">
        {q}
        <span
          aria-hidden
          className="shrink-0 text-muted transition-transform duration-300 group-open:rotate-45"
          style={{ transitionTimingFunction: "var(--ease)" }}
        >
          +
        </span>
      </summary>
      <p className="mt-3 font-display text-[15px] leading-relaxed text-muted">{children}</p>
    </details>
  );
}
