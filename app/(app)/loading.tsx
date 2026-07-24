import { SkeletonPage, SkeletonStatRow, SkeletonTable } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage actions={2}>
      <SkeletonStatRow count={5} />
      <div className="mb-4">
        <SkeletonTable title columns={7} rows={5} />
      </div>
      <div className="mb-4">
        <SkeletonTable title columns={7} rows={5} />
      </div>
      <div className="grid min-[900px]:grid-cols-[1fr_300px] gap-4 items-start">
        <SkeletonTable title columns={5} rows={4} />
        <SkeletonTable title columns={2} rows={4} />
      </div>
    </SkeletonPage>
  );
}
