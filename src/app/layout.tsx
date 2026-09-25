import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { APP, LOCALE } from "@/lib/config";

const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${APP.name} · ${APP.rfp}`,
  description: APP.tagline,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang={LOCALE} className={`${sans.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
