"use client";

import Link from "next/link";
import Logo from "@/components/layout/Logo";

import ThemeToggle from "@/components/layout/ThemeToggle";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { EXERCISE_ROUTES } from "@/lib/exercises/routes";
import type { User } from "@supabase/supabase-js";
import { CrownIcon } from "@/components/ui/CrownIcon";

/**
 * Barre de navigation.
 *
 * Elle portait dix entrées à plat, toutes de même poids, qui se repliaient
 * sur deux lignes dès que la fenêtre se resserrait. Le problème n'était pas
 * la place mais la STRUCTURE : quatre de ces liens — Cas, Mouvement,
 * Aspect, Participes — sont le même domaine, la grammaire, et rien ne le
 * disait. Ils sont maintenant regroupés sous une seule entrée dépliante,
 * qui a la place de dire à quoi sert chaque module.
 *
 * PUIS LE MENU A CÉDÉ LA PLACE À UNE PAGE. Le déroulant tenait à cinq
 * modules ; il y en a huit, répartis en quatre familles, et chacun compte
 * sa propre progression. Un menu ne peut montrer ni les familles, ni les
 * niveaux, ni ce qui a déjà été travaillé : « Exercices » est donc devenu
 * un lien vers /exercices, qui montre tout cela et laisse entrer
 * directement dans une compétence.
 *
 * L'entrée reste éclairée quand on se trouve DANS un module (/cases,
 * /aspect…), pas seulement sur la page d'accueil : c'est la section
 * courante qui doit se voir, pas l'URL exacte. La liste des routes vit
 * dans lib/exercises/routes.ts — le catalogue lui-même importe toutes les
 * banques d'exercices et n'a rien à faire dans un composant client.
 *
 * D'où l'ordre : Cours, puis Exercices. La barre raconte le parcours que
 * chaque leçon propose en bas de page.
 *
 * PUIS LE REPLI MOBILE A DISPARU À SON TOUR. Une fois les sections
 * descendues dans le bandeau du bas, le bouton burger n'ouvrait plus que
 * trois lignes — thème, abonnement, compte — c'est-à-dire qu'il coûtait un
 * appui pour en économiser zéro. Elles sont maintenant à découvert, en
 * pictogrammes, à droite de la barre et à toute largeur.
 *
 * Il reste trois niveaux de lecture, en trois colonnes de même poids :
 * - au centre, ce qu'on vient APPRENDRE (cours, exercices, vocabulaire,
 *   lecture) ;
 * - à droite, le tableau de bord, seule action mise en avant ;
 * - au bout, le compte, replié derrière l'initiale de l'utilisateur —
 *   « Mon compte » et « Déconnexion » ne sont pas des destinations
 *   d'apprentissage et n'ont rien à faire au même rang.
 */

interface NavItem {
  href: string;
  label: string;
}

/**
 * L'ordre raconte le parcours : lire, s'entraîner, puis travailler seul.
 *
 * « ACCUEIL » N'Y EST PLUS. C'est la page de présentation : on y arrive une
 * fois, avant d'avoir un compte, et on n'y retourne jamais. Elle occupait
 * pourtant le premier rang de la barre sur toutes les pages, devant les
 * quatre sections qui, elles, servent tous les jours. Le logo, à gauche,
 * ramène à l'accueil pour qui la cherche — c'est sa fonction partout
 * ailleurs sur le web.
 */
const MAIN: NavItem[] = [
  { href: "/cours", label: "Cours" },
  { href: "/exercices", label: "Exercices" },
  { href: "/vocabulary", label: "Vocabulaire" },
  { href: "/reading", label: "Textes" },
];

