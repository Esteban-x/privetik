/**
 * Les couleurs des modules et de leurs compétences.
 *
 * Elles vivent à part des pages pour deux raisons. Un fichier `page.tsx` ne
 * doit exporter que ce que Next attend (le composant, `metadata`, la
 * configuration de route) : y ajouter une table de couleurs partagée avec la
 * page de compétence ferait une exportation qui n'a rien à y faire. Et la
 * page d'accueil des exercices a besoin des mêmes couleurs sans vouloir
 * charger les banques d'exercices.
 *
 * LA COULEUR EST UN IDENTIFIANT, pas une décoration : c'est elle qui permet
 * de reconnaître un module d'un coup d'œil dans une liste, avant même
 * d'avoir lu son titre. Elle ne remplit donc son rôle que si deux modules
 * ne peuvent pas être confondus.
 *
 * La palette précédente avait deux bleus voisins (mouvement #2456A6 et
 * nombres #4a63d6) et deux ambres voisins (adjectifs #B5762A et conjugaison
 * #c17d1e) : dans la liste des exercices, quatre modules sur huit se
 * ressemblaient deux à deux. Les huit teintes sont maintenant réparties sur
 * le cercle chromatique, avec au moins 26° entre deux voisines — l'écart
 * en dessous duquel l'œil cesse de les séparer sur une bande de 3 px.
 *
 * Les valeurs sont posées à luminosité comparable pour qu'aucun module ne
 * paraisse plus important qu'un autre, et testées sur les deux thèmes.
 */

export const MODULE_COLORS: Record<string, string> = {
  alphabet: "#2fae64", // vert     140°
  numbers: "#7e8b2e", // olive     70°
  adjectives: "#c9861b", // ambre  38°
  conjugation: "#d94a3d", // rouge  5°
  participles: "#c13b93", // magenta 318°
  cases: "#7b45d4", // violet     262°
  motion: "#3a5fd9", // bleu      228°
  aspect: "#12958f", // sarcelle  178°
};

/**
 * Les compétences d'un même module se distinguent entre elles, mais restent
 * dans le voisinage de la couleur du module : on doit lire « une compétence
 * DE ce module » et non « un neuvième module ».
 */
export const SKILL_COLORS: Record<string, Record<string, string>> = {
  numbers: {
    agreement: "#7e8b2e",
    time: "#9aa33c",
    date: "#63762b",
    age: "#a8952f",
    duration: "#5c7a3e",
    listening: "#8c9a2a",
  },
  conjugation: {
    present1: "#d94a3d",
    present2: "#e0674f",
    mutation: "#bf3b3b",
    past: "#c95a2e",
    imperative: "#d6415c",
  },
  alphabet: {
    letters: "#2fae64",
    traps: "#3fb87c",
    spelling: "#219a58",
    stress: "#4aa88c",
    sounds: "#57b551",
    dictation: "#2a9a78",
  },
};

/** La couleur d'une compétence, avec repli sur celle du module. */
export function skillColor(moduleId: string, skillId: string): string {
  return SKILL_COLORS[moduleId]?.[skillId] ?? MODULE_COLORS[moduleId] ?? "#3a5fd9";
}
