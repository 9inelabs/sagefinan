import { SkeletonPage, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonTable title columns={6} rows={8} />
    </SkeletonPage>
  );
}
