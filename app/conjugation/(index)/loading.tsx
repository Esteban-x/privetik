import { ModuleHubSkeleton } from "@/components/ui/PageSkeletons";
import { CONJUGATION_SKILLS } from "@/lib/conjugation/exercises";

// Le squelette de CETTE page — voir components/ui/PageSkeletons.tsx.
export default function ConjugationHubLoading() {
  return <ModuleHubSkeleton showcase="table" lesson card="bar" cards={CONJUGATION_SKILLS.length} />;
}
