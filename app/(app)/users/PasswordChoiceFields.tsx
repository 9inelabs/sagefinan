"use client";

import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";

export const MIN_PASSWORD_LENGTH = 6;

export type PasswordMode = "auto" | "custom";

// Shared by CreateUserForm and EditUserForm's "Set new password" action —
// same auto-generate-vs-type-your-own choice either way (see CLAUDE.md's
// follow-up on admin-assigned passwords for why this exists).
export function PasswordChoiceFields({
  mode,
  customValue,
  onModeChange,
  onCustomValueChange,
  disabled,
}: {
  mode: PasswordMode;
  customValue: string;
  onModeChange: (mode: PasswordMode) => void;
  onCustomValueChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Field label="Password" hint={mode === "custom" ? `At least ${MIN_PASSWORD_LENGTH} characters.` : undefined}>
      <div className="flex gap-2 mb-2.5">
        <Chip active={mode === "auto"} disabled={disabled} onClick={() => onModeChange("auto")}>
          Auto-generate
        </Chip>
        <Chip active={mode === "custom"} disabled={disabled} onClick={() => onModeChange("custom")}>
          Set a password
        </Chip>
      </div>
      {mode === "custom" ? (
        <Input
          type="text"
          value={customValue}
          onChange={(e) => onCustomValueChange(e.target.value)}
          disabled={disabled}
          placeholder="Type a password to hand to them"
        />
      ) : null}
    </Field>
  );
}

export function isPasswordChoiceValid(mode: PasswordMode, customValue: string): boolean {
  return mode === "auto" || customValue.trim().length >= MIN_PASSWORD_LENGTH;
}
