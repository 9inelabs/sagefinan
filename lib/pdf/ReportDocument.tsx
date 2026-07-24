import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { PDF_COLORS, PDF_FONT_FAMILY, formatGeneratedAt } from "./theme";

const styles = StyleSheet.create({
  page: {
    fontFamily: PDF_FONT_FAMILY,
    fontSize: 9.5,
    color: PDF_COLORS.ink,
    padding: "28 30 40",
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  hotelName: { fontSize: 10, color: PDF_COLORS.n600 },
  generated: { fontSize: 8, color: PDF_COLORS.n600, textAlign: "right" },
  title: { fontSize: 16, color: PDF_COLORS.ink, marginBottom: 3 },
  subtitle: { fontSize: 9.5, color: PDF_COLORS.n600, marginBottom: 10 },
  rule: { borderBottomWidth: 1, borderBottomColor: PDF_COLORS.n200, marginBottom: 14 },
  footer: {
    position: "absolute",
    bottom: 16,
    left: 30,
    right: 30,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: PDF_COLORS.n400,
    borderTopWidth: 1,
    borderTopColor: PDF_COLORS.n200,
    paddingTop: 6,
  },
});

// Shared shell for every PDF export in the app (SPEC.md's "Exports" section:
// hotel name, report title, department/date range, generated-on timestamp
// and by whom, then the data — same header on every report). Callers supply
// the data as ordinary react-pdf content (typically one or more PdfTable
// blocks below); this component only owns the header/footer chrome.
export function ReportDocument({
  title,
  scopeLine,
  generatedByName,
  generatedAt,
  children,
}: {
  title: string;
  scopeLine: string;
  generatedByName: string;
  generatedAt: string;
  children: React.ReactNode;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.headerTop}>
          <Text style={styles.hotelName}>De-Moon Hotel — Sagefinan</Text>
          <Text style={styles.generated}>
            Generated {formatGeneratedAt(generatedAt)} by {generatedByName}
          </Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{scopeLine}</Text>
        <View style={styles.rule} />

        {children}

        <View style={styles.footer} fixed>
          <Text>Sagefinan — De-Moon Hotel stock audit</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export type PdfColumn = {
  header: string;
  width: number; // flex-basis in percent, columns in a table should sum to 100
  align?: "left" | "right";
};

const tableStyles = StyleSheet.create({
  table: { marginBottom: 16 },
  tableTitle: { fontSize: 10.5, color: PDF_COLORS.ink, marginBottom: 6, marginTop: 2 },
  headRow: {
    flexDirection: "row",
    backgroundColor: PDF_COLORS.n50,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: PDF_COLORS.n200,
    paddingVertical: 4,
  },
  headCell: { fontSize: 7.5, color: PDF_COLORS.n600, textTransform: "uppercase" },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderColor: PDF_COLORS.n200,
    paddingVertical: 4,
  },
  totalsRow: {
    flexDirection: "row",
    backgroundColor: PDF_COLORS.n50,
    borderBottomWidth: 1,
    borderColor: PDF_COLORS.n200,
    paddingVertical: 4,
  },
  cell: { fontSize: 8.5, paddingHorizontal: 4 },
});

// A single table, columns as percentage widths (react-pdf has no HTML
// <table>; this is the flexbox-row equivalent of the app's own `<table>`
// styling — hairline row borders, n50 header background, no zebra striping,
// matching CLAUDE.md's design tokens). Cells are pre-formatted strings so
// every caller controls its own number/currency formatting explicitly
// (formatNairaPdf/signedNairaPdf/signedQtyPdf from ./theme).
export function PdfTable({
  title,
  columns,
  rows,
  rowColors,
  totalsRow,
}: {
  title?: string;
  columns: PdfColumn[];
  rows: string[][];
  rowColors?: (string | undefined)[][];
  totalsRow?: string[];
}) {
  return (
    <View style={tableStyles.table} wrap>
      {title ? <Text style={tableStyles.tableTitle}>{title}</Text> : null}
      <View style={tableStyles.headRow} fixed>
        {columns.map((c, i) => (
          <Text
            key={i}
            style={[tableStyles.cell, tableStyles.headCell, { width: `${c.width}%`, textAlign: c.align ?? "left" }]}
          >
            {c.header}
          </Text>
        ))}
      </View>
      {rows.map((row, ri) => (
        <View key={ri} style={tableStyles.row} wrap={false}>
          {row.map((cell, ci) => (
            <Text
              key={ci}
              style={[
                tableStyles.cell,
                { width: `${columns[ci].width}%`, textAlign: columns[ci].align ?? "left" },
                ...(rowColors?.[ri]?.[ci] ? [{ color: rowColors[ri][ci] }] : []),
              ]}
            >
              {cell}
            </Text>
          ))}
        </View>
      ))}
      {totalsRow ? (
        <View style={tableStyles.totalsRow} wrap={false}>
          {totalsRow.map((cell, ci) => (
            <Text
              key={ci}
              style={[tableStyles.cell, { width: `${columns[ci].width}%`, textAlign: columns[ci].align ?? "left" }]}
            >
              {cell}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function PdfNote({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontSize: 8, color: PDF_COLORS.n600, marginBottom: 10 }} wrap>
      {children}
    </Text>
  );
}
