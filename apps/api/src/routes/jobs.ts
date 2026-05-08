import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission, requireJobAccess } from '../middleware/auth';
import {
  createJob,
  getJob,
  listJobs,
  updateJobStatus,
  scanQR,
} from '../services/job.service';

export const jobsRouter = Router();

// ─── Create Job ───────────────────────────────────────────────────────────────

const createJobSchema = z.object({
  type: z.enum(['water', 'fire', 'mold', 'storm', 'multi']),
  lossDate: z.string().datetime(),
  address: z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(2).max(2),
    zip: z.string().min(5),
    country: z.string().default('US'),
    lat: z.number().optional(),
    lng: z.number().optional(),
  }),
  claimNumber: z.string().optional(),
  policyNumber: z.string().optional(),
  insuranceCompany: z.string().optional(),
  deductible: z.number().optional(),
  estimatedLoss: z.number().optional(),
  waterCategory: z.enum(['category_1', 'category_2', 'category_3']).optional(),
  waterClass: z.enum(['class_1', 'class_2', 'class_3', 'class_4']).optional(),
  fireCategory: z.enum(['wet_smoke', 'dry_smoke', 'protein_smoke', 'fuel_oil_smoke', 'other_smoke']).optional(),
  affectedSqFt: z.number().positive(),
  affectedRooms: z.array(z.string()).min(1),
  initialParties: z.array(z.object({
    role: z.enum(['mitigation_company', 'homeowner', 'insurance_adjuster', 'vendor', 'subcontractor', 'public_adjuster', 'attorney']),
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
    company: z.string().optional(),
    licenseNumber: z.string().optional(),
    walletAddress: z.string().optional(),
    aleoAddress: z.string().optional(),
  })).optional(),
});

jobsRouter.post('/', authenticate, requirePermission('job:write'), async (req, res) => {
  const body = createJobSchema.parse(req.body);
  const result = await createJob(body);
  res.status(201).json(result);
});

// ─── List Jobs ────────────────────────────────────────────────────────────────

jobsRouter.get('/', authenticate, requirePermission('job:read'), async (req, res) => {
  const { status, type, search, limit, offset } = req.query;
  const jobs = await listJobs({
    status: status as string | undefined,
    type: type as string | undefined,
    search: search as string | undefined,
    limit: limit ? parseInt(limit as string) : undefined,
    offset: offset ? parseInt(offset as string) : undefined,
  });
  res.json({ jobs, count: jobs.length });
});

// ─── Get Job ──────────────────────────────────────────────────────────────────

jobsRouter.get('/:jobId', authenticate, requireJobAccess, requirePermission('job:read'), async (req, res) => {
  const job = await getJob(req.params['jobId']!);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.json(job);
});

// ─── Update Job Status ────────────────────────────────────────────────────────

jobsRouter.patch('/:jobId/status', authenticate, requireJobAccess, requirePermission('job:write'), async (req, res) => {
  const { status } = z.object({
    status: z.enum(['created', 'active', 'drying', 'remediation', 'reconstruction', 'complete', 'disputed', 'closed']),
  }).parse(req.body);

  const updated = await updateJobStatus(req.params['jobId']!, status, req.auth!.partyId);
  res.json(updated);
});

// ─── QR Scan / Login ─────────────────────────────────────────────────────────

jobsRouter.post('/:jobId/scan', async (req, res) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);
  const result = await scanQR(req.params['jobId']!, email);
  res.json(result);
});

// ─── Get QR Code ──────────────────────────────────────────────────────────────

jobsRouter.get('/:jobId/qr', authenticate, requireJobAccess, async (req, res) => {
  const job = await getJob(req.params['jobId']!);
  if (!job) { res.status(404).json({ error: 'Job not found' }); return; }

  const QRCode = await import('qrcode');
  const svg = await QRCode.toString(job.qrCodeUrl, { type: 'svg', width: 400, margin: 2 });
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(svg);
});
