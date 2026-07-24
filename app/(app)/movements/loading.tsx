import { SkeletonPage, SkeletonBlock, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage actions={1}>
      <div className="mb-4.5 max-w-[280px]">
        <div className="bg-white border border-n200 rounded px-3.75 py-3.25">
          <SkeletonBlock className="h-3 w-24 mb-2.5" />
          <SkeletonBlock className="h-6 w-12" />
        </div>
      </div>
      <SkeletonTable title columns={9} rows={8} />
    </SkeletonPage>
  );
}
