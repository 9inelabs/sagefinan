import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageShell } from "@/components/app-shell/PageShell";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { Btn } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { AccessDenied } from "@/components/AccessDenied";
import { DepartmentRowActions } from "./DepartmentRowActions";

const HEADERS = ["Department", "Central store", "Products", "Active users", "Status", ""];

export default async function DepartmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ includeInactive?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (profile.role !== "ADMIN") return <AccessDenied />;

  const { includeInactive } = await searchParams;
  const showInactive = includeInactive === "1";

  const admin = createAdminClient();
  let query = admin.from("departments").select("id, name, is_central_store, is_active").order("name");
  if (!showInactive) query = query.eq("is_active", true);
  const { data: departments } = await query;

  const [{ data: assignments }, { data: users }] = await Promise.all([
    admin.from("product_assignments").select("department_id"),
    admin.from("profiles").select("department_id").eq("is_active", true),
  ]);

  const productCounts = new Map<string, number>();
  for (const a of assignments ?? []) productCounts.set(a.department_id, (productCounts.get(a.department_id) ?? 0) + 1);
  const userCounts = new Map<string, number>();
  for (const u of users ?? []) {
    if (u.department_id) userCounts.set(u.department_id, (userCounts.get(u.department_id) ?? 0) + 1);
  }

  return (
    <PageShell
      title="Departments"
      subtitle="Central store and every department that counts stock"
      actions={
        <Link href="/departments/new">
          <Btn variant="acc">Add department</Btn>
        </Link>
      }
    >
      <Card title="Departments" extra={`${departments?.length ?? 0} shown`}>
        <div className="px-4 py-2.5 border-b border-n200">
          <Link href={showInactive ? "/departments" : "/departments?includeInactive=1"} className="text-xs text-teal">
            {showInactive ? "Hide inactive" : "Include inactive"}
          </Link>
        </div>

        {!departments || departments.length === 0 ? (
          <EmptyState
            title="No departments yet"
            description="Add the central store first, then the departments that count stock against it."
            action={
              <Link href="/departments/new">
                <Btn variant="acc">Add department</Btn>
              </Link>
            }
          />
        ) : (
          <>
            <div className="hidden min-[900px]:block overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {HEADERS.map((h, i) => (
                      <th
                        key={h + i}
                        className={`text-[11.5px] font-medium text-n600 text-left px-4 py-2 border-b border-n200 bg-n50 uppercase tracking-wide whitespace-nowrap ${
                          i === 2 || i === 3 ? "text-right" : ""
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {departments.map((d) => (
                    <tr key={d.id} className="border-b border-n200 last:border-b-0 hover:bg-n50">
                      <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">
                        <Link href={`/departments/${d.id}`} className="text-teal">
                          {d.name}
                        </Link>
                      </td>
                      <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">
                        {d.is_central_store ? <Tag variant="acc">Central store</Tag> : <span className="text-n600">—</span>}
                      </td>
                      <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">{productCounts.get(d.id) ?? 0}</td>
                      <td className="px-4 h-9 text-[13.5px] text-right tabular-nums whitespace-nowrap">{userCounts.get(d.id) ?? 0}</td>
                      <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">
                        {d.is_active ? <Tag variant="ok">Active</Tag> : <Tag variant="mut">Inactive</Tag>}
                      </td>
                      <td className="px-4 h-9 text-[13.5px] text-right whitespace-nowrap">
                        <div className="flex justify-end gap-3">
                          <Link href={`/departments/${d.id}`} className="text-teal">
                            Edit
                          </Link>
                          <DepartmentRowActions id={d.id} name={d.name} isActive={d.is_active} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="min-[900px]:hidden divide-y divide-n200">
              {departments.map((d) => (
                <div key={d.id} className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <Link href={`/departments/${d.id}`} className="text-[15px] text-teal font-medium">
                      {d.name}
                    </Link>
                    {d.is_active ? <Tag variant="ok">Active</Tag> : <Tag variant="mut">Inactive</Tag>}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-n600 mb-3">
                    <span>{productCounts.get(d.id) ?? 0} products</span>
                    <span>{userCounts.get(d.id) ?? 0} active users</span>
                    {d.is_central_store ? <Tag variant="acc">Central store</Tag> : null}
                  </div>
                  <div className="flex gap-4 text-sm">
                    <Link href={`/departments/${d.id}`} className="text-teal">
                      Edit
                    </Link>
                    <DepartmentRowActions id={d.id} name={d.name} isActive={d.is_active} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </PageShell>
  );
}
