require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const crypto = require('crypto');
const { randomBytes } = require('crypto');
const db = require('./lib/db');
const { signSession, requireAuth, optionalAuth, verifyWalletSignature } = require('./lib/auth');
const { missionCreate, submissionCreate, challengeCreate, badRequest, assessClaimQuality } = require('./lib/validation');
const { adjudicate } = require('./lib/adjudicator');

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ---------------- anti-abuse: simple sliding-window rate limit ----------------
async function rateLimit(req, res, next) {
  const actor = req.userId || req.ip || 'anon';
  const route = req.baseUrl + req.path;
  try {
    if (req.method === 'GET') return next(); // reads are cheap; writes are metered
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM request_log WHERE actor=$1 AND created_at > now() - interval '10 minutes'`, [actor]);
    if (rows[0].n >= Number(process.env.RATE_LIMIT_PER_10MIN || 30)) {
      return res.status(429).json({ error: 'rate limit exceeded, slow down' });
    }
    await db.query(`INSERT INTO request_log(actor, route) VALUES ($1,$2)`, [actor, route]);
    next();
  } catch (e) { next(); }
}
app.use('/api', rateLimit);

const wrap = fn => (req, res) => Promise.resolve(fn(req, res)).catch(e => {
  console.error(e);
  if (!res.headersSent) res.status(500).json({ error: 'internal error' });
});

// ============================ AUTH ============================
app.post('/api/auth/wallet/nonce', wrap(async (req, res) => {
  const address = String(req.body?.address || '').trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) return res.status(400).json({ error: 'invalid wallet address' });
  const nonce = randomBytes(16).toString('hex');
  await db.query(`INSERT INTO nonce_store(address, nonce, created_at) VALUES ($1,$2,NOW())
                  ON CONFLICT(address) DO UPDATE SET nonce=$2, created_at=NOW()`, [address, nonce]);
  res.json({ message: `ProofPatch login\nnonce:${nonce}`, nonce });
}));

app.post('/api/auth/wallet/verify', wrap(async (req, res) => {
  const { address, signature } = req.body || {};
  const addr = String(address || '').trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(addr)) return res.status(400).json({ error: 'invalid wallet address' });
  const { rows } = await db.query(`SELECT nonce FROM nonce_store WHERE address=$1 AND created_at > now() - interval '15 minutes'`, [addr]);
  if (!rows.length) return res.status(400).json({ error: 'nonce expired or missing' });
  const ok = await verifyWalletSignature(addr, rows[0].nonce, signature);
  if (!ok) return res.status(401).json({ error: 'signature verification failed' });

  let user = (await db.query(`SELECT id FROM users WHERE lower(wallet_address)=$1`, [addr])).rows[0];
  if (!user) {
    user = (await db.query(
      `INSERT INTO users(wallet_address, username, user_type) VALUES ($1,$2,$3) RETURNING id`,
      [addr, 'researcher_' + addr.slice(2, 8), 'HUMAN'])).rows[0];
  }
  res.json({ token: signSession(user.id), user_id: user.id });
}));

app.post('/api/auth/register', wrap(async (req, res) => {
  const schema = require('zod').object({
    username: require('zod').string().trim().min(3).max(32).regex(/^[a-z0-9_]+$/i),
    password: require('zod').string().min(8).max(128),
    user_type: require('zod').enum(['HUMAN','AGENT']).default('HUMAN'),
  });
  const p = schema.safeParse(req.body);
  if (!p.success) return badRequest(res, p);
  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash(p.data.password, 10);
  try {
    const { rows } = await db.query(
      `INSERT INTO users(username, password_hash, user_type) VALUES ($1,$2,$3) RETURNING id, username, user_type`,
      [p.data.username.toLowerCase(), hash, p.data.user_type]);
    res.json({ token: signSession(rows[0].id), user: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'username already taken' });
    throw e;
  }
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  const { rows } = await db.query(`SELECT * FROM users WHERE username=$1 AND password_hash IS NOT NULL`, [String(username||'').toLowerCase()]);
  if (!rows.length) return res.status(401).json({ error: 'invalid credentials' });
  const ok = await require('bcryptjs').compare(String(password||''), rows[0].password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });
  res.json({ token: signSession(rows[0].id), user: { id: rows[0].id, username: rows[0].username, user_type: rows[0].user_type } });
}));

app.get('/api/auth/me', requireAuth, wrap(async (req, res) => {
  const { rows } = await db.query(`SELECT id, username, wallet_address, user_type FROM users WHERE id=$1`, [req.userId]);
  if (!rows.length) return res.status(404).json({ error: 'user not found' });
  const rep = await getReputation(req.userId);
  res.json({ user: rows[0], reputation: rep });
}));

// ============================ MISSIONS ============================
app.get('/api/missions', optionalAuth, wrap(async (req, res) => {
  const { status, category, difficulty, q, sort = 'newest', min_reward, limit = 50, offset = 0 } = req.query;
  const where = []; const params = [];
  if (status && status !== 'all') { params.push(status); where.push(`m.status = $${params.length}`); }
  else where.push(`m.status <> 'DRAFT'`);
  if (category && category !== 'all') { params.push(category); where.push(`m.category = $${params.length}`); }
  if (difficulty && difficulty !== 'all') { params.push(difficulty); where.push(`m.difficulty = $${params.length}`); }
  if (min_reward) { params.push(Number(min_reward)); where.push(`m.reward_amount >= $${params.length}`); }
  if (q) { params.push(`%${q}%`); where.push(`(m.title ILIKE $${params.length} OR m.claim ILIKE $${params.length})`); }
  const order = { newest:'created_at DESC', reward_high:'reward_amount DESC', deadline:'deadline ASC' }[sort] || 'created_at DESC';
  params.push(Math.min(+limit || 50, 100)); const limN = params.length;
  params.push(Math.max(+offset || 0, 0)); const offN = params.length;
  const { rows } = await db.query(
    `SELECT m.*, u.username AS creator_name,
       (SELECT count(*) FROM submissions s WHERE s.mission_id=m.id)::int AS submission_count,
       c.id AS claim_id, c.current_verdict
     FROM missions m LEFT JOIN users u ON u.id=m.creator
     LEFT JOIN LATERAL (SELECT * FROM claims WHERE mission_id=m.id ORDER BY version DESC LIMIT 1) c ON true
     WHERE ${where.join(' AND ')}
     ORDER BY ${order} LIMIT $${limN} OFFSET $${offN}`, params);
  res.json(rows.map(shapeMission));
}));

app.get('/api/missions/:id', wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT m.*, u.username AS creator_name,
       c.id AS claim_id, c.statement, c.verification_rules, c.required_source_types,
       c.current_verdict, c.status AS claim_status, c.version, c.deadline AS claim_deadline
     FROM missions m LEFT JOIN users u ON u.id=m.creator
     LEFT JOIN LATERAL (SELECT * FROM claims WHERE mission_id=m.id ORDER BY version DESC LIMIT 1) c ON true
     WHERE m.id=$1`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'mission not found' });
  const subs = await db.query(
    `SELECT s.id, s.status, s.created_at, s.is_agent, u.username AS submitter_name, u.user_type,
            a.verdict, a.id AS adjudication_id
     FROM submissions s JOIN users u ON u.id=s.submitter_id
     LEFT JOIN LATERAL (SELECT * FROM adjudications WHERE claim_id=s.claim_id ORDER BY timestamp DESC LIMIT 1) a ON true
     WHERE s.mission_id=$1 ORDER BY s.created_at DESC LIMIT 100`, [rows[0].id]);
  res.json({ ...shapeMission(rows[0]), submissions: subs.rows });
}));

