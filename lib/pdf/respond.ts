import { renderToBuffer } from "@react-pdf/renderer";

// Every PDF export Route Handler ends with this: render the react-pdf
// Document to a buffer and return it as a downloadable response. Filenames
// follow the same `<report>-<scope>-<date>.pdf` shape the CSV exports
// already use.
export async function pdfResponse(doc: Parameters<typeof renderToBuffer>[0], filename: string): Promise<Response> {
  const buffer = await renderToBuffer(doc);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
