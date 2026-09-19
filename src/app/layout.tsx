import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Slate",
  description: "Verified interactive teaching materials.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ml">
      <body>{children}</body>
    </html>
  );
}

