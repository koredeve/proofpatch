"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { VerdictBadge, Badge } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

export default function SubmissionPage() {
  const { id } = useParams<{ id: string }>();
  const [s, setS] = useState<any>(null);
  useEffect(() => { api(`/api/submissions/${id}`).then(setS).catch(console.error); }, [id]);
  if (!s) return <p className="mt-20 animate-pulse text-center font-mono text-sm text-fog">loading…</p>;
  return (
    <div className="fade-up mx-auto max-w-3xl">
      <p className="font-mono text-xs text-fog">submission {s.id.slice(0,8)}</p>
      <h1 className="mt-2 flex items-center gap-3 text-2xl font-bold">
        Status: {s.status === "ADJUDICATED" ? <VerdictBadge v={(s.adjudication||{}).verdict} /> : <Badge>{s.status}</Badge>}
      </h1>
      {s.status !== "ADJUDICATED" && (
        <div className="card mt-6 animate-pulse p-8 text-center">
          <p className="font-mono text-sm text-[#fbbf24]">ADJUDICATING…</p>
          <p className="mt-2 text-sm text-fog">GenLayer validators are evaluating this evidence against the verification rules.</p>
        </div>
      )}
      <div className="card mt-6 p-6"><p className="label">Reasoning</p><p className="text-sm leading-relaxed text-fog">{s.reasoning}</p></div>
      {(s.evidence||[]).filter((e:any)=>e&&e.url).map((e:any,i:number)=>(
        <div key={i} className="card mt-4 p-6">
          <div className="flex items-center justify-between gap-3">
            <a href={e.url} target="_blank" rel="noopener noreferrer nofollow" className="truncate font-medium text-[#7dd3fc] hover:underline">{e.title}</a>
            <Badge>{e.source_type}</Badge>
          </div>
          <p className="mt-1 truncate font-mono text-xs text-fog">{e.url}</p>
          <p className="mt-3 text-sm text-fog">{e.description}</p>
          <blockquote className="mt-3 border-l-2 border-[#232833] pl-4 font-mono text-xs leading-relaxed text-paper/90">{e.relevant_text}</blockquote>
        </div>
      ))}
      {s.adjudication && (
        <Link href={`/adjudications/${s.adjudication.id}`} className="btn-secondary mt-6 w-full justify-center">View full adjudication record →</Link>
      )}
    </div>
  );
}
