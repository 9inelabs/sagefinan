import { SkeletonPage, SkeletonListRows } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonListRows rows={8} />
    </SkeletonPage>
  );
}
