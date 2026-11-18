import { SkeletonPage, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage actions={1}>
      <SkeletonTable title columns={6} rows={6} />
    </SkeletonPage>
  );
}
