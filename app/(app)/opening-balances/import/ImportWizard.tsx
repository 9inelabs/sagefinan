"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Btn } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { OpeningDryRunResult } from "@/lib/opening-balances/actions";
import { commitOpeningBalanceImport, dryRunOpeningBalanceImport } from "@/lib/opening-balances/actions";

type Stage = "upload" | "checking" | "preview" | "committing" | "done";

export function ImportWizard() {
  const [stage, setStage] = useState<Stage>("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<OpeningDryRunResult | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [commitResult, setCommitResult] = useState<{ written: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setFileName(file.name);
    setStage("checking");
    try {
      const text = await file.text();
      const dryRun = await dryRunOpeningBalanceImport(text);
      setResult(dryRun);
      setReplaceExisting(false);
      setStage("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file.");
      setStage("upload");
    }
  }

  async function confirmImport() {
    if (!result) return;
    setStage("committing");
    setError(null);
    try {
      const summary = await commitOpeningBalanceImport(result.validRows, replaceExisting);
      setCommitResult(summary);
      setStage("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed — nothing was written.");
      setStage("preview");
    }
  }

  function reset() {
    setStage("upload");
    setFileName(null);
    setResult(null);
    setReplaceExisting(false);
    setCommitResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  if (stage === "done" && commitResult) {
    return (
      <Card title="Import complete">
        <div className="p-6 text-sm leading-relaxed">
          <p className="mb-4">
            Wrote <b className="font-medium">{commitResult.written}</b> opening-balance movement{commitResult.written === 1 ? "" : "s"}
            {commitResult.skipped > 0 ? (
              <>
                {" "}
                and skipped <b className="font-medium">{commitResult.skipped}</b> row{commitResult.skipped === 1 ? "" : "s"} that already had a balance
                set (replace wasn&apos;t enabled, or the value was 0 and nothing existed to write).
              </>
            ) : (
              "."
            )}
          </p>
          <div className="flex gap-2">
            <Link href="/opening-balances">
              <Btn variant="acc">Go to Opening balances</Btn>
            </Link>
            <Btn onClick={reset}>Import another file</Btn>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="1. Upload">
        <div className="p-4">
          <p className="text-sm text-n600 mb-3">
            Columns: <code className="text-ink">department</code>, <code className="text-ink">code</code>, <code className="text-ink">name</code>,{" "}
            <code className="text-ink">opening_qty</code>, <code className="text-ink">as_at_date</code> (YYYY-MM-DD). Nothing is written until you
            confirm the preview below.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
              disabled={stage === "checking" || stage === "committing"}
              className="text-sm"
            />
            <a href="/templates/opening-balance-import-template.csv" download className="text-teal text-sm">
              Download CSV template
            </a>
          </div>
          {fileName ? <p className="text-xs text-n600 mt-2">{fileName}</p> : null}
          {error ? <p className="text-sm text-red mt-3">{error}</p> : null}
          {stage === "checking" ? <p className="text-sm text-n600 mt-3">Validating…</p> : null}
        </div>
      </Card>

      {result ? (
        <Card
          title="2. Preview"
          extra={`${result.totalRows} row${result.totalRows === 1 ? "" : "s"} · ${result.errors.length} error${result.errors.length === 1 ? "" : "s"}`}
        >
          <div className="p-4 grid grid-cols-2 min-[640px]:grid-cols-4 gap-3">
            <Stat label="Total rows" value={result.totalRows} />
            <Stat label="Will create" value={result.toCreate} />
            <Stat label="Already set" value={result.toReplace} />
            <Stat label="No-op (zero, unset)" value={result.noOp} />
          </div>

          {result.toReplace > 0 ? (
            <div className="mx-4 mb-4 bg-n50 border border-n200 rounded p-3">
              <label className="flex items-start gap-2.5 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-teal w-4 h-4 mt-0.5"
                  checked={replaceExisting}
                  onChange={(e) => setReplaceExisting(e.target.checked)}
                />
                <span>
                  <b className="font-medium">{result.toReplace}</b> row{result.toReplace === 1 ? "" : "s"} already{" "}
                  {result.toReplace === 1 ? "has" : "have"} an opening balance set. Replace them — each is reversed and re-recorded cleanly, both
                  entries stay visible in the movement history. Leave unchecked to skip these rows and keep the existing figures.
                </span>
              </label>
            </div>
          ) : null}

          {result.validRows.filter((r) => r.existingMovementId).length > 0 ? (
            <div className="border-t border-n200">
              <div className="px-4 pt-3 pb-1 text-xs text-n600">Rows with an existing opening balance:</div>
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {["Row", "Department", "Product", "Current", "New"].map((h) => (
                        <th key={h} className="text-[11.5px] font-medium text-n600 text-left px-4 py-2 border-b border-n200 bg-n50 uppercase tracking-wide">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.validRows
                      .filter((r) => r.existingMovementId)
                      .map((r) => (
                        <tr key={r.row} className="border-b border-n200 last:border-b-0">
                          <td className="px-4 h-8 text-[13px] tabular-nums whitespace-nowrap">{r.row}</td>
                          <td className="px-4 h-8 text-[13px] whitespace-nowrap">{r.departmentName}</td>
                          <td className="px-4 h-8 text-[13px] whitespace-nowrap">
                            {r.productName} <span className="text-n600 text-xs">{r.productCode}</span>
                          </td>
                          <td className="px-4 h-8 text-[13px] tabular-nums text-n600 whitespace-nowrap">
                            {r.existingQuantity} (as at {r.existingBusinessDay})
                          </td>
                          <td className="px-4 h-8 text-[13px] tabular-nums font-medium whitespace-nowrap">
                            {r.quantity} (as at {r.businessDay})
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {result.errors.length > 0 ? (
            <div className="border-t border-n200">
              <div className="px-4 pt-3 pb-1 text-xs text-n600">
                {result.errors.length} row{result.errors.length === 1 ? "" : "s"} will be skipped:
              </div>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="text-[11.5px] font-medium text-n600 text-left px-4 py-2 border-b border-n200 bg-n50 uppercase tracking-wide">Row</th>
                      <th className="text-[11.5px] font-medium text-n600 text-left px-4 py-2 border-b border-n200 bg-n50 uppercase tracking-wide">
                        Reason
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((e, i) => (
                      <tr key={i} className="border-b border-n200 last:border-b-0">
                        <td className="px-4 h-8 text-[13px] tabular-nums text-red whitespace-nowrap">{e.row}</td>
                        <td className="px-4 h-8 text-[13px] text-n600">{e.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="p-4 border-t border-n200 flex items-center justify-between gap-3">
            <span className="text-sm text-n600">
              {result.validRows.length > 0
                ? `Ready to write ${result.toCreate + (replaceExisting ? result.toReplace : 0)} row${
                    result.toCreate + (replaceExisting ? result.toReplace : 0) === 1 ? "" : "s"
                  }.`
                : "Nothing to import — fix the errors above and re-upload."}
            </span>
            <div className="flex gap-2">
              <Btn onClick={reset} disabled={stage === "committing"}>
                Start over
              </Btn>
              <Btn variant="acc" disabled={stage === "committing" || result.validRows.length === 0} onClick={confirmImport}>
                {stage === "committing" ? "Importing…" : "Import"}
              </Btn>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-n200 rounded px-3 py-2.5">
      <div className="text-[11px] text-n600 uppercase tracking-wide">{label}</div>
      <div className="text-xl font-medium tabular-nums mt-1">{value}</div>
    </div>
  );
}