/**
 * Ce qu'un visiteur voit à la place.
 *
 * PREMIÈRE VERSION : NE MONTRER QUE DU LISIBLE SANS COMPTE — le cours, les
 * six cas, l'alphabet et les tarifs. La logique était défendable : la liste
 * des membres renvoie trois fois sur quatre à /login, et montrer des portes
 * fermées est désagréable.
 *
 * ELLE AVAIT UN DÉFAUT PLUS GRAVE QUE CELUI QU'ELLE CORRIGEAIT. Cette liste
 * ne décrit pas le produit, elle décrit ce qui se trouve être public. Un
 * visiteur y lisait « Cours, Les cas, Alphabet » et en concluait que l'app
 * enseigne les déclinaisons — pas qu'elle a huit modules d'exercices, un
 * vocabulaire avec quatre modes de révision et des textes de lecture
 * générés à son niveau. On lui cachait les trois quarts du produit AU
 * MOMENT PRÉCIS où il décide s'il vaut un compte.
 *
 * ELLE EST DONC L'IMAGE DE LA LISTE DES MEMBRES, et c'est voulu : la barre
 * doit annoncer l'app, pas l'état de session. /cours et /exercices sont
 * ouverts et se lisent en entier ; /vocabulary et /reading demandent un
 * compte, et le disent — voir le message contextuel de app/login.
 *
 * LE COÛT SEO EST NUL, contrairement à ce que la première version
 * supposait : /vocabulary et /reading sont en `Disallow` dans robots.ts, un
 * robot ne les suit donc pas et n'y dépense aucun budget d'exploration.
 * L'argument ne valait que pour les humains — et pour eux, sous-vendre
 * l'app coûte plus cher qu'un détour par /login.
 *
 * CE QUE ÇA DÉPLACE. « Les cas » et « Alphabet » quittent la barre : ce sont
 * deux pages parmi d'autres du catalogue, pas deux sections du produit, et
 * /exercices les liste toutes les deux avec les six autres modules.
 */
const PUBLIC_NAV: NavItem[] = [
  { href: "/cours", label: "Cours" },
  { href: "/exercices", label: "Exercices" },
  { href: "/vocabulary", label: "Vocabulaire" },
  { href: "/reading", label: "Textes" },
  { href: "/premium", label: "Tarifs" },
];

