/**
 * Les segments de premier niveau que l'application connaît.
 *
 * POURQUOI CETTE LISTE EXISTE. Le garde-fou de proxy.ts refuse par défaut :
 * tout ce qui n'est pas explicitement public exige une session. C'est la
 * bonne posture — un écran ajouté demain est protégé sans qu'on y pense —
 * mais elle a un effet de bord : une adresse qui n'existe pas du tout
 * répondait une redirection vers /login au lieu d'une page introuvable. Un
 * visiteur déconnecté ne voyait donc jamais la 404, et un robot
 * d'indexation ne recevait jamais de 404 non plus : il collectionnait des
 * redirections vers une page de connexion.
 *
 * Le proxy consulte donc cette liste avant de rediriger. Segment inconnu =
 * on laisse passer, et Next rend app/not-found.tsx.
 *
 * LE SENS DE L'OUBLI EST LE BON. Ajouter une section sans l'inscrire ici la
 * rend introuvable — un bug visible, qu'on corrige en cinq minutes. L'oubli
 * inverse (une section protégée qu'on laisserait publique) n'est pas
 * possible : cette liste n'accorde aucun accès, elle dit seulement « cette
 * adresse existe ». L'authentification reste décidée par PUBLIC_PATHS.
 */
export const APP_SEGMENTS = [
  "account",
  "adjectives",
  "alphabet",
  "aspect",
  "auth",
  "cases",
  "conjugation",
  "cours",
  "dashboard",
  "erreurs",
  "exercices",
  "forgot-password",
  "guides",
  "level-test",
  "login",
  "motion",
  "numbers",
  "onboarding",
  "participles",
  "premium",
  "reading",
  "reset-password",
  "signup",
  "vocabulary",
] as const;

/** `/` et `/api/...` compris : eux ne passent jamais par la 404 du proxy. */
export function isKnownRoute(pathname: string): boolean {
  if (pathname === "/") return true;
  const segment = pathname.split("/")[1] ?? "";
  if (segment === "api") return true;
  return (APP_SEGMENTS as readonly string[]).includes(segment);
}
