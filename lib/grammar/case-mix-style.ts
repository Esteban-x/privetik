import { CASES_BY_LEARNING_ORDER } from "./cases";

/**
 * Les couleurs des « Cas mélangés » : les six cas à la fois.
 *
 * Chaque page de cas porte SA couleur jusque dans le champ de saisie et le
 * bouton (`.case-tint`, globals.css). Le mélange n'en a pas une : il les a
 * toutes, dans l'ordre où on les apprend. Le dégradé dit d'un coup d'œil ce
 * que la page entraîne — n'importe lequel des six.
 */

const COLORS = CASES_BY_LEARNING_ORDER.map((c) => c.color);

export const CASE_MIX_GRADIENT = `linear-gradient(90deg, ${COLORS.join(", ")})`;

/**
 * Les variables lues par `.mix-tint`, `.field-mix` et `.btn-mix` : le dégradé
 * entier, et trois de ses couleurs pour les lumières que `box-shadow` ne
 * sait pas peindre en dégradé.
 */
export const CASE_MIX_VARS = {
  "--mix": CASE_MIX_GRADIENT,
  "--mix-a": COLORS[0],
  "--mix-c": COLORS[Math.floor(COLORS.length / 2)],
  "--mix-f": COLORS[COLORS.length - 1],
} as Record<string, string>;

export const CASE_MIX_COLORS = COLORS;
