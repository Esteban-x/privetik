"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { EXERCISE_ROUTES } from "@/lib/exercises/routes";
import { BookIcon, CardsIcon, ChartIcon, TargetIcon, TextIcon } from "@/components/ui/icons";

/**
 * La navigation d'application, en bas de l'écran.
 *
 * POURQUOI EN BAS. Les cinq sections sont les mêmes à chaque session, et
 * une session dure quelques minutes : c'est exactement le profil pour
 * lequel le bandeau du bas existe. Replié derrière le bouton burger, chaque
 * changement de section coûtait deux appuis, dont le premier dans le coin
 * haut-droit — le point le plus difficile à atteindre d'une seule main sur
 * un grand téléphone. Il en coûte un, dans la zone du pouce.
 *
 * POURQUOI IL DISPARAÎT PENDANT UN EXERCICE. Les commandes les plus
 * touchées de l'app sont déjà en bas : les quatre notes de révision
 * (« À revoir / Difficile / Bien / Facile ») et « Suivant → ». Un bandeau
 * fixe se serait posé juste dessous, et un pouce qui vise « Facile » en
 * retombant deux millimètres trop bas aurait quitté la session en cours.
 * Il s'efface donc sur les écrans qui sont un poste de travail à tâche
 * unique — et ce sont précisément les plus serrés en hauteur, qui
 * récupèrent au passage les 60 px.
 *
 * DEUX JEUX D'ONGLETS. Il n'en portait qu'un, réservé aux comptes : à
 * l'époque, les cinq destinations étaient toutes protégées et les montrer à
 * un visiteur aurait fait cinq onglets qui renvoient à /login. Depuis que le
 * cours et les tables sont publics, un visiteur sur téléphone se retrouvait
 * au contraire SANS aucune navigation — ni bandeau, ni menu replié, la barre
 * du haut ne portant ses liens qu'au-delà de 1024 px. Il a donc son propre
 * jeu, qui ne contient que du lisible sans compte.
 */

const MEMBER_TABS = [
  { href: "/cours", label: "Cours", Icon: BookIcon },
  { href: "/exercices", label: "Exercices", Icon: TargetIcon },
  { href: "/vocabulary", label: "Vocabulaire", Icon: CardsIcon },
  { href: "/reading", label: "Textes", Icon: TextIcon },
  // « Tableau de bord » ne tient pas dans un cinquième de 375 px. « Progrès »
  // n'est pas un raccourci arbitraire : série, XP, précision et niveau sont
  // tout ce que cette page contient. La barre du bureau, elle, a la place du
  // nom complet et le garde.
  { href: "/dashboard", label: "Progrès", Icon: ChartIcon },
] as const;

/**
 * Le même produit que pour un membre, et non « ce qui se trouve être
 * public » — voir le long commentaire de PUBLIC_NAV dans NavBar.tsx, qui
 * porte le raisonnement. Les deux listes doivent bouger ensemble : elles
 * sont la même navigation à deux largeurs d'écran.
 *
 * /cours et /exercices s'ouvrent sans compte ; /vocabulary et /reading
 * mènent à /login, qui dit alors ce qui attend derrière.
 */
const VISITOR_TABS = [
  { href: "/cours", label: "Cours", Icon: BookIcon },
  { href: "/exercices", label: "Exercices", Icon: TargetIcon },
  { href: "/vocabulary", label: "Vocabulaire", Icon: CardsIcon },
  { href: "/reading", label: "Textes", Icon: TextIcon },
  { href: "/premium", label: "Tarifs", Icon: ChartIcon },
] as const;

/**
 * Les modes de révision : une carte à la fois, des boutons de notation en
 * bas d'écran. On y entre pour travailler, pas pour naviguer.
 */
const SESSION_PATHS = [
  "/vocabulary/flashcards",
  "/vocabulary/qcm",
  "/vocabulary/typing",
  "/vocabulary/voice",
  "/level-test",
];

/**
 * Une page de compétence — /cases/genitive, /aspect/past, /numbers/ordinals…
 * Déduite d'EXERCISE_ROUTES plutôt qu'énumérée : la liste est déjà tenue à
 * jour et vérifiée par `npm run check:exercises`, et un module ajouté
 * demain hériterait sinon d'un bandeau au mauvais endroit sans que personne
 * ne s'en aperçoive. `/exercices` est l'index des modules, pas un exercice.
 */
function isSkillPage(path: string): boolean {
  return EXERCISE_ROUTES.some((root) => root !== "/exercices" && path.startsWith(root + "/"));
}

function isSession(path: string): boolean {
  if (SESSION_PATHS.some((p) => path === p || path.startsWith(p + "/"))) return true;
  return isSkillPage(path);
}

export default function BottomNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  if (isSession(pathname)) return null;

  // L'ACCUEIL FAISAIT EXCEPTION POUR UN VISITEUR, et c'était le mauvais
  // calcul. L'idée — une page de vente n'a pas à ressembler à une app qu'on
  // n'a pas choisie — supposait que le visiteur repart d'où il vient. En
  // pratique il ARRIVE là, par une recherche ou un lien, et sur téléphone il
  // n'avait alors AUCUNE navigation : ni bandeau, ni menu replié, la barre du
  // haut ne portant ses liens qu'au-delà de 1024 px. La seule sortie était le
  // corps de la page. Une page de vente sans navigation ne vend pas mieux,
  // elle enferme.
  const tabs = signedIn ? MEMBER_TABS : VISITOR_TABS;

  return (
    <>
      {/* Le bandeau est `fixed` : sans ce jumeau dans le flux, il recouvrirait
          la fin de chaque page. Rendu ici plutôt qu'en padding sur <main>
          pour qu'il apparaisse et disparaisse avec la barre — un padding
          permanent aurait laissé un vide en bas des écrans d'exercice, là
          justement où la barre s'efface. */}
      <div aria-hidden className="h-[calc(3.75rem+env(safe-area-inset-bottom))] lg:hidden" />

      {/* UN APLAT FRANC, pas un verre dépoli. Le flou laissait deviner le
          contenu qui passe dessous : sur des onglets qu'on vise au pouce
          sans regarder, ce fourmillement derrière les icônes est du bruit,
          et il change à chaque défilement. `bg2` est le gris sombre du thème
          noir et le blanc du thème clair — un cran au-dessus du fond de page
          dans les deux cas, ce qui pose le bandeau comme un objet distinct
          plutôt que comme une zone de la page. */}
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg2 lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="flex h-[3.75rem] items-stretch">
          {tabs.map(({ href, label, Icon }) => {
            const active =
              href === "/exercices"
                ? EXERCISE_ROUTES.some((route) => pathname.startsWith(route))
                : pathname.startsWith(href);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-full flex-col items-center justify-center gap-1 px-1 transition-colors ${
                    active ? "text-accent-ink" : "text-muted"
                  }`}
                >
                  <Icon className="h-[22px] w-[22px] shrink-0" strokeWidth={active ? 2.2 : 1.8} />
                  <span className="font-display text-[10px] font-semibold leading-none">
                    {label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
