import { PrismaClient } from '@prisma/client';
import PDFDocument from 'pdfkit';
import {
  sha256Hex,
  generateId,
  S500_COMPLIANCE_CHECKLIST,
  S700_COMPLIANCE_CHECKLIST,
  WATER_CATEGORIES,
  WATER_CLASSES,
  FIRE_SMOKE_CATEGORIES,
} from '@safetracks/shared';
import { getBethelnetClient } from '@safetracks/storage';
import {
  submitJobMessage,
  makeReportGeneratedMessage,
} from '@safetracks/blockchain';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export async function generateInsuranceReport(
  jobId: string,
  generatedByPartyId: string,
): Promise<{
  reportId: string;
  pdfBuffer: Buffer;
  bethelnetCid: string;
  hederaTxId: string;
  sha256Hash: string;
}> {
  const job = await prisma.restorationJob.findUniqueOrThrow({
    where: { id: jobId },
    include: {
      parties: true,
      documents: { include: { uploader: true } },
      moistureReadings: { orderBy: { timestamp: 'asc' } },
      psychroReadings: { orderBy: { timestamp: 'asc' } },
      equipment: { orderBy: { placedAt: 'asc' } },
      s500WorkPlan: true,
      s700WorkPlan: true,
    },
  });

  const pdfBuffer = await buildPdf(job);
  const sha256Hash = sha256Hex(pdfBuffer);
  const reportId = generateId();

  // Upload PDF to Bethelnet
  const bethelnet = getBethelnetClient();
  const bethelnetResult = await bethelnet.uploadBuffer(pdfBuffer, {
    filename: `report-${job.jobNumber}-v${Date.now()}.pdf`,
    mimeType: 'application/pdf',
    tags: [jobId, 'insurance_report'],
    metadata: { jobId, reportId, jobNumber: job.jobNumber },
  });

  // Anchor on Hedera
  const hcsResult = await submitJobMessage(
    job.hederaTopicId,
    makeReportGeneratedMessage(jobId, reportId, sha256Hash, bethelnetResult.cid, generatedByPartyId),
  );

  // Persist report metadata
  const summary = {
    jobNumber: job.jobNumber,
    lossAddress: `${job.street}, ${job.city}, ${job.state} ${job.zip}`,
    lossDate: job.lossDate.toISOString(),
    claimNumber: job.claimNumber,
    totalDryingDays: calcDryingDays(job.moistureReadings),
    equipmentCount: job.equipment.length,
    documentCount: job.documents.length,
    complianceStandards: getComplianceStandards(job),
    signedParties: job.parties.filter(p => p.acceptedAt).map(p => p.name),
  };

  await prisma.insuranceReport.create({
    data: {
      id: reportId,
      jobId,
      generatedBy: generatedByPartyId,
      pdfBethelnetCid: bethelnetResult.cid,
      sha256Hash,
      hederaTxId: hcsResult.transactionId,
      summary,
    },
  });

  logger.info(`Report generated: ${reportId} for job ${jobId}`);

  return {
    reportId,
    pdfBuffer,
    bethelnetCid: bethelnetResult.cid,
    hederaTxId: hcsResult.transactionId,
    sha256Hash,
  };
}

// ─── PDF Builder ──────────────────────────────────────────────────────────────

