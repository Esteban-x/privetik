import { ModuleHubSkeleton } from "@/components/ui/PageSkeletons";
import { ADJECTIVE_SKILLS } from "@/lib/adjectives/exercises";

// Le squelette de CETTE page — voir components/ui/PageSkeletons.tsx.
export default function ModuleHubLoading() {
  return <ModuleHubSkeleton showcase="table" card="icon" cards={ADJECTIVE_SKILLS.length} />;
}
