import { SkeletonPage, SkeletonTable } from "@/components/ui/Skeleton";
import { ReportsTabsSkeleton } from "../ReportsTabsSkeleton";

export default function Loading() {
  return (
    <SkeletonPage actions={1}>
      <ReportsTabsSkeleton />
      <SkeletonTable columns={10} rows={8} />
    </SkeletonPage>
  );
}
