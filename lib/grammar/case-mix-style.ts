import { CASES, CASES_BY_LEARNING_ORDER } from "./cases";

/**
 * Les couleurs des « Cas mélangés ».
 *
 * Chaque page de cas porte SA couleur jusque dans le champ de saisie et le
 * bouton (`.case-tint`, globals.css). Le mélange n'en a pas une seule.
 *
 * LE DÉGRADÉ NE RÉCITE PAS LES SIX CAS. La première version les posait bout
 * à bout — gris, brun, violet, vert, ambre, bleu : six teintes de même
 * valeur, sombres et peu saturées, qui côte à côte se lisaient comme une
 * bande boueuse. La légende des six reste dans les pastilles de la carte
 * d'accès (CASE_MIX_COLORS) ; le thème, lui, prend les quatre cas de teinte
 * franche, rangés sur le cercle chromatique (violet, bleu, vert, ambre),
 * éclaircis, et interpolés en oklch pour qu'aucun passage ne traverse de
 * gris.
 */

const colorOf = (id: string) => {
  const found = CASES.find((c) => c.id === id);
  if (!found) throw new Error(`Cas inconnu : ${id}`);
  return found.color;
};

/** Un cran plus clair : les couleurs des cas sont réglées pour du texte blanc posé dessus, pas pour briller. */
const lift = (hex: string) => `color-mix(in oklab, ${hex} 78%, white)`;

const VIVID = ["accusative", "instrumental", "genitive", "dative"].map(colorOf).map(lift);

export const CASE_MIX_GRADIENT = `linear-gradient(in oklch 120deg, ${VIVID.join(", ")})`;

/**
 * Les variables lues par `.mix-tint`, `.field-mix` et `.btn-mix` : le dégradé
 * entier, et trois de ses couleurs pour les lumières que `box-shadow` ne
 * sait pas peindre en dégradé.
 */
export const CASE_MIX_VARS = {
  "--mix": CASE_MIX_GRADIENT,
  "--mix-a": VIVID[0],
  "--mix-c": VIVID[1],
  "--mix-f": VIVID[VIVID.length - 1],
} as Record<string, string>;

/** Les six cas dans l'ordre où on les apprend — la légende, pas le thème. */
export const CASE_MIX_COLORS = CASES_BY_LEARNING_ORDER.map((c) => c.color);
