import { SkeletonPage, SkeletonBlock } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <div className="max-w-[860px] mx-auto">
        <div className="surface-hero rounded-[22px] h-[230px]" />
        <div className="bg-white rounded-b-[22px] p-6 grid gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}