app.post('/api/missions', requireAuth, wrap(async (req, res) => {
  const p = missionCreate.safeParse(req.body);
  if (!p.success) return badRequest(res, p);
  const quality = assessClaimQuality(p.data.claim);
  const d = p.data;
  const { rows } = await db.query(
    `INSERT INTO missions(title, description, claim, verification_rules, required_evidence,
        required_source_types, reward_amount, currency, deadline, difficulty, category, creator, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'OPEN')
     RETURNING id`,
    [d.title, d.description, d.claim, d.verification_rules, d.required_evidence,
     JSON.stringify(d.required_source_types), d.reward_amount, d.currency,
     d.deadline, d.difficulty, d.category, req.userId]);

  // escrow-style ledger entry for the creator's funding (display/index state)
  await db.query(`INSERT INTO rewards(mission_id, claim_id, amount, currency, status, settlement_status, recipient_id)
                  VALUES ($1, NULL, $2, $3, 'FUNDED', 'OFF_CHAIN_LEDGER', $4)`,
    [rows[0].id, d.reward_amount, d.currency, req.userId]);

  const claimRows = await db.query(
    `INSERT INTO claims(statement, created_by, status, verification_rules, required_source_types,
        deadline, reward_amount, currency, mission_id, current_verdict)
     VALUES ($1,$2,'OPEN',$3,$4,$5,$6,$7,$8,'PENDING') RETURNING id`,
    [d.claim, req.userId, d.verification_rules, JSON.stringify(d.required_source_types),
     d.deadline, d.reward_amount, d.currency, rows[0].id]);
  const claimId = claimRows.rows[0].id;
  await db.query(`INSERT INTO claim_versions(claim_id, version, status, verdict) VALUES ($1,1,'OPEN','PENDING')`, [claimId]);
  res.status(201).json({ mission_id: rows[0].id, claim_id: claimId, quality_warnings: quality.warnings });
}));

