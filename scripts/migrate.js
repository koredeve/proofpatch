const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  await pool.query(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())`);
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    const { rows } = await pool.query('SELECT 1 FROM _migrations WHERE name = $1', [f]);
    if (rows.length) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO _migrations(name) VALUES ($1)', [f]);
      console.log('applied:', f);
    } catch (e) {
      console.error('FAILED:', f, e.message);
      process.exit(1);
    }
  }
  console.log('migrations complete');
  await pool.end();
}
run().catch(e => { console.error(e); process.exit(1); });
