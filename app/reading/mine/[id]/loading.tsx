import { ReadingTextSkeleton } from "@/components/exercises/ReadingSkeletons";

// Même arbitrage que app/reading/[textId]/loading.tsx : page privée, jamais
// indexée — le squelette immédiat vaut plus que le statut d'un 404.
export default function MyReadingTextLoading() {
  return <ReadingTextSkeleton />;
}
