import {
  Client,
  PrivateKey,
  TopicMessageSubmitTransaction,
  type TransactionReceipt,
} from "@hashgraph/sdk";

/**
 * Anchors an event onto the Hedera Consensus Service topic configured via
 * env vars. This gives every event an independent, publicly-verifiable
 * timestamp and ordering - the same guarantee the org_events log makes
 * internally (append-only, immutable), now backed by a public ledger instead
 * of "trust our database."
 *
 * Requires HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY, HEDERA_TOPIC_ID, and
 * HEDERA_NETWORK ("testnet" | "mainnet") in the environment. Throws if any
 * are missing - callers should treat anchoring as best-effort and not let a
 * missing/misconfigured Hedera account block writing the event itself.
 */
export interface HcsPayload {
  event_id: string;
  event_type: string;
  visibility: string;
  created_at: string;
  /** SHA-256 hex digest of the full event_payload, not the payload itself -
   * the topic is public, so sensitive payloads never touch it. */
  payload_hash: string;
}

function getClient(): Client {
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;
  const network = process.env.HEDERA_NETWORK ?? "testnet";

  if (!operatorId || !operatorKey) {
    throw new Error("HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set to anchor events.");
  }

  const client = network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(operatorId, PrivateKey.fromStringECDSA(operatorKey));
  return client;
}

export async function anchorEventToHedera(payload: HcsPayload): Promise<{
  topicId: string;
  sequenceNumber: number;
  consensusTimestamp: string;
}> {
  const topicId = process.env.HEDERA_TOPIC_ID;
  if (!topicId) {
    throw new Error("HEDERA_TOPIC_ID must be set to anchor events.");
  }

  const client = getClient();

  try {
    const submitTx = new TopicMessageSubmitTransaction({
      topicId,
      message: JSON.stringify(payload),
    });

    const submitted = await submitTx.execute(client);
    const receipt: TransactionReceipt = await submitted.getReceipt(client);
    const record = await submitted.getRecord(client);

    if (!receipt.topicSequenceNumber) {
      throw new Error("Hedera receipt did not include a topic sequence number.");
    }

    return {
      topicId,
      sequenceNumber: receipt.topicSequenceNumber.toNumber(),
      consensusTimestamp: record.consensusTimestamp.toDate().toISOString(),
    };
  } finally {
    client.close();
  }
}
