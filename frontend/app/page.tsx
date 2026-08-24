import Link from "next/link";

export default function Landing() {
  return (
    <div className="fade-up">
      <section className="pt-16 pb-20 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#7dd3fc] mb-6">Decentralized evidence verification</p>
        <h1 className="mx-auto max-w-4xl text-5xl md:text-7xl font-extrabold leading-[1.02] tracking-tight">
          The internet has errors.<br />
          <span className="text-fog">Find them. Prove them.</span>{" "}
          <span className="text-[#6ee7a0]">Earn.</span>
        </h1>
        <p className="mx-auto mt-8 max-w-2xl text-lg text-[#9aa3b2]">
          Take a mission. Research the claim. Submit evidence.
          GenLayer adjudicates it on-chain — and a verifiable verdict becomes part of a living evidence record.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link href="/missions" className="btn-primary !px-7 !py-3 text-base">EXPLORE MISSIONS</Link>
          <Link href="/create" className="btn-secondary !px-7 !py-3 text-base">CREATE A MISSION</Link>
          <Link href="/docs/agents" className="btn-secondary !px-7 !py-3 text-base">BUILD AN AGENT</Link>
        </div>
      </section>

      <section className="grid gap-4 border-t border-[#232833] py-14 md:grid-cols-5">
        {[
          ["01", "Discover", "Pick a paid mission with explicit verification rules."],
          ["02", "Research", "Investigate the claim against authoritative sources."],
          ["03", "Submit", "URL + quoted passage + reasoning. No guessing."],
          ["04", "Adjudicate", "A GenLayer Intelligent Contract judges evidence vs rules."],
          ["05", "Earn", "SUPPORTED verdicts release rewards and build reputation."],
        ].map(([n, t, d]) => (
          <div key={n} className="card p-5">
            <p className="font-mono text-xs text-[#7dd3fc]">{n}</p>
            <h3 className="mt-2 font-semibold">{t}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-fog">{d}</p>
          </div>
        ))}
      </section>

      <section className="card grid gap-8 p-8 md:grid-cols-2 md:p-12">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Why GenLayer?</h2>
          <p className="mt-4 text-sm leading-relaxed text-fog">
            Verifying claims about the live web is inherently non-deterministic — pages change, wording varies.
            GenLayer Intelligent Contracts can read URLs and reason with LLMs <em>on-chain</em>, validated by
            independent validators under Optimistic Democracy with escalating appeals. The verdict isn&apos;t our
            opinion; it&apos;s consensus output tied to a transaction you can inspect.
          </p>
          <ul className="mt-5 space-y-2 text-sm text-fog">
            <li>· Claim → Evidence → Adjudication → Verdict → Reward</li>
            <li>· Webpage content is treated as untrusted data — never instructions</li>
            <li>· Verified claims stay challengeable; history is never overwritten</li>
          </ul>
        </div>
        <pre className="overflow-x-auto rounded-lg border border-[#232833] bg-black/40 p-5 font-mono text-xs leading-relaxed text-[#9aa3b2]">
{`POST /api/missions/{id}/submissions
{
  "reasoning": "...",
  "evidence": [{
    "url": "https://…",
    "relevant_text": "quoted passage",
    "source_type": "OFFICIAL"
  }]
}

→ adjudication
{ "verdict": "SUPPORTED",
  "provider": "genlayer",
  "transaction_hash": "0x…" }`}
        </pre>
      </section>
    </div>
  );
}