async function buildPdf(job: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const colors = { primary: '#1B4F72', accent: '#2E86C1', gray: '#717D7E', light: '#EBF5FB' };

    // ── Cover Page ──
    doc.rect(0, 0, doc.page.width, 120).fill(colors.primary);
    doc.fillColor('white').fontSize(28).font('Helvetica-Bold')
      .text('VERIFIED RESTORE', 50, 30, { align: 'center' });
    doc.fontSize(14).text('Insurance Restoration Claim Package', 50, 65, { align: 'center' });
    doc.fontSize(10).text('Blockchain-Verified | IICRC Compliant | Tamper-Evident', 50, 88, { align: 'center' });

    doc.fillColor(colors.primary).fontSize(20).font('Helvetica-Bold')
      .text(`Job # ${job.jobNumber}`, 50, 145);
    doc.fillColor(colors.gray).fontSize(11).font('Helvetica')
      .text(`Loss Date: ${new Date(job.lossDate).toLocaleDateString()}`, 50, 170)
      .text(`Report Date: ${new Date().toLocaleDateString()}`, 50, 185)
      .text(`Loss Type: ${job.type.toUpperCase()}`, 50, 200);

    // Address box
    doc.rect(50, 220, 500, 80).fill(colors.light).stroke(colors.accent);
    doc.fillColor(colors.primary).fontSize(11).font('Helvetica-Bold')
      .text('Loss Location', 60, 230);
    doc.fillColor('#2C3E50').font('Helvetica')
      .text(`${job.street}`, 60, 248)
      .text(`${job.city}, ${job.state} ${job.zip}`, 60, 263);

    // Insurance info box
    if (job.claimNumber || job.insuranceCompany) {
      doc.rect(50, 315, 500, 80).fill(colors.light).stroke(colors.accent);
      doc.fillColor(colors.primary).fontSize(11).font('Helvetica-Bold').text('Insurance Information', 60, 325);
      doc.fillColor('#2C3E50').font('Helvetica');
      if (job.claimNumber) doc.text(`Claim #: ${job.claimNumber}`, 60, 343);
      if (job.policyNumber) doc.text(`Policy #: ${job.policyNumber}`, 60, 358);
      if (job.insuranceCompany) doc.text(`Carrier: ${job.insuranceCompany}`, 280, 343);
      if (job.estimatedLoss) doc.text(`Est. Loss: $${job.estimatedLoss.toLocaleString()}`, 280, 358);
    }

    // Blockchain verification box
    doc.rect(50, 410, 500, 90).fill('#E8F8F5').stroke('#27AE60');
    doc.fillColor('#1E8449').fontSize(11).font('Helvetica-Bold').text('Blockchain Verification', 60, 422);
    doc.fillColor('#2C3E50').font('Helvetica').fontSize(9)
      .text(`Hedera Topic: ${job.hederaTopicId}`, 60, 440)
      .text(`Aleo Commitment: ${job.aleoCommitment ?? 'Pending'}`, 60, 454)
      .text('Verify at: https://hashscan.io | https://explorer.aleo.org', 60, 468)
      .text('All data is cryptographically timestamped and tamper-evident.', 60, 482);

    doc.addPage();

    // ── Section 2: Parties ──
    sectionHeader(doc, '1. Parties of Record', colors.primary);
    doc.moveDown(0.5);

    for (const party of job.parties) {
      doc.fillColor(colors.primary).fontSize(10).font('Helvetica-Bold').text(formatRole(party.role), 50, doc.y);
      doc.fillColor('#2C3E50').font('Helvetica')
        .text(`${party.name}${party.company ? ` — ${party.company}` : ''}`, 160, doc.y - 12)
        .text(party.email, 160, doc.y)
        .text(party.phone ?? '', 160, doc.y);
      doc.moveDown(0.5);
    }

    doc.addPage();

    // ── Section 3: Job Classification ──
    sectionHeader(doc, '2. Damage Classification (IICRC)', colors.primary);
    doc.moveDown(0.5);

    if (job.waterCategory) {
      const cat = WATER_CATEGORIES[job.waterCategory as keyof typeof WATER_CATEGORIES];
      infoRow(doc, 'Water Category', cat.label, colors);
      infoRow(doc, 'Description', cat.description, colors);
      infoRow(doc, 'Health Risk', cat.healthRisk, colors);
    }
    if (job.waterClass) {
      const cls = WATER_CLASSES[job.waterClass as keyof typeof WATER_CLASSES];
      infoRow(doc, 'Moisture Class', cls.label, colors);
      infoRow(doc, 'Typical Drying', cls.typicalDryingDays + ' days', colors);
    }
    if (job.fireCategory) {
      const fire = FIRE_SMOKE_CATEGORIES[job.fireCategory as keyof typeof FIRE_SMOKE_CATEGORIES];
      infoRow(doc, 'Smoke Type', fire.label, colors);
      infoRow(doc, 'Cleaning Method', fire.cleaningMethod, colors);
    }

    infoRow(doc, 'Affected Area', `${job.affectedSqFt} sq ft`, colors);
    infoRow(doc, 'Affected Rooms', job.affectedRooms.join(', '), colors);

    doc.addPage();

    // ── Section 4: Equipment Log ──
    sectionHeader(doc, '3. Equipment Deployment Log', colors.primary);
    doc.moveDown(0.5);

    if (job.equipment.length === 0) {
      doc.fillColor(colors.gray).text('No equipment records found.');
    } else {
      tableRow(doc, ['Type', 'Make/Model', 'Serial #', 'Room', 'Placed', 'Removed'], true, colors);
      for (const eq of job.equipment) {
        tableRow(doc, [
          formatEquipmentType(eq.type),
          `${eq.make} ${eq.model}`,
          eq.serialNumber,
          eq.placedRoom,
          new Date(eq.placedAt).toLocaleDateString(),
          eq.removedAt ? new Date(eq.removedAt).toLocaleDateString() : 'Active',
        ], false, colors);
      }
    }

    doc.addPage();

    // ── Section 5: Moisture Readings ──
    sectionHeader(doc, '4. Daily Moisture Monitoring', colors.primary);
    doc.moveDown(0.5);

    if (job.moistureReadings.length === 0) {
      doc.fillColor(colors.gray).text('No moisture readings recorded.');
    } else {
      tableRow(doc, ['Date', 'Room', 'Material', 'Location', 'Reading %', 'Dry Std', 'Status'], true, colors);
      for (const r of job.moistureReadings) {
        const status = r.readingPct <= r.dryStandard ? 'DRY ✓' : 'WET';
        tableRow(doc, [
          new Date(r.timestamp).toLocaleDateString(),
          r.room,
          r.material,
          r.location.slice(0, 20),
          `${r.readingPct}%`,
          `${r.dryStandard}%`,
          status,
        ], false, colors);
      }
    }

    doc.addPage();

    // ── Section 6: Psychrometrics ──
    sectionHeader(doc, '5. Psychrometric Data (S500 §12)', colors.primary);
    doc.moveDown(0.5);

    if (job.psychroReadings.length === 0) {
      doc.fillColor(colors.gray).text('No psychrometric readings recorded.');
    } else {
      tableRow(doc, ['Date', 'Room', 'Temp °F', 'RH %', 'Dew Pt °F', 'Grains/lb'], true, colors);
      for (const r of job.psychroReadings) {
        tableRow(doc, [
          new Date(r.timestamp).toLocaleDateString(),
          r.room,
          r.temperatureF.toFixed(1),
          r.relativeHumidityPct.toFixed(1),
          r.dewPointF.toFixed(1),
          r.grainsPerLb.toFixed(1),
        ], false, colors);
      }
    }

    doc.addPage();

    // ── Section 7: Document Index ──
    sectionHeader(doc, '6. Document Index (Blockchain-Verified)', colors.primary);
    doc.moveDown(0.5);
    doc.fillColor(colors.gray).fontSize(9)
      .text('All files below are stored on Bethelnet decentralized storage with ZK proof of integrity.');
    doc.moveDown(0.5);

    for (const d of job.documents) {
      doc.fillColor(colors.primary).fontSize(9).font('Helvetica-Bold')
        .text(formatDocType(d.type), 50, doc.y);
      doc.fillColor('#2C3E50').font('Helvetica')
        .text(`  ${d.filename} — ${formatBytes(Number(d.sizeBytes))} — ${new Date(d.createdAt).toLocaleDateString()}`, 50, doc.y)
        .text(`  Bethelnet CID: ${d.bethelnetCid}`, 50, doc.y)
        .text(`  SHA-256: ${d.sha256Hash}`, 50, doc.y)
        .text(`  Hedera TX: ${d.hederaTxId}`, 50, doc.y);
      doc.moveDown(0.3);
    }

    doc.addPage();

    // ── Section 8: IICRC Compliance Checklist ──
    sectionHeader(doc, '7. IICRC Compliance Checklist', colors.primary);
    doc.moveDown(0.5);

    const checklist = job.type === 'fire' || job.type === 'mold'
      ? S700_COMPLIANCE_CHECKLIST
      : S500_COMPLIANCE_CHECKLIST;

    for (const item of checklist) {
      doc.fillColor('#2C3E50').fontSize(9).text(`☐  ${item}`, 60, doc.y);
      doc.moveDown(0.3);
    }

    doc.addPage();

    // ── Section 9: Audit Trail Summary ──
    sectionHeader(doc, '8. Blockchain Audit Trail', colors.primary);
    doc.moveDown(0.5);
    doc.fillColor('#2C3E50').fontSize(9)
      .text(`Hedera Topic ID: ${job.hederaTopicId}`)
      .text(`Network: ${process.env['HEDERA_NETWORK'] ?? 'testnet'}`)
      .text(`Verify at: https://hashscan.io/testnet/topic/${job.hederaTopicId}`)
      .moveDown(0.5)
      .text('Every event in this claim (job creation, document uploads, moisture readings,')
      .text('equipment placements, and report generation) has been immutably timestamped')
      .text('on the Hedera network and can be independently verified by any party.');

    if (job.aleoCommitment) {
      doc.moveDown(0.5)
        .text('Aleo ZK Privacy Commitment:')
        .text(job.aleoCommitment)
        .moveDown(0.3)
        .text('This commitment proves insurance data integrity without revealing PII.');
    }

    // ── Footer on each page ──
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      doc.fillColor(colors.gray).fontSize(8)
        .text(
          `SafeTracks Verified Restore | Job ${job.jobNumber} | Page ${i + 1} of ${totalPages}`,
          50, doc.page.height - 40, { align: 'center', width: 500 },
        );
    }

    doc.end();
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sectionHeader(doc: PDFKit.PDFDocument, title: string, color: string): void {
  doc.rect(50, doc.y, 500, 24).fill(color);
  doc.fillColor('white').fontSize(12).font('Helvetica-Bold')
    .text(title, 58, doc.y - 20);
  doc.moveDown(1.2);
}

