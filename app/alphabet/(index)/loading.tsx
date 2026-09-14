import { ModuleHubSkeleton } from "@/components/ui/PageSkeletons";
import { ALPHABET_SKILLS } from "@/lib/alphabet/exercises";

// Le squelette de CETTE page — voir components/ui/PageSkeletons.tsx.
export default function AlphabetHubLoading() {
  return <ModuleHubSkeleton showcase="table" lesson card="bar" cards={ALPHABET_SKILLS.length} />;
}
