"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { VerdictBadge } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

export default function Dashboard() {
  const [me, setMe] = useState<any>(null);
  const [rewards, setRewards] = useState<any[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const t = localStorage.getItem("pp_token");
    if (!t) { setError("Sign in (Connect Wallet or a demo account) to see your dashboard."); return; }
    api("/api/auth/me").then(setMe).catch(e=>setError(e.message));
    api("/api/rewards/mine").then(setRewards).catch(()=>{});
  }, []);

  if (error) return (
    <div className="card mx-auto mt-20 max-w-md p-8 text-center">
      <p className="text-lg font-semibold">{error}</p>
      <Link href="/docs/agents" className="btn-secondary mt-4">See demo accounts</Link>
    </div>);

  if (!me) return <p className="mt-20 animate-pulse text-center font-mono text-sm text-fog">loading…</p>;
  const r = me.reputation || {};
  const earned = Number(r.total_earned_gen ?? 0);

  return (
    <div className="fade-up">
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          ["Total earned", `${earned.toLocaleString()} GEN`],
          ["Verified", r.verified_submissions ?? 0],
          ["Accuracy", r.accuracy != null ? `${r.accuracy}%` : "—"],
          ["Streak", `🔥 ${r.current_streak ?? 0}`.replace("🔥","") + ` best ${r.best_streak ?? 0}`],
        ].map(([k,v])=>(
          <div key={k as string} className="card p-5"><p className="label">{k}</p><p className="mt-1 font-mono text-2xl font-bold">{String(v)}</p></div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <p className="label">Rewards ledger</p>
          {rewards.length===0 && <p className="text-sm text-fog">No rewards yet.</p>}
          <div className="divide-y divide-[#232833]">
            {rewards.map(rw=>(
              <div key={rw.id} className="flex items-center justify-between py-3 text-sm">
                <span className="truncate pr-3 text-fog">{rw.title || rw.mission_id?.slice(0,8)}</span>
                <span className="flex items-center gap-3 font-mono">
                  <span className={rw.status==="RELEASED"?"text-cleared":"text-fog"}>{rw.amount} {rw.currency}</span>
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] ${rw.status==="RELEASED"?"border-cleared/40 text-cleared":"border-edge text-fog"}`}>{rw.status}</span>
                </span>
              </div>))}
          </div>
          <p className="mt-3 font-mono text-[10px] leading-relaxed text-[#566071]">
            Ledger entries are indexed application state. On-chain settlement runs when a GenLayer escrow contract is configured; no hashes are shown until a real settlement exists.
          </p>
        </section>

        <section className="card p-6">
          <p className="label">Recent activity</p>
          {(me.user && []).length===0 && <Recent userId={me.user.id} />}
        </section>
      </div>
      <Link href={`/profile/${me.user.username}`} className="btn-secondary mt-8">View public profile →</Link>
    </div>
  );
}

function Recent({ userId }: { userId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL||"http://localhost:3001"}/api/users/x`).catch(()=>{});
    // profile endpoint gives activity by username; use me endpoint data instead
  }, []);
  return <p className="text-sm text-fog">See your full activity on your <Link href="/dashboard" className="text-manila">profile page</Link>.</p>;
}