// ============================ SUBMISSIONS (agent API compatible) ============================
async function handleCreateSubmission(req, res) {
  const mission = (await db.query(`SELECT m.*, c.id AS claim_id, c.statement, c.status AS cstatus
                                   FROM missions m JOIN claims c ON c.mission_id=m.id AND c.version=(
                                     SELECT max(version) FROM claims WHERE mission_id=m.id)
                                   WHERE m.id=$1`, [req.params.id])).rows[0];
  if (!mission) return res.status(404).json({ error: 'mission not found' });
  if (mission.status !== 'OPEN' || !['OPEN','CHALLENGED'].includes(mission.cstatus))
    return res.status(409).json({ error: `mission not accepting submissions (mission=${mission.status}, claim=${mission.cstatus})` });
  if (new Date(mission.deadline) < new Date()) return res.status(409).json({ error: 'deadline passed' });

  const p = submissionCreate.safeParse(req.body);
  if (!p.success) return badRequest(res, p);

  // duplicate detection: same submitter, same primary URL on same claim
  for (const ev of p.data.evidence) {
    const dup = await db.query(
      `SELECT 1 FROM evidence e JOIN submissions s ON s.id=e.submission_id
       WHERE e.url=$1 AND s.claim_id=$2 AND s.submitter_id=$3`, [ev.url, mission.claim_id, req.userId]);
    if (dup.rowCount) return res.status(409).json({ error: `duplicate evidence url already submitted by you on this claim: ${ev.url}` });
  }

  const isAgent = req.agent === true; // agents identified by user_type at token issue time
  const sub = (await db.query(
    `INSERT INTO submissions(mission_id, claim_id, submitter_id, reasoning, is_agent)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`, [mission.id, mission.claim_id, req.userId, p.data.reasoning, isAgent])).rows[0];
  for (const ev of p.data.evidence) {
    await db.query(
      `INSERT INTO evidence(url, title, description, quoted_passage, source_type, screenshot,
          submitter, mission_id, claim_id, submission_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PENDING_ADJUDICATION')`,
      [ev.url, ev.title, ev.description, ev.relevant_text, ev.source_type, ev.screenshot_url || null,
       req.userId, mission.id, mission.claim_id, sub.id]);
  }

  setImmediate(() => processSubmission(sub.id).catch(e => console.error('adjudication failed:', e)));
  res.status(202).json({ submission_id: sub.id, status: 'PENDING_ADJUDICATION',
    note: 'submission accepted; GenLayer adjudication has started' });
}
const createSubmissionRoute = [requireAuth, wrap(handleCreateSubmission)];
app.post('/api/missions/:id/submissions', ...createSubmissionRoute);

