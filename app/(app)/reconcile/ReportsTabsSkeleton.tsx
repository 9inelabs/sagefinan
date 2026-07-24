import { SkeletonBlock } from "@/components/ui/Skeleton";

// Mirrors ReportsTabs.tsx's four-tab row so the five report/investigation
// loading.tsx files that sit under it don't jump when the real tabs mount.
export function ReportsTabsSkeleton() {
  const widths = ["w-24", "w-32", "w-28", "w-32"];
  return (
    <div className="flex gap-1 border-b border-n200 mb-4">
      {widths.map((w, i) => (
        <SkeletonBlock key={i} className={`h-8 ${w} mb-1`} />
      ))}
    </div>
  );
}
