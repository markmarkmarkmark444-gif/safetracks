import {
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TopicInfoQuery,
  TopicId,
  PrivateKey,
  KeyList,
  Status,
} from '@hashgraph/sdk';
import { getHederaClient } from './client';

export interface TopicMessage {
  type: string;
  jobId: string;
  data: Record<string, unknown>;
  timestamp: string;
  actorId?: string;
}

export interface SubmitResult {
  transactionId: string;
  sequenceNumber: number;
  topicRunningHash: string;
  status: string;
}

/**
 * Creates a new Hedera Consensus Service topic for a restoration job.
 * The topic acts as an immutable, timestamped message log for all job events.
 * submitKey restricts who can post — only our API's operator key can submit.
 */
export async function createJobTopic(jobId: string): Promise<string> {
  const client = getHederaClient();

  const operatorKey = PrivateKey.fromStringDer(
    process.env['HEDERA_PRIVATE_KEY']!,
  );

  const tx = await new TopicCreateTransaction()
    .setTopicMemo(`SafeTracks Restoration Job: ${jobId}`)
    .setSubmitKey(operatorKey.publicKey)
    .setAdminKey(operatorKey.publicKey)
    .execute(client);

  const receipt = await tx.getReceipt(client);

  if (receipt.status !== Status.Success) {
    throw new Error(`Failed to create topic: ${receipt.status.toString()}`);
  }

  const topicId = receipt.topicId!;
  return topicId.toString();
}

/**
 * Submits a structured message to a job's HCS topic.
 * Each message is cryptographically sequenced and timestamped by the Hedera network.
 */
export async function submitJobMessage(
  topicId: string,
  message: TopicMessage,
): Promise<SubmitResult> {
  const client = getHederaClient();

  const messageJson = JSON.stringify(message);

  // HCS has a 1024-byte limit per message. Large payloads are pre-stored on Bethelnet;
  // only the hash + CID are embedded here.
  if (Buffer.byteLength(messageJson, 'utf8') > 1024) {
    throw new Error(
      `HCS message too large (${Buffer.byteLength(messageJson)} bytes). ` +
      'Store payload on Bethelnet and submit only the hash reference.',
    );
  }

  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(TopicId.fromString(topicId))
    .setMessage(messageJson)
    .execute(client);

  const receipt = await tx.getReceipt(client);

  return {
    transactionId: tx.transactionId!.toString(),
    sequenceNumber: Number(receipt.topicSequenceNumber),
    topicRunningHash: Buffer.from(receipt.topicRunningHash).toString('hex'),
    status: receipt.status.toString(),
  };
}

/**
 * Fetches topic info — used to verify a topic exists and get the memo.
 */
export async function getTopicInfo(topicId: string) {
  const client = getHederaClient();

  const info = await new TopicInfoQuery()
    .setTopicId(TopicId.fromString(topicId))
    .execute(client);

  return {
    topicId: info.topicId.toString(),
    memo: info.topicMemo,
    sequenceNumber: Number(info.sequenceNumber),
    runningHash: Buffer.from(info.runningHash).toString('hex'),
    expirationTime: info.expirationTime?.toDate().toISOString(),
  };
}

// ─── Typed HCS message factories ─────────────────────────────────────────────

export function makeJobCreatedMessage(jobId: string, jobNumber: string, aleoCommitment: string): TopicMessage {
  return {
    type: 'JOB_CREATED',
    jobId,
    data: { jobNumber, aleoCommitment },
    timestamp: new Date().toISOString(),
  };
}

export function makeDocumentUploadedMessage(
  jobId: string,
  docId: string,
  docType: string,
  bethelnetCid: string,
  sha256Hash: string,
  actorId: string,
): TopicMessage {
  return {
    type: 'DOCUMENT_UPLOADED',
    jobId,
    actorId,
    data: { docId, docType, bethelnetCid, sha256Hash },
    timestamp: new Date().toISOString(),
  };
}

export function makeMoistureReadingMessage(
  jobId: string,
  readingId: string,
  room: string,
  material: string,
  readingPct: number,
  actorId: string,
): TopicMessage {
  return {
    type: 'MOISTURE_READING',
    jobId,
    actorId,
    data: { readingId, room, material, readingPct },
    timestamp: new Date().toISOString(),
  };
}

export function makeEquipmentPlacedMessage(
  jobId: string,
  equipmentId: string,
  equipmentType: string,
  room: string,
  actorId: string,
): TopicMessage {
  return {
    type: 'EQUIPMENT_PLACED',
    jobId,
    actorId,
    data: { equipmentId, equipmentType, room },
    timestamp: new Date().toISOString(),
  };
}

export function makeEquipmentRemovedMessage(
  jobId: string,
  equipmentId: string,
  hoursOnJob: number,
  actorId: string,
): TopicMessage {
  return {
    type: 'EQUIPMENT_REMOVED',
    jobId,
    actorId,
    data: { equipmentId, hoursOnJob },
    timestamp: new Date().toISOString(),
  };
}

export function makeReportGeneratedMessage(
  jobId: string,
  reportId: string,
  sha256Hash: string,
  bethelnetCid: string,
  actorId: string,
): TopicMessage {
  return {
    type: 'REPORT_GENERATED',
    jobId,
    actorId,
    data: { reportId, sha256Hash, bethelnetCid },
    timestamp: new Date().toISOString(),
  };
}

export function makeWorkPlanSignedMessage(
  jobId: string,
  standard: 'S500' | 'S700',
  signedByPartyId: string,
): TopicMessage {
  return {
    type: 'WORK_PLAN_SIGNED',
    jobId,
    actorId: signedByPartyId,
    data: { standard },
    timestamp: new Date().toISOString(),
  };
}

export function makeStatusChangedMessage(
  jobId: string,
  fromStatus: string,
  toStatus: string,
  actorId: string,
): TopicMessage {
  return {
    type: 'STATUS_CHANGED',
    jobId,
    actorId,
    data: { fromStatus, toStatus },
    timestamp: new Date().toISOString(),
  };
}
