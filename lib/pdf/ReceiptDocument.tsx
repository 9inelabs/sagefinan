import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import path from "path";
import { PDF_FONT_FAMILY, RECEIPT_PDF_COLORS as C, formatNairaPdf } from "./theme";
import type { ReceiptData } from "@/lib/receipts/actions";

// public/logo-mark-white.png is logo-mark.png with its colours inverted
// (sharp negate, alpha kept): react-pdf has no CSS invert filter, and the
// black mark would vanish on the dark band.
// PDF twin of components/receipt/ReceiptView.tsx — the same dark-green
// header band (hotel, receipt type, reference, headline, grand total, detail
// tiles), the itemised table with unit price/value, flags and notes, and a
// totals block. A4 so it prints cleanly; the header band repeats nothing
// but the table header repeats on every page.
const LOGO = path.join(process.cwd(), "public/logo-mark-white.png");

const styles = StyleSheet.create({
  page: { fontFamily: PDF_FONT_FAMILY, fontSize: 9.5, color: C.ink, paddingBottom: 46 },
  band: { backgroundColor: C.frame, paddingHorizontal: 40, paddingTop: 30, paddingBottom: 24 },
  bandTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brandRow: { flexDirection: "row", alignItems: "center" },
  logo: { width: 22, height: 24, marginRight: 8 },
  hotel: { color: C.onDark, fontSize: 12, fontWeight: "bold" },
  hotelSub: { color: C.onDarkMut, fontSize: 8 },
  pill: { color: C.brandBright, fontSize: 8, fontWeight: "bold", letterSpacing: 1.2, borderWidth: 1, borderColor: C.brand, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 3, textTransform: "uppercase" },
  ref: { color: C.onDarkMut, fontSize: 8, marginTop: 5, textAlign: "right" },
  heroRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 20 },
  label: { color: C.onDarkMut, fontSize: 8 },
  headline: { color: C.onDark, fontSize: 20, fontWeight: "bold", marginTop: 2 },
  sub: { color: C.onDarkMut, fontSize: 8.5, marginTop: 3 },
  total: { color: C.onDark, fontSize: 24, marginTop: 2, textAlign: "right" },
  tiles: { flexDirection: "row", flexWrap: "wrap", marginTop: 16, gap: 6 },
  tile: { backgroundColor: C.frame2, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 6, minWidth: 110, flexGrow: 1 },
  tileLabel: { color: C.onDarkMut, fontSize: 7 },
  tileValue: { color: C.onDark, fontSize: 9, marginTop: 1.5 },
  body: { paddingHorizontal: 40, paddingTop: 18 },
  headRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.n200, paddingBottom: 5 },
  th: { color: C.n600, fontSize: 8 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.n100, paddingVertical: 7 },
  cNo: { width: 22, textAlign: "right", paddingRight: 8, color: C.n600, fontSize: 8 },
  cItem: { flex: 1, paddingRight: 8 },
  cQty: { width: 50, textAlign: "right" },
  cUnit: { width: 80, textAlign: "right", color: C.n600 },
  cAmt: { width: 90, textAlign: "right" },
  itemName: { fontSize: 10 },
  itemMeta: { fontSize: 7.5, color: C.n600, marginTop: 2 },
  note: { fontSize: 7.5, color: C.n600, marginTop: 2 },
  bold: { fontWeight: "bold" },
  neg: { color: C.red },
  totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 14 },
  totals: { width: 220, backgroundColor: C.n50, borderRadius: 8, padding: 10 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  totalsGrand: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: C.n200, marginTop: 4, paddingTop: 6 },
  grandValue: { color: C.brand, fontSize: 13, fontWeight: "bold" },
  footer: { position: "absolute", bottom: 20, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: C.n600 },
});