app.get('/api/submissions/:id', wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT s.*, u.username AS submitter_name, u.user_type,
            json_agg(json_build_object('id',e.id,'url',e.url,'title',e.title,'description',e.description,
              'relevant_text',e.quoted_passage,'source_type',e.source_type,'screenshot_url',e.screenshot)) AS evidence
     FROM submissions s JOIN users u ON u.id=s.submitter_id
     LEFT JOIN evidence e ON e.submission_id=s.id
     WHERE s.id=$1 GROUP BY s.id, u.username, u.user_type`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'submission not found' });
  let adjRow = null;
  if (rows[0].adjudication_id) {
    adjRow = (await db.query(`SELECT * FROM adjudications WHERE id=$1`, [rows[0].adjudication_id])).rows[0] || null;
  }
  res.json({ ...rows[0], adjudication: adjRow ? shapeAdjudication(adjRow) : null });
}));

// legacy single-evidence alias (wraps into submission format)
app.post('/api/evidence', requireAuth, wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.mission_id) return res.status(400).json({ error: 'mission_id required' });
  const payload = {
    reasoning: b.reasoning || b.description || 'Evidence submission',
    evidence: [{
      url: b.url, title: b.title || b.url,
      description: b.description || '',
      relevant_text: b.quoted_passage || b.relevant_text || '',
      source_type: b.source_type || 'OTHER',
      screenshot_url: b.screenshot || null,
    }],
  };
  req.params.id = b.mission_id; req.body = payload;
  return handleCreateSubmission(req, res);
}));

// ============================ ADJUDICATION PIPELINE ============================
async function processSubmission(submissionId) {
  const sub = (await db.query(`SELECT s.*, c.statement, c.verification_rules, c.deadline
                              FROM submissions s JOIN claims c ON c.id=s.claim_id WHERE s.id=$1`, [submissionId])).rows[0];
  if (!sub) throw new Error('submission vanished');
  await db.query(`UPDATE missions SET status='ADJUDICATING', updated_at=NOW() WHERE id=$1 AND status='OPEN'`, [sub.mission_id]);
  const evs = (await db.query(`SELECT * FROM evidence WHERE submission_id=$1`, [submissionId])).rows;
  const result = await adjudicate({
    claimStatement: sub.statement,
    rules: sub.verification_rules,
    evidenceRows: evs.map(e => ({ url: e.url, title: e.title, description: e.description,
                                  relevant_text: e.quoted_passage, source_type: e.source_type })),
  });
  const adj = (await db.query(
    `INSERT INTO adjudications(claim_id, evidence_id, submission_id, verdict, reason, evidence_assessment,
        source_quality, provider, prompt_excerpt, status, transaction_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [sub.claim_id, evs[0]?.id ?? null, sub.id, result.verdict, result.reason, result.evidence_assessment,
     result.source_quality, result.provider, result.prompt_excerpt, 'COMPLETE', result.transaction_hash])).rows[0];

  await db.query(`UPDATE submissions SET status='ADJUDICATED', adjudication_id=$1 WHERE id=$2`, [adj.id, submissionId]);
  await db.query(`UPDATE evidence SET status=$1, adjudication_id=$2 WHERE submission_id=$3`,
    [result.verdict === 'SUPPORTED' ? 'ACCEPTED' : result.verdict, adj.id, submissionId]);

  const accepted = result.verdict === 'SUPPORTED';
  await settleOutcome({ submissionId, claimId: sub.claim_id, missionId: sub.mission_id,
                        submitterId: sub.submitter_id, verdict: result.verdict, provider: result.provider,
                        challengeId: sub.challenge_id || null });
  return { adjudication_id: adj.id, verdict: result.verdict };
}

