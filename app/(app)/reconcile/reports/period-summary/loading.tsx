import { SkeletonPage, SkeletonFormCard, SkeletonStatRow } from "@/components/ui/Skeleton";
import { ReportsTabsSkeleton } from "../../ReportsTabsSkeleton";

export default function Loading() {
  return (
    <SkeletonPage actions={1}>
      <ReportsTabsSkeleton />
      <div className="mb-4">
        <SkeletonFormCard rows={2} />
      </div>
      <SkeletonStatRow count={4} />
    </SkeletonPage>
  );
}
