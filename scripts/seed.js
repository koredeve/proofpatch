/* Seed: realistic TESTNET/DEV data. No fake transaction hashes are ever written:
   every adjudication row carries provider + transaction_hash=NULL unless a real
   on-chain settlement produced one. */
require('dotenv').config();
const db = require('../lib/db');
const bcrypt = require('bcryptjs');

const DAY = 86400000;
async function main() {
  const mkUser = async (username, type) => {
    const { rows } = await db.query(
      `INSERT INTO users(username, user_type, password_hash) VALUES ($1,$2,$3)
       ON CONFLICT (username) DO UPDATE SET user_type=$2 RETURNING id`,
      [username, type, await bcrypt.hash('demo-password-123', 10)]);
    return rows[0].id;
  };
  const alice = await mkUser('alice_research', 'HUMAN');
  const bob   = await mkUser('bob_verifies', 'HUMAN');
  const bot   = await mkUser('factbot_v1', 'AGENT');

  const missions = [
    {
      title: 'Does Node.js\'s official docs currently list fetch() as stable?',
      description: 'Verify against the official Node.js documentation whether the global fetch API is documented as stable (not experimental) in current LTS documentation.',
      claim: "Does the official Node.js documentation currently describe global fetch() as a stable (non-experimental) API?",
      verification_rules: `1) Evidence must come from nodejs.org official documentation.
2) Content must reflect the CURRENT stable release docs, not archived versions.
3) The page must explicitly mark fetch as stable OR absence of experimental warning counts only if stability section is shown.
4) A direct quote containing the stability indicator is required.`,
      required_evidence: 'URL to the relevant nodejs.org documentation page plus a quoted passage containing the stability marker.',
      required_source_types: ['DOCUMENTATION','OFFICIAL'],
      reward_amount: 150, difficulty: 'EASY', category: 'Documentation',
      deadlineDays: 14,
      url: 'https://nodejs.org/api/globals.html#fetch',
    },
    {
      title: 'Does Wikipedia currently list Berlin as the capital of Germany?',
      description: 'Check that Wikipedia\'s Germany article states Berlin is the capital. Trivial but demonstrates the full adjudication loop end-to-end.',
      claim: 'Does the English Wikipedia article "Germany" currently state that Berlin is the capital of Germany?',
      verification_rules: `1) Evidence must be from en.wikipedia.org/wiki/Germany.
2) The quoted passage must contain both "Berlin" and "capital".
3) Current revision at time of retrieval applies.`,
      required_evidence: 'Wikipedia URL plus quoted sentence naming Berlin as capital.',
      required_source_types: ['SECONDARY','OTHER'],
      reward_amount: 50, difficulty: 'EASY', category: 'Public Information',
      deadlineDays: 7,
      url: 'https://en.wikipedia.org/wiki/Germany',
    },
    {
      title: 'Does Python.org currently advertise Python 3.13 in its downloads sidebar?',
      description: 'Verify the official Python website homepage/download pages currently promote a specific major version.',
      claim: 'Does python.org currently offer Python 3.13 as a downloadable release on its official download section?',
      verification_rules: `1) Evidence must come from python.org (official).
2) Quoted passage must mention version 3.13 availability for download.
3) Snapshot must be from today's retrieval; cached/archived copies are insufficient.`,
      required_evidence: 'python.org download page URL plus quoted text showing the 3.13 download entry.',
      required_source_types: ['OFFICIAL','DOCUMENTATION'],
      reward_amount: 120, difficulty: 'MEDIUM', category: 'Technology',
      deadlineDays: 10,
      url: 'https://www.python.org/downloads/',
    },
    {
      title: 'Has the IETF published RFC 9110 as the HTTP semantics specification?',
      description: 'Confirm via ietf.org datatracker that RFC 9110 exists and is titled HTTP Semantics.',
      claim: 'Has the IETF published a document numbered RFC 9110 titled "HTTP Semantics"?',
      verification_rules: `1) Evidence must come from an rfc-editor.org or datatracker.ietf.org URL.
2) Quoted passage must contain the number 9110 and the words HTTP Semantics.
3) Publication metadata (author/date) strengthens but is not required.`,
      required_evidence: 'RFC page URL plus title line quoted verbatim.',
      required_source_types: ['PRIMARY','PUBLIC_RECORD'],
      reward_amount: 200, difficulty: 'MEDIUM', category: 'Research',
      deadlineDays: 21,
      url: 'https://www.rfc-editor.org/rfc/rfc9110.html',
    },
  ];

  for (const m of missions) {
    const creator = alice;
    const { rows } = await db.query(
      `INSERT INTO missions(title, description, claim, verification_rules, required_evidence,
         required_source_types, reward_amount, currency, deadline, difficulty, category, status, creator)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'GEN', NOW() + ($8 || ' days')::interval, $9,$10,'OPEN',$11)
       RETURNING id`,
      [m.title, m.description, m.claim, m.verification_rules, m.required_evidence,
       JSON.stringify(m.required_source_types), m.reward_amount, String(m.deadlineDays),
       m.difficulty, m.category, creator]);
    const missionId = rows[0].id;
    await db.query(`INSERT INTO claims(statement, created_by, status, verification_rules,
        required_source_types, deadline, reward_amount, currency, mission_id, current_verdict)
      VALUES ($1,$2,'OPEN',$3,$4, NOW() + ($5 || ' days')::interval, $6,'GEN',$7,'PENDING')`,
      [m.claim, creator, m.verification_rules, JSON.stringify(m.required_source_types),
       m.deadlineDays, m.reward_amount, missionId]);
    await db.query(`INSERT INTO rewards(mission_id, amount, currency, status, recipient_id)
                    VALUES ($1,$2,'GEN','FUNDED',$3)`, [missionId, m.reward_amount, creator]);
    console.log('seeded mission:', missionId, '-', m.title.slice(0, 60));
  }
  console.log('\nDemo accounts (dev/testnet data):');
  console.log('  alice_research / demo-password-123  (HUMAN)');
  console.log('  bob_verifies   / demo-password-123  (HUMAN)');
  console.log('  factbot_v1     / demo-password-123  (AGENT)');
  await db.end();
}
main().catch(e => { console.error(e); process.exit(1); });
