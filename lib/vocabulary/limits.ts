/**
 * Ce qu'un champ du formulaire d'ajout accepte — écrit UNE FOIS, pour les
 * trois endroits qui doivent s'accorder.
 *
 * Le formulaire (components/vocabulary/AddWordForm), la traduction
 * automatique (app/api/vocab/suggest) et l'enregistrement
 * (app/api/vocab/words) plafonnaient chacun de leur côté, et pas au même
 * chiffre : 400, 100, 400. LE PLUS BAS GAGNE TOUJOURS, et c'était celui
 * qu'on ne voyait pas — un paragraphe collé dans le champ partait entier du
 * navigateur, arrivait coupé au centième caractère chez le modèle, et
 * revenait sans rien. Le champ affichait alors 300 caractères de russe en
 * face d'une traduction vide, et le bouton d'ajout restait éteint sans
 * qu'aucun de ces trois plafonds ne soit visible nulle part.
 */

/**
 * Un côté de la paire — le russe ou le français.
 *
 * 200 SUFFISAIT POUR UN MOT, PAS POUR UNE EXPRESSION. On colle aussi des
 * tournures — « Что вы хотите вместо этого » — et parfois une phrase entière
 * trouvée dans un texte. Ce qui empêche d'aller au-delà de 400, c'est la
 * synthèse vocale : chaque caractère de ce champ finit lu à voix haute, et
 * elle se facture au caractère.
 */
export const FIELD_MAX = 400;

/**
 * La prononciation écrite, qui suit le russe et le dépasse : le latin
 * dépense plus de lettres que le cyrillique pour le même son (« щ » s'y
 * écrit « chtch »). Elle n'est jamais lue à voix haute, donc rien ne se
 * facture ici au caractère.
 */
export const TRANSLIT_MAX = 800;
