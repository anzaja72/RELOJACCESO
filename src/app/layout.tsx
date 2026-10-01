import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { BrandTheme } from "@/components/brand-theme";
import { BRAND_BOOT_SCRIPT } from "@/lib/brand";
import { APP, LOCALE } from "@/lib/config";

const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${APP.name} · ${APP.rfp}`,
  description: APP.tagline,
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang={LOCALE} className={`${sans.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BRAND_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <BrandTheme />
        {children}
      </body>
    </html>
  );
}
