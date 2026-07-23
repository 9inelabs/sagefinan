"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Btn } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatNaira } from "@/lib/format";
import { correctCountEntry } from "@/lib/counts/actions";
import {
  lockCountSession,
  raisePostLockAdjustment,
  setBookDiffReason,
  setVarianceReason,
  type AuditEvent,
  type PostLockAdjustment,
  type ReconcileLine,
  type ReconcileSessionMeta,
} from "@/lib/reconcile/actions";
import type { ReasonCodeRow } from "@/lib/reason-codes/actions";

type Tab = "reconcile" | "audit";

export function ReconcileScreen({
  session,
  initialLines,
  auditTrail,
  reasonCodes,
  currentUserName,
}: {
  session: ReconcileSessionMeta;
  initialLines: ReconcileLine[];
  auditTrail: AuditEvent[];
  reasonCodes: ReasonCodeRow[];
  currentUserName: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("reconcile");
  const [status, setStatus] = useState(session.status);
  const [lockedAt, setLockedAt] = useState(session.lockedAt);
  const [lockedByName, setLockedByName] = useState(session.lockedByName);
  const [lines, setLines] = useState(initialLines);
  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const [correcting, setCorrecting] = useState<ReconcileLine | null>(null);
  const [adjusting, setAdjusting] = useState<ReconcileLine | null>(null);

  const progress = useMemo(() => {
    const reconciled = lines.filter((l) => l.isVarianceReasoned && l.isBookDiffReasoned).length;
    return { reconciled, total: lines.length };
  }, [lines]);

  const outstanding = lines.filter((l) => !(l.isVarianceReasoned && l.isBookDiffReasoned));

  function updateLine(id: string, patch: Partial<ReconcileLine>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function removeIfTallies(id: string, variance: number, bookDiffers: boolean) {
    if (variance === 0 && !bookDiffers) {
      setLines((prev) => prev.filter((l) => l.id !== id));
    }
  }

  async function handleLock() {
    const result = await lockCountSession(session.id);
    setStatus("LOCKED");
    setLockedAt(result.locked_at);
    setLockedByName(currentUserName);
    // Lines/status stay on locally-tracked state (untouched by a parent
    // re-render), but the audit trail is a plain pass-through prop — refresh
    // is what gets the "locked" event onto it without a manual reload.
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 border-b border-n200">
        <TabButton active={tab === "reconcile"} onClick={() => setTab("reconcile")}>
          Reconcile
        </TabButton>
        <TabButton active={tab === "audit"} onClick={() => setTab("audit")}>
          Audit trail
        </TabButton>
      </div>

      {tab === "reconcile" ? (
        <div className="grid grid-cols-1 min-[900px]:grid-cols-[1fr_300px] gap-4 items-start">
          <Card
            title={`Reconcile — ${session.departmentName}`}
            extra={`${progress.reconciled} of ${progress.total} done`}
          >
            {lines.length === 0 ? (
              <div className="p-8 text-center text-sm text-n600">Every product tallies. Nothing to reconcile.</div>
            ) : (
              <div>
                {lines.map((line) => (
                  <ReconcileLineRow
                    key={line.id}
                    line={line}
                    locked={status === "LOCKED"}
                    reasonCodes={reasonCodes}
                    onVarianceReasonSaved={(reasonCodeId, note, isReasoned) => {
                      updateLine(line.id, { reasonCodeId, note, isVarianceReasoned: isReasoned, reasonSetByName: currentUserName, reasonSetAt: new Date().toISOString() });
                      router.refresh();
                    }}
                    onBookDiffReasonSaved={(reasonCodeId, note, isReasoned) => {
                      updateLine(line.id, {
                        bookDiffReasonCodeId: reasonCodeId,
                        bookDiffNote: note,
                        isBookDiffReasoned: isReasoned,
                        bookDiffReasonSetByName: currentUserName,
                        bookDiffReasonSetAt: new Date().toISOString(),
                      });
                      router.refresh();
                    }}
                    onCorrect={() => setCorrecting(line)}
                    onAdjust={() => setAdjusting(line)}
                  />
                ))}
              </div>
            )}

            <div className="p-4 border-t border-n200 flex flex-col gap-2.5">
              {status === "LOCKED" ? (
                <span className="text-sm text-n600">
                  This session is locked — figures are permanent. Raise a post-lock adjustment on a line above if needed.
                </span>
              ) : (
                <>
                  {outstanding.length > 0 ? (
                    <p className="text-sm text-red">
                      {outstanding.length} item{outstanding.length === 1 ? "" : "s"} still need{outstanding.length === 1 ? "s" : ""} a reason:{" "}
                      {outstanding.map((l) => l.name).join(", ")}
                    </p>
                  ) : (
                    <p className="text-sm text-n600">Every variance has a reason. Ready to lock.</p>
                  )}
                  <div className="flex justify-end">
                    <Btn variant="pri" disabled={outstanding.length > 0} onClick={() => setShowLockConfirm(true)}>
                      Lock session
                    </Btn>
                  </div>
                </>
              )}
            </div>
          </Card>

          <Card title="What locking does">
            <div className="p-4 text-[13px] text-n600 leading-relaxed flex flex-col gap-3">
              <p>
                Once locked, this session&apos;s figures become permanent and can&apos;t be edited. No stock movement dated on or before{" "}
                <span className="tabular-nums text-ink">{session.asAtDate}</span> may be posted for {session.departmentName} afterwards.
              </p>
              <p>Corrections after locking don&apos;t overwrite anything — they append as a separate, timestamped adjustment record.</p>
              <div className="flex flex-wrap gap-1.5 items-center">
                <Tag variant="mut">Draft</Tag>
                <span className="text-n400">→</span>
                <Tag variant="warn">Needs reconciling</Tag>
                <span className="text-n400">→</span>
                <Tag variant="acc">Locked</Tag>
              </div>
              {status === "LOCKED" && lockedAt ? (
                <p className="pt-2 border-t border-n200">
                  Locked {new Date(lockedAt).toLocaleString()} by {lockedByName ?? "—"}.
                </p>
              ) : null}
            </div>
          </Card>
        </div>
      ) : (
        <AuditTrailCard events={auditTrail} />
      )}

      <ConfirmDialog
        open={showLockConfirm}
        title="Lock this session?"
        description={
          <div className="flex flex-col gap-2">
            <p>This session&apos;s figures become permanent and can no longer be edited.</p>
            <p>
              No stock movement dated on or before <b className="font-medium">{session.asAtDate}</b> may be posted for{" "}
              <b className="font-medium">{session.departmentName}</b> afterwards.
            </p>
            <p>Any correction found later is added as a separate post-lock adjustment — it never overwrites this certified record.</p>
          </div>
        }
        confirmLabel="Lock session"
        onConfirm={async () => {
          await handleLock();
          setShowLockConfirm(false);
        }}
        onCancel={() => setShowLockConfirm(false)}
      />

      {correcting ? (
        <CorrectDialog
          line={correcting}
          onClose={() => setCorrecting(null)}
          onSaved={(newQty) => {
            const variance = newQty - correcting.expectedQty;
            const bookDiffers = correcting.ledgerQty != null && correcting.ledgerQty !== correcting.expectedQty;
            updateLine(correcting.id, {
              countedQty: newQty,
              variance,
              value: variance !== 0 ? Math.abs(variance) * correcting.unitCost : 0,
              flag: variance < 0 ? "short" : "excess",
              isVarianceReasoned: variance === 0,
            });
            removeIfTallies(correcting.id, variance, bookDiffers);
            setCorrecting(null);
            router.refresh();
          }}
        />
      ) : null}

      {adjusting ? (
        <PostLockAdjustDialog
          line={adjusting}
          currentUserName={currentUserName}
          onClose={() => setAdjusting(null)}
          onSaved={(adjustment) => {
            updateLine(adjusting.id, { adjustments: [...adjusting.adjustments, adjustment] });
            setAdjusting(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2.5 text-sm border-b-2 -mb-px ${active ? "border-teal text-teal" : "border-transparent text-n600 hover:text-ink"}`}
    >
      {children}
    </button>
  );
}

function ReconcileLineRow({
  line,
  locked,
  reasonCodes,
  onVarianceReasonSaved,
  onBookDiffReasonSaved,
  onCorrect,
  onAdjust,
}: {
  line: ReconcileLine;
  locked: boolean;
  reasonCodes: ReasonCodeRow[];
  onVarianceReasonSaved: (reasonCodeId: string, note: string | null, isReasoned: boolean) => void;
  onBookDiffReasonSaved: (reasonCodeId: string, note: string | null, isReasoned: boolean) => void;
  onCorrect: () => void;
  onAdjust: () => void;
}) {
  return (
    <div className="border-b border-n200 last:border-b-0 p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <b className="font-medium text-sm">{line.name}</b> <span className="text-n600 text-xs">{line.code}</span>
        </div>
        <div className="flex items-center gap-2 tabular-nums text-xs">
          <span className="text-n600">
            {line.expectedQty} expected · {line.countedQty} counted
          </span>
          {line.variance !== 0 ? (
            <span className={line.flag === "short" ? "text-red font-medium" : "text-green font-medium"}>
              {line.variance > 0 ? `+${line.variance}` : line.variance} · {formatNaira(line.value)}
            </span>
          ) : null}
          {!locked ? (
            <button type="button" onClick={onCorrect} className="text-teal">
              Correct
            </button>
          ) : (
            <button type="button" onClick={onAdjust} className="text-teal">
              Raise adjustment
            </button>
          )}
        </div>
      </div>

      {line.variance !== 0 ? (
        <ReasonSection
          heading={line.flag === "short" ? "Physical shortage" : "Physical excess"}
          tagVariant={line.flag === "short" ? "bad" : "ok"}
          tagLabel={line.flag === "short" ? "Short" : "Excess"}
          countLineId={line.id}
          reasonCodes={reasonCodes.filter((r) => r.appliesTo === "VARIANCE" || r.appliesTo === "BOTH")}
          reasonCodeId={line.reasonCodeId}
          note={line.note}
          setByName={line.reasonSetByName}
          setAt={line.reasonSetAt}
          locked={locked}
          save={setVarianceReason}
          onSaved={onVarianceReasonSaved}
        />
      ) : null}

      {line.bookDiffers ? (
        <ReasonSection
          heading="Book differs — a posting discrepancy, not a physical loss"
          tagVariant="warn"
          tagLabel="Book differs"
          countLineId={line.id}
          reasonCodes={reasonCodes.filter((r) => r.appliesTo === "BOOK_DIFF" || r.appliesTo === "BOTH")}
          reasonCodeId={line.bookDiffReasonCodeId}
          note={line.bookDiffNote}
          setByName={line.bookDiffReasonSetByName}
          setAt={line.bookDiffReasonSetAt}
          locked={locked}
          save={setBookDiffReason}
          onSaved={onBookDiffReasonSaved}
          extra={<span className="text-xs text-n600 tabular-nums">Ledger {line.ledgerQty} · expected {line.expectedQty}</span>}
        />
      ) : null}

      {line.adjustments.length > 0 ? (
        <div className="bg-n50 border border-n200 rounded p-3 text-xs flex flex-col gap-1.5">
          <p className="text-n600 font-medium">Certified count: {line.countedQty} — adjustments since locking:</p>
          {line.adjustments.map((a) => (
            <p key={a.id} className="tabular-nums">
              <span className="text-ink">
                {a.previousQty} → {a.newQty}
              </span>{" "}
              <span className="text-n600">
                — {a.reason} ({a.createdByName}, {new Date(a.createdAt).toLocaleString()})
              </span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ReasonSection({
  heading,
  tagVariant,
  tagLabel,
  countLineId,
  reasonCodes,
  reasonCodeId,
  note,
  setByName,
  setAt,
  locked,
  save,
  onSaved,
  extra,
}: {
  heading: string;
  tagVariant: "bad" | "ok" | "warn";
  tagLabel: string;
  countLineId: string;
  reasonCodes: ReasonCodeRow[];
  reasonCodeId: string | null;
  note: string | null;
  setByName: string | null;
  setAt: string | null;
  locked: boolean;
  save: (countLineId: string, reasonCodeId: string, note: string) => Promise<unknown>;
  onSaved: (reasonCodeId: string, note: string | null, isReasoned: boolean) => void;
  extra?: React.ReactNode;
}) {
  const [selected, setSelected] = useState(reasonCodeId);
  const [noteText, setNoteText] = useState(note ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCode = reasonCodes.find((r) => r.id === selected);
  const dirty = selected !== reasonCodeId || noteText !== (note ?? "");

  async function persist() {
    if (!selected) {
      setError("Choose a reason.");
      return;
    }
    if (selectedCode?.requiresNote && !noteText.trim()) {
      setError("This reason requires a note.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await save(countLineId, selected, noteText);
      onSaved(selected, noteText.trim() || null, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this reason.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <Tag variant={tagVariant}>{tagLabel}</Tag>
        <span className="text-xs text-n600">{heading}</span>
        {extra}
      </div>
      {locked ? (
        <p className="text-sm">
          {selectedCode ? selectedCode.label : reasonCodeId ? "Retired reason" : "No reason recorded"}
          {note ? <span className="text-n600"> — {note}</span> : null}
          {setByName ? (
            <span className="text-xs text-n600">
              {" "}
              · set by {setByName}
              {setAt ? ` at ${new Date(setAt).toLocaleString()}` : ""}
            </span>
          ) : null}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {reasonCodes.map((r) => (
              <Chip key={r.id} active={selected === r.id} onClick={() => setSelected(r.id)}>
                {r.label}
              </Chip>
            ))}
            {reasonCodeId && !reasonCodes.some((r) => r.id === reasonCodeId) ? (
              <Chip active disabled>
                {selectedCode?.label ?? "Retired reason"}
              </Chip>
            ) : null}
          </div>
          <Input
            className="mt-2"
            placeholder={selectedCode?.requiresNote ? "Note required for this reason" : "Add a note (optional)"}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
          />
          <div className="flex items-center gap-3 mt-1.5">
            {dirty ? (
              <button type="button" onClick={persist} disabled={pending} className="text-teal text-xs">
                {pending ? "Saving…" : "Save reason"}
              </button>
            ) : setByName ? (
              <span className="text-xs text-n600">
                Set by {setByName}
                {setAt ? ` at ${new Date(setAt).toLocaleString()}` : ""}
              </span>
            ) : null}
            {error ? <span className="text-xs text-red">{error}</span> : null}
          </div>
        </>
      )}
    </div>
  );
}

function CorrectDialog({
  line,
  onClose,
  onSaved,
}: {
  line: ReconcileLine;
  onClose: () => void;
  onSaved: (newQty: number) => void;
}) {
  const [qty, setQty] = useState(String(line.countedQty));
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const n = Number(qty);
    if (qty.trim() === "" || !Number.isInteger(n) || n < 0) {
      setError("Enter zero or a positive whole number.");
      return;
    }
    if (!reason.trim()) {
      setError("A reason is required to correct a count entry.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await correctCountEntry(line.id, n, reason.trim());
      onSaved(n);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this correction.");
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={pending ? undefined : onClose} />
      <div className="relative bg-white border border-n200 rounded max-w-[440px] w-full" role="dialog" aria-modal="true">
        <div className="p-4 border-b border-n200">
          <h2 className="text-sm font-medium">Correct {line.name}</h2>
          <p className="text-xs text-n600 mt-1">
            {line.code} · currently counted <span className="tabular-nums">{line.countedQty}</span>
          </p>
        </div>
        <div className="p-4">
          <label className="block text-xs text-n600 mb-1.5">Corrected quantity</label>
          <Input type="number" inputMode="numeric" min={0} value={qty} onChange={(e) => setQty(e.target.value)} className="mb-3.5" />
          <label className="block text-xs text-n600 mb-1.5">Reason (required — recorded as an adjustment)</label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. corrected a typo, re-checked the shelf" />
          {error ? <p className="text-sm text-red mt-3">{error}</p> : null}
        </div>
        <div className="p-4 border-t border-n200 flex justify-end gap-2">
          <Btn type="button" onClick={onClose} disabled={pending}>
            Cancel
          </Btn>
          <Btn type="button" variant="acc" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save correction"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

function PostLockAdjustDialog({
  line,
  currentUserName,
  onClose,
  onSaved,
}: {
  line: ReconcileLine;
  currentUserName: string;
  onClose: () => void;
  onSaved: (adjustment: PostLockAdjustment) => void;
}) {
  const currentFigure = line.adjustments.length > 0 ? line.adjustments[line.adjustments.length - 1].newQty : line.countedQty;
  const [qty, setQty] = useState(String(currentFigure));
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const n = Number(qty);
    if (qty.trim() === "" || !Number.isInteger(n) || n < 0) {
      setError("Enter zero or a positive whole number.");
      return;
    }
    if (!reason.trim()) {
      setError("A reason is required to raise a post-lock adjustment.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await raisePostLockAdjustment(line.id, n, reason.trim());
      onSaved({
        id: result.id,
        previousQty: result.previous_qty,
        newQty: result.new_qty,
        reason: result.reason,
        createdByName: currentUserName,
        createdAt: result.created_at,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not raise this adjustment.");
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={pending ? undefined : onClose} />
      <div className="relative bg-white border border-n200 rounded max-w-[440px] w-full" role="dialog" aria-modal="true">
        <div className="p-4 border-b border-n200">
          <h2 className="text-sm font-medium">Raise a post-lock adjustment — {line.name}</h2>
          <p className="text-xs text-n600 mt-1">
            {line.code} · certified figure <span className="tabular-nums">{line.countedQty}</span> stays visible exactly as locked. This adds a new,
            timestamped entry alongside it — never a replacement.
          </p>
        </div>
        <div className="p-4">
          <label className="block text-xs text-n600 mb-1.5">Adjusted quantity</label>
          <Input type="number" inputMode="numeric" min={0} value={qty} onChange={(e) => setQty(e.target.value)} className="mb-3.5" />
          <label className="block text-xs text-n600 mb-1.5">Reason (required)</label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. delivery note found after locking" />
          {error ? <p className="text-sm text-red mt-3">{error}</p> : null}
        </div>
        <div className="p-4 border-t border-n200 flex justify-end gap-2">
          <Btn type="button" onClick={onClose} disabled={pending}>
            Cancel
          </Btn>
          <Btn type="button" variant="acc" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Raise adjustment"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

function AuditTrailCard({ events }: { events: AuditEvent[] }) {
  const KIND_TAG: Record<AuditEvent["kind"], { variant: "acc" | "warn" | "mut" | "bad"; label: string }> = {
    created: { variant: "mut", label: "Created" },
    finished: { variant: "acc", label: "Finished" },
    reason: { variant: "warn", label: "Reason" },
    locked: { variant: "acc", label: "Locked" },
    adjustment: { variant: "mut", label: "Adjustment" },
    "post-lock-adjustment": { variant: "bad", label: "Post-lock adjustment" },
  };

  return (
    <Card title="Audit trail" extra={`${events.length} event${events.length === 1 ? "" : "s"}`}>
      {events.length === 0 ? (
        <div className="p-8 text-center text-sm text-n600">Nothing recorded yet.</div>
      ) : (
        <div className="divide-y divide-n200">
          {events.map((e, i) => {
            const tag = KIND_TAG[e.kind];
            return (
              <div key={i} className="p-4 flex flex-wrap items-start gap-3">
                <Tag variant={tag.variant}>{tag.label}</Tag>
                <div className="flex-1 min-w-[240px]">
                  <p className="text-sm">{e.description}</p>
                  <p className="text-xs text-n600 mt-0.5 tabular-nums">
                    {new Date(e.at).toLocaleString()}
                    {e.actorName ? ` · ${e.actorName}` : ""}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
