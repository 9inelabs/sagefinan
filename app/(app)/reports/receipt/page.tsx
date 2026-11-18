import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/profile";
import { PageShell } from "@/components/app-shell/PageShell";
import { ReceiptView } from "@/components/receipt/ReceiptView";
import { getReceipt } from "@/lib/receipts/actions";
import { parseReceiptParams, receiptQuery, RECEIPT_BACK } from "./params";

export default async function ReceiptPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  await getCurrentProfile();
  const params = parseReceiptParams(await searchParams);
  if (!params) notFound();

  const receipt = await getReceipt(params);
  if (!receipt) notFound();

  const back = RECEIPT_BACK[params.kind];
  return (
    <PageShell title={receipt.title} subtitle={`${receipt.headline} · ${receipt.reference}`}>
      <ReceiptView receipt={receipt} backHref={back.href} backLabel={back.label} pdfHref={`/reports/receipt/pdf?${receiptQuery(params)}`} />
    </PageShell>
  );
}
