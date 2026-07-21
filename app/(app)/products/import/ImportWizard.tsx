"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Btn } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { DryRunResult } from "@/lib/products/import";
import { commitImportProducts, dryRunImportProducts } from "@/lib/products/import";

type Stage = "upload" | "checking" | "preview" | "committing" | "done";

export function ImportWizard() {
  const [stage, setStage] = useState<Stage>("upload");
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<DryRunResult | null>(null);
  const [commitResult, setCommitResult] = useState<{ created: number; updated: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setFileName(file.name);
    setStage("checking");
    try {
      const text = await file.text();
      const dryRun = await dryRunImportProducts(text);
      setResult(dryRun);
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
      const summary = await commitImportProducts(result.validRows);
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
    setCommitResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  if (stage === "done" && commitResult) {
    return (
      <Card title="Import complete">
        <div className="p-6 text-sm leading-relaxed">
          <p className="mb-4">
            Created <b className="font-medium">{commitResult.created}</b> product{commitResult.created === 1 ? "" : "s"} and updated{" "}
            <b className="font-medium">{commitResult.updated}</b> existing product{commitResult.updated === 1 ? "" : "s"}.
          </p>
          <div className="flex gap-2">
            <Link href="/products">
              <Btn variant="acc">Go to products</Btn>
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
            Columns: <code className="text-ink">code</code>, <code className="text-ink">name</code>,{" "}
            <code className="text-ink">unit_cost</code>, <code className="text-ink">departments</code> (semicolon-separated),{" "}
            <code className="text-ink">shelf_order</code> (optional). Nothing is written until you confirm the preview below.
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
            <a href="/templates/product-import-template.csv" download className="text-teal text-sm">
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
          extra={`${result.totalRows} row${result.totalRows === 1 ? "" : "s"} · ${result.errors.length} error${
            result.errors.length === 1 ? "" : "s"
          }`}
        >
          <div className="p-4 grid grid-cols-3 gap-3">
            <Stat label="Total rows" value={result.totalRows} />
            <Stat label="Will create" value={result.toCreate} />
            <Stat label="Will update" value={result.toUpdate} />
          </div>

          {result.errors.length > 0 ? (
            <div className="border-t border-n200">
              <div className="px-4 pt-3 pb-1 text-xs text-n600">
                {result.errors.length} row{result.errors.length === 1 ? "" : "s"} will be skipped:
              </div>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="text-[11.5px] font-medium text-n600 text-left px-4 py-2 border-b border-n200 bg-n50 uppercase tracking-wide">
                        Row
                      </th>
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
                ? `Ready to write ${result.validRows.length} row${result.validRows.length === 1 ? "" : "s"}.`
                : "Nothing to import — fix the errors above and re-upload."}
            </span>
            <div className="flex gap-2">
              <Btn onClick={reset} disabled={stage === "committing"}>
                Start over
              </Btn>
              <Btn variant="acc" disabled={stage === "committing" || result.validRows.length === 0} onClick={confirmImport}>
                {stage === "committing" ? "Importing…" : `Import ${result.validRows.length} row${result.validRows.length === 1 ? "" : "s"}`}
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
