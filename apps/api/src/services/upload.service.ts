import { PrismaClient } from '@prisma/client';
import {
  DocumentType,
  shouldUseBethelnet,
  sha256Hex,
  generateId,
} from '@safetracks/shared';
import { getBethelnetClient } from '@safetracks/storage';
import {
  submitJobMessage,
  makeDocumentUploadedMessage,
} from '@safetracks/blockchain';
import { generateDocumentProof } from '@safetracks/blockchain';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

const SMALL_FILE_THRESHOLD = 512 * 1024; // 512 KB

export interface ProcessUploadOptions {
  jobId: string;
  partyId: string;
  type: DocumentType;
  filename: string;
  mimeType: string;
  description?: string;
  tags?: string[];
  fileBuffer: Buffer;
}

export async function processUpload(opts: ProcessUploadOptions) {
  const { jobId, partyId, type, filename, mimeType, description, tags = [], fileBuffer } = opts;

  const job = await prisma.restorationJob.findUniqueOrThrow({
    where: { id: jobId },
    select: { hederaTopicId: true },
  });

  const docId = generateId();
  const sha256Hash = sha256Hex(fileBuffer);
  const sizeBytes = fileBuffer.length;

  let bethelnetCid: string;
  let bethelnetZkProof: string;
  let bethelnetChunkCount: number;
  let bethelnetStorageNodeIds: string[];

  if (shouldUseBethelnet(sizeBytes)) {
    // Route to Bethelnet for large files
    logger.info(`Routing ${filename} (${sizeBytes} bytes) to Bethelnet`);

    const bethelnet = getBethelnetClient();
    const result = await bethelnet.uploadBuffer(fileBuffer, {
      filename,
      mimeType,
      tags: [jobId, type, ...tags],
      metadata: { jobId, partyId, type, docId },
    });

    bethelnetCid = result.cid;
    bethelnetZkProof = result.zkProof;
    bethelnetChunkCount = result.chunkCount;
    bethelnetStorageNodeIds = result.storageNodeIds;
  } else {
    // Small file: store inline hash; CID is sha256 (content-addressed)
    bethelnetCid = `local:${sha256Hash}`;
    bethelnetZkProof = '';
    bethelnetChunkCount = 1;
    bethelnetStorageNodeIds = ['local'];
  }

  // Generate Aleo ZK proof of document integrity
  const party = await prisma.jobParty.findUnique({
    where: { id: partyId },
    select: { aleoAddress: true },
  });

  const aleoProof = await generateDocumentProof(
    jobId,
    docId,
    sha256Hash,
    bethelnetCid,
    party?.aleoAddress ?? 'aleo1unknown',
  ).catch(() => null);

  // Submit to Hedera HCS
  const hcsResult = await submitJobMessage(
    job.hederaTopicId,
    makeDocumentUploadedMessage(jobId, docId, type, bethelnetCid, sha256Hash, partyId),
  );

  // Persist document record
  const doc = await prisma.jobDocument.create({
    data: {
      id: docId,
      jobId,
      uploadedBy: partyId,
      type,
      filename,
      mimeType,
      sizeBytes: BigInt(sizeBytes),
      description,
      bethelnetCid,
      bethelnetZkProof,
      bethelnetChunkCount,
      bethelnetStorageNodeIds,
      sha256Hash,
      hederaTxId: hcsResult.transactionId,
      hederaSequenceNumber: hcsResult.sequenceNumber,
      aleoProofId: aleoProof?.proof.proofId,
      tags,
    },
  });

  return {
    document: doc,
    bethelnetCid,
    hederaTxId: hcsResult.transactionId,
    zkProof: aleoProof?.proof.proof ?? bethelnetZkProof,
  };
}

export async function getDocumentSignedUrl(docId: string): Promise<string> {
  const doc = await prisma.jobDocument.findUniqueOrThrow({ where: { id: docId } });

  if (doc.bethelnetCid.startsWith('local:')) {
    throw new Error('Document is stored locally — serve directly');
  }

  const bethelnet = getBethelnetClient();
  return bethelnet.getSignedUrl(doc.bethelnetCid, 3600);
}

export async function listDocuments(jobId: string, type?: DocumentType) {
  return prisma.jobDocument.findMany({
    where: { jobId, ...(type && { type }) },
    include: { uploader: { select: { name: true, role: true } } },
    orderBy: { createdAt: 'desc' },
  });
}
