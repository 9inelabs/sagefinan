import { SkeletonPage, SkeletonStatRow, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonStatRow count={4} />
      <SkeletonTable title columns={7} rows={6} />
    </SkeletonPage>
  );
}
