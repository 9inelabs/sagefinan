import { SkeletonPage, SkeletonListRows } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <div className="max-w-[480px] mx-auto w-full">
        <SkeletonListRows rows={8} />
      </div>
    </SkeletonPage>
  );
}
