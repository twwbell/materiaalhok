import type { Metadata, Viewport } from "next";
import { Lexend, Nunito_Sans } from "next/font/google";
import "./globals.css";

const lexend = Lexend({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--f-head" });
const nunito = Nunito_Sans({ subsets: ["latin"], weight: ["400", "600", "700", "800"], variable: "--f-body" });

export const metadata: Metadata = { title: "Materiaalhok", description: "Materiaal lenen uit het hok · Sport & Bewegen" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#faf7f2" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={`${lexend.variable} ${nunito.variable}`}>
      <body>{children}</body>
    </html>
  );
}
