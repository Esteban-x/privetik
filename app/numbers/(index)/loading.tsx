import { ModuleHubSkeleton } from "@/components/ui/PageSkeletons";
import { NUMBER_SKILLS } from "@/lib/numbers/exercises";

// Le squelette de CETTE page — voir components/ui/PageSkeletons.tsx.
export default function NumbersHubLoading() {
  return <ModuleHubSkeleton showcase="table" lesson card="bar" cards={NUMBER_SKILLS.length} />;
}
