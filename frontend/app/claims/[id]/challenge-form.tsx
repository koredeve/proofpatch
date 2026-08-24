"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

const SOURCE_TYPES = ["PRIMARY","SECONDARY","OFFICIAL","PUBLIC_RECORD","NEWS","DOCUMENTATION","OTHER"];

export default function ChallengeForm({ claimId, onDone }: { claimId: string; onDone?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(""); const [url, setUrl] = useState("");
  const [relevantText, setRelevantText] = useState(""); const [reasoning, setReasoning] = useState("");
  const [sourceType, setSourceType] = useState("PRIMARY");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");

  async function submitChallenge() {
    setBusy(true); setError("");
    try {
      await api(`/api/claims/${claimId}/challenge`, { method:"POST", body: JSON.stringify({
        reason,
        submission: { reasoning, evidence: [{ url, title:url, description:"Challenge evidence.", relevant_text: relevantText, source_type: sourceType }] },
      })});
      setOpen(false); onDone?.();
      router.refresh?.();
      window.location.reload();
    } catch (e:any) { setError(e.message); } finally { setBusy(false); }
  }

  if (!open) return (
    <button onClick={()=>setOpen(true)} className="btn-secondary mt-6 w-full justify-center !border-[#fbbf2440] !text-[#fbbf24] hover:!border-[#fbbf24]">
      ⚑ CHALLENGE THIS VERDICT
    </button>
  );

  return (
    <div className="card mt-6 space-y-4 p-6">
      <div><label className="label">Why is the current verdict wrong? *</label>
        <textarea className="input min-h-20" value={reason} onChange={e=>setReason(e.target.value)}
          placeholder="Be specific about what the verified record misses…" /></div>
      <div><label className="label">Contradicting source URL *</label><input className="input" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://…" /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label">Source type</label>
          <select className="input" value={sourceType} onChange={e=>setSourceType(e.target.value)}>{SOURCE_TYPES.map(s=><option key={s}>{s}</option>)}</select></div>
        <div><label className="label">Quoted passage *</label><textarea className="input min-h-16 font-mono !text-xs" value={relevantText} onChange={e=>setRelevantText(e.target.value)} /></div>
      </div>
      <div><label className="label">Your reasoning *</label><textarea className="input min-h-20" value={reasoning} onChange={e=>setReasoning(e.target.value)} /></div>
      {error && <p className="text-sm text-[#f87171]">{error}</p>}
      <div className="flex gap-3">
        <button onClick={submitChallenge} disabled={busy||!reason||!url||!relevantText||!reasoning} className="btn-primary flex-1 justify-center disabled:opacity-40">{busy?"Re-adjudicating…":"SUBMIT CHALLENGE"}</button>
        <button onClick={()=>setOpen(false)} className="btn-secondary">Cancel</button>
      </div>
      <p className="text-xs text-fog">Challenging triggers re-adjudication. If your evidence overturns the record it becomes the new verified version; otherwise the original stands and history is preserved.</p>
    </div>
  );
}
