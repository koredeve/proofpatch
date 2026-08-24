const { spawn } = require('child_process');
process.env.DATABASE_URL = 'postgresql://mac@localhost:5432/proofpatch_test';
process.env.JWT_SECRET = 'test-secret';
process.env.PORT = process.env.TEST_PORT || '3999';
delete process.env.GENLAYER_RPC_URL;

async function startServer() {
  const child = spawn(process.execPath, ['server.js'], {
    env: process.env, stdio: ['ignore','pipe','pipe'],
  });
  let buf = '';
  child.stderr.on('data', d => { buf += d; process.stderr.write('[server] '+d); });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server boot timeout\n' + buf)), 10000);
    child.stdout.on('data', d => { if (String(d).includes('ProofPatch API')) { clearTimeout(t); res(); } });
  });
  const base = `http://localhost:${process.env.PORT}`;
  const call = async (path, opts = {}, token) => {
    const r = await fetch(base + path, { ...opts,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers||{}) } });
    return { status: r.status, body: await r.json().catch(()=>({})) };
  };
  return { child, call, base };
}

async function makeUser(call, username, type = 'HUMAN') {
  username = `${username}_${Date.now().toString(36)}${Math.floor(Math.random()*1e4)}`;
  const r = await call('/api/auth/register', { method:'POST', body: JSON.stringify({ username, password: 'password-123456', user_type: type }) });
  if (r.status !== 200) throw new Error('register failed: ' + JSON.stringify(r.body));
  return { token: r.body.token, id: r.body.user.id, username };
}

module.exports = { startServer, makeUser };
