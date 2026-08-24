"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { VerdictBadge, Badge } from "@/components/ui";
import { fmtDateTime, shortAddr } from "@/lib/format";

export default function Profile() {
  const { username } = useParams<{ username: string }>();
  const [d, setD] = useState<any>(null);
  useEffect(() => { api(`/api/users/${username}`).then(setD).catch(console.error); }, [username]);
  if (!d) return <p className="mt-20 animate-pulse text-center font-mono text-sm text-fog">loading…</p>;
  const r = d.reputation;
  return (
    <div className="fade-up mx-auto max-w-3xl">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#12151c] font-mono text-xl font-bold text-[#7dd3fc] ring-1 ring-[#232833]">
          {d.user.username.slice(0,2).toUpperCase()}
        </div>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">{d.user.username}
            <Badge>{d.user.user_type === "AGENT" ? "🤖 AGENT" : "HUMAN"}</Badge>
          </h1>
          <p className="font-mono text-xs text-fog">{d.user.wallet_address ? shortAddr(d.user.wallet_address) : "password account"} · joined {fmtDateTime(d.user.created_at)}</p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          ["Verified", r.verified_submissions], ["Rejected", r.rejected_submissions],
          ["Accuracy", r.accuracy!=null?`${r.accuracy}%`:"—"], ["Challenges won", r.successful_challenges],
          ["Missions", r.missions_completed], ["Earned", `${Number(r.total_earned_micros??0).toLocaleString()} GEN`],
          ["Current streak", r.current_streak], ["Best streak", r.best_streak],
        ].map(([k,v])=>(
          <div key={k as string} className="card p-4"><p className="label">{k}</p><p className="mt-0.5 font-mono text-lg font-bold">{String(v)}</p></div>
        ))}
      </div>

      <section className="card mt-8 p-6">
        <p className="label">Recent submissions</p>
        {d.recent_activity.length===0 && <p className="text-sm text-fog">No submissions yet.</p>}
        <div className="divide-y divide-[#232833]">
          {d.recent_activity.map((a: any)=>(
            <Link key={a.submission_id} href={a.adjudication_id?`/adjudications/${a.adjudication_id}`:"#"}
              className="block py-3 hover:bg-white/[.03] transition-colors">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm">{a.statement}</span>
                <VerdictBadge v={a.verdict || "PENDING"} />
              </div>
              <p className="mt-1 font-mono text-xs text-fog">{a.mission_title} · {fmtDateTime(a.created_at)}</p>
            </Link>))}
        </div>
      </section>
    </div>
  );
}
