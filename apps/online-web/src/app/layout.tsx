import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@cashier/web-core/components/auth/auth-provider";
import { BranchProvider } from "@cashier/web-core/components/branches/branch-provider";
import { OnlineShell } from "@/components/online-shell";

const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-plex-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "تقارير الكاشير",
  description: "تقارير المبيعات والمخزون والمال لكل فرع",
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
            <OnlineShell>{children}</OnlineShell>
          </BranchProvider>
        </AuthProvider>
      </body>
    </html>
  );
}