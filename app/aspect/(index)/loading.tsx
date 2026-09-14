import { ModuleHubSkeleton } from "@/components/ui/PageSkeletons";
import { ASPECT_SKILLS } from "@/lib/aspect/exercises";

// Le squelette de CETTE page — voir components/ui/PageSkeletons.tsx.
export default function ModuleHubLoading() {
  return <ModuleHubSkeleton showcase="diagrams" card="icon" cards={ASPECT_SKILLS.length} />;
}
