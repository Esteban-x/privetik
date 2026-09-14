import { ModuleHubSkeleton } from "@/components/ui/PageSkeletons";
import { MOTION_SKILLS } from "@/lib/motion/exercises";

// Le squelette de CETTE page — voir components/ui/PageSkeletons.tsx.
export default function ModuleHubLoading() {
  return <ModuleHubSkeleton showcase="diagrams" card="icon" cards={MOTION_SKILLS.length} />;
}
