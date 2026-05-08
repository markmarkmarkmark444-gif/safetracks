import { Router } from 'express';
import { authenticate, requirePermission, requireJobAccess } from '../middleware/auth';
import { PrismaClient } from '@prisma/client';
import { buildAuditTrail } from '@safetracks/blockchain';

export const auditRouter = Router();
const prisma = new PrismaClient();

// ─── Get Audit Trail ──────────────────────────────────────────────────────────
// Reads directly from Hedera mirror node — immutable, cannot be altered in our DB.

auditRouter.get('/:jobId', authenticate, requireJobAccess, requirePermission('audit:read'), async (req, res) => {
  const job = await prisma.restorationJob.findUniqueOrThrow({
    where: { id: req.params['jobId'] },
    select: { hederaTopicId: true, jobNumber: true },
  });

  const mirrorMessages = await buildAuditTrail(job.hederaTopicId);

  res.json({
    jobNumber: job.jobNumber,
    hederaTopicId: job.hederaTopicId,
    verifyUrl: `https://hashscan.io/${process.env['HEDERA_NETWORK'] ?? 'testnet'}/topic/${job.hederaTopicId}`,
    totalMessages: mirrorMessages.length,
    messages: mirrorMessages,
  });
});
