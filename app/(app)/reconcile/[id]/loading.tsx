import { SkeletonPage, SkeletonBlock, SkeletonTable, SkeletonFormCard } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage actions={1}>
      <div className="flex gap-1 border-b border-n200 mb-4">
        <SkeletonBlock className="h-8 w-24 mb-1" />
        <SkeletonBlock className="h-8 w-24 mb-1" />
      </div>
      <div className="grid grid-cols-1 min-[900px]:grid-cols-[1fr_300px] gap-4 items-start">
        <SkeletonTable title columns={4} rows={7} />
        <SkeletonFormCard rows={2} />
      </div>
    </SkeletonPage>
  );
}