function infoRow(doc: PDFKit.PDFDocument, label: string, value: string, colors: any): void {
  doc.fillColor(colors.primary).fontSize(9).font('Helvetica-Bold')
    .text(label + ':', 50, doc.y, { continued: true, width: 150 });
  doc.fillColor('#2C3E50').font('Helvetica')
    .text(' ' + value, { width: 350 });
  doc.moveDown(0.3);
}

function tableRow(doc: PDFKit.PDFDocument, cells: string[], isHeader: boolean, colors: any): void {
  const x = 50;
  const colWidth = 500 / cells.length;

  if (isHeader) {
    doc.rect(x, doc.y, 500, 16).fill(colors.accent);
    doc.fillColor('white').fontSize(8).font('Helvetica-Bold');
  } else {
    doc.fillColor('#2C3E50').fontSize(8).font('Helvetica');
  }

  cells.forEach((cell, i) => {
    doc.text(cell, x + i * colWidth + 2, doc.y + (isHeader ? 3 : 2), {
      width: colWidth - 4,
      ellipsis: true,
    });
  });

  doc.moveDown(0.8);
}

function formatRole(role: string): string {
  return role.split('_').map(w => w[0]!.toUpperCase() + w.slice(1)).join(' ');
}

function formatDocType(type: string): string {
  return type.split('_').map(w => w[0]!.toUpperCase() + w.slice(1)).join(' ');
}

function formatEquipmentType(type: string): string {
  return type.split('_').map(w => w[0]!.toUpperCase() + w.slice(1)).join(' ');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function calcDryingDays(readings: any[]): number {
  if (readings.length < 2) return 0;
  const first = new Date(readings[0].timestamp).getTime();
  const last = new Date(readings[readings.length - 1].timestamp).getTime();
  return Math.ceil((last - first) / (1000 * 60 * 60 * 24));
}

function getComplianceStandards(job: any): string[] {
  const standards = ['IICRC'];
  if (['water', 'storm'].includes(job.type)) standards.push('S500-2021');
  if (['fire', 'mold'].includes(job.type)) standards.push('S700-2025');
  if (job.type === 'mold') standards.push('S520');
  return standards;
}
