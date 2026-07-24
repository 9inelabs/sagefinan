import { SkeletonPage, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage actions={2}>
      <SkeletonTable columns={6} rows={10} />
    </SkeletonPage>
  );
}
