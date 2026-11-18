import { redirect } from "next/navigation";

// Moved to /reports/receipt/pdf; old links keep working.
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  sp.set("kind", "REQUISITION");
  redirect(`/reports/receipt/pdf?${sp.toString()}`);
}
