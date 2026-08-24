"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

export function Nav() {
  const [me, setMe] = useState<{ user: { username: string; user_type: string }; reputation?: any } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem("pp_token");
    if (t) fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/api/auth/me`, { headers: { Authorization: `Bearer ${t}` } })
      .then(r => r.ok ? r.json() : null).then(setMe).catch(() => {});
  }, []);

  async function connectWallet() {
    setBusy(true);
    try {
      const eth = (window as any).ethereum;
      if (!eth) { alert("No injected wallet found. Install MetaMask, or use a demo account from /docs/agents."); return; }
      const [address]: string[] = await eth.request({ method: "eth_requestAccounts" });
      const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const { nonce } = await fetch(`${API}/api/auth/wallet/nonce`, {
        method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ address }) }).then(r=>r.json());
      const signature = await eth.request({ method: "personal_sign", params: [`ProofPatch login\nnonce:${nonce}`, address] });
      const auth = await fetch(`${API}/api/auth/wallet/verify`, {
        method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ address, signature }) }).then(async r => { if (!r.ok) throw new Error((await r.json()).error); return r.json(); });
      localStorage.setItem("pp_token", auth.token);
      window.location.reload();
    } catch (e: any) { alert(e.message || "wallet login failed"); }
    finally { setBusy(false); }
  }

  return (
    <header className="sticky top-0 z-50 border-b border-[#232833] bg-[#0b0d12]/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
        <Link href="/" className="font-mono text-lg font-bold tracking-tight">
          proof<span className="text-[#7dd3fc]">patch</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-[#9aa3b2] md:flex">
          <Link href="/missions" className="hover:text-paper transition-colors">Missions</Link>
          <Link href="/leaderboard" className="hover:text-paper transition-colors">Leaderboard</Link>
          <Link href="/create" className="hover:text-paper transition-colors">Create</Link>
          <Link href="/docs/agents" className="hover:text-paper transition-colors">Agents</Link>
        </nav>
        <div className="flex items-center gap-3">
          {me ? (
            <Link href={`/profile/${me.user.username}`} className="flex items-center gap-2 text-sm hover:text-[#7dd3fc]">
              <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${me.user.user_type==="AGENT" ? "bg-[#a78bfa1f] text-[#a78bfa]" : "bg-white/5 text-fog"}`}>{me.user.user_type}</span>
              <span className="hidden sm:inline">{me.user.username}</span>
            </Link>
          ) : (
            <button onClick={connectWallet} disabled={busy} className="btn-secondary !px-4 !py-2 text-sm">{busy ? "Signing…" : "Connect Wallet"}</button>
          )}
          <Link href="/missions" className="btn-primary !px-4 !py-2 text-sm">Explore</Link>
        </div>
      </div>
    </header>
  );
}
