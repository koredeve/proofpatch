"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const SOURCE_TYPES = ["PRIMARY","SECONDARY","OFFICIAL","PUBLIC_RECORD","NEWS","DOCUMENTATION","OTHER"];

export default function SubmitEvidence() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [mission, setMission] = useState<any>(null);
  const [reasoning, setReasoning] = useState("");
  const [items, setItems] = useState([newItem()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function newItem() { return { url:"", title:"", description:"", relevant_text:"", source_type:"OFFICIAL" }; }

  useEffect(() => { api(`/api/missions/${id}`).then(setMission).catch(e=>setError(e.message)); }, [id]);
  const setItem = (i:number, k:string, v:string) => setItems(items.map((it,j)=>j===i?{...it,[k]:v}:it));

  async function submit() {
    setBusy(true); setError("");
    try {
      const r = await api(`/api/missions/${id}/submissions`, {
        method: "POST", body: JSON.stringify({ reasoning, evidence: items }) });
      router.push(`/submissions/${(r as any).submission_id}`);
    } catch (e:any) { setError(e.message); } finally { setBusy(false); }
  }

  if (!mission) return <p className="mt-20 animate-pulse text-center font-mono text-sm text-fog">loading…</p>;

  return (
    <div className="fade-up mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight">Submit evidence</h1>
      <p className="mt-1 text-sm text-fog">{mission.title}</p>

      <div className="card mt-6 p-5">
        <p className="label">Rules your evidence must satisfy</p>
        <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-fog">{mission.verification_rules}</pre>
      </div>

      <div className="mt-6 space-y-6">
        <div className="card space-y-4 p-5">
          <p className="label !mb-0">Evidence item</p>
          <div><label className="label">Source URL *</label><input className="input" placeholder="https://…" value={items[0].url} onChange={e=>setItem(0,"url",e.target.value)} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label">Title *</label><input className="input" value={items[0].title} onChange={e=>setItem(0,"title",e.target.value)} /></div>
            <div><label className="label">Source type *</label>
              <select className="input" value={items[0].source_type} onChange={e=>setItem(0,"source_type",e.target.value)}>
                {SOURCE_TYPES.map(s=><option key={s}>{s}</option>)}
              </select></div>
          </div>
          <div><label className="label">Description * <span className="normal-case text-[#566071]">(why this source matters)</span></label>
            <textarea className="input min-h-20" value={items[0].description} onChange={e=>setItem(0,"description",e.target.value)} /></div>
          <div><label className="label">Relevant passage * <span className="normal-case text-[#566071]">(quote the exact lines)</span></label>
            <textarea className="input min-h-24 font-mono !text-xs" value={items[0].relevant_text} onChange={e=>setItem(0,"relevant_text",e.target.value)} /></div>
        </div>

        <div className="card p-5">
          <label className="label">Your reasoning * <span className="normal-case text-[#566071]">(how does this establish the claim?)</span></label>
          <textarea className="input min-h-28" value={reasoning} onChange={e=>setReasoning(e.target.value)} />
        </div>

        {error && <div className="rounded-lg border border-[#f8717140] bg-[#f871710d] px-4 py-3 text-sm text-[#f87171]">{error}</div>}

        <button onClick={submit} disabled={busy || !reasoning || items.some(i=>!i.url||!i.relevant_text)}
          className="btn-primary w-full justify-center disabled:opacity-40 disabled:cursor-not-allowed">
          {busy ? "Submitting → adjudicating…" : "SUBMIT FOR ADJUDICATION"}
        </button>
        <p className="text-center text-xs text-fog">
          On submit, a GenLayer adjudication starts. Webpage content is treated as untrusted data — it can never override the mission rules.
        </p>
      </div>
    </div>
  );
}
