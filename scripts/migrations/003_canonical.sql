-- Canonical ProofPatch schema (resets dev tables; safe pre-production)
DROP TABLE IF EXISTS request_log, reputation, challenges, rewards, adjudications, evidence,
  submissions, claim_versions, claims, missions, nonce_store, wallets CASCADE;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_address VARCHAR(42) UNIQUE,
  username VARCHAR(64) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  user_type VARCHAR(16) NOT NULL DEFAULT 'HUMAN' CHECK (user_type IN ('HUMAN','AGENT')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE nonce_store (
  address VARCHAR(42) PRIMARY KEY,
  nonce VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE missions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  claim TEXT NOT NULL,
  verification_rules TEXT NOT NULL,
  required_evidence TEXT NOT NULL,
  required_source_types JSONB NOT NULL,
  reward_amount BIGINT NOT NULL CHECK (reward_amount > 0),
  currency VARCHAR(8) NOT NULL DEFAULT 'GEN',
  deadline TIMESTAMPTZ NOT NULL,
  difficulty VARCHAR(8) NOT NULL DEFAULT 'MEDIUM',
  category VARCHAR(32) NOT NULL DEFAULT 'Other',
  status VARCHAR(24) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('DRAFT','OPEN','SUBMISSIONS_CLOSED','ADJUDICATING','RESOLVED','CANCELLED')),
  creator UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_missions_status ON missions(status);
CREATE INDEX idx_missions_category ON missions(category);
CREATE INDEX idx_missions_deadline ON missions(deadline);

CREATE TABLE claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  statement TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  status VARCHAR(24) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','VERIFIED','CHALLENGED','REJECTED','SUPERSEDED')),
  verification_rules TEXT NOT NULL,
  required_source_types JSONB NOT NULL,
  deadline TIMESTAMPTZ NOT NULL,
  reward_amount BIGINT NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'GEN',
  mission_id UUID NOT NULL REFERENCES missions(id),
  current_verdict VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_claims_mission ON claims(mission_id);

CREATE TABLE claim_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id UUID NOT NULL REFERENCES claims(id),
  version INT NOT NULL,
  status VARCHAR(32) NOT NULL,
  verdict VARCHAR(32),
  adjudication_id UUID,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(claim_id, version)
);

CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mission_id UUID NOT NULL REFERENCES missions(id),
  claim_id UUID NOT NULL REFERENCES claims(id),
  submitter_id UUID NOT NULL REFERENCES users(id),
  reasoning TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING_ADJUDICATION',
  adjudication_id UUID,
  is_agent BOOLEAN NOT NULL DEFAULT FALSE,
  challenge_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_submissions_mission ON submissions(mission_id);
CREATE INDEX idx_submissions_claim ON submissions(claim_id);
CREATE INDEX idx_submissions_submitter ON submissions(submitter_id);

CREATE TABLE evidence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  url TEXT NOT NULL,
  title VARCHAR(300) NOT NULL,
  description TEXT NOT NULL,
  quoted_passage TEXT NOT NULL,
  source_type VARCHAR(24) NOT NULL,
  screenshot TEXT,
  submitter UUID NOT NULL REFERENCES users(id),
  mission_id UUID NOT NULL REFERENCES missions(id),
  claim_id UUID NOT NULL REFERENCES claims(id),
  submission_id UUID NOT NULL REFERENCES submissions(id),
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING_ADJUDICATION',
  adjudication_id UUID,
  transaction_ref TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_evidence_claim ON evidence(claim_id);
CREATE INDEX idx_evidence_sub ON evidence(submission_id);
CREATE INDEX idx_evidence_url_claim ON evidence(url, claim_id);

CREATE TABLE adjudications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id UUID NOT NULL REFERENCES claims(id),
  evidence_id UUID REFERENCES evidence(id),
  submission_id UUID REFERENCES submissions(id),
  verdict VARCHAR(32) NOT NULL CHECK (verdict IN ('SUPPORTED','REJECTED','INSUFFICIENT_EVIDENCE','CONFLICTING_EVIDENCE')),
  reason TEXT NOT NULL,
  evidence_assessment TEXT,
  source_quality VARCHAR(24),
  provider VARCHAR(48) NOT NULL DEFAULT 'local-simulation',
  prompt_excerpt TEXT,
  status VARCHAR(24) NOT NULL DEFAULT 'COMPLETE',
  transaction_hash TEXT,
  consensus JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_adjudications_claim ON adjudications(claim_id);
ALTER TABLE submissions ADD CONSTRAINT fk_sub_adj FOREIGN KEY (adjudication_id) REFERENCES adjudications(id);

CREATE TABLE rewards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mission_id UUID REFERENCES missions(id),
  claim_id UUID REFERENCES claims(id),
  amount BIGINT NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'GEN',
  status VARCHAR(16) NOT NULL DEFAULT 'FUNDED' CHECK (status IN ('FUNDED','RELEASED','CANCELLED')),
  settlement_status VARCHAR(32) NOT NULL DEFAULT 'OFF_CHAIN_LEDGER',
  recipient_id UUID REFERENCES users(id),
  transaction_hash TEXT,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_rewards_recipient ON rewards(recipient_id);
CREATE INDEX idx_rewards_mission ON rewards(mission_id);

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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE challenges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id UUID NOT NULL REFERENCES claims(id),
  challenger UUID NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  new_submission_id UUID REFERENCES submissions(id),
  status VARCHAR(24) NOT NULL DEFAULT 'RE_ADJUDICATING',
  new_verdict VARCHAR(32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  re_adjudicated_at TIMESTAMPTZ
);
CREATE INDEX idx_challenges_claim ON challenges(claim_id);

CREATE TABLE request_log (
  id BIGSERIAL PRIMARY KEY,
  actor VARCHAR(255) NOT NULL,
  route VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_request_log_actor_time ON request_log(actor, created_at DESC);
