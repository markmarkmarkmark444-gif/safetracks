/**
 * Hedera Mirror Node client — reads historical HCS messages for a job topic.
 * The mirror node is free to query and provides the full ordered message history.
 */

export interface MirrorMessage {
  consensusTimestamp: string;
  sequenceNumber: number;
  runningHash: string;
  message: string; // base64-encoded
  payer: string;
}

export interface MirrorTopicMessages {
  messages: MirrorMessage[];
  nextLink?: string;
}

function getMirrorBaseUrl(): string {
  const network = process.env['HEDERA_NETWORK'] ?? 'testnet';
  if (network === 'mainnet') return 'https://mainnet-public.mirrornode.hedera.com';
  if (network === 'previewnet') return 'https://previewnet.mirrornode.hedera.com';
  return 'https://testnet.mirrornode.hedera.com';
}

/**
 * Fetches all HCS messages for a topic, paginating automatically.
 */
export async function fetchTopicMessages(topicId: string): Promise<MirrorMessage[]> {
  const baseUrl = getMirrorBaseUrl();
  const all: MirrorMessage[] = [];
  let url: string | null = `${baseUrl}/api/v1/topics/${topicId}/messages?limit=100&order=asc`;

  while (url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Mirror node error ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as MirrorTopicMessages;

    for (const msg of body.messages) {
      all.push(msg);
    }

    url = body.nextLink ? `${baseUrl}${body.nextLink}` : null;
  }

  return all;
}

/**
 * Decodes a base64 HCS message and parses the JSON payload.
 */
export function decodeMirrorMessage(raw: MirrorMessage): {
  consensusTimestamp: string;
  sequenceNumber: number;
  payload: Record<string, unknown>;
} {
  const decoded = Buffer.from(raw.message, 'base64').toString('utf8');
  let payload: Record<string, unknown>;

  try {
    payload = JSON.parse(decoded);
  } catch {
    payload = { raw: decoded };
  }

  return {
    consensusTimestamp: raw.consensusTimestamp,
    sequenceNumber: raw.sequenceNumber,
    payload,
  };
}

/**
 * Builds a verifiable audit trail from mirror node messages.
 */
export async function buildAuditTrail(topicId: string) {
  const messages = await fetchTopicMessages(topicId);
  return messages.map(decodeMirrorMessage);
}
