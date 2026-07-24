import { SkeletonPage, SkeletonStatRow, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage actions={2}>
      <SkeletonStatRow count={4} />
      <SkeletonTable title columns={7} rows={8} />
    </SkeletonPage>
  );
}
