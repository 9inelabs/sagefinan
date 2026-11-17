import { SkeletonBlock, SkeletonPage, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage actions={2}>
      <div className="grid grid-cols-2 min-[700px]:grid-cols-3 min-[1180px]:grid-cols-[1.25fr_repeat(4,1fr)] gap-2.5 min-[900px]:gap-3 mb-2.5 min-[900px]:mb-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`bg-white rounded-premium shadow-premium px-4 py-3.5 min-h-[104px] ${i === 0 ? "col-span-2 min-[700px]:col-span-1" : ""}`}>
            <SkeletonBlock className="h-3 w-24 mb-3" />
            <SkeletonBlock className="h-6 w-16" />
          </div>
        ))}
      </div>
      <div className="grid min-[1180px]:grid-cols-[minmax(0,1fr)_320px] gap-2.5 min-[900px]:gap-3 mb-2.5 min-[900px]:mb-3">
        <div className="bg-white rounded-premium shadow-premium p-4.5">
          <SkeletonBlock className="h-4 w-32 mb-5" />
          <SkeletonBlock className="h-[220px] w-full" />
        </div>
        <div className="surface-tint rounded-premium p-5">
          <SkeletonBlock className="h-3 w-28 mb-3 bg-white/60" />
          <SkeletonBlock className="h-8 w-44 bg-white/60" />
        </div>
      </div>
      <div className="grid min-[1180px]:grid-cols-[minmax(0,1fr)_320px] gap-2.5 min-[900px]:gap-3 items-start">
        <div className="grid gap-2.5 min-[900px]:gap-3">
          <SkeletonTable title columns={6} rows={4} />
          <SkeletonTable title columns={5} rows={3} />
        </div>
        <div className="surface-dark rounded-premium h-[360px]" />
      </div>
    </SkeletonPage>
  );
}
