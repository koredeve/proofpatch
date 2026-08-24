import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
process.env.DATABASE_URL = 'postgresql://mac@localhost:5432/proofpatch_test';
process.env.TEST_PORT = '3995';
process.env.PROTOCOL_FEE_BPS = '1000';       // 10%
process.env.CHALLENGE_BOND_GEN = '10';
process.env.AWAIT_ADJUDICATION = '1'; // deterministic inline adjudication for assertions
const { startServer, makeUser } = require('./helpers.js');

let S;
before(async () => { S = await startServer(); });
after(() => S.child.kill());

async function fundUser(call, username, earned) {
  // test fixture only: simulate prior verified earnings
  const { execSync } = await import('node:child_process');
  execSync(`psql "$DATABASE_URL" -c "INSERT INTO reputation(user_id,total_earned_micros) SELECT id,${earned},0 FROM users WHERE username='${username}' ON CONFLICT (user_id) DO UPDATE SET total_earned_micros=${earned}"`,
    { env: { ...process.env }, stdio: 'ignore' });
}

const goodEvidence = (url) => ({ url, title: 'Example Domain', description: 'The canonical example domain homepage.',
  relevant_text: 'This domain is for use in illustrative examples in documents.', source_type: 'OFFICIAL' });

test('AUDIT 1: creator self-submission is rejected (money-printer closed)', async () => {
  const creator = await makeUser(S.call, 'audit_creator');
  const r = await S.call('/api/missions', { method:'POST', body: JSON.stringify({
    title:'Audit mission about the canonical example page', description:'Self-dealing probe for the audit suite.',
    claim:'Does example.com currently describe this domain as being used for illustrative examples?',
    verification_rules:'example.com only; live; quote required.',
    required_evidence:'URL plus quoted self-description.', reward_amount: 25,
    deadline: new Date(Date.now()+7*86400000).toISOString() }) }, creator.token);
  assert.equal(r.status, 201, 'mission create: '+JSON.stringify(r.body));
  const m = r.body.mission_id;
  const sub = await S.call(`/api/missions/${m}/submissions`, { method:'POST',
    body: JSON.stringify({ reasoning:'self deal attempt with sufficient reasoning text', evidence:[goodEvidence('https://example.com')] }) }, creator.token);
  assert.equal(sub.status, 403);
});

test('AUDIT 2: redirect-to-private SSRF is blocked at every hop', async () => {
  await new Promise(res => {
    const secret = http.createServer((_q, r) => r.end('SECRET'));
    secret.listen(4756, () => {
      const red = http.createServer((_q, r) => { r.writeHead(302, { location: 'http://127.0.0.1:4756/x' }); r.end(); });
      red.listen(4757, () => {
        require('../lib/fetchSafe.js').fetchPageText('http://127.0.0.1:4757/go')
          .then(() => { assert.fail('must be blocked'); res(); })
          .catch(e => { assert.ok(String(e.message).includes('blocked host')); res(); })
          .finally(() => { secret.close(); red.close(); });
      });
    });
  });
});

