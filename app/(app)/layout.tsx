import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/profile";
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

  // navForRole() (and its NAV_GROUPS, which now carry lucide-react icon
  // component references) is computed inside AppShell itself, not here —
  // React Server Components can't serialize a component reference across
  // the server→client prop boundary the way it can plain data, so this
  // moved client-side. See CLAUDE.md's follow-up on the premium redesign.
  return <AppShell profile={profile}>{children}</AppShell>;
}
