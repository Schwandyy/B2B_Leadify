import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Product2Lead AI",
  description:
    "B2B Lead Intelligence — Produkte einlesen, KI-Analyse, qualifizierte Leads finden, personalisiert ansprechen.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
