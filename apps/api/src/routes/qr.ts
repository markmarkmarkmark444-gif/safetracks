import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import { PrismaClient } from '@prisma/client';

export const qrRouter = Router();
const prisma = new PrismaClient();

// ─── Resolve QR Code ──────────────────────────────────────────────────────────
// Public endpoint — verifies checksum and returns job summary for unauthenticated preview.

const resolveSchema = z.object({
  jobId: z.string().uuid(),
  checksum: z.string().length(8),
});

qrRouter.post('/resolve', async (req, res) => {
  const { jobId, checksum } = resolveSchema.parse(req.body);

  const job = await prisma.restorationJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      jobNumber: true,
      type: true,
      status: true,
      lossDate: true,
      street: true,
      city: true,
      state: true,
      zip: true,
      hederaTopicId: true,
      aleoCommitment: true,
      qrCodeData: true,
      insuranceCompany: true,
      claimNumber: true,
    },
  });

  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  // Validate checksum from QR payload
  const { sha256Hex } = await import('@safetracks/shared');
  const expected = sha256Hex(`${jobId}:${job.hederaTopicId}`).slice(0, 8);

  if (expected !== checksum) {
    res.status(400).json({ error: 'Invalid QR code checksum' });
    return;
  }

  res.json({
    jobId: job.id,
    jobNumber: job.jobNumber,
    type: job.type,
    status: job.status,
    lossDate: job.lossDate,
    address: `${job.street}, ${job.city}, ${job.state} ${job.zip}`,
    hederaTopicId: job.hederaTopicId,
    aleoCommitment: job.aleoCommitment,
    insuranceCompany: job.insuranceCompany,
    claimNumber: job.claimNumber,
    verifyUrl: `https://hashscan.io/${process.env['HEDERA_NETWORK'] ?? 'testnet'}/topic/${job.hederaTopicId}`,
  });
});

// ─── Generate QR Image ────────────────────────────────────────────────────────

qrRouter.get('/:jobId/png', async (req, res) => {
  const job = await prisma.restorationJob.findUnique({
    where: { id: req.params['jobId'] },
    select: { qrCodeUrl: true },
  });

  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }

  const png = await QRCode.toBuffer(job.qrCodeUrl, { type: 'png', width: 400, margin: 2 });
  res.setHeader('Content-Type', 'image/png');
  res.send(png);
});
