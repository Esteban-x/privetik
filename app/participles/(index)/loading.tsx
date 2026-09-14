import { ModuleHubSkeleton } from "@/components/ui/PageSkeletons";
import { PARTICIPLE_SKILLS } from "@/lib/participles/exercises";

// Le squelette de CETTE page — voir components/ui/PageSkeletons.tsx.
export default function ModuleHubLoading() {
  return <ModuleHubSkeleton showcase="rows" card="icon" cards={PARTICIPLE_SKILLS.length} />;
}
