import path from "path";
import { Font } from "@react-pdf/renderer";

// DejaVu Sans (lib/pdf/fonts/DejaVuSans.ttf, Bitstream Vera license — see
// DejaVuSans-LICENSE.txt alongside it) is the one font registered for every
// PDF export in this app. It was chosen over Inter/Noto Sans's split Google-
// Fonts subset files (tested with fontkit before deciding) specifically
// because it's the one single font file confirmed to carry every glyph these
// reports actually print — ASCII, the Naira sign (U+20A6), and the minus/
// dash characters formatNaira's sign logic uses — where Google's per-subset
// "latin" vs "latin-ext" files each cover only half of that set. Registered
// once at module load; @react-pdf/renderer dedupes repeat calls internally.
const FONT_PATH = path.join(process.cwd(), "lib/pdf/fonts/DejaVuSans.ttf");
Font.register({ family: "DejaVu Sans", src: FONT_PATH });

// react-pdf can't hyphenate DejaVu Sans's embedded subset reliably, and
// product names/notes should never break mid-word in a printed report.
Font.registerHyphenationCallback((word) => [word]);

// Mirrors app/globals.css's design tokens (CLAUDE.md's "Design tokens"
// convention) — the same Ink/Teal/neutral/semantic palette, just re-declared
// here since react-pdf styles are a separate StyleSheet, not CSS.
export const PDF_COLORS = {
  ink: "#111827",
  teal: "#0F766E",
  n50: "#F9FAFB",
  n100: "#F3F4F6",
  n200: "#E5E7EB",
  n400: "#9CA3AF",
  n600: "#4B5563",
  red: "#B42318",
  green: "#067647",
  amber: "#B54708",
  white: "#FFFFFF",
} as const;

export const PDF_FONT_FAMILY = "DejaVu Sans";

// PDF-specific formatting: the app's own formatNaira/sign helpers use ₦ and
// U+2212 MINUS SIGN / U+2014 EM DASH, all covered by DejaVu Sans (see above),
// so these simply mirror lib/format.ts and the per-page `sign` helpers
// rather than introducing ASCII substitutes.
export function formatNairaPdf(value: number): string {
  return "₦" + Math.round(Math.abs(value)).toLocaleString("en-NG");
}

export function signedNairaPdf(value: number): string {
  const sign = value < 0 ? "−" : value > 0 ? "+" : "";
  return `${sign}${formatNairaPdf(value)}`;
}

export function signedQtyPdf(value: number): string {
  return value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0";
}

export function formatGeneratedAt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
