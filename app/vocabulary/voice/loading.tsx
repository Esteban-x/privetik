import { ReviewSessionSkeleton } from "@/components/vocabulary/VocabularySkeletons";

// Sans lui, la route héritait du squelette de /vocabulary — le rail des
// listes — le temps d'afficher une carte.
export default function VoiceLoading() {
  return <ReviewSessionSkeleton mode="voice" />;
}
