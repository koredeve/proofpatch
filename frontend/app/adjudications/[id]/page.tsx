"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { VerdictBadge, Badge, Timeline, SimulatedNote } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

export default function AdjudicationPage() {
  const { id } = useParams<{ id: string }>();
  const [a, setA] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api(`/api/adjudications/${id}`).then(setA).catch(e=>setErr(e.message)); }, [id]);
  if (err) return <p className="mt-20 text-center text-stamp">{err}</p>;
  if (!a) return <p className="mt-20 animate-pulse text-center font-mono text-sm text-fog">loading adjudication…</p>;

  return (
    <div className="fade-up mx-auto max-w-3xl">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-manila">GenLayer adjudication</p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <h1 className="text-3xl font-bold"><VerdictBadge v={a.verdict} /></h1>
        <Badge>{a.provider === "genlayer" ? "GENLAYER CONSENSUS" : "LOCAL SIMULATION"}</Badge>
        <span className="font-mono text-xs text-fog">{fmtDateTime(a.timestamp)}</span>
      </div>

      <SimulatedNote provider={a.provider} />

      <section className="card mt-6 p-6">
        <p className="label">Claim</p>
        <blockquote className="border-l-2 border-manila pl-4 text-lg font-medium leading-relaxed">“{a.claim_statement}”</blockquote>
        <Link href={`/missions/${a.mission_id}`} className="mt-2 inline-block text-xs text-fog hover:text-manila">mission: {a.mission_title} →</Link>
      </section>

      {a.submission && (
        <section className="card mt-4 p-6">
          <p className="label">Evidence evaluated</p>
          {(a.submission.evidence||[]).filter(Boolean).map((e:any,i:number)=>(
            <div key={i} className="mb-4 rounded-lg border border-[#232833] p-4 last:mb-0">
              <div className="flex justify-between gap-2">
                <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="truncate text-sm font-medium text-manila hover:underline">{e.title}</a>
                <Badge>{e.source_type}</Badge>
              </div>
              <p className="mt-2 font-mono text-xs leading-relaxed text-paper/80">{e.relevant_text}</p>
            </div>
          ))}
          <p className="label mt-4">Researcher reasoning</p>
          <p className="text-sm leading-relaxed text-fog">{a.submission.reasoning}</p>
          <p className="mt-2 text-xs text-fog">by <Link href={`/profile/${a.submission.submitter}`} className="text-manila hover:underline">{a.submission.submitter}</Link></p>
        </section>
      )}

      <section className="card mt-4 p-6">
        <p className="label">Verification rules applied</p>
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-fog">{a.verification_rules}</pre>
      </section>

      <section className="card mt-4 p-6">
        <p className="label">Adjudicator reasoning</p>
        <p className="text-sm leading-relaxed">{a.reason}</p>
        <p className="label mt-4">Evidence assessment</p>
        <p className="font-mono text-xs break-all text-fog">{a.evidence_assessment}</p>
      </section>

      <section className="card mt-4 p-6">
        <p className="label">On-chain reference</p>
        <Timeline steps={[
          { label: "ADJUDICATION STARTED", at: a.timestamp, done: true },
          { label: `VERDICT · ${a.verdict}`, at: a.timestamp, done: true },
          a.provider === "genlayer"
            ? { label: a.transaction_hash ? `TX ${String(a.transaction_hash).slice(0,18)}…` : "TRANSACTION PENDING", at: null, done: Boolean(a.transaction_hash) }
            : { label: "SETTLEMENT — not broadcast (simulated)", at: null, done: false },
        ]} />
        <dl className="mt-4 space-y-2 border-t border-[#232833] pt-4 font-mono text-xs">
          <div className="flex justify-between gap-4"><dt className="text-fog">adjudication id</dt><dd className="truncate">{a.id}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-fog">transaction</dt><dd>{a.transaction_hash || "—"}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-fog">consensus</dt><dd className="text-right">{a.provider==="genlayer" ? (a.consensus ? JSON.stringify(a.consensus) : "Consensus details unavailable") : "n/a — simulated"}</dd></div>
        </dl>
      </section>
    </div>
  );
}
