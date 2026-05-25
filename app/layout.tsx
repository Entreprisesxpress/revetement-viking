import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastsProvider } from "@/components/Toasts";
import PWARegister from "@/components/PWARegister";
import PanneauRaccourcis from "@/components/PanneauRaccourcis";
import BarreChargementRoute from "@/components/BarreChargementRoute";

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
  description: "Revêtement Viking Inc. · RBQ 5811-4299-01 · Soumissions automatisées de revêtement extérieur (soffite, fascia, solin, parement)",
  applicationName: "Revêtement Viking",
  authors: [{ name: "Revêtement Viking Inc." }],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Viking",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

export const themeColor = "#0f172a";

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
        <ToastsProvider>
          <BarreChargementRoute />
          {children}
          <PanneauRaccourcis />
        </ToastsProvider>
        <PWARegister />
      </body>
    </html>
  );
}
