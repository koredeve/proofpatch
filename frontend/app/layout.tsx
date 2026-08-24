import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "ProofPatch — Find errors. Prove them. Earn.",
  description: "Decentralized evidence-verification marketplace adjudicated on GenLayer.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0b0d12] text-[#e8ebf0] antialiased">
        <Nav />
        <main className="mx-auto max-w-6xl px-5 pb-24 pt-10">{children}</main>
        <footer className="border-t border-[#232833] py-8 text-center text-xs text-[#566071]">
          ProofPatch — testnet software · adjudication via GenLayer Intelligent Contracts · demo data labeled SIMULATED
        </footer>
      </body>
    </html>
  );
}
