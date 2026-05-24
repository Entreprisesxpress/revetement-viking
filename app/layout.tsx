import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastsProvider } from "@/components/Toasts";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Revêtement Viking — Revêtement extérieur",
  description: "Revêtement Viking Inc. · RBQ 5819-1099-01 · Soumissions automatisées de revêtement extérieur (soffite, fascia, solin, parement)",
  applicationName: "Revêtement Viking",
  authors: [{ name: "Revêtement Viking Inc." }],
  themeColor: "#0f172a",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr-CA"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ToastsProvider>{children}</ToastsProvider>
      </body>
    </html>
  );
}
