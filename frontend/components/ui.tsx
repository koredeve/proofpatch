"use client";
import Link from "next/link";

const verdictStyle: Record<string, string> = {
  SUPPORTED: "bg-[#6ee7a01a] text-[#6ee7a0] border-[#6ee7a033]",
  REJECTED: "bg-[#f871711a] text-[#f87171] border-[#f8717133]",
  INSUFFICIENT_EVIDENCE: "bg-[#fbbf241a] text-[#fbbf24] border-[#fbbf2433]",
  CONFLICTING_EVIDENCE: "bg-[#fb923c1a] text-[#fb923c] border-[#fb923c33]",
  PENDING: "bg-white/5 text-fog border-edge",
};

export function VerdictBadge({ v }: { v?: string | null }) {
  if (!v || v === "PENDING") return <Badge>PENDING</Badge>;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-mono font-semibold tracking-wide ${verdictStyle[v] || ""}`}>
      {v.replace(/_/g, " ")}
    </span>
  );
}

export function StatusBadge({ s }: { s: string }) {
  const map: Record<string,string> = { OPEN:"text-[#7dd3fc] border-[#7dd3fc33] bg-[#7dd3fc14]", VERIFIED:"text-[#6ee7a0] border-[#6ee7a033] bg-[#6ee7a01a]", CHALLENGED:"text-[#fbbf24] border-[#fbbf2433] bg-[#fbbf2414]", RESOLVED:"text-fog border-edge bg-white/5" };
  return <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${map[s]||"text-fog border-edge"}`}>{s}</span>;
}

export function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-md border border-[#232833] bg-white/5 px-2 py-0.5 text-xs font-mono text-[#9aa3b2]">{children}</span>;
}

export function SimulatedNote({ provider, txHash }: { provider: string; txHash?: string | null }) {
  if (provider === "genlayer") return null;
  return (
    <div className="rounded-lg border border-[#fbbf2433] bg-[#fbbf240d] px-4 py-3 text-sm text-[#fbbf24]">
      SIMULATED RESULT — produced by the local development evaluator. Not GenLayer consensus; no transaction was broadcast.
    </div>
  );
}

export function Timeline({ steps }: { steps: { label: string; at?: string | Date | null; done: boolean }[] }) {
  return (
    <ol className="relative ml-3 space-y-6 border-l border-[#232833] pl-6">
      {steps.map((s, i) => (
        <li key={i} className="relative">
          <span className={`absolute -left-[31px] top-0.5 h-4 w-4 rounded-full border-2 ${s.done ? "border-[#7dd3fc] bg-[#7dd3fc]" : "border-[#232833] bg-[#12151c]"}`} />
          <div className="flex flex-wrap items-baseline gap-x-3">
            <p className={`text-sm font-semibold ${s.done ? "text-paper" : "text-fog"}`}>{s.label}</p>
            {s.at && <time className="font-mono text-xs text-fog">{new Date(s.at).toLocaleString()}</time>}
          </div>
        </li>
      ))}
    </ol>
  );
}
