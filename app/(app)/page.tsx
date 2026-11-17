import { getCurrentProfile } from "@/lib/auth/profile";
import { getOverrideCount } from "@/lib/movements/actions";
import { getDashboardData, listDashboardDepartments } from "@/lib/dashboard/actions";
import { DashboardView, ScopedHome } from "./_dashboard/DashboardView";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ department?: string }> }) {
  const profile = await getCurrentProfile();

  if (profile.role === "STOREKEEPER" || profile.role === "DEPARTMENT_USER") {
    return <ScopedHome role={profile.role} departmentName={profile.departmentName} />;
  }

  const { department: departmentId } = await searchParams;

  const [overrideCount, data, departments] = await Promise.all([
    getOverrideCount(),
    getDashboardData(departmentId || undefined),
    listDashboardDepartments(),
  ]);

  return <DashboardView data={data} departments={departments} departmentId={departmentId ?? ""} overrideCount={overrideCount} />;
}