function qty(n: number) {
  return n < 0 ? `−${Math.abs(n)}` : String(n);
}
function money(n: number | null) {
  if (n == null) return "—";
  return n < 0 ? `−${formatNairaPdf(n)}` : formatNairaPdf(n);
}
function day(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
function stamp(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ReceiptDocument({ receipt }: { receipt: ReceiptData }) {
  // Requisition receipts carry no prices (receipt.showPrices false): the
  // price columns, money total and grand-total block are dropped entirely.
  const prices = receipt.showPrices;
  const isPurchase = receipt.kind === "PURCHASE";
  const unstockedCount = receipt.lines.filter((l) => l.unstocked).length;
  const tiles = [...receipt.details.map((d) => ({ label: d.label, value: d.value })), { label: "Recorded", value: stamp(receipt.recordedAt) }];
  return (
    <Document title={`${receipt.title} ${receipt.reference}`} author="De-Moon Hotel">
      <Page size="A4" style={styles.page}>
        <View style={styles.band}>
          <View style={styles.bandTop}>
            <View style={styles.brandRow}>
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={LOGO} style={[styles.logo, { opacity: 0.95 }]} />
              <View>
                <Text style={styles.hotel}>De-Moon Hotel</Text>
                <Text style={styles.hotelSub}>Stock Database</Text>
              </View>
            </View>
            <View>
              <Text style={styles.pill}>{receipt.title}</Text>
              <Text style={styles.ref}>{receipt.reference}</Text>
            </View>
          </View>
          <View style={styles.heroRow}>
            <View style={{ maxWidth: 300 }}>
              <Text style={styles.label}>{receipt.kind === "PURCHASE" ? "Supplier" : "Department"}</Text>
              <Text style={styles.headline}>{receipt.headline}</Text>
              <Text style={styles.sub}>Business day {day(receipt.businessDay)}</Text>
            </View>
            <View>
              <Text style={[styles.label, { textAlign: "right" }]}>{prices ? receipt.valueLabel : "Bottles"}</Text>
              <Text style={styles.total}>{prices ? money(receipt.totals.amount) : qty(receipt.totals.quantity)}</Text>
              <Text style={[styles.sub, { textAlign: "right" }]}>
                {receipt.totals.items} item{receipt.totals.items === 1 ? "" : "s"}
                {prices ? ` · ${qty(receipt.totals.quantity)} bottles` : ""}
                {unstockedCount > 0 ? ` · ${unstockedCount} not stocked` : ""}
              </Text>
            </View>
          </View>
          <View style={styles.tiles}>
            {tiles.map((t) => (
              <View key={t.label} style={styles.tile}>
                <Text style={styles.tileLabel}>{t.label}</Text>
                <Text style={styles.tileValue}>{t.value}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.headRow} fixed>
            <Text style={[styles.th, styles.cNo]}>#</Text>
            <Text style={[styles.th, styles.cItem]}>Item</Text>
            <Text style={[styles.th, styles.cQty]}>Qty</Text>
            {prices ? <Text style={[styles.th, styles.cUnit]}>{isPurchase ? "Unit price" : "Unit cost"}</Text> : null}
            {prices ? <Text style={[styles.th, styles.cAmt]}>{receipt.valueLabel}</Text> : null}
          </View>
          {receipt.lines.map((l, i) => (
            <View key={l.id} style={styles.row} wrap={false}>
              <Text style={styles.cNo}>{i + 1}</Text>
              <View style={styles.cItem}>
                <Text style={styles.itemName}>{l.name}</Text>
                <Text style={styles.itemMeta}>{[l.code, ...l.flags].filter(Boolean).join("  ·  ")}</Text>
                {l.note ? <Text style={styles.note}>“{l.note}”</Text> : null}
              </View>
              <Text style={[styles.cQty, styles.bold, l.quantity < 0 ? styles.neg : {}, l.unstocked ? { width: 80 } : {}]}>
                {l.unstocked ? l.quantityText || "—" : qty(l.quantity)}
              </Text>
              {prices ? <Text style={styles.cUnit}>{l.unitPrice != null ? formatNairaPdf(l.unitPrice) : "—"}</Text> : null}
              {prices ? <Text style={[styles.cAmt, styles.bold, (l.amount ?? 0) < 0 ? styles.neg : {}]}>{money(l.amount)}</Text> : null}
            </View>
          ))}

          <View style={styles.totalsWrap} wrap={false}>
            <View style={styles.totals}>
              <View style={styles.totalsRow}>
                <Text style={{ color: C.n600 }}>Items</Text>
                <Text>{receipt.totals.items}</Text>
              </View>
              <View style={styles.totalsRow}>
                <Text style={{ color: C.n600 }}>{isPurchase ? "Bottles into stock" : "Total quantity"}</Text>
                <Text>{qty(receipt.totals.quantity)}</Text>
              </View>
              {prices ? (
                <View style={styles.totalsGrand}>
                  <Text style={{ color: C.n600 }}>Total {receipt.valueLabel.toLowerCase()}</Text>
                  <Text style={styles.grandValue}>{money(receipt.totals.amount)}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>
            Computer-generated receipt · {receipt.reference} · entered by {receipt.createdByName}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
