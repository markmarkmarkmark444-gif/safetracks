import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate, requirePermission, requireJobAccess } from '../middleware/auth';
import { generateId, calcDewPoint, calcGrainsPerLb } from '@safetracks/shared';
import { submitJobMessage, makeMoistureReadingMessage } from '@safetracks/blockchain';

export const moistureRouter = Router();
const prisma = new PrismaClient();

const moistureSchema = z.object({
  jobId: z.string().uuid(),
  timestamp: z.string().datetime().default(() => new Date().toISOString()),
  room: z.string().min(1),
  material: z.string().min(1),
  location: z.string().min(1),
  readingPct: z.number().min(0).max(100),
  readingWme: z.number().optional(),
  dryStandard: z.number().positive(),
  equipmentId: z.string().uuid().optional(),
  photoId: z.string().uuid().optional(),
});

const psychroSchema = z.object({
  jobId: z.string().uuid(),
  timestamp: z.string().datetime().default(() => new Date().toISOString()),
  room: z.string().min(1),
  temperatureF: z.number(),
  relativeHumidityPct: z.number().min(0).max(100),
  dryingGoalTempF: z.number().optional(),
  dryingGoalRhPct: z.number().optional(),
});

// ─── Log Moisture Reading ─────────────────────────────────────────────────────

moistureRouter.post('/reading', authenticate, requirePermission('moisture:log'), async (req, res) => {
  const body = moistureSchema.parse(req.body);

  if (req.auth!.jobId !== body.jobId) {
    res.status(403).json({ error: 'Token not valid for this job' });
    return;
  }

  const job = await prisma.restorationJob.findUniqueOrThrow({
    where: { id: body.jobId },
    select: { hederaTopicId: true },
  });

  const readingId = generateId();

  const hcsResult = await submitJobMessage(
    job.hederaTopicId,
    makeMoistureReadingMessage(
      body.jobId, readingId, body.room, body.material, body.readingPct, req.auth!.partyId,
    ),
  );

  const reading = await prisma.moistureReading.create({
    data: {
      id: readingId,
      jobId: body.jobId,
      recordedBy: req.auth!.partyId,
      timestamp: new Date(body.timestamp),
      room: body.room,
      material: body.material,
      location: body.location,
      readingPct: body.readingPct,
      readingWme: body.readingWme,
      dryStandard: body.dryStandard,
      equipmentId: body.equipmentId,
      photoId: body.photoId,
      hederaTxId: hcsResult.transactionId,
    },
  });

  res.status(201).json(reading);
});

// ─── Log Psychrometric Reading ────────────────────────────────────────────────

moistureRouter.post('/psychro', authenticate, requirePermission('moisture:log'), async (req, res) => {
  const body = psychroSchema.parse(req.body);

  if (req.auth!.jobId !== body.jobId) {
    res.status(403).json({ error: 'Token not valid for this job' });
    return;
  }

  // Auto-calculate derived values
  const dewPointF = calcDewPoint(body.temperatureF, body.relativeHumidityPct);
  const grainsPerLb = calcGrainsPerLb(body.temperatureF, body.relativeHumidityPct);

  const reading = await prisma.psychrometricReading.create({
    data: {
      id: generateId(),
      jobId: body.jobId,
      recordedBy: req.auth!.partyId,
      timestamp: new Date(body.timestamp),
      room: body.room,
      temperatureF: body.temperatureF,
      relativeHumidityPct: body.relativeHumidityPct,
      dewPointF,
      grainsPerLb,
      dryingGoalTempF: body.dryingGoalTempF,
      dryingGoalRhPct: body.dryingGoalRhPct,
    },
  });

  res.status(201).json(reading);
});

// ─── Get Moisture Readings for Job ────────────────────────────────────────────

moistureRouter.get('/:jobId', authenticate, requireJobAccess, requirePermission('job:read'), async (req, res) => {
  const [moisture, psychro] = await Promise.all([
    prisma.moistureReading.findMany({
      where: { jobId: req.params['jobId'] },
      orderBy: { timestamp: 'desc' },
    }),
    prisma.psychrometricReading.findMany({
      where: { jobId: req.params['jobId'] },
      orderBy: { timestamp: 'desc' },
    }),
  ]);

  res.json({ moistureReadings: moisture, psychroReadings: psychro });
});
