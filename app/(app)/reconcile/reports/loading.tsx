import { SkeletonPage, SkeletonFormCard, SkeletonTable } from "@/components/ui/Skeleton";
import { ReportsTabsSkeleton } from "../ReportsTabsSkeleton";

export default function Loading() {
  return (
    <SkeletonPage actions={2}>
      <ReportsTabsSkeleton />
      <div className="flex flex-col gap-4">
        <SkeletonFormCard rows={2} />
        <SkeletonTable title columns={4} rows={6} />
        <SkeletonTable title columns={3} rows={6} />
      </div>
    </SkeletonPage>
  );
}
