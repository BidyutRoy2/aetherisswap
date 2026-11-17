import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, Inter } from "next/font/google";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AetherisSwap — Testnet Exchange on GIWA Sepolia",
  description:
    "AetherisSwap is a testnet exchange on GIWA Sepolia built with the Ammora SDK 0.3.9. Swap testnet tokens with live Ammora routing. Testnet only — never real funds.",
  metadataBase: new URL("https://aetherisswap.vercel.app"),
  openGraph: {
    title: "AetherisSwap — Testnet Exchange on GIWA Sepolia",
    description:
      "Swap testnet tokens on GIWA Sepolia with live Ammora SDK routing. Testnet only.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${plexMono.variable} ${inter.variable}`}>
      <body className="min-h-screen flex flex-col">
        <Providers>
          <Header />
          <main className="flex-1 w-full">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
