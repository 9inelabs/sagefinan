import { SkeletonPage, SkeletonFormCard, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <div className="mb-4">
        <SkeletonFormCard rows={4} />
      </div>
      <SkeletonTable title columns={5} rows={6} />
    </SkeletonPage>
  );
}
