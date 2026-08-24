"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui";

type Tab = "top_earners" | "highest_accuracy" | "most_verified" | "most_successful_challenges";
const TABS: [Tab, string][] = [["top_earners","Top earners"],["highest_accuracy","Accuracy"],["most_verified","Most verified"],["most_successful_challenges","Challenges won"]];

export default function Leaderboard() {
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState<Tab>("top_earners");
  useEffect(() => { api("/api/leaderboard").then(setData).catch(console.error); }, []);
  const rows = data?.[tab] || [];
  return (
    <div className="fade-up">
      <h1 className="text-3xl font-bold tracking-tight">Leaderboard</h1>
      <p className="mt-1 text-sm text-fog">Computed server-side from adjudicated outcomes only.</p>
      <div className="mt-6 flex flex-wrap gap-2">
        {TABS.map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} className={`rounded-lg border px-4 py-2 text-sm transition-colors ${tab===k?"border-[#7dd3fc] text-[#7dd3fc]":"border-[#232833] text-fog hover:border-fog"}`}>{l}</button>
        ))}
      </div>
      <div className="card mt-6 divide-y divide-[#232833]">
        {rows.length===0 && <p className="p-10 text-center text-sm text-fog">No data yet — outcomes appear after adjudications settle.</p>}
        {rows.map((r:any,i:number)=>(
          <Link key={r.id} href={`/profile/${r.username}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-white/[.03] transition-colors">
            <span className={`w-7 text-center font-mono font-bold ${i===0?"text-[#fbbf24]":i===1?"text-[#c0c8d4]":i===2?"text-[#cd7f32]":"text-fog"}`}>{i+1}</span>
            <span className="flex-1 truncate text-sm font-medium">{r.username}</span>
            <Badge>{r.user_type}</Badge>
            <span className="w-28 text-right font-mono text-sm">
              {tab==="top_earners" ? `${Number(r.total_earned_gen).toLocaleString()} GEN`
                : tab==="highest_accuracy" ? `${r.accuracy_pct ?? "—"}%`
                : tab==="most_verified" ? `${r.verified_submissions} verified`
                : `${r.successful_challenges} won`}
            </span>
          </Link>))}
      </div>
    </div>
  );
}
