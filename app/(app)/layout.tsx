import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/profile";
import { navForRole } from "@/lib/nav";
import { AppShell } from "@/components/app-shell/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  // A temp password (new account, or an admin-reset one) must be replaced
  // before anything else is reachable — enforced here, once, for every
  // route under this layout, rather than a per-page check that's easy to
  // forget on a new screen. /change-password lives outside this route
  // group, so this can't loop.
  if (profile.mustChangePassword) {
    redirect("/change-password");
  }

  const groups = navForRole(profile.role);

  return (
    <AppShell profile={profile} groups={groups}>
      {children}
    </AppShell>
  );
}
