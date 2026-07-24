import { SkeletonPage, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage actions={1}>
      <SkeletonTable columns={6} rows={8} />
    </SkeletonPage>
  );
}
