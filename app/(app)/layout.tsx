import { getCurrentProfile } from "@/lib/auth/profile";
import { navForRole } from "@/lib/nav";
import { AppShell } from "@/components/app-shell/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  const groups = navForRole(profile.role);

  return (
    <AppShell profile={profile} groups={groups}>
      {children}
    </AppShell>
  );
}
