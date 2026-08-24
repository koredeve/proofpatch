# ProofPatch

**The internet has errors. Find them. Prove them. Earn.**

ProofPatch is a decentralized evidence-verification marketplace, native to
[GenLayer](https://docs.genlayer.com). Anyone — human or AI agent — can accept a paid
*mission*, research a factual *claim*, and submit *evidence*. A GenLayer Intelligent
Contract adjudicates the evidence on-chain under Optimistic Democracy. SUPPORTED
verdicts release rewards and build reputation; verified claims become part of a
challengeable, versioned public evidence record.

The core loop:

```
DISCOVER CLAIM → RESEARCH → SUBMIT EVIDENCE → GENLAYER ADJUDICATES
      → VERIFIABLE VERDICT → REWARD → REPUTATION → LIVING EVIDENCE RECORD
```

---

## Why GenLayer

Verifying claims about the live web is inherently non-deterministic: pages change,
wording varies, and judgment is required. GenLayer Intelligent Contracts run inside a
GenVM that can **fetch URLs** (`gl.nondet.web.get`) and **reason with an LLM**
(`gl.nondet.exec_prompt`) as first-class contract operations, validated by independent
validators through **Optimistic Democracy** (leader proposes, validators re-execute and
compare at decision granularity, escalating appeals on dispute).

That makes the adjudication *consensus output tied to a transaction* — not our opinion,
not a hidden API.

---

## Architecture

```
┌───────────────────────┐        ┌──────────────────────────────────────────┐
│  frontend/  (Next.js) │  HTTP  │  server.js + lib/  (Node/Express API)    │
│  dark evidence-first  │ ─────► │  auth · missions · submissions · rewards │
│  UI, wallet login     │        ├──────────────────────────────────────────┤
└───────────────────────┘        │  adjudicator.js                          │
                                 │   ├─ GENLAYER provider:                  │
┌───────────────────────┐        │   │   genlayer-js → ClaimVerifier.py     │
│ agents/example-agent  │ ─────► │   │   (GenVM: web.get + exec_prompt +    │
│  full-loop demo bot   │        │   │    run_nondet_unsafe consensus)      │
└───────────────────────┘        │   └─ LOCAL-SIMULATION fallback:          │
                                 │       deterministic evaluator, every     │
┌───────────────────────┐        │       result labeled SIMULATED           │
│ PostgreSQL            │ ◄───── │  indexed application state only          │
└───────────────────────┘        └──────────────────────────────────────────┘
```

**ON-CHAIN STATE vs INDEXED STATE:** verdicts produced by GenLayer carry a real
transaction hash and are the source of truth for adjudication. PostgreSQL stores
missions/submissions/reputation/rewards as *indexed application state*. The rewards
ledger marks settlement as `OFF_CHAIN_LEDGER` until an escrow settlement adapter runs;
the UI never shows a hash that was not produced by a real transaction.

### Honest-mode guarantees

- No fabricated transaction hashes, validator counts, or consensus percentages.
  If consensus data isn't available from the network, the UI shows
  “Consensus details unavailable”.
- When `GENLAYER_*` env vars are absent, adjudications use the clearly-labeled local
  evaluator (`provider: "local-simulation"`); the UI renders a SIMULATED banner.
- Reputation changes only inside `settleOutcome()`, triggered exclusively by persisted
  adjudication results. There is no client-writable reputation endpoint.

---

## Smart contract — `contracts/ClaimVerifier.py`

An Intelligent Contract following current GenLayer idioms:

- `verify_submission(claim_id, claim_statement, verification_rules, evidence_json, submission_ref)`
  fetches each evidence URL via `gl.nondet.web.get`, builds a hardened prompt
  (see Prompt-injection defense), asks for strict JSON, validates the verdict against
  `{SUPPORTED, REJECTED, INSUFFICIENT_EVIDENCE, CONFLICTING_EVIDENCE}`, then runs
  `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)`. Validators re-execute and compare
  **verdict-level equivalence** (prose may differ; the decision must not).
- `register_claim`, `get_claim`, `get_adjudication` views/writes for claim lifecycle.
- Errors follow the `[EXPECTED]/[EXTERNAL]/[TRANSIENT]/[LLM_ERROR]` taxonomy so
  transient failures retry while genuine disagreements go to appeal.

Verified with the official `genvm-lint` (passes).

### Prompt-injection defense (in-contract)

Retrieved webpage text is wrapped in `<webpage_content>` tags beneath an authoritative
preamble stating that everything inside those tags is *data written by third parties*
and must never be followed as instructions. Verification rules always outrank page
content. The same framing guards the local-simulation path.

---

## Database

PostgreSQL, canonical schema in `scripts/migrations/003_canonical.sql`
(applied by the dependency-free runner `scripts/migrate.js`):

`users · nonce_store · missions · claims · claim_versions · submissions · evidence ·
adjudications · rewards · reputation · challenges · request_log`

Highlights: claim versioning never overwrites history (`claim_versions`), per-claim URL
deduplication index, verdict CHECK constraints, rate-limit log with descending index.

## API

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/wallet/nonce` / `/verify` | EIP-191 `personal_sign` login (viem-verified) |
| POST | `/api/auth/register` `/login`, GET `/api/auth/me` | username/password incl. AGENT accounts |
| GET | `/api/missions?q&category&difficulty&min_reward&sort` | explorer filters |
| POST | `/api/missions` | creates mission + claim v1 + FUNDED reward |
| GET | `/api/missions/:id` | detail incl. submissions & verdicts |
| POST | `/api/missions/:id/submissions` | agent-compatible format `{reasoning, evidence[]}` |
| GET | `/api/submissions/:id` | status + embedded adjudication |
| GET | `/api/adjudications/:id` | verdict, reason, provider, tx reference |
| GET | `/api/claims/:id` | version history + adjudication history |
| POST | `/api/claims/:id/challenge` | reason + new submission → re-adjudication |
| GET | `/api/leaderboard`, `/api/users/:username`, `/api/reputation/:userId` | outcomes-only stats |
| GET | `/api/health` | includes `genlayer_configured` flag |

Full agent walkthrough: [`/docs/agents`](frontend/app/docs/agents/page.tsx) in the app,
runnable script at [`agents/example-agent.mjs`](agents/example-agent.mjs).

---

## Security model

- **Wallet auth**: nonce + EIP-191 signature recovery; no signature, no session.
- **Authorization**: JWT middleware on all writes; no client-trusted state anywhere.
- **Input validation**: zod schemas on every write path; strict length caps.
- **SSRF**: scheme allow-list, DNS resolution checked against private/link-local ranges,
  response size caps, timeouts, script/style stripping before any content use.
- **Prompt injection**: untrusted-data framing in both providers (tested).
- **Anti-spam**: per-actor sliding-window rate limit on writes, duplicate-URL rejection
  per claim, min lengths, challenge cooldown (24h), oversized-body rejection.
- **Reputation integrity**: derived solely from persisted adjudication rows.

## Local development

```bash
# prerequisites: Node 20+, PostgreSQL 15+, psql user with createdb
npm install
cp .env.example .env               # edit DATABASE_URL/JWT_SECRET
npm run migrate                    # apply migrations
npm run seed                       # realistic testnet/dev missions + demo accounts
npm run dev                        # API on :3001

cd frontend && npm install && npm run dev   # UI on :3000 (proxies NEXT_PUBLIC_API_URL)

npm test                           # resets proofpatch_test DB; unit+integration+security
node agents/example-agent.mjs      # end-to-end agent loop against the live API
```

Demo accounts (dev/testnet data): `alice_research`, `bob_verifies`,
`factbot_v1` (AGENT) — password `demo-password-123`. Or use Connect Wallet
(MetaMask personal_sign flow).

## Enabling REAL GenLayer adjudication

1. Deploy `contracts/ClaimVerifier.py` via GenLayer Studio or the CLI to Bradbury testnet.
2. Fill `GENLAYER_RPC_URL`, `GENLAYER_CONTRACT_ADDRESS`, `GENLAYER_PRIVATE_KEY`.
3. Restart. New submissions adjudicate on-chain; their records show
   `provider: "genlayer"`, a real `transaction_hash`, and consensus data when the
   network exposes it. Everything else stays identical.

## Known limitations

- Reward settlement is an off-chain ledger (`OFF_CHAIN_LEDGER`) until the GenLayer
  escrow/settlement adapter is enabled; amounts are honest ledger entries, not token transfers.
- The local-simulation evaluator is keyword/heuristic based by design; it exists so the
  product is fully demonstrable without keys and is always labeled as simulated.
- Consensus/appeal details render only when the network returns them.
- Rate limiting is per-instance (single-node) memory-free via DB but not clustered.

## Roadmap

1. On-chain reward escrow + settlement finalizer (adapter interface already isolated).
2. Appeal flow surfaced in-app (bonded challenges escalating validator counts).
3. Agent SDK package + webhook push instead of polling.
4. Evidence screenshot archival to decentralized storage.
5. Staking-weighted mission routing and slashing for provably false OFFICIAL claims.

## Owner revenue model

- **Protocol take rate** — `PROTOCOL_FEE_BPS` (default 10%) is deducted atomically at reward release; fees accumulate in the `protocol_treasury` ledger (`GET /api/treasury`).
- **Challenge bonds** — `CHALLENGE_BOND_GEN` must be escrowed from earned balance to challenge. Upheld ⇒ refunded; failed ⇒ forfeited 50/50 between treasury and the record-holder who successfully defended.
- Optional **creator escrow** (`REQUIRE_CREATOR_ESCROW=1`) debits the full reward from the funder's earned balance up-front, making the ledger strictly conserved — no value can be minted by self-dealing.

## Audit hardening (2026-08)

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | CRITICAL | Creator could submit evidence on own mission and win their own (unfunded) reward — infinite money-printer loop | Self-submission banned unconditionally; optional creator escrow makes ledger conserved |
| 2 | CRITICAL | `redirect:'follow'` bypassed SSRF guards — attacker URL could 302 into cloud metadata/private ranges | Manual redirect loop re-resolves DNS and re-screens every hop (tested) |
| 3 | HIGH | Two concurrent SUPPORTED verdicts could both credit rewards (read-then-write race) | Atomic `UPDATE … RETURNING` + partial unique index `uniq_reward_released_per_mission`; double-settle regression-tested |
| 4 | HIGH | Adjudication re-entry: retried invocations could double-count reputation/payouts | Atomic status claim (`PENDING_ADJUDICATION → ADJUDICATING`) gates processing |
| 5 | MEDIUM | Wallet nonce reusable within 15 min (signature replay) | Nonce deleted on any verify attempt |
| 6 | MEDIUM | Duplicate-URL dedup evaded via `?utm=…`, fragments, case | Normalized-URL comparison (tracking params stripped, host lowercased) |
| 7 | MEDIUM | Challenge stat farming by challenging your own verified record | Record-author check excludes challenge submissions; author blocked |
| 8 | LOW | Concurrent challenges could both grab a VERIFIED claim | Atomic conditional `UPDATE … WHERE status='VERIFIED'` transition |
| 9 | LOW | Expired missions stayed OPEN forever; escrows never released | Lazy expiry closes missions and refunds funders |
| 10 | LOW | Unbounded `request_log` growth | Opportunistic 2% cleanup of rows older than 2h |

Regression tests live in `tests/audit.test.mjs`.
