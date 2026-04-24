// Core domain types for SafeTracks
// No PII or PHI ever appears in these structures

export interface Session {
  id: string;
  created_at: string;
  qr_code_id: string;
  location_tag: string | null; // coarse-grained only (city/neighborhood), never GPS coords
  user_agent_hash: string;     // hashed, not raw
  status: 'active' | 'completed' | 'abandoned';
}

export interface ConsentEvent {
  id: string;
  session_id: string;
  consent_version: string;
  consent_given: boolean;
  consent_timestamp: string;
  consent_artifact: string;    // SHA-256(session_id + timestamp + version) — the cryptographic consent primitive
  ip_hash: string | null;      // hashed, never raw IP
}

export interface Survey {
  id: string;
  session_id: string;
  consent_id: string;
  answers: SurveyAnswer[];
  submitted_at: string;
  data_hash: string;           // SHA-256 of canonicalized answers — no raw data stored on-chain
}

export interface SurveyAnswer {
  question_id: string;
  question_text: string;
  answer_type: 'single_choice' | 'multi_choice' | 'scale' | 'boolean';
  answer_value: string;        // stored as string regardless of type
}

export interface Reward {
  id: string;
  session_id: string;
  consent_id: string;
  base_amount: number;
  bonus_amount: number;
  spike_bonus: number;
  total_amount: number;
  reward_token: string;        // opaque redemption token, not linked to identity
  issued_at: string;
  redeemed_at: string | null;
}

export interface ZKProof {
  id: string;
  session_id: string;
  consent_id: string;
  proof_input_hash: string;    // SHA-256(consent_artifact + data_hash + reward_token)
  public_signals: string[];    // public inputs visible to verifier
  proof_data: string;          // serialized proof (mock or real snark proof bytes)
  verification_key_hash: string;
  is_valid: boolean;
  generated_at: string;
  circuit_version: string;
}

export interface AnchorLog {
  id: string;
  session_id: string;
  zk_proof_id: string | null;
  anchored_hash: string;       // what was submitted to Hedera HCS
  hedera_topic_id: string;
  hedera_transaction_id: string;
  consensus_timestamp: string;
  anchored_at: string;
}

export interface BillingEvent {
  id: string;
  consent_id: string;          // billing tied to consent artifact, not identity
  session_id: string;
  event_type: 'participation' | 'bonus' | 'spike';
  amount_cents: number;
  billing_period: string;      // YYYY-MM format
  anchor_log_id: string | null;
  created_at: string;
}

// API request/response shapes

export interface CreateSessionRequest {
  qr_code_id: string;
  location_tag?: string;
}

export interface CreateSessionResponse {
  session_id: string;
  created_at: string;
}

export interface ConsentRequest {
  session_id: string;
  consent_given: boolean;
  consent_version: string;
}

export interface ConsentResponse {
  consent_id: string;
  consent_artifact: string;
  message: string;
}

export interface SurveyRequest {
  session_id: string;
  consent_id: string;
  answers: SurveyAnswer[];
}

export interface SurveyResponse {
  survey_id: string;
  data_hash: string;
  message: string;
}

export interface RewardRequest {
  session_id: string;
  consent_id: string;
  survey_id: string;
}

export interface RewardResponse {
  reward_id: string;
  total_amount: number;
  breakdown: {
    base: number;
    bonus: number;
    spike: number;
  };
  reward_token: string;
}

export interface ZKProofRequest {
  session_id: string;
  consent_id: string;
  survey_id: string;
  reward_id: string;
}

export interface ZKProofResponse {
  proof_id: string;
  proof_input_hash: string;
  public_signals: string[];
  is_valid: boolean;
  circuit_version: string;
}

export interface AnchorRequest {
  session_id: string;
  zk_proof_id: string;
}

export interface AnchorResponse {
  anchor_id: string;
  hedera_transaction_id: string;
  consensus_timestamp: string;
  anchored_hash: string;
}

// Internal ZK service types

export interface ZKProofInput {
  consent_artifact: string;
  data_hash: string;
  reward_token: string;
  timestamp: string;
}

export interface ZKProofOutput {
  proof_input_hash: string;
  public_signals: string[];
  proof_data: string;
  verification_key_hash: string;
  is_valid: boolean;
  circuit_version: string;
}
