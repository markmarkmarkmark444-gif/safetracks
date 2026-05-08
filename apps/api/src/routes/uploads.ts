import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authenticate, requirePermission, requireJobAccess } from '../middleware/auth';
import { processUpload, getDocumentSignedUrl, listDocuments } from '../services/upload.service';
import { DocumentType } from '@safetracks/shared';

export const uploadsRouter = Router();

// Store files in memory — large files are immediately streamed to Bethelnet.
// Max file size: 500 MB (Bethelnet handles video footage).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ALLOWED_MIMES = [
      'image/jpeg', 'image/png', 'image/heic', 'image/tiff',
      'video/mp4', 'video/quicktime', 'video/x-msvideo',
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/json',
      'application/zip',
    ];
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  },
});

const uploadSchema = z.object({
  jobId: z.string().uuid(),
  type: z.enum([
    'photo', 'video', 'moisture_log', 'psychrometric_chart', 'equipment_report',
    'xactimate_export', 'work_plan_s500', 'work_plan_s700', 'certificate_of_completion',
    'scope_of_loss', 'invoice', 'subcontractor_receipt', 'permit', 'other',
  ]),
  description: z.string().max(500).optional(),
  tags: z.string().optional(), // comma-separated
});

// ─── Upload Document ──────────────────────────────────────────────────────────

uploadsRouter.post(
  '/',
  authenticate,
  requirePermission('document:upload'),
  upload.single('file'),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const { jobId, type, description, tags } = uploadSchema.parse(req.body);

    // Verify the authenticated party has access to this job
    if (req.auth!.jobId !== jobId) {
      res.status(403).json({ error: 'Token not valid for this job' });
      return;
    }

    const result = await processUpload({
      jobId,
      partyId: req.auth!.partyId,
      type: type as DocumentType,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      description,
      tags: tags?.split(',').map(t => t.trim()).filter(Boolean),
      fileBuffer: req.file.buffer,
    });

    res.status(201).json({
      document: {
        id: result.document.id,
        jobId: result.document.jobId,
        type: result.document.type,
        filename: result.document.filename,
        sizeBytes: Number(result.document.sizeBytes),
        bethelnetCid: result.bethelnetCid,
        hederaTxId: result.hederaTxId,
        zkProof: result.zkProof,
        createdAt: result.document.createdAt,
      },
    });
  },
);

// ─── List Documents ───────────────────────────────────────────────────────────

uploadsRouter.get('/:jobId', authenticate, requireJobAccess, requirePermission('document:read'), async (req, res) => {
  const { type } = req.query;
  const docs = await listDocuments(req.params['jobId']!, type as DocumentType | undefined);
  res.json({ documents: docs });
});

// ─── Get Signed Download URL ──────────────────────────────────────────────────

uploadsRouter.get('/document/:docId/url', authenticate, requirePermission('document:read'), async (req, res) => {
  const url = await getDocumentSignedUrl(req.params['docId']!);
  res.json({ url, expiresIn: 3600 });
});
