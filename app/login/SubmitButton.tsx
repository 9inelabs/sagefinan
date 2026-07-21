"use client";

import { useFormStatus } from "react-dom";

// Login route only — intentionally diverges from the app's ink/teal, 6px-
// radius design system (see SPEC.md "Login route visual treatment"). Do not
// copy this pill/near-black styling into any authenticated screen.
export function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full h-16 rounded-[28px] bg-[#2B2B2B] text-white text-base font-bold disabled:opacity-70 hover:brightness-110 transition"
    >
      {pending ? "Signing in…" : "Continue"}
    </button>
  );
}
