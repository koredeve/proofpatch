import type { Metadata } from "next";
import { Instrument_Serif, Public_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";

const instrument = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal","italic"], variable: "--font-instrument-serif" });
const publicSans = Public_Sans({ subsets: ["latin"], variable: "--font-public-sans" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400","500","600","700"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: "ProofPatch — Find errors. Prove them. Earn.",
  description: "Decentralized evidence-verification marketplace adjudicated on GenLayer.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${instrument.variable} ${publicSans.variable} ${plexMono.variable}`}>
      <body className="min-h-screen bg-vault text-ink antialiased">
        <Nav />
        <main className="mx-auto max-w-6xl px-5 pb-24 pt-10">{children}</main>
        <footer className="border-t border-edge py-8 text-center font-mono text-[11px] uppercase tracking-[0.15em] text-fog">
          ProofPatch · testnet · adjudicated on GenLayer · simulated results labeled
        </footer>
      </body>
    </html>
  );
}
