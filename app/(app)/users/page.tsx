import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageShell } from "@/components/app-shell/PageShell";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { Btn } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { AccessDenied } from "@/components/AccessDenied";
import { ROLE_LABELS } from "@/lib/nav";
import { UserRowActions } from "./UserRowActions";

function formatLastSignIn(value: string | null | undefined) {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function UsersPage() {
  const profile = await getCurrentProfile();
  if (profile.role !== "ADMIN") return <AccessDenied />;

  const admin = createAdminClient();
  const [{ data: profiles }, { data: authList }] = await Promise.all([
    admin.from("profiles").select("id, full_name, role, department_id, is_active, departments(name)").order("full_name"),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  const authById = new Map((authList?.users ?? []).map((u) => [u.id, u]));

  const rows = (profiles ?? []).map((p) => ({
    id: p.id,
    fullName: p.full_name,
    email: authById.get(p.id)?.email ?? "—",
    role: p.role,
    departmentName: p.departments?.name ?? null,
    isActive: p.is_active,
    lastSignIn: authById.get(p.id)?.last_sign_in_at ?? null,
  }));

  return (
    <PageShell
      title="Users"
      subtitle="Who can sign in, and what they can do"
      actions={
        <Link href="/users/new">
          <Btn variant="acc">Add user</Btn>
        </Link>
      }
    >
      <Card title="Users" extra={`${rows.length} total`}>
        {rows.length === 0 ? (
          <EmptyState
            title="No users yet"
            description="Add the first admin or staff account."
            action={
              <Link href="/users/new">
                <Btn variant="acc">Add user</Btn>
              </Link>
            }
          />
        ) : (
          <>
            <div className="hidden min-[900px]:block overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {["Name", "Email", "Role", "Department", "Status", "Last sign-in", ""].map((h) => (
                      <th
                        key={h}
                        className="text-[11.5px] font-medium text-n600 text-left px-4 py-2 border-b border-n200 bg-n50 uppercase tracking-wide whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => (
                    <tr key={u.id} className="border-b border-n200 last:border-b-0 hover:bg-n50">
                      <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">
                        <Link href={`/users/${u.id}`} className="text-teal">
                          {u.fullName}
                        </Link>
                      </td>
                      <td className="px-4 h-9 text-[13.5px] text-n600 whitespace-nowrap">{u.email}</td>
                      <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">{ROLE_LABELS[u.role]}</td>
                      <td className="px-4 h-9 text-[13.5px] text-n600 whitespace-nowrap">{u.departmentName ?? "—"}</td>
                      <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">
                        {u.isActive ? <Tag variant="ok">Active</Tag> : <Tag variant="mut">Inactive</Tag>}
                      </td>
                      <td className="px-4 h-9 text-[13.5px] text-n600 tabular-nums whitespace-nowrap">{formatLastSignIn(u.lastSignIn)}</td>
                      <td className="px-4 h-9 text-right whitespace-nowrap">
                        <div className="flex justify-end items-center gap-3">
                          <Link href={`/users/${u.id}`} className="text-teal text-sm">
                            Edit
                          </Link>
                          <UserRowActions id={u.id} isActive={u.isActive} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="min-[900px]:hidden divide-y divide-n200">
              {rows.map((u) => (
                <div key={u.id} className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <Link href={`/users/${u.id}`} className="text-teal font-medium">
                      {u.fullName}
                    </Link>
                    {u.isActive ? <Tag variant="ok">Active</Tag> : <Tag variant="mut">Inactive</Tag>}
                  </div>
                  <div className="text-xs text-n600 mb-1">{u.email}</div>
                  <div className="text-xs text-n600 mb-3">
                    {ROLE_LABELS[u.role]}
                    {u.departmentName ? ` · ${u.departmentName}` : ""} · last sign-in {formatLastSignIn(u.lastSignIn)}
                  </div>
                  <div className="flex gap-4 text-sm">
                    <Link href={`/users/${u.id}`} className="text-teal">
                      Edit
                    </Link>
                    <UserRowActions id={u.id} isActive={u.isActive} />
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
