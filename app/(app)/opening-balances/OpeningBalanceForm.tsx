"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Btn } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { saveOpeningBalances, type OpeningBalanceLine } from "@/lib/opening-balances/actions";
import { OpeningBalanceRow } from "./OpeningBalanceRow";

type Department = { id: string; name: string; is_central_store: boolean };
type ScreenData = { lines: OpeningBalanceLine[]; missingCount: number; totalCount: number };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function OpeningBalanceForm({
  departments,
  selectedDepartmentId,
  screenData,
}: {
  departments: Department[];
  selectedDepartmentId: string | null;
  screenData: ScreenData | null;
}) {
  const router = useRouter();

  if (departments.length === 0) {
    return (
      <Card title="Opening balances">
        <EmptyState
          title="No departments yet"
          description="Add a department before setting opening balances."
          action={
            <Link href="/departments" className="text-teal text-sm">
              Go to Departments →
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="px-4 py-2.5 flex flex-wrap gap-2 items-center">
          <Select
            value={selectedDepartmentId ?? ""}
            onChange={(e) => router.push(`/opening-balances?department=${e.target.value}`)}
          >
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
                {d.is_central_store ? " (central store)" : ""}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {screenData && selectedDepartmentId ? (
        <DepartmentForm key={selectedDepartmentId} departmentId={selectedDepartmentId} screenData={screenData} />
      ) : null}
    </div>
  );
}

function DepartmentForm({ departmentId, screenData }: { departmentId: string; screenData: ScreenData }) {
  const [asAtDate, setAsAtDate] = useState(todayIso());
  const [lines, setLines] = useState(screenData.lines);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(screenData.lines.map((l) => [l.productId, l.currentQty != null ? String(l.currentQty) : ""]))
  );
  const [search, setSearch] = useState("");
  const [showOnlyMissing, setShowOnlyMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [confirmReplace, setConfirmReplace] = useState<{ count: number } | null>(null);

  const missingCount = lines.filter((l) => l.currentQty == null).length;

  const visible = useMemo(() => {
    let base = lines;
    if (showOnlyMissing) base = base.filter((l) => l.currentQty == null);
    const q = search.trim().toLowerCase();
    if (q) base = base.filter((l) => l.name.toLowerCase().includes(q) || l.code.toLowerCase().includes(q));
    return base;
  }, [lines, showOnlyMissing, search]);

  function handleChange(productId: string, value: string) {
    setValues((prev) => ({ ...prev, [productId]: value }));
  }

  function computeChangedEntries() {
    return lines
      .map((l) => {
        const raw = (values[l.productId] ?? "").trim();
        const initial = l.currentQty != null ? String(l.currentQty) : "";
        if (raw === initial) return null;
        if (raw === "") return null; // cleared back to blank — nothing to submit
        const quantity = Number(raw);
        if (!Number.isInteger(quantity) || quantity < 0) return null;
        return { line: l, quantity };
      })
      .filter((e): e is { line: OpeningBalanceLine; quantity: number } => e !== null);
  }

  async function doSave() {
    const changed = computeChangedEntries();
    if (changed.length === 0) {
      setSavedMessage("Nothing to save — no values were changed.");
      return;
    }
    setSaving(true);
    setError(null);
    setSavedMessage(null);
    try {
      const result = await saveOpeningBalances(
        departmentId,
        asAtDate,
        changed.map((c) => ({ productId: c.line.productId, quantity: c.quantity }))
      );
      setLines((prev) =>
        prev.map((l) => {
          const c = changed.find((c) => c.line.productId === l.productId);
          if (!c) return l;
          return { ...l, currentQty: c.quantity, currentBusinessDay: asAtDate };
        })
      );
      setSavedMessage(`Saved ${result.written} opening balance${result.written === 1 ? "" : "s"} as at ${asAtDate}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save opening balances.");
    } finally {
      setSaving(false);
      setConfirmReplace(null);
    }
  }

  function handleSaveClick() {
    const changed = computeChangedEntries();
    const replaceCount = changed.filter((c) => c.line.currentQty != null).length;
    if (replaceCount > 0) {
      setConfirmReplace({ count: replaceCount });
    } else {
      doSave();
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-n200 rounded px-[15px] py-[13px]">
          <span className="text-[11.5px] text-n600 tracking-wide uppercase">Still need an opening balance</span>
          <b className={`block text-2xl font-medium mt-[5px] tracking-tight tabular-nums ${missingCount > 0 ? "text-amber" : "text-green"}`}>
            {missingCount} <i className="not-italic text-xs text-n600 font-normal">/ {lines.length}</i>
          </b>
        </div>
        <div className="bg-white border border-n200 rounded px-[15px] py-[13px] flex flex-col justify-center">
          <label className="text-xs text-n600 mb-1.5 block">As-at date</label>
          <Input type="date" value={asAtDate} onChange={(e) => setAsAtDate(e.target.value)} />
        </div>
      </div>

      <Card title="Products" extra={`Shelf order · ${lines.length} assigned`}>
        <div className="px-4 py-2.5 border-b border-n200 flex flex-wrap items-center justify-between gap-2">
          <Input className="flex-1 min-w-[180px]" placeholder="Search product or code" value={search} onChange={(e) => setSearch(e.target.value)} />
          <label className="text-xs text-n600 flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
            <input type="checkbox" className="accent-teal w-4 h-4" checked={showOnlyMissing} onChange={(e) => setShowOnlyMissing(e.target.checked)} />
            Show only missing
          </label>
        </div>

        {lines.length === 0 ? (
          <EmptyState title="Nothing assigned" description="This department has no active products assigned yet." />
        ) : visible.length === 0 ? (
          <EmptyState title="No matches" description="Try a different search term or clear the filter." />
        ) : (
          <div>
            {visible.map((l) => (
              <OpeningBalanceRow
                key={l.productId}
                productId={l.productId}
                code={l.code}
                name={l.name}
                shelfOrder={l.shelfOrder}
                value={values[l.productId] ?? ""}
                isSet={l.currentQty != null}
                onChange={handleChange}
              />
            ))}
          </div>
        )}

        <div className="p-4 border-t border-n200 flex flex-col gap-2.5">
          {error ? <p className="text-sm text-red">{error}</p> : null}
          {savedMessage && !error ? <p className="text-sm text-green">{savedMessage}</p> : null}
          <div className="flex justify-end">
            <Btn variant="acc" onClick={handleSaveClick} disabled={saving || lines.length === 0}>
              {saving ? "Saving…" : "Save opening balances"}
            </Btn>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmReplace != null}
        title="Replace existing opening balances?"
        description={
          <p>
            {confirmReplace?.count} product{confirmReplace?.count === 1 ? "" : "s"} already{" "}
            {confirmReplace?.count === 1 ? "has" : "have"} an opening balance set. Saving will reverse the existing entry and record the new figure —
            both stay visible in the movement history, nothing is overwritten in place.
          </p>
        }
        confirmLabel="Replace and save"
        onConfirm={doSave}
        onCancel={() => setConfirmReplace(null)}
      />
    </>
  );
}
