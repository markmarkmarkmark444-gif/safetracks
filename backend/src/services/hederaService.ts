/**
 * HEDERA CONSENSUS SERVICE INTEGRATION
 *
 * SafeTracks uses HCS as an immutable, timestamped audit log.
 * Only hashes and ZK proof commitments are submitted — never PII or PHI.
 *
 * WHAT GETS ANCHORED:
 *   An HCS message payload containing:
 *     {
 *       type: "safetracks_proof_anchor",
 *       anchored_hash: <proof_input_hash or data_hash>,
 *       public_signals: [...],
 *       circuit_version: "0.1.0-mock",
 *       anchored_at: <ISO timestamp>
 *     }
 *
 * WHY HEDERA:
 *   - aBFT consensus: finality in seconds, not minutes
 *   - HCS gives a verifiable consensus_timestamp — tamper-evident
 *   - No smart contract needed: pure messaging, very low cost (~$0.0001/msg)
 *   - Compliant: Hedera is used by healthcare consortia (e.g. Avery Dennison)
 */

import {
  Client,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TopicId,
  PrivateKey,
  AccountId,
  Hbar,
} from '@hashgraph/sdk';

export interface HederaAnchorResult {
  hedera_transaction_id: string;
  consensus_timestamp: string;
  hedera_topic_id: string;
}

export interface AnchorPayload {
  type: 'safetracks_proof_anchor';
  anchored_hash: string;
  public_signals: string[];
  circuit_version: string;
  session_id: string;
  anchored_at: string;
}

let _client: Client | null = null;

function getClient(): Client {
  if (_client) return _client;

  const accountId = process.env.HEDERA_ACCOUNT_ID;
  const privateKey = process.env.HEDERA_PRIVATE_KEY;

  if (!accountId || !privateKey) {
    throw new HederaNotConfiguredError(
      'HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY must be set. ' +
      'Get free testnet credentials at https://portal.hedera.com'
    );
  }

  _client = Client.forTestnet();
  _client.setOperator(
    AccountId.fromString(accountId),
    PrivateKey.fromStringDer(privateKey)
  );
  _client.setDefaultMaxTransactionFee(new Hbar(1)); // 1 HBAR max per tx

  return _client;
}

/**
 * Create a new HCS topic for SafeTracks anchoring.
 * Run once during deployment; store the returned topic ID in HEDERA_TOPIC_ID.
 */
export async function createAnchorTopic(): Promise<string> {
  const client = getClient();

  const receipt = await new TopicCreateTransaction()
    .setTopicMemo('SafeTracks proof anchoring — no PII')
    .execute(client)
    .then(tx => tx.getReceipt(client));

  if (!receipt.topicId) {
    throw new Error('Failed to create HCS topic');
  }

  const topicId = receipt.topicId.toString();
  console.log(`HCS topic created: ${topicId}`);
  return topicId;
}

/**
 * Anchor a proof hash to Hedera HCS.
 * Returns the transaction ID and consensus timestamp for the anchor log.
 */
export async function anchorToHedera(
  anchoredHash: string,
  publicSignals: string[],
  circuitVersion: string,
  sessionId: string
): Promise<HederaAnchorResult> {
  const topicId = process.env.HEDERA_TOPIC_ID;
  if (!topicId) {
    throw new HederaNotConfiguredError(
      'HEDERA_TOPIC_ID not set. Create a topic first or run createAnchorTopic().'
    );
  }

  const client = getClient();

  const payload: AnchorPayload = {
    type: 'safetracks_proof_anchor',
    anchored_hash: anchoredHash,
    public_signals: publicSignals,
    circuit_version: circuitVersion,
    session_id: sessionId,
    anchored_at: new Date().toISOString(),
  };

  const message = JSON.stringify(payload);

  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(TopicId.fromString(topicId))
    .setMessage(message)
    .execute(client);

  const record = await tx.getRecord(client);

  return {
    hedera_transaction_id: record.transactionId?.toString() ?? `sim-${Date.now()}`,
    consensus_timestamp: record.consensusTimestamp?.toDate().toISOString() ?? new Date().toISOString(),
    hedera_topic_id: topicId,
  };
}

/**
 * Simulate anchoring when Hedera credentials are not configured.
 * Returns a clearly marked simulated result so the system remains testable.
 */
export async function anchorSimulated(
  anchoredHash: string,
  publicSignals: string[],
  circuitVersion: string,
  sessionId: string
): Promise<HederaAnchorResult> {
  await new Promise(r => setTimeout(r, 150)); // simulate network latency

  const fakeTs = Math.floor(Date.now() / 1000);
  return {
    hedera_transaction_id: `0.0.SIMULATED@${fakeTs}.000000000`,
    consensus_timestamp: new Date().toISOString(),
    hedera_topic_id: process.env.HEDERA_TOPIC_ID ?? '0.0.SIMULATED',
  };
}

/**
 * Main anchor entry point: tries real Hedera, falls back to simulation in dev.
 */
// Detects placeholder values left from .env.example
function looksLikePlaceholder(val: string): boolean {
  return val.includes('XXXXXXX') || val.includes('...') || val.length < 5;
}

export function isHederaConfigured(): boolean {
  const acct = process.env.HEDERA_ACCOUNT_ID ?? '';
  const key = process.env.HEDERA_PRIVATE_KEY ?? '';
  const topic = process.env.HEDERA_TOPIC_ID ?? '';
  return (
    !!acct && !!key && !!topic &&
    !looksLikePlaceholder(acct) &&
    !looksLikePlaceholder(key) &&
    !looksLikePlaceholder(topic)
  );
}

export async function anchor(
  anchoredHash: string,
  publicSignals: string[],
  circuitVersion: string,
  sessionId: string
): Promise<HederaAnchorResult> {
  if (!isHederaConfigured()) {
    console.warn(
      '[HederaService] Credentials not configured or are placeholder values — using simulated anchor. ' +
      'Set real HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY, HEDERA_TOPIC_ID for live anchoring.'
    );
    return anchorSimulated(anchoredHash, publicSignals, circuitVersion, sessionId);
  }

  return anchorToHedera(anchoredHash, publicSignals, circuitVersion, sessionId);
}

export class HederaNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HederaNotConfiguredError';
  }
}
