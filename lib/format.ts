// Unsigned naira magnitude, e.g. formatNaira(1500) -> "₦1,500". Sign (when
// needed — the ledger/received/issued style "+"/"−" prefixes) is composed by
// the caller, since most figures in the design (the compare table's Value
// column) are shown unsigned and coloured instead.
export function formatNaira(value: number): string {
  return "₦" + Math.round(Math.abs(value)).toLocaleString("en-NG");
}
