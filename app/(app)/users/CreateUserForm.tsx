"use client";

import { useState } from "react";
import { useRouter } from "nextjs-toploader/app";
import { Btn } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { createUser } from "@/lib/users/actions";
import type { UserRole } from "@/lib/auth/profile";
import { PasswordChoiceFields, isPasswordChoiceValid, type PasswordMode } from "./PasswordChoiceFields";
import { TempPasswordReveal } from "./TempPasswordReveal";

const ROLES: { value: UserRole; label: string }[] = [
  { value: "ADMIN", label: "Admin" },
  { value: "AUDITOR", label: "Auditor" },
  { value: "STOREKEEPER", label: "Storekeeper" },
  { value: "DEPARTMENT_USER", label: "Department user" },
];

// Temporary password, shown once, over an invite email: no SMTP provider is
// configured for this project yet (supabase/config.toml's [auth.email.smtp]
// block is commented out), so a self-contained flow that needs no extra
// infrastructure is what actually works today. Revisit if/when SMTP lands.
export function CreateUserForm({
  departments,
  centralStoreId,
}: {
  departments: { id: string; name: string }[];
  centralStoreId: string | null;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("DEPARTMENT_USER");
  const [departmentId, setDepartmentId] = useState("");
  const [passwordMode, setPasswordMode] = useState<PasswordMode>("auto");
  const [customPassword, setCustomPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ tempPassword: string; email: string } | null>(null);
  const router = useRouter();

  const nonCentralDepartments = departments.filter((d) => d.id !== centralStoreId);
  const needsDepartment = role === "DEPARTMENT_USER";
  const isStorekeeper = role === "STOREKEEPER";

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const resolvedDepartmentId = isStorekeeper ? centralStoreId : needsDepartment ? departmentId || null : null;
      const result = await createUser({
        fullName,
        email,
        role,
        departmentId: resolvedDepartmentId,
        customPassword: passwordMode === "custom" ? customPassword : undefined,
      });
      setCreated({ tempPassword: result.tempPassword, email });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  if (created) {
    return <TempPasswordReveal email={created.email} tempPassword={created.tempPassword} verb="created" onDone={() => router.push("/users")} />;
  }

  return (
    <div className="p-4">
      <Field label="Full name">
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={pending} />
      </Field>
      <Field label="Email">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={pending} />
      </Field>
      <Field label="Role">
        <Select
          value={role}
          onChange={(e) => {
            setRole(e.target.value as UserRole);
            setDepartmentId("");
          }}
          disabled={pending}
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

      <PasswordChoiceFields
        mode={passwordMode}
        customValue={customPassword}
        onModeChange={setPasswordMode}
        onCustomValueChange={setCustomPassword}
        disabled={pending}
      />

      {error ? <p className="text-sm text-red mb-3">{error}</p> : null}

      <div className="flex gap-2">
        <Btn
          type="button"
          variant="acc"
          disabled={
            pending ||
            !fullName.trim() ||
            !email.trim() ||
            (needsDepartment && !departmentId) ||
            (isStorekeeper && !centralStoreId) ||
            !isPasswordChoiceValid(passwordMode, customPassword)
          }
          onClick={submit}
        >
          {pending ? "Creating…" : "Create user"}
        </Btn>
        <Btn type="button" onClick={() => router.push("/users")} disabled={pending}>
          Cancel
        </Btn>
      </div>
    </div>
  );
}
