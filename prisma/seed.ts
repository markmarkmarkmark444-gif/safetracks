/**
 * Prisma seed — creates a sample restoration job for development/testing.
 * Run with: npm run db:seed
 */

import { PrismaClient } from '@prisma/client';
import { generateId, generateJobNumber } from '../packages/shared/src/utils';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database with sample data...');

  const jobId = generateId();
  const jobNumber = generateJobNumber('water');

  // Sample water damage job
  const job = await prisma.restorationJob.create({
    data: {
      id: jobId,
      jobNumber,
      type: 'water',
      status: 'drying',
      lossDate: new Date('2026-04-15'),
      street: '1234 Oak Lane',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      country: 'US',
      lat: 30.2672,
      lng: -97.7431,
      waterCategory: 'category_2',
      waterClass: 'class_3',
      affectedRooms: ['Kitchen', 'Living Room', 'Hallway', 'Master Bedroom'],
      affectedSqFt: 1800,
      claimNumber: 'CLM-2026-087433',
      policyNumber: 'POL-TX-44821-A',
      insuranceCompany: 'State Farm',
      deductible: 2500,
      estimatedLoss: 45000,
      hederaTopicId: '0.0.1234567', // fake for seed
      aleoCommitment: 'field:placeholder-commitment-hash',
      qrCodeUrl: `http://localhost:3000/scan/${jobId}?t=abc12345`,
      qrCodeData: JSON.stringify({ v: 1, jobId, hederaTopicId: '0.0.1234567', checksum: 'abc12345' }),

      parties: {
        create: [
          {
            id: generateId(),
            role: 'mitigation_company',
            name: 'John Smith',
            email: 'john@restorepro.com',
            phone: '512-555-0101',
            company: 'RestorePro LLC',
            licenseNumber: 'IICRC-WRT-90341',
          },
          {
            id: generateId(),
            role: 'homeowner',
            name: 'Sarah Johnson',
            email: 'sarah.johnson@email.com',
            phone: '512-555-0202',
          },
          {
            id: generateId(),
            role: 'insurance_adjuster',
            name: 'Mike Davis',
            email: 'mdavis@statefarm.com',
            phone: '512-555-0303',
            company: 'State Farm',
          },
        ],
      },

      equipment: {
        create: [
          {
            id: generateId(),
            type: 'dehumidifier',
            make: 'Dri-Eaz',
            model: 'LGR 7000XLi',
            serialNumber: 'DE7000-20481',
            placedAt: new Date('2026-04-15T14:00:00Z'),
            placedRoom: 'Kitchen',
            placedBy: '', // will be filled by party
          },
          {
            id: generateId(),
            type: 'air_mover',
            make: 'Dri-Eaz',
            model: 'Velo Pro',
            serialNumber: 'VP-10293',
            placedAt: new Date('2026-04-15T14:30:00Z'),
            placedRoom: 'Living Room',
            placedBy: '',
          },
        ],
      },

      moistureReadings: {
        create: [
          {
            id: generateId(),
            recordedBy: '', // filled by party
            timestamp: new Date('2026-04-15T15:00:00Z'),
            room: 'Kitchen',
            material: 'drywall',
            location: 'N wall, 12in from floor',
            readingPct: 28,
            dryStandard: 14,
          },
          {
            id: generateId(),
            recordedBy: '',
            timestamp: new Date('2026-04-16T09:00:00Z'),
            room: 'Kitchen',
            material: 'drywall',
            location: 'N wall, 12in from floor',
            readingPct: 22,
            dryStandard: 14,
          },
        ],
      },
    },
    include: { parties: true },
  });

  // Fix placedBy/recordedBy references
  const mitParty = job.parties.find(p => p.role === 'mitigation_company');
  if (mitParty) {
    await prisma.equipment.updateMany({
      where: { jobId, placedBy: '' },
      data: { placedBy: mitParty.id },
    });
    await prisma.moistureReading.updateMany({
      where: { jobId, recordedBy: '' },
      data: { recordedBy: mitParty.id },
    });
  }

  console.log(`✓ Created sample job: ${jobNumber} (${jobId})`);
  console.log(`  Claim: CLM-2026-087433 | State Farm | $45,000`);
  console.log(`  Status: drying | Category 2 | Class 3`);
  console.log(`  Parties: ${job.parties.length}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
