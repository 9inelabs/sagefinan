import { SkeletonPage, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage actions={1}>
      <SkeletonTable columns={7} rows={8} />
    </SkeletonPage>
  );
}
