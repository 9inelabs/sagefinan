import { getCurrentProfile } from "@/lib/auth/profile";
import { getReceipt } from "@/lib/receipts/actions";
import { ReceiptDocument } from "@/lib/pdf/ReceiptDocument";
import { pdfResponse } from "@/lib/pdf/respond";
import { parseReceiptParams } from "@/lib/receipts/params";

export async function GET(request: Request) {
  await getCurrentProfile();
  const params = parseReceiptParams(new URL(request.url).searchParams);
  if (!params) return new Response("Missing or invalid receipt parameters.", { status: 400 });

  const receipt = await getReceipt(params);
  if (!receipt) return new Response("Not found.", { status: 404 });

  const slug = receipt.headline.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return pdfResponse(<ReceiptDocument receipt={receipt} />, `${receipt.title.toLowerCase().replace(/\s+/g, "-")}-${slug}-${params.day}.pdf`);
}
