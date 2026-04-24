// SQL schema definitions — all tables, no PII/PHI stored
export const SCHEMA_SQL = `
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- Sessions: ephemeral identifiers, no user identity
CREATE TABLE IF NOT EXISTS sessions (
  id                TEXT PRIMARY KEY,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  qr_code_id        TEXT NOT NULL,
  location_tag      TEXT,
  user_agent_hash   TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active', 'completed', 'abandoned'))
);

-- Consent events: the cryptographic consent primitive
-- consent_artifact = SHA-256(session_id || timestamp || version)
-- This artifact is the anchor for all downstream data
CREATE TABLE IF NOT EXISTS consent_events (
  id                TEXT PRIMARY KEY,
  session_id        TEXT NOT NULL REFERENCES sessions(id),
  consent_version   TEXT NOT NULL,
  consent_given     INTEGER NOT NULL DEFAULT 0,
  consent_timestamp TEXT NOT NULL,
  consent_artifact  TEXT NOT NULL UNIQUE,
  ip_hash           TEXT
);

-- Surveys: only hashed answer data; raw answers stored briefly then discarded
CREATE TABLE IF NOT EXISTS surveys (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES sessions(id),
  consent_id    TEXT NOT NULL REFERENCES consent_events(id),
  answers_json  TEXT NOT NULL,
  submitted_at  TEXT NOT NULL DEFAULT (datetime('now')),
  data_hash     TEXT NOT NULL
);

-- Rewards: amounts linked to consent_id, no user identity
CREATE TABLE IF NOT EXISTS rewards (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES sessions(id),
  consent_id    TEXT NOT NULL REFERENCES consent_events(id),
  base_amount   REAL NOT NULL,
  bonus_amount  REAL NOT NULL,
  spike_bonus   REAL NOT NULL,
  total_amount  REAL NOT NULL,
  reward_token  TEXT NOT NULL UNIQUE,
  issued_at     TEXT NOT NULL DEFAULT (datetime('now')),
  redeemed_at   TEXT
);

-- ZK proofs: proof artifacts — no sensitive data, only hashes and proof bytes
CREATE TABLE IF NOT EXISTS zk_proofs (
  id                    TEXT PRIMARY KEY,
  session_id            TEXT NOT NULL REFERENCES sessions(id),
  consent_id            TEXT NOT NULL REFERENCES consent_events(id),
  proof_input_hash      TEXT NOT NULL,
  public_signals        TEXT NOT NULL,  -- JSON array
  proof_data            TEXT NOT NULL,  -- serialized proof
  verification_key_hash TEXT NOT NULL,
  is_valid              INTEGER NOT NULL DEFAULT 0,
  generated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  circuit_version       TEXT NOT NULL
);

-- Anchor logs: immutable record of what was submitted to Hedera HCS
CREATE TABLE IF NOT EXISTS anchor_logs (
  id                    TEXT PRIMARY KEY,
  session_id            TEXT NOT NULL REFERENCES sessions(id),
  zk_proof_id           TEXT REFERENCES zk_proofs(id),
  anchored_hash         TEXT NOT NULL,
  hedera_topic_id       TEXT NOT NULL,
  hedera_transaction_id TEXT NOT NULL,
  consensus_timestamp   TEXT NOT NULL,
  anchored_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Billing events: HIPAA-aware billing tied to consent artifact, not identity
-- Supports ~$99/month accumulation model
CREATE TABLE IF NOT EXISTS billing_events (
  id              TEXT PRIMARY KEY,
  consent_id      TEXT NOT NULL REFERENCES consent_events(id),
  session_id      TEXT NOT NULL REFERENCES sessions(id),
  event_type      TEXT NOT NULL CHECK(event_type IN ('participation', 'bonus', 'spike')),
  amount_cents    INTEGER NOT NULL,
  billing_period  TEXT NOT NULL,  -- YYYY-MM
  anchor_log_id   TEXT REFERENCES anchor_logs(id),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index for efficient billing queries by period
CREATE INDEX IF NOT EXISTS idx_billing_period ON billing_events(billing_period);
CREATE INDEX IF NOT EXISTS idx_billing_consent ON billing_events(consent_id);
CREATE INDEX IF NOT EXISTS idx_consent_session ON consent_events(session_id);
CREATE INDEX IF NOT EXISTS idx_surveys_consent ON surveys(consent_id);
CREATE INDEX IF NOT EXISTS idx_rewards_consent ON rewards(consent_id);
CREATE INDEX IF NOT EXISTS idx_zk_consent ON zk_proofs(consent_id);
`;
