import type { MetadataRoute } from "next";
import { absolute } from "@/lib/seo/site";
import { LESSONS } from "@/lib/courses/catalog";
import { CASES } from "@/lib/grammar/cases";
import { GUIDES } from "@/lib/seo/guides";

/**
 * Le plan du site.
 *
 * IL NE LISTE QUE CE QU'UN VISITEUR DÉCONNECTÉ PEUT VOIR. Déclarer une page
 * qui répond une redirection vers /login est contre-productif : le moteur la
 * suit, ne trouve pas le contenu annoncé, et apprend à se méfier du fichier
 * entier.
 *
 * IL EST DÉRIVÉ DU CATALOGUE, jamais recopié. Les 130 leçons et les six cas
 * viennent des mêmes constantes que les pages elles-mêmes : une leçon
 * ajoutée demain entre dans le plan sans que personne y pense, et une leçon
 * retirée en sort. Un plan tenu à la main est un plan qui ment au bout de
 * trois mois — et un moteur qui rencontre trop de 404 déclarées cesse de le
 * relire.
 *
 * LES PRIORITÉS SONT RELATIVES. Elles ne disent pas à Google ce qui est
 * important dans l'absolu — il n'en tient d'ailleurs presque pas compte —
 * mais dans quel ordre explorer quand il ne peut pas tout faire. L'accueil et
 * les six cas d'abord : ce sont les pages qui répondent aux requêtes les plus
 * cherchées.
 */

type Entry = {
  path: string;
  /** Le poids RELATIF des pages entre elles, pas une note absolue. */
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
};

const STATIC_PAGES: Entry[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/cours", priority: 0.9, changeFrequency: "weekly" },
  { path: "/cases", priority: 0.9, changeFrequency: "monthly" },
  { path: "/cases/melange", priority: 0.7, changeFrequency: "monthly" },
  // Le catalogue des exercices : la page qui énumère ce que l'app fait.
  { path: "/exercices", priority: 0.8, changeFrequency: "monthly" },
  // Les deux accueils qui montrent une démonstration à un visiteur.
  { path: "/reading", priority: 0.7, changeFrequency: "monthly" },
  { path: "/vocabulary", priority: 0.7, changeFrequency: "monthly" },
  { path: "/alphabet", priority: 0.8, changeFrequency: "monthly" },
  { path: "/conjugation", priority: 0.8, changeFrequency: "monthly" },
  { path: "/numbers", priority: 0.7, changeFrequency: "monthly" },
  { path: "/premium", priority: 0.6, changeFrequency: "monthly" },
  { path: "/guides", priority: 0.5, changeFrequency: "yearly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const cases: Entry[] = CASES.map((c) => ({
    path: `/cases/${c.id}`,
    priority: 0.9,
    changeFrequency: "monthly",
  }));

  const lessons: Entry[] = LESSONS.map(({ lesson }) => ({
    path: `/cours/${lesson.slug}`,
    priority: 0.7,
    changeFrequency: "monthly",
  }));

  // Les guides répondent à des questions durables : ils ne changent pas
  // d'une saison à l'autre, et l'annoncer évite de faire revenir un robot
  // pour rien.
  const guides: Entry[] = GUIDES.map((g) => ({
    path: `/guides/${g.slug}`,
    priority: 0.6,
    changeFrequency: "yearly",
  }));

  return [...STATIC_PAGES, ...cases, ...lessons, ...guides].map(
    ({ path, priority, changeFrequency }) => ({
      url: absolute(path),
      lastModified,
      changeFrequency,
      priority,
    })
  );
}
