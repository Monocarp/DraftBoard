import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import Navigation from "@/components/Navigation";
import { createSupabaseServer } from "@/lib/supabase-server";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0f1a",
};

export const metadata: Metadata = {
  title: "2026 NFL Draft Board",
  description: "Comprehensive 2026 NFL Draft Board — rankings, player profiles, mock drafts, and scouting reports.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Draft Board",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-512.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const isAdmin = !!user && user.email === process.env.ADMIN_EMAIL;

  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} antialiased bg-[#0a0f1a] text-gray-100`}>
        <Navigation userEmail={user?.email ?? null} isAdmin={isAdmin} />
        <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
        <Analytics />
      </body>
    </html>
  );
}
