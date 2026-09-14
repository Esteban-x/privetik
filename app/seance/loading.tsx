import PageSkeleton from "@/components/ui/PageSkeleton";

// Voir components/ui/PageSkeleton.tsx : autorise Next à précharger la route.
export default function SeanceLoading() {
  return <PageSkeleton variant="hub" width="max-w-3xl" />;
}
