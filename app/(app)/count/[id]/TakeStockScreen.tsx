"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Btn } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  saveCountEntries,
  saveLedgerEntries,
  finishCountSession,
  getLedgerLinesForRecording,
  type SessionMeta,
  type CountingLine,
} from "@/lib/counts/actions";
import { useLineEntries, type EntryLine } from "./useLineEntries";
import { CountRow } from "./CountRow";

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function toEntryLines(lines: { productId: string; code: string; name: string; shelfOrder: number | null; value: number | null }[]): EntryLine[] {
  return lines.map((l) => ({
    productId: l.productId,
    code: l.code,
    name: l.name,
    shelfOrder: l.shelfOrder,
    value: l.value == null ? "" : String(l.value),
  }));
}

export function TakeStockScreen({ session, initialLines }: { session: SessionMeta; initialLines: CountingLine[] }) {
  const [tab, setTab] = useState<"physical" | "ledger">("physical");
  const [ledgerMounted, setLedgerMounted] = useState(false);
  const isDraft = session.status === "DRAFT";

  function selectTab(next: "physical" | "ledger") {
    setTab(next);
    if (next === "ledger") setLedgerMounted(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 border-b border-n200">
        <TabButton active={tab === "physical"} onClick={() => selectTab("physical")}>
          Physical count
        </TabButton>
        <TabButton active={tab === "ledger"} onClick={() => selectTab("ledger")} disabled={isDraft}>
          Ledger record
        </TabButton>
      </div>

      {/* Both tabs, once visited, stay mounted (hidden via CSS, not unmounted)
          so switching tabs never discards an in-progress edit or forces a
          re-fetch that could show stale figures. */}
      <div className={tab === "physical" ? "" : "hidden"}>
        <PhysicalTab session={session} initialLines={initialLines} />
      </div>
      {ledgerMounted ? (
        <div className={tab === "ledger" ? "" : "hidden"}>
          <LedgerTab session={session} />
        </div>
      ) : null}
    </div>
  );
}

function TabButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`px-3 py-2 text-sm border-b-2 -mb-px ${
        active
          ? "border-teal text-teal font-medium"
          : disabled
            ? "border-transparent text-n400 cursor-not-allowed"
            : "border-transparent text-n600 hover:text-ink"
      }`}
      title={disabled ? "Available once the count is finished" : undefined}
    >
      {children}
    </button>
  );
}

function PhysicalTab({ session, initialLines }: { session: SessionMeta; initialLines: CountingLine[] }) {
  const router = useRouter();
  const isDraft = session.status === "DRAFT";
  const initial = useMemo(() => toEntryLines(initialLines.map((l) => ({ ...l, value: l.physicalQty }))), [initialLines]);
  const { lines, handleChange, flush, setAll, lastSavedAt, saving, saveError } = useLineEntries(initial, (entries) =>
    saveCountEntries(
      session.id,
      entries.map((e) => ({ productId: e.productId, physicalQty: e.value }))
    )
  );

  const [search, setSearch] = useState("");
  const [blankPrompt, setBlankPrompt] = useState<EntryLine[] | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  const counted = lines.filter((l) => l.value.trim() !== "").length;
  const total = lines.length;
  const pct = total === 0 ? 0 : Math.round((counted / total) * 100);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((l) => l.name.toLowerCase().includes(q) || l.code.toLowerCase().includes(q));
  }, [lines, search]);

  async function handleFinishClick() {
    await flush();
    const blanks = lines.filter((l) => l.value.trim() === "");
    if (blanks.length > 0) {
      setBlankPrompt(blanks);
    } else {
      await doFinish(false);
    }
  }

  async function doFinish(zeroFillBlanks: boolean) {
    setFinishing(true);
    setFinishError(null);
    try {
      if (zeroFillBlanks) {
        setAll((l) => (l.value.trim() === "" ? { ...l, value: "0" } : l));
      }
      await finishCountSession(session.id, zeroFillBlanks);
      setBlankPrompt(null);
      router.refresh();
    } catch (e) {
      setFinishError(e instanceof Error ? e.message : "Could not finish this count.");
    } finally {
      setFinishing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!isDraft ? (
        <div className="text-sm bg-n50 border border-n200 rounded px-4 py-3 text-n600">
          This count is {session.status === "LOCKED" ? "locked and read-only" : "finished"}.{" "}
          {session.status !== "LOCKED" ? (
            <>
              Spotted a miscount?{" "}
              <Link href={`/compare/${session.id}`} className="text-teal">
                Correct it from Compare stock
              </Link>
              .
            </>
          ) : null}
        </div>
      ) : null}

      <Card className="max-w-[420px] mx-auto w-full overflow-hidden">
        <div className="bg-ink text-white px-4 py-3">
          <b className="text-[15px] font-medium block">{session.departmentName}</b>
          <p className="text-xs text-n400 mt-0.5">Physical count · as at close of {session.asAtDate}</p>
        </div>
        <div className="px-4 py-2.5 border-b border-n200 bg-n50">
          <div className="flex justify-between text-[12.5px] mb-1.5">
            <span>
              Counted <b className="font-medium tabular-nums">{counted}</b> of <b className="font-medium tabular-nums">{total}</b>
            </span>
            <span className="text-n600">
              {saving
                ? "Saving…"
                : lastSavedAt
                  ? `Draft saved ${timeOf(lastSavedAt)}`
                  : isDraft
                    ? "Not saved yet"
                    : "Finished"}
            </span>
          </div>
          <div className="h-[5px] bg-n200 rounded-full overflow-hidden mb-2.5">
            <div className="h-full bg-teal" style={{ width: `${pct}%` }} />
          </div>
          <Input placeholder="Search product or code" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {total === 0 ? (
          <EmptyState title="Nothing assigned" description="This department has no active products assigned to count." />
        ) : visible.length === 0 ? (
          <EmptyState title="No matches" description="Try a different search term." />
        ) : (
          <div>
            {visible.map((l) => (
              <CountRow
                key={l.productId}
                productId={l.productId}
                code={l.code}
                name={l.name}
                shelfOrder={l.shelfOrder}
                value={l.value}
                disabled={!isDraft}
                onChange={handleChange}
              />
            ))}
          </div>
        )}

        {isDraft ? (
          <div className="px-4 py-3 border-t border-n200 flex gap-2.5">
            <Btn onClick={() => flush()} className="flex-1 h-[46px]">
              Save draft
            </Btn>
            <Btn variant="pri" onClick={handleFinishClick} disabled={finishing || total === 0} className="flex-1 h-[46px]">
              {finishing ? "Finishing…" : "Finish count"}
            </Btn>
          </div>
        ) : null}
        {saveError ? <p className="text-xs text-red px-4 pb-3">{saveError}</p> : null}
        {finishError ? <p className="text-xs text-red px-4 pb-3">{finishError}</p> : null}
      </Card>

      <ConfirmDialog
        open={blankPrompt != null}
        title={`${blankPrompt?.length ?? 0} product${(blankPrompt?.length ?? 0) === 1 ? "" : "s"} not yet counted`}
        description={
          <div>
            <p className="mb-3">Go back and count them, or record all of the following as zero:</p>
            <div className="border border-n200 rounded max-h-48 overflow-y-auto bg-n50">
              {(blankPrompt ?? []).map((l) => (
                <div key={l.productId} className="px-3 py-1.5 text-xs border-b border-n200 last:border-b-0 flex gap-2">
                  <span className="text-n600 tabular-nums flex-none">{l.code}</span>
                  <span className="truncate">{l.name}</span>
                </div>
              ))}
            </div>
          </div>
        }
        confirmLabel="Record all as zero"
        onConfirm={() => doFinish(true)}
        onCancel={() => setBlankPrompt(null)}
      />
    </div>
  );
}

