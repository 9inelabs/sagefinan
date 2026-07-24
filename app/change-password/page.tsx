import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/profile";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { changePassword } from "./actions";
import { ChangePasswordSubmit } from "./ChangePasswordSubmit";

// Top-level route, deliberately outside app/(app) — no sidebar, since this
// gates entry to the app rather than being part of it. Uses the app's
// normal Ink/Teal design tokens (not /login's own soft-white treatment,
// which SPEC.md's "Login route visual treatment" explicitly scopes to that
// one route only).
export default async function ChangePasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const profile = await getCurrentProfile();
  if (!profile.mustChangePassword) {
    redirect("/");
  }

  const { error } = await searchParams;

  return (
    <div className="min-h-screen bg-n100 flex items-center justify-center px-4">
      <div className="w-full max-w-[400px] bg-white border border-n200 rounded p-6">
        <h1 className="text-xl font-medium text-ink tracking-tight mb-1.5">Set a new password</h1>
        <p className="text-sm text-n600 mb-5 leading-relaxed">
          You&apos;re signed in with a temporary password. Choose your own before continuing — nobody else will know it.
        </p>

        <form action={changePassword}>
          <Field label="New password" htmlFor="newPassword">
            <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required minLength={8} />
          </Field>
          <Field label="Confirm new password" htmlFor="confirmPassword">
            <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} />
          </Field>

          {error ? (
            <p className="text-sm text-red mb-3.5" role="alert">
              {error}
            </p>
          ) : null}

          <ChangePasswordSubmit />
        </form>
      </div>
    </div>
  );
}
