"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";

const STEPS = ["Claim", "Rules", "Evidence", "Reward", "Deadline", "Review"];

export default function CreateMission() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [f, setF] = useState({
    title: "", description: "", claim: "",
    verification_rules: "", required_evidence: "",
    required_source_types: ["OFFICIAL","PRIMARY"] as string[],
    reward_amount: 100, currency: "GEN",
    deadline: "", difficulty: "MEDIUM", category: "Technology",
  });
  const set = (k:string, v:any) => setF(p=>({...p,[k]:v}));

  async function checkQuality(claim: string) {
    if (claim.trim().length < 15) return setWarnings([]);
    // client-side mirror of server heuristics for instant feedback
    const w: string[] = [];
    const lower = claim.toLowerCase();
    ["good","bad","best","worst","opinion"].forEach(t => { if (lower.includes(t)) w.push(`Subjective term "${t}" — must be objectively testable.`); });
    if (!/\b(current|currently|as of|today|now|latest)\b/i.test(claim)) w.push('No time boundary — add "currently" or "as of <date>".');
    setWarnings(w);
  }

  async function create() {
    setBusy(true); setError("");
    try {
      const r = await api("/api/missions", { method:"POST", body: JSON.stringify({
        ...f, deadline: new Date(f.deadline).toISOString(),
      })});
      router.push(`/missions/${(r as any).mission_id}`);
    } catch (e:any) {
      setError(e.message + ((e as any).details ? ` — ${(e as any).details.join("; ")}` : ""));
    } finally { setBusy(false); }
  }

  const canNext = [
    f.title.length >= 10 && f.claim.trim().length >= 15 && f.description.length >= 20,
    f.verification_rules.length >= 20,
    f.required_evidence.length >= 20 && f.required_source_types.length > 0,
    f.reward_amount > 0,
    Boolean(f.deadline) && new Date(f.deadline).getTime() > Date.now() + 3600_000,
    true,
  ][step];

  return (
    <div className="fade-up mx-auto max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tight">Create a mission</h1>
      <p className="mt-1 text-sm text-fog">Vague missions are rejected. Precise claims earn precise verdicts.</p>

      <ol className="mt-8 flex gap-2">
        {STEPS.map((s,i)=>(
          <li key={s} className={`flex-1 rounded-lg border px-2 py-2 text-center font-mono text-[10px] uppercase tracking-wide transition-colors ${i===step?"border-manila text-manila":i<step?"border-cleared/40 text-cleared/70":"border-[#232833] text-fog"}`}>
            {i+1}. {s}
          </li>
        ))}
      </ol>

      <div className="card mt-6 space-y-5 p-6">
        {step===0 && <>
          <div><label className="label">Mission title *</label><input className="input" value={f.title} onChange={e=>set("title",e.target.value)} placeholder="Does X's official docs currently list feature Y?" /></div>
          <div><label className="label">The claim to verify *</label>
            <textarea className="input min-h-24" value={f.claim} onChange={e=>{set("claim",e.target.value); checkQuality(e.target.value);}}
              placeholder={'Good: "Does Tesla currently list Model Y as an available vehicle?"'} /></div>
          {warnings.length>0 && (
            <div className="rounded-lg border border-manila/25 bg-manila/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-manila">Claim quality warnings</p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-manila/90">{warnings.map((w,i)=><li key={i}>{w}</li>)}</ul>
            </div>)}
          <div><label className="label">Description *</label><textarea className="input min-h-24" value={f.description} onChange={e=>set("description",e.target.value)} placeholder="Context a researcher needs." /></div>
        </>}
        {step===1 && <div><label className="label">Verification rules *</label>
          <textarea className="input min-h-40 font-mono !text-xs" value={f.verification_rules} onChange={e=>set("verification_rules",e.target.value)}
            placeholder={"1) Evidence must come from the official domain.\n2) Content must reflect the current release, not archives.\n3) A direct quote containing X is required."} /></div>}
        {step===2 && <>
          <div><label className="label">What evidence is acceptable? *</label><textarea className="input min-h-28" value={f.required_evidence} onChange={e=>set("required_evidence",e.target.value)} /></div>
          <div><p className="label">Required source types</p><div className="flex flex-wrap gap-2">
            {["PRIMARY","SECONDARY","OFFICIAL","PUBLIC_RECORD","NEWS","DOCUMENTATION","OTHER"].map(t=>(
              <button key={t} type="button" onClick={()=>set("required_source_types", f.required_source_types.includes(t)?f.required_source_types.filter(x=>x!==t):[...f.required_source_types,t])}
                className={`rounded-md border px-2.5 py-1 font-mono text-xs transition-colors ${f.required_source_types.includes(t)?"border-manila text-manila":"border-[#232833] text-fog hover:border-fog"}`}>{t}</button>))}
          </div></div>
        </>}
        {step===3 && <div className="grid grid-cols-2 gap-4">
          <div><label className="label">Reward (GEN) *</label><input type="number" min={1} className="input" value={f.reward_amount} onChange={e=>set("reward_amount",+e.target.value)} /></div>
          <div><label className="label">Difficulty</label><select className="input" value={f.difficulty} onChange={e=>set("difficulty",e.target.value)}><option>EASY</option><option>MEDIUM</option><option>HARD</option></select></div>
          <div className="col-span-2"><label className="label">Category</label><select className="input" value={f.category} onChange={e=>set("category",e.target.value)}>
            {["Technology","Companies","Products","Documentation","Research","Public Information","Other"].map(c=><option key={c}>{c}</option>)}</select></div>
        </div>}
        {step===4 && <div><label className="label">Deadline *</label><input type="datetime-local" className="input" value={f.deadline} onChange={e=>set("deadline",e.target.value)} />
          <p className="mt-2 text-xs text-fog">Must be at least one hour in the future.</p></div>}
        {step===5 && <dl className="space-y-3 text-sm">
          {[["Title",f.title],["Claim",f.claim],["Rules",f.verification_rules],["Evidence spec",f.required_evidence],["Source types",f.required_source_types.join(", ")],["Reward",`${f.reward_amount} ${f.currency}`],["Difficulty",f.difficulty],["Deadline",f.deadline]].map(([k,v])=>(
            <div key={k as string}><dt className="label !mb-1">{k}</dt><dd className="whitespace-pre-wrap rounded-lg border border-[#232833] bg-black/30 p-3 font-mono text-xs">{String(v)||"—"}</dd></div>))}
        </dl>}
      </div>

      {error && <p className="mt-4 rounded-lg border border-stamp40] bg-stamp/5 px-4 py-3 text-sm text-stamp">{error}</p>}

      <div className="mt-6 flex justify-between">
        <button onClick={()=>setStep(s=>Math.max(0,s-1))} disabled={step===0} className="btn-secondary disabled:opacity-30">Back</button>
        {step < 5
          ? <button onClick={()=>setStep(s=>s+1)} disabled={!canNext} className="btn-primary disabled:opacity-30 disabled:cursor-not-allowed">Continue →</button>
          : <button onClick={create} disabled={busy} className="btn-primary disabled:opacity-40">{busy ? "Creating…" : "CREATE & FUND MISSION"}</button>}
      </div>
    </div>
  );
}
