import { redirect } from "next/navigation";

// Receipts moved to the shared /reports/receipt view (dark-green redesign,
// with unit costs and values); old links keep working.
export default async function LegacyReceiptPage({ searchParams }: { searchParams: Promise<{ department?: string; day?: string; by?: string }> }) {
  const { department = "", day = "", by = "" } = await searchParams;
  redirect(`/reports/receipt?${new URLSearchParams({ kind: "REQUISITION", department, day, by }).toString()}`);
}