async function settleOutcome({ submissionId, claimId, missionId, submitterId, verdict, provider, challengeId }) {
  const mission = (await db.query(`SELECT * FROM missions WHERE id=$1`, [missionId])).rows[0];
  const finalVerdictMap = { SUPPORTED: 'SUPPORTED', REJECTED: 'REJECTED',
                            INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE', CONFLICTING_EVIDENCE: 'CONFLICTING_EVIDENCE' };
  const claimStatus = verdict === 'SUPPORTED'
    ? (challengeId ? 'VERIFIED' : 'VERIFIED')
    : (verdict === 'REJECTED' && challengeId ? 'SUPERSEDED' : (challengeId ? 'VERIFIED' : 'OPEN'));
  const cur = (await db.query(`SELECT version, current_verdict FROM claims WHERE id=$1`, [claimId])).rows[0];
  // A FAILED challenge leaves the claim's standing verdict unchanged.
  const effectiveVerdict =
    challengeId && verdict !== 'SUPPORTED' ? (cur?.current_verdict ?? 'PENDING') : finalVerdictMap[verdict];
  // Append-only version history: a challenge always creates a NEW version row so
  // historical information is never overwritten.
  let versionToWrite = cur?.version || 1;
  if (challengeId) {
    versionToWrite = (cur?.version || 1) + 1;
    await db.query(`UPDATE claims SET version=$1 WHERE id=$2`, [versionToWrite, claimId]);
    if (verdict === 'SUPPORTED') {
      // challenge upheld: prior verified versions are superseded, never deleted
      await db.query(
        `UPDATE claim_versions SET status='SUPERSEDED' WHERE claim_id=$1 AND status='VERIFIED'`,
        [claimId]);
    }
  }
  const rowStatus = verdict === 'SUPPORTED' ? 'VERIFIED' : (challengeId ? 'VERIFIED' : claimStatus);
  const note = challengeId
    ? (verdict === 'SUPPORTED'
        ? 'challenge UPHELD — record superseded by challenger evidence'
        : `challenge REJECTED (${verdict}) — original stands`)
    : null;
  await db.query(`UPDATE claims SET status=$1, current_verdict=$2, updated_at=NOW() WHERE id=$3`,
                 [rowStatus === 'SUPERSEDED' ? 'SUPERSEDED' : rowStatus, effectiveVerdict, claimId]);
  // Non-challenge success updates the existing OPEN version row in place;
  // challenges always append a brand-new version row.
  await db.query(
    `INSERT INTO claim_versions(claim_id, version, status, verdict, adjudication_id, note)
     VALUES ($1,$2,$3,$4,(SELECT adjudication_id FROM submissions WHERE id=$5),$6)
     ON CONFLICT (claim_id, version) DO UPDATE
       SET status=$3, verdict=$4,
           adjudication_id=(SELECT adjudication_id FROM submissions WHERE id=$5),
           note=$6`,
    [claimId, versionToWrite, rowStatus, finalVerdictMap[verdict], submissionId, note]);
  // Mission resolves ONLY on a successful verification; failed evidence keeps it open.
  await db.query(`UPDATE missions SET status=$1, updated_at=NOW() WHERE id=$2`,
                 [verdict === 'SUPPORTED' ? 'RESOLVED' : 'OPEN', missionId]);

  // ---- reputation: derived ONLY from adjudicated outcomes ----
  const good = verdict === 'SUPPORTED';
  await db.query(`INSERT INTO reputation(user_id, verified_submissions, rejected_submissions,
                    successful_challenges, missions_completed, last_adjudicated_at, updated_at)
                  VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
                  ON CONFLICT (user_id) DO UPDATE SET
                    verified_submissions = reputation.verified_submissions + $2,
                    rejected_submissions = reputation.rejected_submissions + $3,
                    successful_challenges = reputation.successful_challenges + $4,
                    missions_completed = reputation.missions_completed + $5,
                    last_adjudicated_at = NOW(), updated_at = NOW()`,
    [submitterId, good ? 1 : 0, good ? 0 : 1, challengeId && good ? 1 : 0, good ? 1 : 0]);

  // streak logic
  if (good) {
    await db.query(`UPDATE reputation SET current_streak = current_streak + 1,
                      best_streak = GREATEST(best_streak, current_streak + 1) WHERE user_id=$1`, [submitterId]);
  } else {
    await db.query(`UPDATE reputation SET current_streak = 0 WHERE user_id=$1`, [submitterId]);
  }

  // ---- reward release (ledger; settlement adapter isolated) ----
  if (good && !challengeId) {
    await db.query(
      `UPDATE rewards SET status='RELEASED', recipient_id=$1, settled_at=NOW()
       WHERE mission_id=$2 AND status='FUNDED'`, [submitterId, missionId]);
    const amt = (await db.query(`SELECT amount FROM rewards WHERE mission_id=$1 AND status='RELEASED'`, [missionId])).rows[0];
    if (amt) await db.query(`UPDATE reputation SET total_earned_micros = total_earned_micros + $1 WHERE user_id=$2`,
                            [amt.amount, submitterId]);
  }
}

app.get('/api/adjudications/:id', wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT a.*, c.statement AS claim_statement, c.verification_rules, m.title AS mission_title, m.id AS mission_id
     FROM adjudications a JOIN claims c ON c.id=a.claim_id JOIN missions m ON m.id=c.mission_id
     WHERE a.id=$1`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'adjudication not found' });
  const sub = await db.query(
    `SELECT s.id, s.reasoning, u.username AS submitter, u.user_type,
            json_agg(json_build_object('url',e.url,'title',e.title,'relevant_text',e.quoted_passage,
              'source_type',e.source_type,'description',e.description)) AS evidence
     FROM submissions s JOIN users u ON u.id=s.submitter_id LEFT JOIN evidence e ON e.submission_id=s.id
     WHERE s.adjudication_id=$1 GROUP BY s.id,u.username,u.user_type`, [req.params.id]);
  res.json({ ...shapeAdjudication(rows[0]), submission: sub.rows[0] || null });
}));

// ============================ CLAIMS ============================
app.get('/api/claims/:id', wrap(async (req, res) => {
  const claim = (await db.query(
    `SELECT c.*, m.title AS mission_title FROM claims c JOIN missions m ON m.id=c.mission_id WHERE c.id=$1`,
    [req.params.id])).rows[0];
  if (!claim) return res.status(404).json({ error: 'claim not found' });
  const versions = await db.query(
    `SELECT v.*, a.verdict AS adj_verdict, a.provider FROM claim_versions v
     LEFT JOIN adjudications a ON a.id=v.adjudication_id
     WHERE v.claim_id=$1 ORDER BY v.version ASC`, [claim.id]);
  const adjs = await db.query(`SELECT id, verdict, provider, timestamp FROM adjudications WHERE claim_id=$1 ORDER BY timestamp ASC`, [claim.id]);
  res.json({ ...claim, required_source_types: safeJson(claim.required_source_types),
             versions: versions.rows, adjudication_history: adjs.rows });
}));

function safeJson(s) { try { return typeof s === 'string' ? JSON.parse(s) : s; } catch { return s; } }

// ============================ CHALLENGES ============================
app.post('/api/claims/:id/challenge', requireAuth, wrap(async (req, res) => {
  const claim = (await db.query(`SELECT * FROM claims WHERE id=$1`, [req.params.id])).rows[0];
  if (!claim) return res.status(404).json({ error: 'claim not found' });
  if (claim.status !== 'VERIFIED') return res.status(409).json({ error: `only VERIFIED claims can be challenged (current: ${claim.status})` });
  const cooldown = await db.query(
    `SELECT 1 FROM challenges WHERE claim_id=$1 AND created_at > now() - interval '24 hours'`, [claim.id]);
  if (cooldown.rowCount) return res.status(429).json({ error: 'this claim was challenged within the last 24h; cooldown active' });
  const rep = await getReputation(req.userId);
  if ((await db.query(`SELECT count(*)::int n FROM submissions WHERE submitter_id=$1`, [req.userId])).rows[0].n === 0 && claim.created_by !== req.userId)
    ; // newcomers may challenge — allowed intentionally

  const p = challengeCreate.safeParse(req.body);
  if (!p.success) return badRequest(res, p);

  const ch = (await db.query(
    `INSERT INTO challenges(claim_id, challenger, reason, status) VALUES ($1,$2,$3,'RE_ADJUDICATING') RETURNING id`,
    [claim.id, req.userId, p.data.reason])).rows[0];

  await db.query(`UPDATE claims SET status='CHALLENGED', updated_at=NOW() WHERE id=$1`, [claim.id]);
  await db.query(`INSERT INTO claim_versions(claim_id, version, status, verdict, note)
                  VALUES ($1,$2,'CHALLENGED',$3,$4)`,
    [claim.id, claim.version + 1, claim.current_verdict, `challenge ${ch.id}: ${p.data.reason.slice(0,200)}`]);

  const sub = (await db.query(
    `INSERT INTO submissions(mission_id, claim_id, submitter_id, reasoning, status, is_agent)
     VALUES ($1,$2,$3,$4,'ADJUDICATING',$5) RETURNING id`,
    [claim.mission_id, claim.id, req.userId, `[challenge ${ch.id}] ` + p.data.reasoning,
     req.agent === true])).rows[0];
  await db.query(`UPDATE challenges SET new_submission_id=$1 WHERE id=$2`, [sub.id, ch.id]);
  await db.query(`UPDATE submissions SET challenge_id=$1 WHERE id=$2`, [ch.id, sub.id]);
  for (const ev of p.data.submission.evidence) {
    await db.query(
      `INSERT INTO evidence(url, title, description, quoted_passage, source_type, screenshot,
          submitter, mission_id, claim_id, submission_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PENDING_ADJUDICATION')`,
      [ev.url, ev.title, ev.description, ev.relevant_text, ev.source_type, ev.screenshot_url || null,
       req.userId, claim.mission_id, claim.id, sub.id]);
  }
  setImmediate(() => processChallenge(ch.id, sub.id).catch(e => console.error('challenge adjudication failed:', e)));
  res.status(202).json({ challenge_id: ch.id, submission_id: sub.id, status: 'RE_ADJUDICATING' });
}));

