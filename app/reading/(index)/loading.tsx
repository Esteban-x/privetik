import { ReadingHubSkeleton } from "@/components/exercises/ReadingSkeletons";

// Voir components/ui/PageSkeleton.tsx : ce fichier autorise Next à
// PRÉCHARGER la route et à basculer dessus au clic. Dans le groupe `(index)`,
// il ne couvre que l'index — les textes ont leur propre squelette.
export default function ReadingHubLoading() {
  return <ReadingHubSkeleton />;
}
