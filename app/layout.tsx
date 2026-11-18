import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import NextTopLoader from "nextjs-toploader";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import "./globals.css";

// Inter, self-hosted (app/fonts/, SIL Open Font License — see Inter-LICENSE.txt)
// rather than next/font/google: fetching from Google Fonts at build time made
// production builds depend on Google's response, and one variant of it broke
// Turbopack's font loader outright. Same latin subset Google served before;
// the variable file covers the 400/500 weights the app uses.
const inter = localFont({
  variable: "--font-inter",
  src: "./fonts/InterVariable-latin.woff2",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sagefinan",
  description: "Daily stock audit for hotel departments",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Sagefinan",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a100c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>
        <NextTopLoader color="var(--brand-bright)" height={3} showSpinner={false} shadow={false} />
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  );
}
