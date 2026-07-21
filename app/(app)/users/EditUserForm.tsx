"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { updateUser } from "@/lib/users/actions";
import type { UserRole } from "@/lib/auth/profile";

const ROLES: { value: UserRole; label: string }[] = [
  { value: "ADMIN", label: "Admin" },
  { value: "AUDITOR", label: "Auditor" },
  { value: "STOREKEEPER", label: "Storekeeper" },
  { value: "DEPARTMENT_USER", label: "Department user" },
];

export function EditUserForm({
  user,
  departments,
  centralStoreId,
  isSelf,
}: {
  user: { id: string; fullName: string; email: string; role: UserRole; departmentId: string | null; isActive: boolean };
  departments: { id: string; name: string }[];
  centralStoreId: string | null;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(user.fullName);
  const [role, setRole] = useState<UserRole>(user.role);
  const [departmentId, setDepartmentId] = useState(user.departmentId ?? "");
  const [isActive, setIsActive] = useState(user.isActive);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nonCentralDepartments = departments.filter((d) => d.id !== centralStoreId);
  const needsDepartment = role === "DEPARTMENT_USER";
  const isStorekeeper = role === "STOREKEEPER";

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const resolvedDepartmentId = isStorekeeper ? centralStoreId : needsDepartment ? departmentId || null : null;
      await updateUser(user.id, { fullName, role, departmentId: resolvedDepartmentId, isActive });
      router.push("/users");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setPending(false);
    }
  }

  return (
    <div className="p-4">
      <Field label="Full name">
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={pending} />
      </Field>
      <Field label="Email" hint="Email cannot be changed here.">
        <Input value={user.email} disabled />
      </Field>
      <Field label="Role" hint={isSelf ? "You cannot change your own role." : undefined}>
        <Select
          value={role}
          onChange={(e) => {
            setRole(e.target.value as UserRole);
            setDepartmentId("");
          }}
          disabled={pending || isSelf}
          className="w-full"
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
      </Field>

      {isStorekeeper ? (
        <Field label="Department" hint="Storekeepers are always assigned to the central store.">
          <Input value={departments.find((d) => d.id === centralStoreId)?.name ?? "Central store"} disabled />
        </Field>
      ) : needsDepartment ? (
        <Field label="Department">
          <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} disabled={pending} className="w-full">
            <option value="">Select a department</option>
            {nonCentralDepartments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <label className="flex items-center gap-2 text-sm mb-3.5 cursor-pointer select-none">
        <input
          type="checkbox"
          className="accent-teal w-4 h-4"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          disabled={pending}
        />
        Active
      </label>

      {error ? <p className="text-sm text-red mb-3">{error}</p> : null}

      <div className="flex gap-2">
        <Btn type="button" variant="acc" disabled={pending || !fullName.trim() || (needsDepartment && !departmentId)} onClick={submit}>
          {pending ? "Saving…" : "Save changes"}
        </Btn>
        <Btn type="button" onClick={() => router.push("/users")} disabled={pending}>
          Cancel
        </Btn>
      </div>
    </div>
  );
}
