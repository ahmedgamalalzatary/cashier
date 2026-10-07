import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@cashier/web-core/components/auth/auth-provider";
import { AppShell } from "@/components/layout/app-shell";
import { BranchProvider } from "@cashier/web-core/components/branches/branch-provider";

const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-plex-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "نظام الكاشير والمخازن",
  description: "نظام إدارة الكافيه: كاشير، مخازن، موردين، ورديات",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${plexArabic.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <AuthProvider>
          <BranchProvider>
            <AppShell>{children}</AppShell>
          </BranchProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
