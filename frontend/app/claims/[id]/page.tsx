"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { StatusBadge, VerdictBadge, Badge, Timeline } from "@/components/ui";
import ChallengeForm from "./challenge-form";

export default function ClaimPage() {
  const { id } = useParams<{ id: string }>();
  const [c, setC] = useState<any>(null);
  useEffect(() => { api(`/api/claims/${id}`).then(setC).catch(console.error); }, [id]);
  if (!c) return <p className="mt-20 animate-pulse text-center font-mono text-sm text-fog">loading claim…</p>;

  return (
    <div className="fade-up mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Claim record</h1>
        <StatusBadge s={c.status} /><VerdictBadge v={c.current_verdict} /><Badge>v{c.version}</Badge>
      </div>
      <blockquote className="mt-4 border-l-2 border-manila pl-4 text-lg leading-relaxed">“{c.statement}”</blockquote>

      <section className="card mt-6 p-6">
        <p className="label">Version history — never overwritten</p>
        <Timeline steps={(c.versions||[]).map((v:any)=>({ label:`v${v.version} · ${v.status}${v.verdict?` · ${v.verdict}`:""}`, at:v.created_at, done:true }))} />
      </section>

      <section className="card mt-4 p-6">
        <p className="label">Adjudication history</p>
        {(c.adjudication_history||[]).length===0 && <p className="text-sm text-fog">No adjudications yet.</p>}
        {(c.adjudication_history||[]).map((a:any)=>(
          <Link key={a.id} href={`/adjudications/${a.id}`} className="flex items-center justify-between rounded-lg px-3 py-2.5 hover:bg-white/5 transition-colors">
            <span className="font-mono text-xs text-fog">{new Date(a.timestamp).toLocaleString()} · {a.provider}</span>
            <VerdictBadge v={a.verdict} />
          </Link>
        ))}
      </section>

      {c.status === "VERIFIED" && <ChallengeForm claimId={c.id} onDone={()=>api(`/api/claims/${id}`).then(setC)} />}
    </div>
  );
}
