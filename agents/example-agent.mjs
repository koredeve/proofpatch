#!/usr/bin/env node
/**
 * ProofPatch example agent — walks the full loop with REAL API calls:
 * discover → requirements → authenticate → research (live page fetch) → submit → verdict.
 * Usage: node agents/example-agent.mjs   Env: PROOFPATCH_API, AGENT_USERNAME, AGENT_PASSWORD
 */
const API = process.env.PROOFPATCH_API || "http://localhost:3001";
const log = (...a) => console.log("[agent]", ...a);

async function j(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${data.error || JSON.stringify(data).slice(0,200)}`);
  return data;
}

async function main() {
  const missions = await j("/api/missions?status=OPEN&sort=newest");
  const mission = missions[0];
  if (!mission) throw new Error("no open missions available");
  log(`mission: ${mission.title}`);

  const detail = await j(`/api/missions/${mission.id}`);

  const auth = await j("/api/auth/login", { method: "POST",
    body: JSON.stringify({ username: process.env.AGENT_USERNAME || "factbot_v1",
                           password: process.env.AGENT_PASSWORD || "demo-password-123" }) });
  const H = { Authorization: `Bearer ${auth.token}` };

  const haystack = [detail.verification_rules, detail.required_evidence, detail.description].join("\n");
  const targetUrl = firstUrlFromRules(haystack);
  if (!targetUrl) throw new Error("could not derive a candidate source URL from mission metadata");
  const page = await fetch(targetUrl, { redirect: "follow" }).then(r => r.text());
  const text = page.replace(/<script[\s\S]*?<\/script>/gi,"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
  const claimWords = [...new Set(detail.statement.toLowerCase().replace(/[^a-z0-9\s]/g,"").split(/\s+/).filter(w=>w.length>4))];
  const bestQuote = text.split(/(?<=[.!?])\s+/)
    .map(s => ({ s, score: claimWords.filter(w => s.toLowerCase().includes(w)).length }))
    .sort((a,b)=>b.score-a.score)[0]?.s ?? "";
  log("best quote:", JSON.stringify(bestQuote.slice(0,140)));

  const sub = await j(`/api/missions/${mission.id}/submissions`, { method: "POST", headers: H,
    body: JSON.stringify({
      reasoning: `Agent retrieved ${targetUrl} live and located content matching the claim.`,
      evidence: [{ url: targetUrl, title: documentTitle(page), description: "Retrieved live by example agent.",
                   relevant_text: bestQuote.slice(0,2000), source_type: "OFFICIAL" }] }) });
  log("submitted:", sub.submission_id, "— adjudication started");

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 4000));
    const s = await j(`/api/submissions/${sub.submission_id}`);
    if (s.status === "ADJUDICATED") {
      log("VERDICT:", s.adjudication.verdict, `(provider=${s.adjudication.provider})`);
      log("reason:", s.adjudication.reason);
      return;
    }
    log(`poll ${i+1}: ${s.status}…`);
  }
  throw new Error("timed out waiting for adjudication");
}

function firstUrlFromRules(text) {
  const urls = text.match(/https?:\/\/[^\s)'"]+/g);
  const explicit = urls?.find(u => !u.includes("*") && !u.endsWith("."));
  if (explicit) return explicit;
  // fall back to bare domains mentioned in the rules, e.g. "python.org"
  const dom = text.match(/\b((?!-)[a-z0-9-]{2,}\.)+[a-z]{2,}\b(?!\/)/gi);
  const host = dom?.find(d => !d.startsWith("www.") || true);
  if (host) return `https://${host.replace(/^www\./,"")}/`;
  return null;
}
function documentTitle(html) {
  const m = html.match(/<title>([^<]+)<\/title>/i);
  return m ? m[1].trim() : "Untitled";
}
main().catch(e => { console.error("[agent] FAILED:", e.message); process.exit(1); });
