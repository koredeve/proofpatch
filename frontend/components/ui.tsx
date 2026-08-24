"use client";
import Link from "next/link";

/** Signature element: the verdict stamp. */
export function VerdictBadge({ v, animated = false }: { v?: string | null; animated?: boolean }) {
  if (!v || v === "PENDING") return <span className="rounded border border-edge bg-white/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fog">pending</span>;
  const cls = { SUPPORTED: "stamp-supported", REJECTED: "stamp-rejected",
    INSUFFICIENT_EVIDENCE: "stamp-insufficient", CONFLICTING_EVIDENCE: "stamp-conflicting" }[v as string] || "stamp-insufficient";
  return (
    <span className={`stamp ${cls} ${animated ? "stamp-animated" : ""}`}>
      {v.replace(/_/g, " ")}
    </span>
  );
}

export function StatusBadge({ s }: { s: string }) {
  const map: Record<string,string> = {
    OPEN: "text-manila border-manila/40",
    VERIFIED: "text-cleared border-cleared/40",
    CHALLENGED: "text-stamp border-stamp/40",
    RESOLVED: "text-fog border-edge",
    SUBMISSIONS_CLOSED: "text-fog border-edge",
  };
  return <span className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${map[s]||"text-fog border-edge"}`}>{s.replace(/_/g," ")}</span>;
}

export function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded border border-edge px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-fog">{children}</span>;
}

export function ExhibitTag({ id }: { id: string }) {
  return <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-fog">Exhibit {id.slice(0, 8)}</span>;
}

export function SimulatedNote({ provider }: { provider: string }) {
  if (provider === "genlayer") return null;
  return (
    <div className="rounded-md border border-manila/30 bg-manila/5 px-4 py-3 text-sm text-manila">
      Simulated result — produced by the local development evaluator. Not GenLayer consensus; no transaction was broadcast.
    </div>
  );
}

export function Timeline({ steps }: { steps: { label: string; at?: string | Date | null; done: boolean }[] }) {
  return (
    <ol className="relative ml-3 space-y-6 border-l border-edge pl-6">
      {steps.map((s, i) => (
        <li key={i} className="relative">
          <span className={`absolute -left-[31px] top-0.5 h-4 w-4 rounded-full border-2 ${s.done ? "border-manila bg-manila" : "border-edge bg-folder"}`} />
          <div className="flex flex-wrap items-baseline gap-x-3">
            <p className={`font-mono text-xs font-semibold tracking-wide ${s.done ? "text-paper" : "text-fog"}`}>{s.label}</p>
            {s.at && <time className="text-xs text-fog">{new Date(s.at).toLocaleString()}</time>}
          </div>
        </li>
      ))}
    </ol>
  );
}