async function processChallenge(challengeId, submissionId) {
  const out = await processSubmission(submissionId);
  const sub = (await db.query(`SELECT * FROM submissions WHERE id=$1`, [submissionId])).rows[0];
  const claim = (await db.query(`SELECT * FROM claims WHERE id=$1`, [sub.claim_id])).rows[0];
  let newClaimStatus;
  if (out.verdict === 'SUPPORTED') newClaimStatus = 'SUPERSEDED_VERDICT_REVERSED'; // challenger proved old verdict wrong → record supersedes
  else newClaimStatus = 'VERIFIED';                                                // challenge failed → original stands
  // For MVP semantics: SUPPORTED challenge ⇒ claim flips to the challenger's evidence and prior version marked SUPERSEDED.

  // Final claim state (status + standing verdict) is owned by settleOutcome;
  // here we only close out the challenge record itself.
  await db.query(`UPDATE challenges SET status='RESOLVED', re_adjudicated_at=NOW(), new_verdict=$1 WHERE id=$2`,
    [out.verdict, challengeId]);
}

app.get('/api/challenges/claim/:claimId', wrap(async (req, res) => {
  const { rows } = await db.query(`SELECT * FROM challenges WHERE claim_id=$1 ORDER BY created_at DESC`, [req.params.claimId]);
  res.json(rows);
}));

