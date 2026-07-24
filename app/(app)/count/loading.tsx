import { SkeletonPage, SkeletonFormCard } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonFormCard rows={2} />
    </SkeletonPage>
  );
}
