import { PrismaClient } from '@prisma/client';
import { DocumentType, sha256Hex, generateId } from '@safetracks/shared';
import { getStorageClient } from '@safetracks/storage';
import { submitJobMessage, makeDocumentUploadedMessage } from '@safetracks/blockchain';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

const SMALL_FILE_THRESHOLD = 512 * 1024; // 512 KB — below this, skip remote storage

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

  let ipfsCid: string;
  let storageProvider: string;

  if (sizeBytes >= SMALL_FILE_THRESHOLD) {
    logger.info(`Uploading ${filename} (${(sizeBytes / 1024).toFixed(0)} KB) to Pinata IPFS`);
    const storage = getStorageClient();
    const result = await storage.uploadBuffer(fileBuffer, {
      filename,
      mimeType,
      tags: [jobId, type, ...tags],
      metadata: { jobId, partyId, type, docId },
    });
    ipfsCid = result.cid;
    storageProvider = 'pinata';
  } else {
    // Small file — content-addressed by SHA-256, no remote storage needed
    ipfsCid = `local:${sha256Hash}`;
    storageProvider = 'local';
  }

  // Anchor to Hedera HCS — immutable timestamped record
  const hcsResult = await submitJobMessage(
    job.hederaTopicId,
    makeDocumentUploadedMessage(jobId, docId, type, ipfsCid, sha256Hash, partyId),
  );

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
      ipfsCid,
      storageProvider,
      sha256Hash,
      hederaTxId: hcsResult.transactionId,
      hederaSequenceNumber: hcsResult.sequenceNumber,
      tags,
    },
  });

  return {
    document: doc,
    ipfsCid,
    hederaTxId: hcsResult.transactionId,
    retrievalUrl: storageProvider === 'pinata'
      ? getStorageClient().getRetrievalUrl(ipfsCid)
      : null,
  };
}

export async function getDocumentUrl(docId: string): Promise<string> {
  const doc = await prisma.jobDocument.findUniqueOrThrow({ where: { id: docId } });

  if (doc.storageProvider === 'local') {
    throw new Error('Document stored locally — no remote URL available');
  }

  return getStorageClient().getRetrievalUrl(doc.ipfsCid);
}

export async function listDocuments(jobId: string, type?: DocumentType) {
  return prisma.jobDocument.findMany({
    where: { jobId, ...(type && { type }) },
    include: { uploader: { select: { name: true, role: true } } },
    orderBy: { createdAt: 'desc' },
  });
}