function LedgerTab({ session }: { session: SessionMeta }) {
  if (session.status === "DRAFT") {
    return (
      <Card>
        <EmptyState
          title="Available once the count is finished"
          description="Ledger figures are an optional second pass — finish the physical count first."
        />
      </Card>
    );
  }
  return <LedgerTabLoader session={session} />;
}

function LedgerTabLoader({ session }: { session: SessionMeta }) {
  const [loading, setLoading] = useState(true);
  const [initial, setInitial] = useState<EntryLine[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    getLedgerLinesForRecording(session.id).then(({ lines }) => {
      if (cancelled) return;
      setInitial(toEntryLines(lines.map((l) => ({ ...l, value: l.ledgerQty }))));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [session.id]);

  if (loading) {
    return <div className="text-sm text-n600 p-6 text-center">Loading…</div>;
  }

  return <LedgerLinesEditor session={session} initialLines={initial} search={search} setSearch={setSearch} />;
}

function LedgerLinesEditor({
  session,
  initialLines,
  search,
  setSearch,
}: {
  session: SessionMeta;
  initialLines: EntryLine[];
  search: string;
  setSearch: (v: string) => void;
}) {
  const disabled = session.status === "LOCKED";
  const { lines, handleChange, flush, lastSavedAt, saving, saveError } = useLineEntries(initialLines, (entries) =>
    saveLedgerEntries(
      session.id,
      entries.map((e) => ({ productId: e.productId, ledgerQty: e.value }))
    )
  );

  const recorded = lines.filter((l) => l.value.trim() !== "").length;
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((l) => l.name.toLowerCase().includes(q) || l.code.toLowerCase().includes(q));
  }, [lines, search]);

  return (
    <Card className="max-w-[420px] mx-auto w-full overflow-hidden">
      <div className="bg-ink text-white px-4 py-3">
        <b className="text-[15px] font-medium block">{session.departmentName}</b>
        <p className="text-xs text-n400 mt-0.5">Ledger record · optional, skippable</p>
      </div>
      <div className="px-4 py-2.5 border-b border-n200 bg-n50">
        <div className="flex justify-between text-[12.5px] mb-1.5">
          <span>
            Recorded <b className="font-medium tabular-nums">{recorded}</b> of <b className="font-medium tabular-nums">{lines.length}</b>
          </span>
          <span className="text-n600">
            {saving ? "Saving…" : lastSavedAt ? `Saved ${timeOf(lastSavedAt)}` : disabled ? "Locked" : "Not recorded yet"}
          </span>
        </div>
        <Input placeholder="Search product or code" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {lines.length === 0 ? (
        <EmptyState title="Nothing assigned" description="This department has no active products assigned." />
      ) : visible.length === 0 ? (
        <EmptyState title="No matches" description="Try a different search term." />
      ) : (
        <div>
          {visible.map((l) => (
            <CountRow
              key={l.productId}
              productId={l.productId}
              code={l.code}
              name={l.name}
              shelfOrder={l.shelfOrder}
              value={l.value}
              disabled={disabled}
              onChange={handleChange}
            />
          ))}
        </div>
      )}
      {!disabled ? (
        <div className="px-4 py-3 border-t border-n200">
          <Btn onClick={() => flush()} className="w-full h-[46px]">
            Save
          </Btn>
        </div>
      ) : null}
      {saveError ? <p className="text-xs text-red px-4 pb-3">{saveError}</p> : null}
    </Card>
  );
}
