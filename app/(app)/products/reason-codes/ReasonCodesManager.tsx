"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Btn } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import {
  createReasonCode,
  setReasonCodeActive,
  type ReasonCodeApplies,
  type ReasonCodeRow,
} from "@/lib/reason-codes/actions";

const APPLIES_LABEL: Record<ReasonCodeApplies, string> = {
  VARIANCE: "Physical variance only",
  BOOK_DIFF: "Book difference only",
  BOTH: "Either",
};

export function ReasonCodesManager({ initialCodes }: { initialCodes: ReasonCodeRow[] }) {
  const [codes, setCodes] = useState(initialCodes);
  const [showAdd, setShowAdd] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function toggle(row: ReasonCodeRow) {
    setPendingId(row.id);
    try {
      await setReasonCodeActive(row.id, !row.isActive);
      setCodes((prev) => prev.map((c) => (c.id === row.id ? { ...c, isActive: !c.isActive } : c)));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="Reason codes"
        extra={`${codes.filter((c) => c.isActive).length} active · ${codes.length} total`}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {["Label", "Applies to", "Note required", "Status", ""].map((h) => (
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
              {codes.map((c) => (
                <tr key={c.id} className="border-b border-n200 last:border-b-0 hover:bg-n50">
                  <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">{c.label}</td>
                  <td className="px-4 h-9 text-[13.5px] text-n600 whitespace-nowrap">{APPLIES_LABEL[c.appliesTo]}</td>
                  <td className="px-4 h-9 text-[13.5px] text-n600 whitespace-nowrap">{c.requiresNote ? "Yes" : "—"}</td>
                  <td className="px-4 h-9 whitespace-nowrap">
                    <Tag variant={c.isActive ? "acc" : "mut"}>{c.isActive ? "Active" : "Retired"}</Tag>
                  </td>
                  <td className="px-4 h-9 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggle(c)}
                      disabled={pendingId === c.id}
                      className="text-teal text-sm disabled:text-n400"
                    >
                      {pendingId === c.id ? "Saving…" : c.isActive ? "Retire" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t border-n200 flex items-center justify-between gap-3">
          <span className="text-sm text-n600">
            Retiring a code stops it appearing for new reasons — lines that already used it keep showing it.
          </span>
          <Btn variant="acc" onClick={() => setShowAdd(true)}>
            Add code
          </Btn>
        </div>
      </Card>

      {showAdd ? (
        <AddDialog
          onClose={() => setShowAdd(false)}
          onCreated={(row) => {
            setCodes((prev) => [...prev, row]);
            setShowAdd(false);
          }}
        />
      ) : null}
    </div>
  );
}

function AddDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (row: ReasonCodeRow) => void }) {
  const [label, setLabel] = useState("");
  const [appliesTo, setAppliesTo] = useState<ReasonCodeApplies>("VARIANCE");
  const [requiresNote, setRequiresNote] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const trimmed = label.trim();
    if (!trimmed) {
      setError("A label is required.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await createReasonCode({ label: trimmed, appliesTo, requiresNote });
      // The list is re-fetched via revalidatePath on the server; reflect an
      // optimistic row locally so the dialog can close immediately.
      onCreated({
        id: crypto.randomUUID(),
        code: trimmed.toUpperCase().replace(/[^A-Z0-9]+/g, "_"),
        label: trimmed,
        appliesTo,
        requiresNote,
        isActive: true,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add this reason code.");
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={pending ? undefined : onClose} />
      <div className="relative bg-white border border-n200 rounded max-w-[440px] w-full" role="dialog" aria-modal="true">
        <div className="p-4 border-b border-n200">
          <h2 className="text-sm font-medium">Add a reason code</h2>
        </div>
        <div className="p-4">
          <Field label="Label">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Theft" autoFocus />
          </Field>
          <Field label="Applies to" hint="Which kind of variance line this reason may be attached to.">
            <Select value={appliesTo} onChange={(e) => setAppliesTo(e.target.value as ReasonCodeApplies)} className="w-full">
              <option value="VARIANCE">Physical variance only</option>
              <option value="BOOK_DIFF">Book difference only</option>
              <option value="BOTH">Either</option>
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-sm text-n600 cursor-pointer">
            <input type="checkbox" className="accent-teal w-4 h-4" checked={requiresNote} onChange={(e) => setRequiresNote(e.target.checked)} />
            Require a note whenever this reason is chosen (like &quot;Other&quot;)
          </label>
          {error ? <p className="text-sm text-red mt-3">{error}</p> : null}
        </div>
        <div className="p-4 border-t border-n200 flex justify-end gap-2">
          <Btn type="button" onClick={onClose} disabled={pending}>
            Cancel
          </Btn>
          <Btn type="button" variant="acc" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Add code"}
          </Btn>
        </div>
      </div>
    </div>
  );
}
