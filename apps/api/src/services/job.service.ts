import { PrismaClient } from '@prisma/client';
import QRCode from 'qrcode';
import {
  CreateJobRequest,
  CreateJobResponse,
  generateJobNumber,
  generateId,
  encodeQRPayload,
} from '@safetracks/shared';
import {
  createJobTopic,
  submitJobMessage,
  makeJobCreatedMessage,
} from '@safetracks/blockchain';
import { generateJobCommitment } from '@safetracks/blockchain';
import { issueToken } from '../middleware/auth';

const prisma = new PrismaClient();

const WEB_BASE_URL = process.env['WEB_BASE_URL'] ?? 'https://app.safetracks.io';

export async function createJob(req: CreateJobRequest): Promise<CreateJobResponse> {
  const jobId = generateId();
  const jobNumber = generateJobNumber(req.type);

  // 1. Create Hedera HCS topic for this job
  const hederaTopicId = await createJobTopic(jobId);

  // 2. Generate Aleo commitment for privacy-preserving insurance data
  const nonce = generateId().replace(/-/g, '');
  const aleoResult = await generateJobCommitment(
    jobId,
    req.claimNumber ?? 'PENDING',
    req.policyNumber ?? 'PENDING',
    req.initialParties?.find(p => p.role === 'homeowner')?.name ?? 'PENDING',
    nonce,
  ).catch(() => null); // Non-fatal — commitment added later if Aleo is unavailable

  const aleoCommitment = aleoResult?.commitment ?? '';
  const aleoJobId = aleoResult?.proof.executionId ?? '';

  // 3. Generate QR code payload and image
  const qrPayload = encodeQRPayload(jobId, hederaTopicId);
  const qrUrl = `${WEB_BASE_URL}/scan/${jobId}?t=${qrPayload.checksum}`;
  const qrSvg = await QRCode.toString(qrUrl, { type: 'svg', width: 300, margin: 2 });

  // 4. Persist job to database
  const job = await prisma.restorationJob.create({
    data: {
      id: jobId,
      jobNumber,
      type: req.type,
      status: 'created',
      lossDate: new Date(req.lossDate),
      street: req.address.street,
      city: req.address.city,
      state: req.address.state,
      zip: req.address.zip,
      country: req.address.country,
      lat: req.address.lat,
      lng: req.address.lng,
      waterCategory: req.waterCategory,
      waterClass: req.waterClass,
      fireCategory: req.fireCategory,
      affectedRooms: req.affectedRooms,
      affectedSqFt: req.affectedSqFt,
      claimNumber: req.claimNumber,
      policyNumber: req.policyNumber,
      insuranceCompany: req.insuranceCompany,
      deductible: req.deductible,
      estimatedLoss: req.estimatedLoss,
      hederaTopicId,
      aleoCommitment: aleoCommitment || undefined,
      aleoJobId: aleoJobId || undefined,
      qrCodeUrl: qrUrl,
      qrCodeData: JSON.stringify(qrPayload),
      parties: req.initialParties ? {
        create: req.initialParties.map(p => ({
          id: generateId(),
          ...p,
        })),
      } : undefined,
    },
    include: { parties: true },
  });

  // 5. Submit job creation event to Hedera HCS
  await submitJobMessage(
    hederaTopicId,
    makeJobCreatedMessage(jobId, jobNumber, aleoCommitment),
  ).catch(err => {
    // Log but don't fail — the job is created; HCS message can be retried
    console.error('Failed to submit job creation HCS message:', err);
  });

  return {
    job: {
      id: job.id,
      jobNumber: job.jobNumber,
      type: job.type as any,
      status: job.status as any,
      lossDate: job.lossDate.toISOString(),
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      address: {
        street: job.street,
        city: job.city,
        state: job.state,
        zip: job.zip,
        country: job.country,
        lat: job.lat ?? undefined,
        lng: job.lng ?? undefined,
      },
      waterCategory: job.waterCategory as any,
      waterClass: job.waterClass as any,
      fireCategory: job.fireCategory as any,
      affectedRooms: job.affectedRooms,
      affectedSqFt: job.affectedSqFt,
      claimNumber: job.claimNumber ?? undefined,
      policyNumber: job.policyNumber ?? undefined,
      insuranceCompany: job.insuranceCompany ?? undefined,
      deductible: job.deductible ?? undefined,
      estimatedLoss: job.estimatedLoss ?? undefined,
      hederaTopicId: job.hederaTopicId,
      aleoCommitment: job.aleoCommitment ?? undefined,
      aleoJobId: job.aleoJobId ?? undefined,
      qrCodeUrl: job.qrCodeUrl,
      qrCodeData: job.qrCodeData,
      parties: job.parties.map(p => ({
        id: p.id,
        jobId: p.jobId,
        role: p.role as any,
        name: p.name,
        email: p.email,
        phone: p.phone ?? undefined,
        company: p.company ?? undefined,
        licenseNumber: p.licenseNumber ?? undefined,
        walletAddress: p.walletAddress ?? undefined,
        aleoAddress: p.aleoAddress ?? undefined,
        inviteToken: p.inviteToken ?? undefined,
        acceptedAt: p.acceptedAt?.toISOString(),
        createdAt: p.createdAt.toISOString(),
      })),
    },
    qrCodeSvg: qrSvg,
    hederaTopicId,
    aleoCommitment,
  };
}

