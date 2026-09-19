import type { Metadata } from "next";
import { Manjari } from "next/font/google";
import "./globals.css";

// Builder UI only (§5c). Generated artifacts never load this — they use a
// system Malayalam font stack (see src/lib/artifact/baseCss.ts).
const manjari = Manjari({
  weight: ["100", "400", "700"],
  subsets: ["malayalam", "latin"],
  variable: "--font-manjari",
});

export const metadata: Metadata = {
  title: "Slate",
  description: "Verified interactive teaching materials.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ml" className={manjari.variable}>
      <body>{children}</body>
    </html>
  );
}

