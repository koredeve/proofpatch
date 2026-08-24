-- ProofPatch core schema v2
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(64) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_type VARCHAR(16) NOT NULL DEFAULT 'HUMAN';
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
UPDATE users SET username = 'user_' || left(id::text, 8) WHERE username IS NULL;

CREATE TABLE IF NOT EXISTS nonce_store (
  address VARCHAR(255) PRIMARY KEY,
  nonce VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mission_id UUID NOT NULL REFERENCES missions(id),
  claim_id UUID NOT NULL REFERENCES claims(id),
  submitter_id UUID NOT NULL REFERENCES users(id),
  reasoning TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING_ADJUDICATION',
  is_agent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_submissions_mission ON submissions(mission_id);
CREATE INDEX IF NOT EXISTS idx_submissions_claim ON submissions(claim_id);
CREATE INDEX IF NOT EXISTS idx_submissions_submitter ON submissions(submitter_id);

ALTER TABLE evidence ADD COLUMN IF NOT EXISTS submission_id UUID REFERENCES submissions(id);

CREATE TABLE IF NOT EXISTS claim_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id UUID NOT NULL REFERENCES claims(id),
  version INT NOT NULL,
  status VARCHAR(32) NOT NULL,
  verdict VARCHAR(32),
  adjudication_id UUID,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(claim_id, version)
);

-- adjudications: add provider + structured output
ALTER TABLE adjudications ADD COLUMN IF NOT EXISTS provider VARCHAR(48) NOT NULL DEFAULT 'local-simulation';
ALTER TABLE adjudications ADD COLUMN IF NOT EXISTS prompt_excerpt TEXT;
ALTER TABLE adjudications ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'COMPLETE';

-- rewards ledger
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS recipient_id UUID REFERENCES users(id);
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS mission_id UUID REFERENCES missions(id);
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS settlement_status VARCHAR(32) NOT NULL DEFAULT 'OFF_CHAIN_LEDGER';

-- reputation per user (replace old table shape if needed)
DROP TABLE IF EXISTS reputation CASCADE;
CREATE TABLE reputation (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  verified_submissions INT NOT NULL DEFAULT 0,
  rejected_submissions INT NOT NULL DEFAULT 0,
  successful_challenges INT NOT NULL DEFAULT 0,
  missions_completed INT NOT NULL DEFAULT 0,
  total_earned_micros BIGINT NOT NULL DEFAULT 0,
  current_streak INT NOT NULL DEFAULT 0,
  best_streak INT NOT NULL DEFAULT 0,
  last_adjudicated_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- rate limiting / abuse
CREATE TABLE IF NOT EXISTS request_log (
  id BIGSERIAL PRIMARY KEY,
  actor VARCHAR(255) NOT NULL,
  route VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_request_log_actor_time ON request_log(actor, created_at DESC);

-- missions category
ALTER TABLE missions ADD COLUMN IF NOT EXISTS category VARCHAR(32) DEFAULT 'Other';
ALTER TABLE missions ALTER COLUMN reward TYPE BIGINT USING reward::bigint;
ALTER TABLE missions ALTER COLUMN reward SET DEFAULT 0;
