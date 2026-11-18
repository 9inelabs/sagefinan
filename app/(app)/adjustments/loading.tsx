import { SkeletonPage, SkeletonFormCard, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonFormCard rows={3} />
      <div className="mt-3">
        <SkeletonTable title columns={7} rows={4} />
      </div>
    </SkeletonPage>
  );
}