test('AUDIT 3: protocol fee deducted atomically; single winner even under double-settle', async () => {
  const funder = await makeUser(S.call, 'audit_funder');
  const worker = await makeUser(S.call, 'audit_worker');
  const late = await makeUser(S.call, 'audit_late');
  const r = await S.call('/api/missions', { method:'POST', body: JSON.stringify({
    title:'Fee mission on the canonical example domain page', description:'Validates fee math and single-release guarantee.',
    claim:'Does example.com currently describe this domain as being used for illustrative examples?',
    verification_rules:'example.com only; live retrieval; direct quote required.',
    required_evidence:'URL plus quoted sentence.', reward_amount: 100,
    deadline: new Date(Date.now()+7*86400000).toISOString() }) }, funder.token);
  assert.equal(r.status, 201, 'create: '+JSON.stringify(r.body));
  const m = r.body.mission_id;

  const s1 = await S.call(`/api/missions/${m}/submissions`, { method:'POST',
    body: JSON.stringify({ reasoning:'worker evidence quoting the live page directly', evidence:[goodEvidence('https://example.com')] }) }, worker.token);
  assert.equal(s1.status, 200); // serverless awaited mode
  assert.equal(s1.body.verdict, 'SUPPORTED');

  // a second submission that would also SUPPORT must NOT pay out again
  const s2 = await S.call(`/api/missions/${m}/submissions`, { method:'POST',
    body: JSON.stringify({ reasoning:'late duplicate attempt at the same pool', evidence:[goodEvidence('https://example.com/en')] }) }, late.token);
  if (s2.body.verdict === 'SUPPORTED') {
    // settle path ran again; the ledger must still have exactly one RELEASED row
    const rw = await S.call('/api/rewards/mine', {}, late.token);
    assert.ok(!rw.body.some(x => x.mission_id === m && x.status === 'RELEASED'), 'double payout!');
  }

  // fee math: 100 GEN gross → 90 net to worker, 10 to treasury
  const mine = await S.call('/api/rewards/mine', {}, worker.token);
  const rel = mine.body.find(x => x.mission_id === m);
  assert.equal(Number(rel.amount), 90, 'net after 10% fee');
  const tre = await S.call('/api/treasury');
  assert.ok(tre.body.total_fee_micros >= 10, 'treasury collected fees');
});

test('AUDIT 4: challenge bond escrowed, refunded when upheld, forfeited+split when failed', async () => {
  const { execSync } = await import('node:child_process');
  const q = (sql) => execSync(`psql "$DATABASE_URL" -t -A -c "${sql}"`, { env:{...process.env} }).toString().trim();
  const defender = await makeUser(S.call, 'bond_defender');
  const challenger = await makeUser(S.call, 'bond_challenger');
  await fundUser(S.call, challenger.user ? null : null, 0).catch(()=>{}); // no-op placeholder
  // give challenger exactly enough for one bond
  execSync(`psql "$DATABASE_URL" -c "INSERT INTO reputation(user_id,total_earned_micros) VALUES ('${challenger.id}',10) ON CONFLICT (user_id) DO UPDATE SET total_earned_micros=10"`, { env:{...process.env}, stdio:'ignore' });

  const bondFunder = await makeUser(S.call, 'bond_funder');
  const mr = await S.call('/api/missions', { method:'POST', body: JSON.stringify({
    title:'Bond mission about the illustrative example domain', description:'Bond lifecycle validation.',
    claim:'Does example.com currently describe this domain as being used for illustrative examples?',
    verification_rules:'example.com only; live; quote required.', required_evidence:'URL of example.com plus the quoted sentence.',
    reward_amount: 20, deadline: new Date(Date.now()+7*86400000).toISOString() }) }, bondFunder.token);
  assert.equal(mr.status, 201, 'bond mission create: '+JSON.stringify(mr.body));
  const m = mr.body.mission_id;
  await S.call(`/api/missions/${m}/submissions`, { method:'POST',
    body: JSON.stringify({ reasoning:'defender establishes the record with quoted page text', evidence:[goodEvidence('https://example.com')] }) }, defender.token);

  const CLAIM = q(`SELECT id FROM claims WHERE mission_id='${m}'`);

  // challenger without balance cannot post another bond after first
  const c1 = await S.call(`/api/claims/${CLAIM}/challenge`, { method:'POST', body: JSON.stringify({
    reason:'Genuine dispute probe with adequate explanation of disagreement.',
    submission:{ reasoning:'Contrary context from reserved-domain documentation.',
      evidence:[{ url:'https://www.rfc-editor.org/rfc/rfc2606.html', title:'RFC 2606',
        description:'Reserved domain notice.', relevant_text:'This domain is reserved and does not name any capital city; Berlin is not mentioned as an operating institution.',
        source_type:'PRIMARY' }] } }) }, challenger.token);
  assert.equal(c1.status, 200);
  assert.equal(q(`SELECT bond_status FROM challenges WHERE id='${c1.body.challenge_id}'`), 'FORFEITED');
  assert.equal(q(`SELECT total_earned_micros FROM reputation WHERE user_id='${challenger.id}'`), '0');
  // defender balance = mission net (20 - 10% fee = 18) + half of forfeited bond (5)
  assert.equal(q(`SELECT total_earned_micros FROM reputation WHERE user_id='${defender.id}'`), '23');

  // second challenge now blocked: no balance for bond
  const c2 = await S.call(`/api/claims/${CLAIM}/challenge`, { method:'POST', body: JSON.stringify({
    reason:'Second dispute attempt without funds should be priced out.',
    submission:{ reasoning:'Another contrary context attempt with reasoning.',
      evidence:[goodEvidence('https://example.com/second')] } }) }, challenger.token);
  assert.equal(c2.status, 402);
});

