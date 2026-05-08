import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate, requirePermission, requireJobAccess } from '../middleware/auth';
import { generateId } from '@safetracks/shared';
import {
  submitJobMessage,
  makeEquipmentPlacedMessage,
  makeEquipmentRemovedMessage,
} from '@safetracks/blockchain';

export const equipmentRouter = Router();
const prisma = new PrismaClient();

const placeSchema = z.object({
  jobId: z.string().uuid(),
  type: z.enum([
    'dehumidifier', 'air_mover', 'air_scrubber', 'hepa_air_scrubber',
    'hydroxyl_generator', 'ozone_generator', 'thermal_fogger',
    'desiccant_dehumidifier', 'negative_air_machine', 'moisture_meter',
    'thermo_hygrometer', 'infrared_camera', 'other',
  ]),
  make: z.string().min(1),
  model: z.string().min(1),
  serialNumber: z.string().min(1),
  assetTag: z.string().optional(),
  placedAt: z.string().datetime().default(() => new Date().toISOString()),
  placedRoom: z.string().min(1),
  dailyRentalRate: z.number().positive().optional(),
});

const removeSchema = z.object({
  removedAt: z.string().datetime().default(() => new Date().toISOString()),
  hoursOnJob: z.number().positive(),
});

// ─── Place Equipment ──────────────────────────────────────────────────────────

equipmentRouter.post('/', authenticate, requirePermission('equipment:manage'), async (req, res) => {
  const body = placeSchema.parse(req.body);

  if (req.auth!.jobId !== body.jobId) {
    res.status(403).json({ error: 'Token not valid for this job' });
    return;
  }

  const job = await prisma.restorationJob.findUniqueOrThrow({
    where: { id: body.jobId },
    select: { hederaTopicId: true },
  });

  const equipId = generateId();

  const hcsResult = await submitJobMessage(
    job.hederaTopicId,
    makeEquipmentPlacedMessage(body.jobId, equipId, body.type, body.placedRoom, req.auth!.partyId),
  );

  const equipment = await prisma.equipment.create({
    data: {
      id: equipId,
      jobId: body.jobId,
      type: body.type,
      make: body.make,
      model: body.model,
      serialNumber: body.serialNumber,
      assetTag: body.assetTag,
      placedAt: new Date(body.placedAt),
      placedRoom: body.placedRoom,
      placedBy: req.auth!.partyId,
      dailyRentalRate: body.dailyRentalRate,
      hederaTxId: hcsResult.transactionId,
    },
  });

  res.status(201).json(equipment);
});

// ─── Remove Equipment ─────────────────────────────────────────────────────────

equipmentRouter.patch('/:equipId/remove', authenticate, requirePermission('equipment:manage'), async (req, res) => {
  const { removedAt, hoursOnJob } = removeSchema.parse(req.body);

  const equipment = await prisma.equipment.findUniqueOrThrow({
    where: { id: req.params['equipId'] },
    include: { job: { select: { hederaTopicId: true } } },
  });

  if (req.auth!.jobId !== equipment.jobId) {
    res.status(403).json({ error: 'Token not valid for this job' });
    return;
  }

  const hcsResult = await submitJobMessage(
    equipment.job.hederaTopicId,
    makeEquipmentRemovedMessage(equipment.jobId, equipment.id, hoursOnJob, req.auth!.partyId),
  );

  const updated = await prisma.equipment.update({
    where: { id: equipment.id },
    data: { removedAt: new Date(removedAt), hoursOnJob, hederaTxId: hcsResult.transactionId },
  });

  res.json(updated);
});

// ─── List Equipment ───────────────────────────────────────────────────────────

equipmentRouter.get('/:jobId', authenticate, requireJobAccess, requirePermission('job:read'), async (req, res) => {
  const equipment = await prisma.equipment.findMany({
    where: { jobId: req.params['jobId'] },
    orderBy: { placedAt: 'asc' },
  });
  res.json({ equipment });
});
