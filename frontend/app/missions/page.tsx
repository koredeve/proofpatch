"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { StatusBadge, Badge } from "@/components/ui";
import { timeLeft } from "@/lib/format";

const CATEGORIES = ["all","Technology","Companies","Products","Documentation","Research","Public Information","Other"];
const DIFFICULTIES = ["all","EASY","MEDIUM","HARD"];

export default function Missions() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState(""); const [category, setCategory] = useState("all");
  const [difficulty, setDifficulty] = useState("all"); const [sort, setSort] = useState("newest");
  const [minReward, setMinReward] = useState(""); const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true); setError("");
    const p = new URLSearchParams({ sort, ...(q && { q }), ...(category!=="all" && { category }), ...(difficulty!=="all" && { difficulty }), ...(minReward && { min_reward: minReward }) });
    api(`/api/missions?${p}`).then(setRows).catch(e => setError(e.message)).finally(()=>setLoading(false));
  }, [q, category, difficulty, sort, minReward]);

  return (
    <div className="fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">Open cases</h1>
          <p className="mt-1 text-sm text-fog">Every case states its claim, its rules, and its payout. Prove it and the reward is yours.</p>
        </div>
      </div>

      <div className="card mt-6 grid gap-3 p-4 md:grid-cols-5">
        <input className="input md:col-span-2" placeholder="Search claims…" value={q} onChange={e=>setQ(e.target.value)} />
        <select className="input" value={category} onChange={e=>setCategory(e.target.value)}>{CATEGORIES.map(c=><option key={c} value={c}>{c==="all"?"All categories":c}</option>)}</select>
        <select className="input" value={difficulty} onChange={e=>setDifficulty(e.target.value)}>{DIFFICULTIES.map(d=><option key={d} value={d}>{d==="all"?"Any difficulty":d}</option>)}</select>
        <div className="flex gap-2">
          <select className="input" value={sort} onChange={e=>setSort(e.target.value)}>
            <option value="newest">Newest</option><option value="reward_high">Top reward</option><option value="deadline">Ending soon</option>
          </select>
          <input className="input !w-24" type="number" placeholder="≥ GEN" value={minReward} onChange={e=>setMinReward(e.target.value)} />
        </div>
      </div>

      {loading && <p className="mt-10 animate-pulse text-center font-mono text-sm text-fog">loading missions…</p>}
      {error && <p className="mt-10 text-center text-sm text-[#f87171]">{error}</p>}
      {!loading && !error && rows.length === 0 && (
        <div className="card mt-10 p-12 text-center">
          <p className="text-lg font-semibold">No open missions match.</p>
          <p className="mt-1 text-sm text-fog">Clear filters or create the first mission for this niche.</p>
        </div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map(m => (
          <Link key={m.id} href={`/missions/${m.id}`} className="card group flex flex-col p-5 transition-all hover:-translate-y-px hover:border-manila/50">
            <div className="flex items-start justify-between gap-2">
              <StatusBadge s={m.status} /><Badge>{m.category}</Badge>
            </div>
            <h3 className="mt-3 font-display line-clamp-2 text-xl leading-snug transition-colors group-hover:text-manila">{m.title}</h3>
            <p className="mt-2 line-clamp-3 flex-1 text-sm text-fog">{m.claim}</p>
            <div className="mt-4 flex items-center justify-between border-t border-[#232833] pt-3 font-mono text-xs">
              <span className="text-cleared">{m.reward_amount} {m.currency}</span>
              <span className="text-fog">{timeLeft(m.deadline)}</span>
              <span className="text-fog">{m.submission_count} sub</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