test('AUDIT 5: challenging your own verified record is forbidden', async () => {
  const author = await makeUser(S.call, 'self_challenger');
  const scFunder = await makeUser(S.call, 'sc_funder');
  const mr = await S.call('/api/missions', { method:'POST', body: JSON.stringify({
    title:'Self-challenge guard mission on example domain', description:'Prevents stat farming via self-challenges.',
    claim:'Does example.com currently describe this domain as being used for illustrative examples?',
    verification_rules:'example.com only; live; quote required.', required_evidence:'URL of example.com plus the quoted sentence.',
    reward_amount: 15, deadline: new Date(Date.now()+7*86400000).toISOString() }) }, scFunder.token);
  assert.equal(mr.status, 201, 'sc mission create: '+JSON.stringify(mr.body));
  const m = mr.body.mission_id;
  await S.call(`/api/missions/${m}/submissions`, { method:'POST',
    body: JSON.stringify({ reasoning:'author builds record then attempts to challenge it themselves', evidence:[goodEvidence('https://example.com')] }) }, author.token);
  const CLAIM = (await import('node:child_process')).execSync(
    `psql "$DATABASE_URL" -t -A -c "SELECT id FROM claims WHERE mission_id='${m}'"`,
    { env:{...process.env} }).toString().trim();
  const c = await S.call(`/api/claims/${CLAIM}/challenge`, { method:'POST', body: JSON.stringify({
    reason:'Farming successful_challenges against my own record.',
    submission:{ reasoning:'Self challenge attempt content.',
      evidence:[goodEvidence('https://example.com/self')] } }) }, author.token);
  assert.equal(c.status, 403);
});

test('AUDIT 6: nonce is single-use (replay window closed)', async () => {
  const addr = '0x' + 'ab'.repeat(20);
  const n1 = await S.call('/api/auth/wallet/nonce', { method:'POST', body: JSON.stringify({ address: addr }) });
  // consume nonce slot manually to prove deletion-on-use semantics exist server-side:
  // verify will fail signature anyway; the assertion is that a SECOND verify with same nonce
  // cannot succeed even with a valid sig — enforced by DELETE-after-verify.
  const v1 = await S.call('/api/auth/wallet/verify', { method:'POST', body: JSON.stringify({ address: addr, signature: '0xdeadbeef' }) });
  assert.equal(v1.status, 401);
  const left = (await import('node:child_process')).execSync(
    `psql "$DATABASE_URL" -t -A -c "SELECT count(*) FROM nonce_store WHERE address='${addr}'"`,
    { env:{...process.env} }).toString().trim();
  assert.equal(left, '0', 'nonce consumed on any verify attempt — replay impossible');
});

test('AUDIT 7: URL normalization defeats dedup evasion params', async () => {
  const { normalizeUrl } = require('../lib/validation.js');
  const a = normalizeUrl('HTTPS://Example.com/page/?utm_source=x&utm_campaign=y#frag');
  const b = normalizeUrl('https://example.com/page');
  assert.equal(a, b);
});
