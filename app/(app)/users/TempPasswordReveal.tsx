"use client";

import { useState } from "react";
import { Btn } from "@/components/ui/Button";

// Shown once after createUser/setUserPassword returns a password — over an
// invite/reset email, since no SMTP provider is configured for this project
// (see CreateUserForm's own note). Shared by account creation and the
// edit-screen "Set new password" action.
export function TempPasswordReveal({
  email,
  tempPassword,
  verb = "created",
  onDone,
  doneLabel = "Done",
}: {
  email: string;
  tempPassword: string;
  verb?: "created" | "reset";
  onDone: () => void;
  doneLabel?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="p-6">
      <p className="text-sm mb-3">
        {verb === "created" ? (
          <>
            Account created for <b className="font-medium">{email}</b>.
          </>
        ) : (
          <>
            Password reset for <b className="font-medium">{email}</b>.
          </>
        )}{" "}
        This {verb === "created" ? "temporary" : "new"} password is shown once — copy it now and pass it to them directly. It will not be
        shown again. They&apos;ll be asked to set their own password the first time they sign in.
      </p>
      <div className="flex items-center gap-2 mb-4">
        <code className="flex-1 bg-n50 border border-n200 rounded px-3 py-2.5 text-[15px] tabular-nums select-all">{tempPassword}</code>
        <Btn
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(tempPassword);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Btn>
      </div>
      <div className="flex gap-2">
        <Btn type="button" variant="acc" onClick={onDone}>
          {doneLabel}
        </Btn>
      </div>
    </div>
  );
}
