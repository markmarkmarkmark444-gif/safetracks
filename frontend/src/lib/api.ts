// API client for SafeTracks backend
// All calls use session_id — no user identity ever transmitted

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function apiCall<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(error.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// Session
export async function createSession(qrCodeId: string, locationTag?: string) {
  return apiCall<{ session_id: string; created_at: string }>('/session', {
    method: 'POST',
    body: JSON.stringify({ qr_code_id: qrCodeId, location_tag: locationTag }),
  });
}

// Consent
export async function submitConsent(
  sessionId: string,
  consentGiven: boolean,
  consentVersion = '1.0'
) {
  return apiCall<{ consent_id: string; consent_artifact: string; message: string }>('/consent', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, consent_given: consentGiven, consent_version: consentVersion }),
  });
}

// Survey questions
export async function getQuestions() {
  return apiCall<{
    questions: {
      id: string;
      text: string;
      type: string;
      options: string[];
      label?: string;
    }[];
  }>('/survey/questions');
}

// Survey submission
export async function submitSurvey(
  sessionId: string,
  consentId: string,
  answers: { question_id: string; question_text: string; answer_type: string; answer_value: string }[]
) {
  return apiCall<{ survey_id: string; data_hash: string; message: string }>('/survey', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, consent_id: consentId, answers }),
  });
}

// Reward
export async function issueReward(sessionId: string, consentId: string, surveyId: string) {
  return apiCall<{
    reward_id: string;
    total_amount: number;
    breakdown: { base: number; bonus: number; spike: number };
    reward_token: string;
  }>('/reward', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, consent_id: consentId, survey_id: surveyId }),
  });
}

// ZK Proof
export async function generateZkProof(
  sessionId: string,
  consentId: string,
  surveyId: string,
  rewardId: string
) {
  return apiCall<{
    proof_id: string;
    proof_input_hash: string;
    public_signals: string[];
    is_valid: boolean;
    circuit_version: string;
  }>('/zk-proof', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, consent_id: consentId, survey_id: surveyId, reward_id: rewardId }),
  });
}

// Anchor to Hedera
export async function anchorProof(sessionId: string, zkProofId: string) {
  return apiCall<{
    anchor_id: string;
    hedera_transaction_id: string;
    consensus_timestamp: string;
    anchored_hash: string;
  }>('/anchor', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, zk_proof_id: zkProofId }),
  });
}

// Health
export async function checkHealth() {
  return apiCall<{
    status: string;
    hedera_configured: boolean;
    zk_mode: string;
  }>('/health');
}
