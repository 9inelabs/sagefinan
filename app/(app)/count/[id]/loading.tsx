import { SkeletonPage, SkeletonBlock, SkeletonListRows } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <div className="flex gap-2 mb-3">
        <SkeletonBlock className="h-9 flex-1 max-w-sm" />
        <SkeletonBlock className="h-9 w-24" />
      </div>
      <SkeletonBlock className="h-2 w-full mb-4" />
      <SkeletonListRows rows={12} />
    </SkeletonPage>
  );
}
