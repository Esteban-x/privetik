/**
 * Le prix de Privetik Pro, tel qu'il s'AFFICHE — l'accueil et la page des
 * tarifs le lisent ici, pour ne jamais annoncer deux montants différents.
 * Le montant débité, lui, est celui du prix Stripe.
 */
export const PRICE_EUR = 16.99;

const eur = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);

export const PRICE_LABEL = eur(PRICE_EUR);

/** Ramené au jour, le prix se compare à une dépense quotidienne banale — la
 *  seule échelle où « 17 € » cesse d'être un palier psychologique. Calculé,
 *  jamais écrit en dur : le jour où le tarif bouge, cette ligne suit. */
export const PRICE_PER_DAY = eur(Math.round((PRICE_EUR * 12 * 100) / 365) / 100);
