"use client";

import { useFormStatus } from "react-dom";
import { Btn } from "@/components/ui/Button";

export function ChangePasswordSubmit() {
  const { pending } = useFormStatus();

  return (
    <Btn type="submit" variant="acc" disabled={pending} className="w-full h-10">
      {pending ? "Saving…" : "Set new password"}
    </Btn>
  );
}