// ============================ REWARDS ============================
app.get('/api/rewards/mine', requireAuth, wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT r.*, m.title FROM rewards r LEFT JOIN missions m ON m.id=r.mission_id
     WHERE r.recipient_id=$1 OR (r.status='FUNDED' AND EXISTS (SELECT 1 FROM missions WHERE id=r.mission_id AND creator=$1))
     ORDER BY r.created_at DESC`, [req.userId]);
  res.json(rows);
}));

app.get('/api/rewards/:id', wrap(async (req, res) => {
  const { rows } = await db.query(`SELECT * FROM rewards WHERE id=$1`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'reward not found' });
  res.json(rows[0]); // transaction_hash stays null unless a real settlement wrote one
}));

// ============================ REPUTATION / LEADERBOARD / PROFILES ============================
async function getReputation(userId) {
  const { rows } = await db.query(`SELECT * FROM reputation WHERE user_id=$1`, [userId]);
  if (!rows.length) return { verified_submissions:0, rejected_submissions:0, accuracy:null,
                             successful_challenges:0, missions_completed:0, total_earned_gen:0,
                             current_streak:0, best_streak:0 };
  const r = rows[0];
  const total = r.verified_submissions + r.rejected_submissions;
  return { ...r, accuracy: total ? +(r.verified_submissions / total * 100).toFixed(1) : null };
}

app.get('/api/reputation/:userId', wrap(async (req, res) => res.json(await getReputation(req.params.userId))));

app.get('/api/users/:username', wrap(async (req, res) => {
  const u = (await db.query(`SELECT id, username, wallet_address, user_type, created_at FROM users WHERE lower(username)=lower($1)`,
    [req.params.username])).rows[0];
  if (!u) return res.status(404).json({ error: 'user not found' });
  const recent = await db.query(
    `SELECT s.id AS submission_id, s.status, s.created_at, c.statement, m.title AS mission_title, a.verdict, a.id AS adjudication_id
     FROM submissions s JOIN claims c ON c.id=s.claim_id JOIN missions m ON m.id=s.mission_id
     LEFT JOIN adjudications a ON a.id=s.adjudication_id
     WHERE s.submitter_id=$1 ORDER BY s.created_at DESC LIMIT 20`, [u.id]);
  res.json({ user: u, reputation: await getReputation(u.id), recent_activity: recent.rows });
}));

app.get('/api/leaderboard', wrap(async (req, res) => {
  const earn = await db.query(
    `SELECT u.id, u.username, u.user_type, COALESCE(SUM(r.amount),0)::bigint AS total_earned_gen
     FROM rewards r JOIN users u ON u.id=r.recipient_id WHERE r.status='RELEASED'
     GROUP BY u.id,u.username,u.user_type ORDER BY total_earned_gen DESC LIMIT 25`);
  const acc = await db.query(
    `SELECT u.id, u.username, u.user_type, r.verified_submissions, r.rejected_submissions,
            CASE WHEN (r.verified_submissions+r.rejected_submissions)>0
                 THEN round(r.verified_submissions*100.0/(r.verified_submissions+r.rejected_submissions),1) END AS accuracy_pct
     FROM reputation r JOIN users u ON u.id=r.user_id
     WHERE r.verified_submissions + r.rejected_submissions >= 3
     ORDER BY accuracy_pct DESC NULLS LAST, r.verified_submissions DESC LIMIT 25`);
  const ver = await db.query(
    `SELECT u.id, u.username, u.user_type, r.verified_submissions FROM reputation r
     JOIN users u ON u.id=r.user_id ORDER BY r.verified_submissions DESC LIMIT 25`);
  const cha = await db.query(
    `SELECT u.id, u.username, u.user_type, r.successful_challenges FROM reputation r
     JOIN users u ON u.id=r.user_id ORDER BY r.successful_challenges DESC LIMIT 25`);
  res.json({ top_earners: earn.rows, highest_accuracy: acc.rows, most_verified: ver.rows, most_successful_challenges: cha.rows });
}));

// ============================ MISC ============================
app.get('/api/health', (_req,res)=>res.json({ ok:true, ts:new Date().toISOString(),
  genlayer_configured: Boolean(process.env.GENLAYER_RPC_URL && process.env.GENLAYER_CONTRACT_ADDRESS && process.env.GENLAYER_PRIVATE_KEY)}));

function shapeMission(m) {
  return { ...m, required_source_types: safeJson(m.required_source_types),
           reward: `${m.reward_amount} ${m.currency}`, deadline: m.deadline };
}
function shapeAdjudication(a) {
  return { ...a,
    simulated: a.provider !== 'genlayer',
    consensus_note: a.provider === 'genlayer'
      ? (a.consensus ? undefined : 'Consensus details unavailable')
      : 'SIMULATED RESULT — produced by the local development evaluator, NOT by GenLayer consensus. No transaction was broadcast.' };
}

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => console.log(`ProofPatch API on :${PORT} | genlayer=${process.env.GENLAYER_RPC_URL ? 'configured' : 'not-configured (local-simulation mode)'}`));
}
module.exports = { app };
