"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Btn } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tag } from "@/components/ui/Tag";
import {
  listReceivers,
  postRequisitionBatch,
  searchProductsForRequisition,
  type RequisitionProductResult,
} from "@/lib/movements/actions";

type BatchLine = {
  productId: string;
  code: string;
  name: string;
  available: number;
  quantity: number;
  isOverride: boolean;
  overrideReason: string;
};

export function RequisitionBatchForm({
  initialBusinessDay,
  destinations,
}: {
  initialBusinessDay: string;
  destinations: { id: string; name: string }[];
}) {
  const [businessDay, setBusinessDay] = useState(initialBusinessDay);
  const [toDepartmentId, setToDepartmentId] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [receivers, setReceivers] = useState<{ id: string; full_name: string }[]>([]);

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<RequisitionProductResult[]>([]);
  const [picked, setPicked] = useState<RequisitionProductResult | null>(null);
  const [qty, setQty] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [insufficientStock, setInsufficientStock] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const searchToken = useRef(0);

  const [lines, setLines] = useState<BatchLine[]>([]);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [posted, setPosted] = useState<{ toDepartmentName: string; businessDay: string; lineCount: number; totalBottles: number } | null>(
    null
  );

  useEffect(() => {
    setReceivedBy("");
    setReceivers([]);
    if (!toDepartmentId) return;
    listReceivers(toDepartmentId).then(setReceivers);
  }, [toDepartmentId]);

  async function runSearch(q: string) {
    setSearch(q);
    setPicked(null);
    resetAddState();
    if (!q.trim() || !toDepartmentId) {
      setResults([]);
      return;
    }
    const token = ++searchToken.current;
    const data = await searchProductsForRequisition(q, toDepartmentId, businessDay);
    if (token === searchToken.current) setResults(data);
  }

  function resetAddState() {
    setAddError(null);
    setInsufficientStock(false);
    setOverrideReason("");
  }

  function pick(product: RequisitionProductResult) {
    setPicked(product);
    setResults([]);
    setSearch(`${product.code} — ${product.name}`);
    setQty("");
    resetAddState();
  }

  function addToBatch() {
    if (!picked) return;
    if (!picked.assignedToDestination) return;

    const n = Number(qty);
    if (!Number.isInteger(n) || n <= 0) {
      setAddError("Enter a positive whole number of bottles.");
      return;
    }

    const available = picked.availableQty ?? 0;
    const alreadyInBatch = lines.find((l) => l.productId === picked.id)?.quantity ?? 0;
    const over = alreadyInBatch + n > available;

    if (over && !overrideReason.trim()) {
      setInsufficientStock(true);
      setAddError(
        `Central store only holds ${available} bottles of this product as at ${businessDay} — ${alreadyInBatch + n} requested.`
      );
      return;
    }

    setLines((prev) => {
      const existing = prev.find((l) => l.productId === picked.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === picked.id
            ? {
                ...l,
                quantity: l.quantity + n,
                isOverride: l.isOverride || over,
                overrideReason: over ? overrideReason.trim() : l.overrideReason,
              }
            : l
        );
      }
      return [
        ...prev,
        { productId: picked.id, code: picked.code, name: picked.name, available, quantity: n, isOverride: over, overrideReason: over ? overrideReason.trim() : "" },
      ];
    });
    setPicked(null);
    setSearch("");
    setQty("");
    resetAddState();
  }

  function removeLine(productId: string) {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }

  async function post() {
    setPosting(true);
    setPostError(null);
    try {
      await postRequisitionBatch({
        businessDay,
        toDepartmentId,
        receivedBy,
        lines: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          isOverride: l.isOverride,
          overrideReason: l.overrideReason,
        })),
      });
      setPosted({
        toDepartmentName: destinations.find((d) => d.id === toDepartmentId)?.name ?? "",
        businessDay,
        lineCount: lines.length,
        totalBottles: lines.reduce((sum, l) => sum + l.quantity, 0),
      });
      setLines([]);
    } catch (e) {
      setPostError(e instanceof Error ? e.message : "Could not post this batch.");
    } finally {
      setPosting(false);
    }
  }

  function startNewBatch() {
    setPosted(null);
    setPostError(null);
    setToDepartmentId("");
    setBusinessDay(initialBusinessDay);
  }

  if (posted) {
    return (
      <Card title="Requisition posted">
        <div className="p-6 text-sm leading-relaxed">
          <p className="mb-4">
            Recorded <b className="font-medium">{posted.lineCount}</b> line{posted.lineCount === 1 ? "" : "s"} totalling{" "}
            <b className="font-medium tabular-nums">{posted.totalBottles}</b> bottles moved to{" "}
            <b className="font-medium">{posted.toDepartmentName}</b> for business day{" "}
            <b className="font-medium tabular-nums">{posted.businessDay}</b>.
          </p>
          <Btn variant="acc" onClick={startNewBatch}>
            Start a new batch
          </Btn>
        </div>
      </Card>
    );
  }

  const totalBottles = lines.reduce((sum, l) => sum + l.quantity, 0);
  const overrideCount = lines.filter((l) => l.isOverride).length;

  return (
    <div className="flex flex-col gap-4">
      <Card title="Requisition details">
        <div className="p-4 grid grid-cols-1 min-[600px]:grid-cols-3 gap-3.5">
          <Field label="Business day">
            <Input type="date" value={businessDay} onChange={(e) => setBusinessDay(e.target.value)} />
          </Field>
          <Field label="To department">
            <Select
              value={toDepartmentId}
              onChange={(e) => {
                setToDepartmentId(e.target.value);
                setLines([]);
                setPicked(null);
                setSearch("");
                setResults([]);
              }}
              className="w-full"
            >
              <option value="">Select a department…</option>
              {destinations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Received by" hint={!toDepartmentId ? "Choose a destination department first" : undefined}>
            <Select value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} disabled={!toDepartmentId} className="w-full">
              <option value="">Select who received it…</option>
              {receivers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {toDepartmentId && receivers.length === 0 ? (
          <div className="px-4 pb-4 text-xs text-amber">
            No active users are assigned to this department yet — add one before this requisition can be posted.
          </div>
        ) : null}
      </Card>

      <Card title="Add to batch">
        {!toDepartmentId ? (
          <EmptyState title="Choose a destination first" description="Pick the department this requisition is going to before searching products." />
        ) : (
          <div className="p-4">
            <Field label="Product">
              <div className="relative">
                <Input placeholder="Search code or name" value={search} onChange={(e) => runSearch(e.target.value)} />
                {results.length > 0 ? (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-n200 rounded max-h-64 overflow-y-auto shadow-sm">
                    {results.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => pick(r)}
                        className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm hover:bg-n50"
                      >
                        <span className="text-n600 tabular-nums text-xs flex-none">{r.code}</span>
                        <span className="truncate flex-1">{r.name}</span>
                        {!r.assignedToDestination ? <span className="text-xs text-amber flex-none">Not assigned</span> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </Field>

            {picked && !picked.assignedToDestination ? (
              <div className="text-sm">
                <p className="text-n600 mb-2">
                  <b className="text-ink font-medium">{picked.name}</b> isn&apos;t assigned to this department yet — you can&apos;t
                  requisition something it doesn&apos;t stock.
                </p>
                <Link href={`/products/${picked.id}`} className="text-teal">
                  Go to this product&apos;s assignment screen →
                </Link>
              </div>
            ) : null}

            {picked && picked.assignedToDestination ? (
              <>
                <div className="text-xs text-n600 mb-3">
                  Central store holds <b className="text-ink font-medium tabular-nums">{picked.availableQty ?? 0}</b> bottles of this
                  product as at {businessDay}.
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="Bottles">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      className="w-28"
                      value={qty}
                      onChange={(e) => {
                        setQty(e.target.value);
                        resetAddState();
                      }}
                      placeholder="0"
                    />
                  </Field>
                  <Btn type="button" variant="acc" onClick={addToBatch} className="h-9">
                    Add to batch
                  </Btn>
                </div>

                {insufficientStock ? (
                  <div className="mt-3 border border-[#F5CFA0] bg-[#FFFAEB] rounded p-3">
                    <p className="text-sm text-amber mb-2">Not enough stock to cover this without an override.</p>
                    <Field label="Override reason (required to proceed anyway)">
                      <Input
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                        placeholder="e.g. physical stock confirmed, ledger not yet updated"
                      />
                    </Field>
                    <Btn type="button" variant="pri" onClick={addToBatch} disabled={!overrideReason.trim()}>
                      Add anyway (flags for auditor review)
                    </Btn>
                  </div>
                ) : null}
              </>
            ) : null}

            {addError && !insufficientStock ? <p className="text-sm text-red mt-3">{addError}</p> : null}
          </div>
        )}
      </Card>

      <Card
        title="Batch"
        extra={`${lines.length} line${lines.length === 1 ? "" : "s"} · ${totalBottles} bottles${
          overrideCount > 0 ? ` · ${overrideCount} overridden` : ""
        }`}
      >
        {lines.length === 0 ? (
          <EmptyState title="No lines yet" description="Search a product above and add it to this batch to get started." />
        ) : (
          <>
            <div className="hidden min-[900px]:block overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {["Product", "Code", "Central available", "Moving", "Central remaining", "", ""].map((h, i) => (
                      <th
                        key={h + i}
                        className={`text-[11.5px] font-medium text-n600 text-left px-4 py-2 border-b border-n200 bg-n50 uppercase tracking-wide whitespace-nowrap ${
                          i > 1 && i < 5 ? "text-right" : ""
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const remaining = l.available - l.quantity;
                    return (
                      <tr key={l.productId} className="border-b border-n200 last:border-b-0 hover:bg-n50">
                        <td className="px-4 h-9 text-[13.5px] whitespace-nowrap">{l.name}</td>
                        <td className="px-4 h-9 text-[13.5px] text-n600 tabular-nums whitespace-nowrap">{l.code}</td>
                        <td className="px-4 h-9 text-[13.5px] text-right text-n600 tabular-nums whitespace-nowrap">{l.available}</td>
                        <td className="px-4 h-9 text-[13.5px] text-right text-red font-medium tabular-nums whitespace-nowrap">
                          −{l.quantity}
                        </td>
                        <td
                          className={`px-4 h-9 text-[13.5px] text-right font-medium tabular-nums whitespace-nowrap ${remaining < 0 ? "text-red" : ""}`}
                        >
                          {remaining}
                        </td>
                        <td className="px-4 h-9 whitespace-nowrap">{l.isOverride ? <Tag variant="warn">Override</Tag> : null}</td>
                        <td className="px-4 h-9 text-right whitespace-nowrap">
                          <button type="button" onClick={() => removeLine(l.productId)} className="text-teal text-sm">
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="min-[900px]:hidden divide-y divide-n200">
              {lines.map((l) => {
                const remaining = l.available - l.quantity;
                return (
                  <div key={l.productId} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm truncate">{l.name}</div>
                        <div className="text-xs text-n600 tabular-nums mt-0.5">{l.code}</div>
                      </div>
                      <button type="button" onClick={() => removeLine(l.productId)} className="text-teal text-sm flex-none">
                        Remove
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-n600 tabular-nums items-center">
                      <span>Available {l.available}</span>
                      <span className="text-red">−{l.quantity}</span>
                      <span className={`font-medium ${remaining < 0 ? "text-red" : "text-ink"}`}>→ {remaining}</span>
                      {l.isOverride ? <Tag variant="warn">Override</Tag> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="p-4 border-t border-n200 flex flex-col min-[600px]:flex-row min-[600px]:items-center min-[600px]:justify-between gap-3">
          {postError ? <p className="text-sm text-red">{postError}</p> : <span />}
          <Btn variant="pri" disabled={lines.length === 0 || !receivedBy || posting} onClick={post} className="h-10">
            {posting ? "Posting…" : "Post requisition"}
          </Btn>
        </div>
      </Card>
    </div>
  );
}
