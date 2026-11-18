import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { PDF_FONT_FAMILY, PO_PDF_COLORS as C, formatNaira2Pdf } from "./theme";

// Reproduces the hotel's own "Goods Purchase Order" template (the PDF the
// owner supplied): navy top rule, orange hotel name, large grey title, date
// block, red column headings, zebra-striped item rows, a navy "Subtotal"
// label and a large pink grand total. Adds the order number and approval
// line, which the paper version didn't need.
const styles = StyleSheet.create({
  page: { fontFamily: PDF_FONT_FAMILY, fontSize: 9.5, color: C.text, paddingTop: 34, paddingBottom: 48, paddingHorizontal: 54 },
  rule: { height: 7, backgroundColor: C.navy, marginBottom: 22, marginHorizontal: -40 },
  hotel: { color: C.orange, fontSize: 17, fontWeight: "bold", letterSpacing: 0.2 },
  title: { color: C.title, fontSize: 30, fontWeight: "bold", marginTop: 2 },
  metaRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 8, marginBottom: 16, gap: 28 },
  metaBlock: { minWidth: 110 },
  metaValue: { fontSize: 10.5, fontWeight: "bold", color: C.text },
  metaLabel: { fontSize: 8, color: C.muted, marginTop: 2 },
  headRow: { flexDirection: "row", paddingBottom: 6, marginBottom: 2 },
  head: { color: C.heading, fontWeight: "bold", fontSize: 10.5 },
  row: { flexDirection: "row", alignItems: "center", minHeight: 20, paddingVertical: 3 },
  zebra: { backgroundColor: C.zebra },
  colNo: { width: 46, textAlign: "right", paddingRight: 8, fontWeight: "bold", fontSize: 8.5 },
  colDesc: { flex: 1, paddingRight: 8 },
  colQty: { width: 120, fontWeight: "bold" },
  colAmt: { width: 110, textAlign: "right", fontWeight: "bold", paddingRight: 4 },
  subtotalRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: C.rule, paddingTop: 7, marginTop: 1 },
  subtotalLabel: { flex: 1, textAlign: "right", color: C.navy, fontWeight: "bold", paddingRight: 40 },
  subtotalValue: { width: 110, textAlign: "right", fontWeight: "bold", color: "#000000", paddingRight: 4 },
  grand: { textAlign: "right", color: C.pink, fontSize: 22, fontWeight: "bold", marginTop: 20, paddingRight: 4 },
  approval: { marginTop: 26, fontSize: 8.5, color: C.muted },
  footer: { position: "absolute", bottom: 22, left: 54, right: 54, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: C.muted },
});

export type PurchaseOrderDocumentProps = {
  poNumber: string;
  orderDate: string; // already formatted, e.g. 16-Nov-2026
  supplierName: string | null;
  approvedLine: string | null; // e.g. "Approved by Franklyn Raymond · 16 Nov 2026, 14:05"
  lines: { lineNo: number; description: string; quantityText: string | null; amount: number }[];
  total: number;
};

export function PurchaseOrderDocument({ poNumber, orderDate, supplierName, approvedLine, lines, total }: PurchaseOrderDocumentProps) {
  return (
    <Document title={`Purchase order ${poNumber}`} author="De-Moon Relaxation Place">
      <Page size="A4" style={styles.page}>
        <View style={styles.rule} fixed />
        <Text style={styles.hotel}>DE-MOON RELAXATION PLACE</Text>
        <Text style={styles.title}>Goods Purchase Order</Text>

        <View style={styles.metaRow}>
          {supplierName ? (
            <View style={styles.metaBlock}>
              <Text style={styles.metaValue}>{supplierName}</Text>
              <Text style={styles.metaLabel}>Supplier</Text>
            </View>
          ) : null}
          <View style={styles.metaBlock}>
            <Text style={styles.metaValue}>{poNumber}</Text>
            <Text style={styles.metaLabel}>Order no.</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaValue}>{orderDate}</Text>
            <Text style={styles.metaLabel}>Date</Text>
          </View>
        </View>

        <View style={styles.headRow} fixed>
          <Text style={[styles.head, { width: 46 }]}>Item #</Text>
          <Text style={[styles.head, { flex: 1 }]}>Description</Text>
          <Text style={[styles.head, { width: 120 }]}>Qty</Text>
          <Text style={[styles.head, { width: 110, textAlign: "right", paddingRight: 4 }]}>Total price</Text>
        </View>

        {lines.map((l, i) => (
          <View key={l.lineNo} style={i % 2 === 0 ? [styles.row, styles.zebra] : styles.row} wrap={false}>
            <Text style={styles.colNo}>{l.lineNo}</Text>
            <Text style={styles.colDesc}>{l.description}</Text>
            <Text style={styles.colQty}>{l.quantityText ?? ""}</Text>
            <Text style={styles.colAmt}>{formatNaira2Pdf(l.amount)}</Text>
          </View>
        ))}

        <View style={styles.subtotalRow} wrap={false}>
          <Text style={styles.subtotalLabel}>Subtotal</Text>
          <Text style={styles.subtotalValue}>{formatNaira2Pdf(total)}</Text>
        </View>
        <Text style={styles.grand}>{formatNaira2Pdf(total)}</Text>

        {approvedLine ? <Text style={styles.approval}>{approvedLine}</Text> : null}

        <View style={styles.footer} fixed>
          <Text>
            {poNumber} · {orderDate}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
