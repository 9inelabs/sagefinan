import { SkeletonPage, SkeletonStatRow, SkeletonListRows } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage actions={1}>
      <SkeletonStatRow count={2} />
      <SkeletonListRows rows={10} />
    </SkeletonPage>
  );
}
