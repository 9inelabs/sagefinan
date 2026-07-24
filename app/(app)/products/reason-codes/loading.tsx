import { SkeletonPage, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonTable columns={4} rows={8} />
    </SkeletonPage>
  );
}
