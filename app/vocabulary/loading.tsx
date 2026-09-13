import { WorkspaceSkeleton } from "@/components/vocabulary/VocabularySkeletons";

// Voir components/ui/PageSkeleton.tsx : ce fichier ne sert pas qu'à
// remplir l'écran, il autorise Next à PRÉCHARGER cette route dynamique et
// donc à basculer dessus au clic, sans attendre le serveur.
//
// Le squelette est celui de l'écran réel — rail des listes, puis les mots —
// et non la grille générique « hub », qui ne ressemblait à rien de ce qui
// arrivait ensuite. Les modes de révision ont chacun le leur : sans eux, ils
// héritaient de celui-ci.
export default function VocabularyLoading() {
  return <WorkspaceSkeleton />;
}
