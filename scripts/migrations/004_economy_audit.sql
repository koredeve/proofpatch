-- Economy mechanics + audit hardening
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS funder_id UUID REFERENCES users(id);
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS gross_amount BIGINT;
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS fee_amount BIGINT NOT NULL DEFAULT 0;
ALTER TABLE rewards ADD COLUMN IF NOT EXISTS kind VARCHAR(16) NOT NULL DEFAULT 'MISSION';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_reward_released_per_mission
  ON rewards(mission_id) WHERE status = 'RELEASED';

ALTER TABLE challenges ADD COLUMN IF NOT EXISTS bond_amount BIGINT NOT NULL DEFAULT 0;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS bond_status VARCHAR(16) NOT NULL DEFAULT 'NONE';

CREATE TABLE IF NOT EXISTS protocol_treasury (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  total_fee_micros BIGINT NOT NULL DEFAULT 0,
  total_forfeited_micros BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO protocol_treasury (id) VALUES ('00000000-0000-4000-8000-000000000001')
  ON CONFLICT (id) DO NOTHING;

UPDATE rewards SET funder_id = recipient_id WHERE funder_id IS NULL AND status = 'FUNDED';