export async function getJob(jobId: string) {
  return prisma.restorationJob.findUnique({
    where: { id: jobId },
    include: {
      parties: true,
      documents: { orderBy: { createdAt: 'desc' } },
      moistureReadings: { orderBy: { timestamp: 'desc' } },
      psychroReadings: { orderBy: { timestamp: 'desc' } },
      equipment: { orderBy: { placedAt: 'asc' } },
      s500WorkPlan: true,
      s700WorkPlan: true,
      reports: { orderBy: { generatedAt: 'desc' } },
    },
  });
}

export async function listJobs(filter?: {
  status?: string;
  type?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  return prisma.restorationJob.findMany({
    where: {
      ...(filter?.status && { status: filter.status as any }),
      ...(filter?.type && { type: filter.type as any }),
      ...(filter?.search && {
        OR: [
          { jobNumber: { contains: filter.search, mode: 'insensitive' } },
          { claimNumber: { contains: filter.search, mode: 'insensitive' } },
          { insuranceCompany: { contains: filter.search, mode: 'insensitive' } },
          { street: { contains: filter.search, mode: 'insensitive' } },
          { city: { contains: filter.search, mode: 'insensitive' } },
        ],
      }),
    },
    include: { parties: true, _count: { select: { documents: true, equipment: true } } },
    orderBy: { createdAt: 'desc' },
    take: filter?.limit ?? 50,
    skip: filter?.offset ?? 0,
  });
}

export async function updateJobStatus(jobId: string, newStatus: string, actorPartyId: string) {
  const job = await prisma.restorationJob.findUniqueOrThrow({ where: { id: jobId } });

  const updated = await prisma.restorationJob.update({
    where: { id: jobId },
    data: { status: newStatus as any },
  });

  // Anchor status change on Hedera
  const { makeStatusChangedMessage } = await import('@safetracks/blockchain');
  await submitJobMessage(
    job.hederaTopicId,
    makeStatusChangedMessage(jobId, job.status, newStatus, actorPartyId),
  ).catch(() => {});

  return updated;
}

export async function scanQR(jobId: string, partyEmail: string) {
  const party = await prisma.jobParty.findFirst({
    where: { jobId, email: partyEmail.toLowerCase() },
  });

  if (!party) {
    throw Object.assign(new Error('Party not found for this job'), { statusCode: 403 });
  }

  const token = issueToken({
    partyId: party.id,
    jobId,
    role: party.role as any,
  });

  const { ROLE_PERMISSIONS } = await import('@safetracks/shared');

  return {
    accessToken: token,
    role: party.role,
    permissions: ROLE_PERMISSIONS[party.role as keyof typeof ROLE_PERMISSIONS] ?? [],
  };
}