export default function NavBar({
  initialUser,
  initialPro = false,
}: {
  initialUser: User | null;
  /** Lu côté serveur : évite qu'un abonné voie clignoter « Version Pro ». */
  initialPro?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  // Amorcé avec la valeur déjà connue côté serveur (voir app/layout.tsx) :
  // le tout premier rendu affiche déjà le bon état, aucun flash "déconnecté"
  // le temps qu'un effet client résolve — un client component peint toujours
  // son état initial avant qu'un effet ne puisse le corriger, donc c'était
  // la seule vraie façon de l'éliminer (réduire le délai ne suffit pas).
  const [user, setUser] = useState<User | null>(initialUser);
  // Le plan ne change pas en cours de navigation (un paiement passe par
  // Stripe, donc par un rechargement complet) : la valeur du serveur suffit,
  // sans requête client supplémentaire.
  const isPro = initialPro;
  const [openPanel, setOpenPanel] = useState<"account" | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    const supabase = createClient();
    // Garde la nav synchronisée avec les changements côté client (connexion,
    // déconnexion, rafraîchissement de jeton) sans recharger la page — l'état
    // initial, lui, vient déjà du serveur, plus besoin de re-fetch au montage.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Un menu déplié doit se refermer sur un clic ailleurs et sur Échap :
  // sans ça il reste ouvert par-dessus la page, et au clavier on s'y trouve
  // enfermé.
  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenPanel(null);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenPanel(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // Changement de route : referme tout — comparaison pendant le rendu plutôt
  // qu'un effet qui appellerait setState de façon synchrone.
  const [seenPathname, setSeenPathname] = useState(pathname);
  if (pathname !== seenPathname) {
    setSeenPathname(pathname);
    setOpenPanel(null);
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  /** Dans un module d'exercices, l'entrée « Exercices » reste allumée. */
  function isActive(href: string): boolean {
    if (href === "/exercices") return EXERCISE_ROUTES.some((route) => pathname.startsWith(route));
    return pathname.startsWith(href);
  }
  const initial = (user?.email ?? "?").trim().charAt(0).toUpperCase();

  // DEUX BARRES, PAS UNE.
  //
  // Connecté, elle n'a aucun fond à elle : `bg-bg/72` posait 72 % de noir
  // par-dessus le voile d'ambiance (body::before), et la bande de 64 px du
  // haut se retrouvait plus sombre que le reste — une démarcation visible
  // alors même qu'aucune bordure n'était tracée. Sans fond, le voile
  // traverse la barre intact et le `backdrop-blur` assure seul la
  // lisibilité de ce qui défile dessous.
  //
  // DÉCONNECTÉ, LE FLOU NE TIENT PAS. La page d'accueil ouvre sur un titre
  // de 52 px en trois couleurs saturées, qui passe pile sous la barre : le
  // flou n'en fait pas un fond, il en fait une bouillie colorée mouvante
  // derrière la marque. Un aplat franc y est la seule réponse.
  //
  // MAIS `bg-bg` SEUL DONNE UN NOIR (ou un blanc) FRANC, pas la couleur de
  // la page. La page n'est jamais à `--color-bg` : le voile d'ambiance la
  // teinte par-dessus, et il est à son maximum précisément en haut d'écran,
  // là où passe la barre. Un aplat du token nu se lisait donc comme une
  // bande noire posée sur un fond légèrement plus clair.
  //
  // D'où le voile reconduit à l'intérieur de la barre (`.ambient-veil`,
  // globals.css) : mêmes dégradés, même boîte de référence — le viewport —
  // ce qui n'aligne les pourcentages que parce que la barre est accrochée à
  // `top-0`. Le résultat est exactement la couleur qu'aurait la page à cet
  // endroit, dans les deux thèmes, sans démarcation ni bordure de rattrapage.
  const solid = !user;

  return (
    <header
      className={`sticky top-0 z-50 ${solid ? "bg-bg" : "backdrop-blur-md"}`}
    >
      {/* Le rogneur, et non `overflow-hidden` sur la barre elle-même : le
          panneau du compte est un `absolute top-full` qui déborde vers le
          bas, et la barre le couperait net. */}
      {solid && (
        <div
          aria-hidden
          // `-z-10` : un absolu à z-index auto peint AU-DESSUS du contenu en
          // flux, donc le voile serait passé par-dessus le logo et les
          // boutons. En négatif il se range derrière eux — et il reste
          // confiné à la barre, qui a son propre contexte d'empilement du
          // fait de son `z-50`.
          className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        >
          <span className="ambient-veil" />
        </div>
      )}
      <div ref={navRef} className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-6">
        {/* Le `flex-1` est porté par le conteneur et non par le lien : sur le
            lien, tout le tiers gauche de la barre deviendrait une zone
            cliquable qui ramène à l'accueil. */}
        <div className="flex flex-1 items-center">
          {/* NI HALO, NI OMBRE, NI ZOOM. Le <span> flouté qui vivait ici
              projetait un dégradé derrière la marque : c'était lui la lueur
              autour du logo, pas une box-shadow — d'où le fait qu'elle ait
              survécu à deux nettoyages du CSS.
              Ce qui reste au survol est entièrement interne au dessin :
              `logo-lift` (globals.css) n'agit que sur la saturation et la
              luminosité. Rien ne déborde du carré. */}
          <Link href="/" className="group flex shrink-0 items-center gap-2.5">
            <Logo size={30} className="logo-lift shrink-0" />
            <span className="font-display text-[19px] font-bold tracking-tight">Privetik</span>
          </Link>
        </div>

        {/* Navigation d'apprentissage, au centre de la barre : le logo et le
            bloc compte qui l'encadrent portent le même `flex-1`, si bien que
            les liens tombent au milieu quelles que soient leurs largeurs
            respectives — un simple `flex-1` sur la nav seule les aurait
            collés au logo.
            
            Elle disparaît sous lg, où les mêmes sections vivent désormais
            dans le bandeau du bas (BottomNav) : quatre entrées plus le bloc
            compte ne tiennent pas sur 640 px sans se couper en deux lignes,
            et un bandeau sous le pouce vaut mieux qu'une liste repliée
            derrière un bouton.

            Le contenu de la liste dépend de qui regarde — voir PUBLIC_NAV. */}
        <nav aria-label="Sections" className="hidden items-center gap-0.5 lg:flex">
          {(user ? MAIN : PUBLIC_NAV).map((link) => (
            <TopLink key={link.href} item={link} active={isActive(link.href)} />
          ))}
        </nav>

        {/* LE RAIL. Plus de bouton burger : les sections sont dans le
            bandeau du bas, et ce qui restait derrière le repli — thème,
            abonnement, compte — tient en trois pictogrammes de 36 px. Un
            menu qui s'ouvre pour montrer trois entrées coûte un appui de
            plus que les trois entrées elles-mêmes. Le rail est donc le même
            à toute largeur ; seuls « Tableau de bord » et la liste des
            sections restent réservés au bureau, faute de place ailleurs. */}
        <div className="flex flex-1 items-center justify-end gap-2">
          <ThemeToggle />

          {user ? (
            <>
              {/* UNIQUEMENT POUR UN COMPTE GRATUIT. La couronne seule, dans
                  un carré au dégradé : le mot « Pro » à côté d'elle disait
                  deux fois la même chose, et c'est le dégradé — le seul de
                  toute la barre — qui porte l'accroche, pas le libellé.

                  32 px LÀ OÙ SES VOISINS EN FONT 36, et c'est voulu : à
                  taille égale, un aplat tricolore saturé pèse bien plus lourd
                  que deux glyphes monochromes au trait fin. Le rendre un cran
                  plus petit ramène les trois objets au même poids optique —
                  ce qui est la vraie régularité d'un rail, pas l'égalité des
                  boîtes. */}
              {!isPro && (
                <Link
                  href="/premium"
                  title="Passer à Privetik Pro"
                  aria-label="Passer à Privetik Pro"
                  className="pro-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]"
                >
                  <CrownIcon size={18} />
                </Link>
              )}

              <Link
                href="/dashboard"
                className={`hidden whitespace-nowrap rounded-lg border px-4 py-2 font-display text-sm font-semibold transition-colors lg:block ${
                  pathname.startsWith("/dashboard")
                    ? "border-accent bg-accent/12 text-accent-ink"
                    : "border-border text-text hover:bg-accent/10 hover:border-accent/35"
                }`}
              >
                Tableau de bord
              </Link>

              {/* Le compte tient dans son initiale : deux entrées qui ne
                  sont pas des destinations d'apprentissage, et qui
                  prenaient auparavant autant de place qu'un module. */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOpenPanel((p) => (p === "account" ? null : "account"))}
                  aria-expanded={openPanel === "account"}
                  aria-haspopup="true"
                  aria-label="Mon compte"
                  className={`relative flex h-9 w-9 items-center justify-center rounded-full border font-display text-sm font-bold transition-colors ${
                    pathname.startsWith("/account") || openPanel === "account"
                      ? "border-accent bg-accent/12 text-accent-ink"
                      : "border-border text-muted hover:bg-accent/10 hover:border-accent/35 hover:text-text"
                  }`}
                >
                  {initial}
                  {/* LE STATUT SE LIT SUR L'AVATAR, en bas à droite, là où
                      les interfaces posent les pastilles de statut. Bordé de
                      la couleur du fond pour se détacher du cercle qu'il
                      chevauche — sans ce liseré, la couronne se confond avec
                      le bord de l'avatar. */}
                  {isPro && (
                    <span
                      aria-hidden
                      title="Abonné Privetik Pro"
                      className="pro-gradient absolute -bottom-1 -right-1 flex h-[19px] w-[19px] items-center justify-center rounded-full ring-2 ring-bg"
                    >
                      <CrownIcon size={13} />
                    </span>
                  )}
                </button>

                {openPanel === "account" && (
                  <div className="modal-panel animate-pop-in absolute right-0 top-full z-50 mt-2 w-[240px] origin-top-right overflow-hidden rounded-[14px] p-1.5">
                    {user.email && (
                      <p className="truncate px-3 py-2 font-display text-xs text-muted">
                        {user.email}
                      </p>
                    )}
                    <Link
                      href="/account"
                      className="menu-item block rounded-[10px] px-3 py-2.5 font-display text-sm font-medium text-text hover:text-accent-ink"
                    >
                      Mon compte
                    </Link>
                    <button
                      onClick={signOut}
                      className="menu-item block w-full rounded-[10px] px-3 py-2.5 text-left font-display text-sm font-medium text-muted hover:text-danger"
                    >
                      Déconnexion
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <Link
              href="/login"
              className="btn surface-interactive surface-static inline-flex h-9 whitespace-nowrap rounded-lg px-4 font-display text-sm font-semibold lg:h-10 lg:px-5"
            >
              <span>Se connecter</span>
            </Link>
          )}
        </div>
      </div>

    </header>
  );
}

/**
 * Un lien de la barre, hors menu déroulant. Extrait parce que « Cours »
 * s'affiche AVANT le déroulant et le reste après : sans lui, le même
 * balisage serait recopié de part et d'autre.
 */
function TopLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={`whitespace-nowrap rounded-lg px-3 py-2 font-display text-sm font-medium transition-colors ${
        active ? "text-text" : "text-muted hover:text-text"
      }`}
    >
      {item.label}
    </Link>
  );
}
