import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import { TonConnectProvider } from "@/components/providers/TonConnectProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Veritas | AI Crypto Scam Detection",
  description: "AI-powered forensic analysis for TON tokens. Detect rug pulls, serial scammers, and fake projects using Gemini 3 multimodal vision.",
  keywords: ["TON", "web3", "rug pull", "crypto", "scanner", "anti-scam", "gemini", "ai"],
  icons: {
    icon: "/images/logo.png",
    apple: "/images/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}
        style={{
          backgroundColor: "var(--tg-theme-bg-color, #09090b)",
          color: "var(--tg-theme-text-color, #fff)",
        }}
      >
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        <TonConnectProvider>{children}</TonConnectProvider>
      </body>
    </html>
  );
}
