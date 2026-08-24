"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { VerdictBadge, ExhibitTag } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

type Docket = { title: string; verdict: string; at: string; id: string; exhibit: string };

export default function Landing() {
  const [docket, setDocket] = useState<Docket | null>(null);
  const [openCount, setOpenCount] = useState<number | null>(null);

  useEffect(() => {
    const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    fetch(`${API}/api/missions?limit=25`).then(r => r.json()).then((rows: any[]) => {
      setOpenCount(rows.filter(m => m.status === "OPEN").length || null);
      for (const m of rows) {
        if (m.current_verdict && m.current_verdict !== "PENDING" && m.claim_id) {
          setDocket({ title: m.title, verdict: m.current_verdict, at: m.updated_at, id: m.id, exhibit: m.id });
          return;
        }
      }
    }).catch(() => {});
  }, []);

  return (
    <div className="fade-up">
      <section className="grid items-center gap-12 pb-20 pt-10 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <p className="mb-6 font-mono text-xs uppercase tracking-[0.28em] text-manila">
            Evidence bounties · settled on GenLayer
          </p>
          <h1 className="font-display text-5xl leading-[1.05] md:text-[64px]">
            The internet has errors.<br />
            <span className="italic text-fog">Document them.</span>{" "}
            <span className="text-cleared">Get paid.</span>
          </h1>
          <p className="mt-7 max-w-xl leading-relaxed text-fog">
            Take a bounty on a factual claim. Track down the source. Submit your evidence.
            An Intelligent Contract judges it in public — and a stamped verdict becomes
            part of a permanent, challengeable record.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link href="/missions" className="btn-primary">Browse open missions</Link>
            <Link href="/create" className="btn-secondary">Post a mission</Link>
            <Link href="/docs/agents" className="text-sm text-fog underline decoration-edge underline-offset-4 transition-colors hover:text-manila hover:decoration-manila">
              Build an agent →
            </Link>
          </div>
          {openCount != null && (
            <p className="mt-6 font-mono text-xs uppercase tracking-[0.15em] text-fog">
              {openCount} mission{openCount === 1 ? "" : "s"} paying right now
            </p>
          )}
        </div>

        {/* Signature moment: the live docket */}
        <div className="relative">
          <div className="absolute -left-3 -top-3 z-10"><ExhibitTag id={docket?.exhibit ?? "00000000"} /></div>
          <div className="card rotate-[0.6deg] p-6 shadow-[0_18px_50px_-20px_rgba(0,0,0,0.7)]">
            <div className="flex items-center justify-between border-b border-dashed border-edge pb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-fog">
              <span>Adjudication record</span><span>GenLayer</span>
            </div>
            <blockquote className="mt-4 border-l-2 border-manila pl-4 font-display text-lg italic leading-snug">
              “{docket?.title ?? "Does the official documentation currently mark this API as stable?"}”
            </blockquote>
            <div className="mt-5 flex items-center justify-between gap-4">
              <VerdictBadge v={docket?.verdict ?? "SUPPORTED"} animated />
              <Link href={docket ? `/missions/${docket.id}` : "/missions"}
                className="font-mono text-xs text-fog transition-colors hover:text-manila">
                inspect record →
              </Link>
            </div>
            <dl className="mt-5 space-y-2 border-t border-dashed border-edge pt-4 font-mono text-[11px] text-fog">
              <div className="flex justify-between"><dt>settled</dt><dd>{docket ? fmtDateTime(docket.at) : "—"}</dd></div>
              <div className="flex justify-between"><dt>evidence</dt><dd>URL + quoted passage</dd></div>
              <div className="flex justify-between"><dt>appealable</dt><dd>yes · bonded</dd></div>
            </dl>
          </div>
        </div>
      </section>

      <section className="grid gap-px overflow-hidden rounded-lg border border-edge bg-edge md:grid-cols-5">
        {[
          ["Take a case", "Every mission lists its claim, rules, and payout up front."],
          ["Verify", "Find the authoritative source. Quote it. Link it."],
          ["File it", "Your evidence enters the public record with your name on it."],
          ["Judged on-chain", "GenLayer validators weigh evidence against the rules."],
          ["Collect", "Supported verdicts release rewards and build standing."],
        ].map(([t, d]) => (
          <div key={t} className="bg-folder p-5">
            <h3 className="font-display text-lg">{t}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-fog">{d}</p>
          </div>
        ))}
      </section>

      <section className="card mt-14 grid gap-8 p-8 md:grid-cols-2 md:p-10">
        <div>
          <h2 className="font-display text-2xl">Why judge it on-chain?</h2>
          <p className="mt-4 text-sm leading-relaxed text-fog">
            Checking claims about the live web takes judgment, not arithmetic. GenLayer contracts read
            pages and reason over them inside the network, where independent validators re-run every
            judgment and agree before it settles. Disagree? A bonded appeal escalates to more validators.
          </p>
          <ul className="mt-5 space-y-2 text-sm text-fog">
            <li>· Webpage text is data, never instructions</li>
            <li>· Verified claims stay open to bonded challenges</li>
            <li>· History is appended, never rewritten</li>
          </ul>
        </div>
        <pre className="overflow-x-auto rounded-md bg-black/40 p-5 font-mono text-xs leading-relaxed text-fog">
{`POST /api/missions/{id}/submissions
{
  "reasoning": "how this proves the claim",
  "evidence": [{
    "url": "https://source.example/page",
    "relevant_text": "exact quoted lines",
    "source_type": "OFFICIAL"
  }]
}`}
        </pre>
      </section>
    </div>
  );
}
