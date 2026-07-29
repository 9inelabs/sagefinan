import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { PDF_COLORS, PDF_FONT_FAMILY } from "./theme";

// PDF counterpart of components/receipt/ReceiptView.tsx — same content,
// same black-and-white spirit, deliberately simpler visually (a solid dark
// header bar rather than the on-screen gradient — react-pdf's gradient
// primitives are a real added-complexity/reliability tradeoff for a detail
// that isn't the point of the export; the on-screen view is what's asked to
// match the reference image exactly, this is the print/save convenience).
const styles = StyleSheet.create({
  page: {
    fontFamily: PDF_FONT_FAMILY,
    fontSize: 10,
    color: PDF_COLORS.ink,
    padding: 36,
  },
  card: { maxWidth: 340, marginHorizontal: "auto", width: "100%" },
  header: {
    backgroundColor: PDF_COLORS.ink,
    borderRadius: 10,
    padding: 20,
    marginBottom: 14,
    textAlign: "center",
  },
  hotelName: {
    color: PDF_COLORS.white,
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  headerLine: { color: "#D4D4D8", fontSize: 9.5, marginBottom: 2 },
  linesCard: {
    borderWidth: 1,
    borderColor: PDF_COLORS.n200,
    borderRadius: 10,
    overflow: "hidden",
  },
  line: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: PDF_COLORS.n100,
  },
  lineName: { fontSize: 10.5, color: PDF_COLORS.ink },
  lineCode: { fontSize: 8, color: PDF_COLORS.n400, marginTop: 2 },
  lineQty: { fontSize: 10.5, color: PDF_COLORS.ink },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: PDF_COLORS.n50,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  totalsLabel: { fontSize: 8, color: PDF_COLORS.n600, textTransform: "uppercase" },
  totalsValue: { fontSize: 10.5, color: PDF_COLORS.ink },
  footer: { textAlign: "center", fontSize: 8, color: PDF_COLORS.n400, marginTop: 14 },
});

export type ReceiptDocumentLine = {
  code: string;
  name: string;
  quantity: number;
  isOverride: boolean;
  isReversal: boolean;
  isReversed: boolean;
};

export function ReceiptDocument({
  kind,
  businessDay,
  departmentName,
  createdByName,
  lines,
}: {
  kind: string;
  businessDay: string;
  departmentName: string;
  createdByName: string;
  lines: ReceiptDocumentLine[];
}) {
  const totalQuantity = lines.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <Document>
      <Page size="A5" style={styles.page}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.hotelName}>De-Moon Hotel</Text>
            <Text style={styles.headerLine}>
              {kind} · {createdByName} · {businessDay}
            </Text>
            <Text style={styles.headerLine}>Department · {departmentName}</Text>
          </View>

          <View style={styles.linesCard}>
            {lines.map((l, i) => (
              <View key={`${l.code}-${i}`} style={styles.line}>
                <View>
                  <Text style={styles.lineName}>{l.name}</Text>
                  <Text style={styles.lineCode}>
                    {l.code}
                    {l.isOverride ? "  ·  OVERRIDE" : ""}
                    {l.isReversal ? "  ·  REVERSAL" : ""}
                    {l.isReversed ? "  ·  REVERSED" : ""}
                  </Text>
                </View>
                <Text style={styles.lineQty}>{l.quantity}</Text>
              </View>
            ))}
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>
                {lines.length} item{lines.length === 1 ? "" : "s"}
              </Text>
              <Text style={styles.totalsValue}>{totalQuantity}</Text>
            </View>
          </View>

          <Text style={styles.footer}>Receipt is computer generated.</Text>
        </View>
      </Page>
    </Document>
  );
}
