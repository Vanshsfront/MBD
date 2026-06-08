import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { Rum } from "@/components/rum";
import "./globals.css";

// Inter is the canonical typeface for the MBD app — chosen to match the
// legacy codebase's Cal-AI-style typography. Geist_Mono is retained for the
// (rare) monospace surfaces (token strings, invoice numbers).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "MBD Clinic OS",
  description: "Movement By Design — Clinic Operating System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {children}
        <Toaster position="top-right" richColors closeButton />
        <Rum />
      </body>
    </html>
  );
}
