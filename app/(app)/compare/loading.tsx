import { SkeletonPage, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonTable title columns={7} rows={8} />
    </SkeletonPage>
  );
}
