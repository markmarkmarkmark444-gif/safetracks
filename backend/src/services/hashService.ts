import { createHash, randomBytes } from 'crypto';

/**
 * All hashing runs through this module to ensure consistency.
 * SHA-256 is used throughout — collision-resistant and HIPAA-compatible.
 */

export function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function sha256Multi(...parts: string[]): string {
  const joined = parts.join('|');
  return sha256(joined);
}

/**
 * Consent artifact: cryptographic proof that consent was given.
 * This is the root of all downstream data linking.
 * Format: SHA-256(session_id || consent_version || timestamp)
 */
export function deriveConsentArtifact(
  sessionId: string,
  consentVersion: string,
  timestamp: string
): string {
  return sha256Multi(sessionId, consentVersion, timestamp);
}

/**
 * Survey data hash: one-way hash of canonicalized survey answers.
 * Raw answers can be discarded after hashing; only the hash is stored.
 */
export function hashSurveyData(answers: Record<string, unknown>[]): string {
  const canonical = JSON.stringify(
    answers
      .slice()
      .sort((a, b) =>
        String(a['question_id'] ?? '').localeCompare(String(b['question_id'] ?? ''))
      )
  );
  return sha256(canonical);
}

/**
 * Proof input hash: the input to the ZK circuit.
 * Ties consent, survey data, and reward together without revealing any of them.
 */
export function deriveProofInputHash(
  consentArtifact: string,
  dataHash: string,
  rewardToken: string,
  timestamp: string
): string {
  return sha256Multi(consentArtifact, dataHash, rewardToken, timestamp);
}

/**
 * HIPAA-safe hash of IP address — needed for rate-limiting but must not store raw IP.
 */
export function hashIp(ip: string): string {
  // Salt with a fixed daily salt so IPs rotate after 24h and cannot be back-correlated
  const dailySalt = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return sha256(ip + dailySalt);
}

/**
 * HIPAA-safe hash of user-agent string.
 */
export function hashUserAgent(ua: string): string {
  return sha256(ua);
}

/**
 * Generate a cryptographically secure opaque token (for reward redemption, etc.)
 * This is NOT a hash — it is a random value with no preimage.
 */
export function generateSecureToken(prefix = 'tok'): string {
  return `${prefix}_${randomBytes(24).toString('hex')}`;
}
