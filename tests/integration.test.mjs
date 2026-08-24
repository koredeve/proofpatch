import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
process.env.DATABASE_URL = 'postgresql://mac@localhost:5432/proofpatch_test';
process.env.TEST_PORT = '3997';
const { startServer, makeUser } = require('./helpers.js');

let S;
before(async () => { S = await startServer(); });
after(() => S.child.kill());

let alice, bob;

test('register two users', async () => {
  alice = await require('./helpers.js').makeUser(S.call, 'int_alice');
  bob = await require('./helpers.js').makeUser(S.call, 'int_bob');
  assert.ok(alice.token && bob.token);
});

let missionId, claimId;
test('mission creation works and validates claim quality', async () => {
  const r = await S.call('/api/missions', { method:'POST', body: JSON.stringify({
    title: 'Does example.com currently describe itself as an illustrative example?',
    description: 'Verifying whether the fictional company lists a Berlin office right now.',
    claim: 'Does the website example.com currently describe this domain as being used for illustrative examples in documents?',
    verification_rules: '1) Evidence must come from example.com. 2) Current live page. 3) Direct quote of the self-description is required.',
    required_evidence: 'URL https://example.com plus the quoted self-description sentence.',
    reward_amount: 75,
    deadline: new Date(Date.now() + 7*86400000).toISOString(),
  })}, alice.token);
  assert.equal(r.status, 201);
  missionId = r.body.mission_id; claimId = r.body.claim_id;
  assert.ok(missionId);

  const bad = await S.call('/api/missions', { method:'POST', body: JSON.stringify({
    title: 'Is Acme good?', description: 'x'.repeat(20), claim: 'Is Acme good?',
    verification_rules: 'n/a', required_evidence: 'n/a', reward_amount: 1,
    deadline: new Date(Date.now()+86400000).toISOString(),
  })}, alice.token);
  assert.equal(bad.status, 400); // too short/vague fields fail schema
});

const evidence = (url) => ({ url, title: 'Example Domain',
  description: 'The canonical example domain homepage retrieved live.',
  relevant_text: 'This domain is for use in illustrative examples in documents. You may use this domain in literature without prior coordination or asking for permission.',
  source_type: 'OFFICIAL' });

test('evidence submission triggers adjudication → SUPPORTED verdict persisted', async () => {
  const r = await S.call(`/api/missions/${missionId}/submissions`, { method:'POST',
    body: JSON.stringify({ reasoning: 'The official page lists a Berlin office explicitly.', evidence: [evidence('https://acme.example/locations')] }) }, bob.token);
  assert.equal(r.status, 202);
  const sid = r.body.submission_id;
  let sub, tries = 0;
  do { await new Promise(res => setTimeout(res, 1000)); sub = await S.call(`/api/submissions/${sid}`); }
  while (sub.body.status !== 'ADJUDICATED' && ++tries < 20);
  assert.equal(sub.body.status, 'ADJUDICATED');
  assert.equal(sub.body.adjudication.verdict, 'SUPPORTED');
  assert.equal(sub.body.adjudication.provider, 'local-simulation');
  assert.equal(sub.body.adjudication.transaction_hash, null); // never fabricated
});

test('claim becomes VERIFIED, version history exists, reward released to submitter', async () => {
  const c = await S.call(`/api/claims/${claimId}`);
  assert.equal(c.body.status, 'VERIFIED');
  assert.equal(c.body.current_verdict, 'SUPPORTED');
  assert.ok(c.body.versions.length >= 1);
  const rw = await S.call('/api/rewards/mine', {}, bob.token);
  const released = rw.body.find(x => x.mission_id === missionId && x.status === 'RELEASED');
  assert.ok(released, 'reward must be released to bob');
});

test('reputation updated from adjudicated outcome only', async () => {
  const me = await S.call('/api/auth/me', {}, bob.token);
  assert.equal(me.body.reputation.verified_submissions, 1);
  assert.equal(me.body.reputation.accuracy, 100);
  // client-side reputation manipulation must not exist
  const hack = await S.call('/api/reputation/update', { method:'POST', body: JSON.stringify({ user_id: bob.id }) });
  assert.notEqual(hack.status, 200); // route removed entirely
});

test('challenge flow: failed challenge keeps VERIFIED, history preserved', async () => {
  const ch = await S.call(`/api/claims/${claimId}/challenge`, { method:'POST',
    body: JSON.stringify({ reason: 'I dispute this; the office may have closed last month.',
      submission: { reasoning: 'Challenging with contradicting official notice.',
        evidence: [{ url:'https://www.rfc-editor.org/rfc/rfc2606.html', title:'RFC 2606', description:'Reserved domain notice.',
          relevant_text: 'The domain example.com is reserved, not an operating business, and provides no such self-description of offices.',
          source_type: 'PRIMARY' }] } }) }, alice.token);
  assert.equal(ch.status, 202);
  let c;
  const deadline = Date.now() + 40000;
  do {
    await new Promise(res => setTimeout(res, 1500));
    c = await S.call(`/api/claims/${claimId}`);
    const resolved = c.body.adjudication_history?.length >= 2
      && c.body.status !== 'CHALLENGED';
    if (resolved && Date.now() > deadline - 38000) break; // ensure at least one recheck
  } while (Date.now() < deadline);
  assert.equal(c.body.status, 'VERIFIED', `claim should return to VERIFIED, got ${c.body.status}`); // original stands
  assert.ok(c.body.versions.length >= 2, 'history preserved');
});
