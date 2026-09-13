import { ReadingTextSkeleton } from "@/components/exercises/ReadingSkeletons";

// Une frontière de chargement sur une page qui appelle `notFound()` fait
// partir un identifiant inventé en 200 plutôt qu'en 404 (voir check:seo).
// Assumé ICI, et seulement ici : /reading/* demande un compte et n'est pas
// indexé (robots.ts), donc le statut n'a aucun lecteur — alors que l'attente
// d'un texte sans squelette, elle, se voit à chaque ouverture.
export default function ReadingTextLoading() {
  return <ReadingTextSkeleton />;
}
