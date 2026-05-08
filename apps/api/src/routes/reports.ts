import { Router } from 'express';
import { authenticate, requirePermission, requireJobAccess } from '../middleware/auth';
import { generateInsuranceReport } from '../services/report.service';
import { PrismaClient } from '@prisma/client';

export const reportsRouter = Router();
const prisma = new PrismaClient();

// ─── Generate Report ──────────────────────────────────────────────────────────

reportsRouter.post('/:jobId/generate', authenticate, requireJobAccess, requirePermission('report:generate'), async (req, res) => {
  const { reportId, ipfsCid, hederaTxId, sha256Hash } =
    await generateInsuranceReport(req.params['jobId']!, req.auth!.partyId);

  res.status(201).json({
    reportId,
    ipfsCid,
    hederaTxId,
    sha256Hash,
    message: 'Report generated and anchored on Hedera.',
  });
});

// ─── Download Report PDF ──────────────────────────────────────────────────────

reportsRouter.get('/:jobId/:reportId/pdf', authenticate, requireJobAccess, requirePermission('report:read'), async (req, res) => {
  const report = await prisma.insuranceReport.findUniqueOrThrow({
    where: { id: req.params['reportId'] },
  });

  if (report.jobId !== req.params['jobId']) {
    res.status(403).json({ error: 'Report does not belong to this job' });
    return;
  }

  // Re-generate on demand (PDF is always reproducible from DB state)
  const { pdfBuffer } = await generateInsuranceReport(report.jobId, req.auth!.partyId);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="safetracks-report-${req.params['jobId']?.slice(0, 8)}.pdf"`,
  );
  res.send(pdfBuffer);
});

// ─── List Reports ─────────────────────────────────────────────────────────────

reportsRouter.get('/:jobId', authenticate, requireJobAccess, requirePermission('report:read'), async (req, res) => {
  const reports = await prisma.insuranceReport.findMany({
    where: { jobId: req.params['jobId'] },
    orderBy: { generatedAt: 'desc' },
  });
  res.json({ reports });
});
