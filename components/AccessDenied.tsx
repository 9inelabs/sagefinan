import { PageShell } from "@/components/app-shell/PageShell";
import { Card } from "@/components/ui/Card";

// Used on admin-only routes so a non-admin who navigates here directly (not
// through the sidebar, which already hides these) sees a clear explanation
// instead of a crash or a silent bounce back to "/" — per SPEC.md, hiding
// the nav item is not itself the authorization check.
export function AccessDenied() {
  return (
    <PageShell title="Access denied">
      <Card>
        <div className="p-8 text-center">
          <p className="text-sm font-medium text-ink mb-1">You don&apos;t have access to this page.</p>
          <p className="text-sm text-n600">This area is restricted to administrators.</p>
        </div>
      </Card>
    </PageShell>
  );
}
