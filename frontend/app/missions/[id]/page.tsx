"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { StatusBadge, VerdictBadge, Badge, Timeline } from "@/components/ui";
import { fmtDate, fmtDateTime, timeLeft } from "@/lib/format";

export default function MissionDetail() {
  const { id } = useParams<{ id: string }>();
  const [m, setM] = useState<any>(null);
  const [err, setErr] = useState("");
  const [claim, setClaim] = useState<any>(null);

  useEffect(() => {
    api(`/api/missions/${id}`).then(async (d) => {
      setM(d);
      if (d.claim_id) {
        try { setClaim(await api(`/api/claims/${d.claim_id}`)); } catch {}
      }
    }).catch(e => setErr(e.message));
  }, [id]);

  if (err) return <p className="mt-20 text-center text-[#f87171]">{err}</p>;
  if (!m) return <p className="mt-20 animate-pulse text-center font-mono text-sm text-fog">loading mission…</p>;

  const steps = [
    { label: "MISSION CREATED", at: m.created_at, done: true },
    { label: `REWARD FUNDED — ${m.reward_amount} ${m.currency}`, at: m.created_at, done: true },
    ...((claim?.adjudication_history||[]).map((a: any) => ({ label: `ADJUDICATION · ${a.verdict}`, at: a.timestamp, done: true }))),
    ...(m.current_verdict === "SUPPORTED" ? [{ label: "REWARD RELEASED", at: null as any, done: true }] : []),
    ...(m.status !== "RESOLVED" ? [{ label: "AWAITING EVIDENCE / ADJUDICATION", at: null as any, done: false }] : []),
  ];

  return (
    <div className="fade-up">
      <Link href="/missions" className="font-mono text-xs text-fog hover:text-[#7dd3fc]">← all missions</Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <h1 className="max-w-3xl text-2xl font-bold leading-snug md:text-3xl">{m.title}</h1>
        <div className="text-right">
          <p className="font-mono text-2xl font-bold text-[#6ee7a0]">{m.reward}</p>
          <p className="font-mono text-xs text-fog">{timeLeft(m.deadline)} · deadline {fmtDate(m.deadline)}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <StatusBadge s={m.status} /><Badge>{m.difficulty}</Badge><Badge>{m.category}</Badge>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        <section className="space-y-6 lg:col-span-3">
          <div className="card p-6">
            <p className="label">Claim under verification</p>
            <blockquote className="border-l-2 border-[#7dd3fc] pl-4 text-lg font-medium leading-relaxed">“{m.statement || m.claim}”</blockquote>
            {m.current_verdict && m.current_verdict !== "PENDING" && (
              <div className="mt-4"><VerdictBadge v={m.current_verdict} /></div>
            )}
          </div>
          <div className="card p-6">
            <p className="label">Verification rules</p>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-fog">{m.verification_rules}</pre>
          </div>
          <div className="card p-6">
            <p className="label">Acceptable evidence</p>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-fog">{m.required_evidence}</pre>
            <p className="label mt-4">Required source types</p>
            <div className="flex flex-wrap gap-1.5">{(m.required_source_types||[]).map((t: any)=><Badge key={t}>{t}</Badge>)}</div>
          </div>
          <div className="card p-6">
            <div className="flex items-center justify-between">
              <p className="label !mb-0">Submissions ({(m.submissions as any[]|[]).length})</p>
              {m.status === "OPEN" && <Link href={`/missions/${m.id}/submit`} className="btn-primary !px-4 !py-2 text-sm">SUBMIT EVIDENCE</Link>}
            </div>
            <div className="mt-4 space-y-3">
              {((m.submissions||[]) as any[]).length === 0 && <p className="rounded-lg border border-dashed border-[#232833] p-6 text-center text-sm text-fog">No submissions yet. Be the first researcher on this claim.</p>}
              {(m.submissions as any[]||[]).map((s: any) => (
                <Link key={s.id} href={s.adjudication_id ? `/adjudications/${s.adjudication_id}` : `/submissions/${s.id}`}
                  className="flex items-center justify-between rounded-lg border border-[#232833] px-4 py-3 text-sm hover:border-[#7dd3fc66] transition-colors">
                  <span>
                    <span className="font-medium">{s.submitter_name}</span>
                    {s.user_type === "AGENT" && <span className="ml-2 rounded bg-[#a78bfa1f] px-1.5 py-0.5 font-mono text-[10px] text-[#a78bfa]">AGENT</span>}
                    <span className="ml-2 font-mono text-xs text-fog">{fmtDateTime(s.created_at)}</span>
                  </span>
                  <VerdictBadge v={s.verdict || "PENDING"} />
                </Link>
              ))}
            </div>
          </div>
        </section>

        <aside className="lg:col-span-2">
          <div className="card sticky top-24 p-6">
            <p className="label">Lifecycle</p>
            <Timeline steps={steps} />
            <dl className="mt-6 space-y-3 border-t border-[#232833] pt-4 text-sm">
              <div className="flex justify-between"><dt className="text-fog">Creator</dt><dd><Link href={`/profile/${m.creator_name}`} className="hover:text-[#7dd3fc]">{m.creator_name}</Link></dd></div>
              <div className="flex justify-between"><dt className="text-fog">Created</dt><dd className="font-mono">{fmtDateTime(m.created_at)}</dd></div>
              {m.claim_id && <div className="flex justify-between"><dt className="text-fog">Claim record</dt><dd><Link href={`/claims/${m.claim_id}`} className="text-[#7dd3fc] hover:underline">view history →</Link></dd></div>}
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}
