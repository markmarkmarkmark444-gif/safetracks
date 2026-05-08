// ─── Domain Types: Verified Restore — Insurance Restoration Platform ──────────

export type JobType = 'water' | 'fire' | 'mold' | 'storm' | 'multi';
export type JobStatus =
  | 'created'
  | 'active'
  | 'drying'
  | 'remediation'
  | 'reconstruction'
  | 'complete'
  | 'disputed'
  | 'closed';

export type PartyRole =
  | 'mitigation_company'
  | 'homeowner'
  | 'insurance_adjuster'
  | 'vendor'
  | 'subcontractor'
  | 'public_adjuster'
  | 'attorney';

export type DocumentType =
  | 'photo'
  | 'video'
  | 'moisture_log'
  | 'psychrometric_chart'
  | 'equipment_report'
  | 'xactimate_export'
  | 'work_plan_s500'
  | 'work_plan_s700'
  | 'certificate_of_completion'
  | 'scope_of_loss'
  | 'invoice'
  | 'subcontractor_receipt'
  | 'permit'
  | 'other';

export type EquipmentType =
  | 'dehumidifier'
  | 'air_mover'
  | 'air_scrubber'
  | 'hepa_air_scrubber'
  | 'hydroxyl_generator'
  | 'ozone_generator'
  | 'thermal_fogger'
  | 'desiccant_dehumidifier'
  | 'negative_air_machine'
  | 'moisture_meter'
  | 'thermo_hygrometer'
  | 'infrared_camera'
  | 'other';

export type MaterialClass = 'class_1' | 'class_2' | 'class_3' | 'class_4';
export type WaterCategory = 'category_1' | 'category_2' | 'category_3';
export type FireSmokeCategory =
  | 'wet_smoke'
  | 'dry_smoke'
  | 'protein_smoke'
  | 'fuel_oil_smoke'
  | 'other_smoke';

// ─── Core Entities ────────────────────────────────────────────────────────────

export interface RestorationJob {
  id: string;
  jobNumber: string;
  type: JobType;
  status: JobStatus;
  lossDate: string; // ISO date
  createdAt: string;
  updatedAt: string;

  // Location
  address: JobAddress;

  // Classification
  waterCategory?: WaterCategory;
  waterClass?: MaterialClass;
  fireCategory?: FireSmokeCategory;
  affectedRooms: string[];
  affectedSqFt: number;

  // Insurance
  claimNumber?: string;
  policyNumber?: string;
  insuranceCompany?: string;
  deductible?: number;
  estimatedLoss?: number;

  // Blockchain anchors
  hederaTopicId: string;
  hederaAccountId?: string;
  aleoCommitment?: string;
  aleoJobId?: string;

  // QR
  qrCodeUrl: string;
  qrCodeData: string;

  // Parties
  parties: JobParty[];
}

export interface JobAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  lat?: number;
  lng?: number;
}

export interface JobParty {
  id: string;
  jobId: string;
  role: PartyRole;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  licenseNumber?: string;
  walletAddress?: string;
  aleoAddress?: string;
  inviteToken?: string;
  acceptedAt?: string;
  createdAt: string;
}

// ─── Documents & Storage ─────────────────────────────────────────────────────

export interface JobDocument {
  id: string;
  jobId: string;
  uploadedBy: string; // partyId
  type: DocumentType;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  description?: string;

  // Bethelnet storage
  bethelnetCid: string;
  bethelnetZkProof: string;
  bethelnetChunkCount: number;
  bethelnetStorageNodeIds: string[];

  // On-chain anchors
  sha256Hash: string;
  hederaTxId: string;
  hederaSequenceNumber: number;
  aleoProofId?: string;

  tags: string[];
  createdAt: string;
}

// ─── Moisture & Psychrometric Data ───────────────────────────────────────────

export interface MoistureReading {
  id: string;
  jobId: string;
  recordedBy: string; // partyId
  timestamp: string;

  room: string;
  material: string;
  location: string; // e.g., "North wall, 12 inches from floor"
  readingPct: number; // moisture content %
  readingWme?: number; // wood moisture equivalent
  dryStandard: number; // target dry standard for this material
  equipmentId?: string;
  photoId?: string;

  hederaTxId?: string;
}

export interface PsychrometricReading {
  id: string;
  jobId: string;
  recordedBy: string;
  timestamp: string;

  room: string;
  temperatureF: number;
  relativeHumidityPct: number;
  dewPointF: number;
  grainsPerLb: number;
  specificHumidity?: number;
  wetBulbF?: number;
  vaporPressure?: number;

  // IICRC S500 drying goal thresholds
  dryingGoalTempF?: number;
  dryingGoalRhPct?: number;

  hederaTxId?: string;
}

// ─── Equipment Tracking ───────────────────────────────────────────────────────

export interface Equipment {
  id: string;
  jobId: string;
  type: EquipmentType;
  make: string;
  model: string;
  serialNumber: string;
  assetTag?: string;

  placedAt: string;
  removedAt?: string;
  placedRoom: string;
  placedBy: string; // partyId

  dailyRentalRate?: number;
  hoursOnJob?: number;

  hederaTxId?: string;
}

// ─── IICRC Compliance Templates ───────────────────────────────────────────────

export interface S500WorkPlan {
  jobId: string;
  version: string; // '2021'
  category: WaterCategory;
  classOfWaterDamage: MaterialClass;
  scopeOfWork: string;
  dryingProtocol: DryingProtocol;
  structuralDryingGoals: StructuralDryingGoal[];
  containmentRequired: boolean;
  antimicrobialApplied: boolean;
  antimicrobialProduct?: string;
  ppe: string[];
  generatedAt: string;
  signedByPartyId?: string;
  hederaTxId?: string;
}

export interface S700WorkPlan {
  jobId: string;
  version: string; // '2025'
  fireCategory: FireSmokeCategory;
  scopeOfWork: string;
  smokeRemovalProtocol: string;
  deodorizationMethod: string;
  contentsCleaning: boolean;
  packoutRequired: boolean;
  airQualityTesting: boolean;
  ppe: string[];
  generatedAt: string;
  signedByPartyId?: string;
  hederaTxId?: string;
}

export interface DryingProtocol {
  targetDaysToComplete: number;
  dailyReadingRequired: boolean;
  hepaFiltered: boolean;
  containmentType: 'none' | 'poly_barrier' | 'negative_pressure' | 'full_enclosure';
  demolitionRequired: boolean;
  demolitionScope?: string;
}

export interface StructuralDryingGoal {
  material: string;
  targetMoisturePct: number;
  baselineReadingPct: number;
}

// ─── Audit & Chain-of-Custody ─────────────────────────────────────────────────

export interface AuditEvent {
  id: string;
  jobId: string;
  actorPartyId: string;
  actorRole: PartyRole;
  eventType: string;
  description: string;
  metadata: Record<string, unknown>;
  hederaTxId: string;
  hederaSequenceNumber: number;
  timestamp: string;
}

export interface ChainOfCustodyRecord {
  jobId: string;
  hederaTopicId: string;
  events: AuditEvent[];
  totalMessages: number;
  startTime: string;
  lastUpdated: string;
  zkIntegrityProof?: string;
}

// ─── Report Generation ────────────────────────────────────────────────────────

export interface InsuranceReportRequest {
  jobId: string;
  includePhotos: boolean;
  includeEquipmentLogs: boolean;
  includePsychrometrics: boolean;
  includeMoistureLogs: boolean;
  includeAuditTrail: boolean;
  format: 'pdf' | 'json';
}

export interface InsuranceReport {
  id: string;
  jobId: string;
  generatedAt: string;
  generatedBy: string;
  version: number;
  pdfBethelnetCid?: string;
  jsonBethelnetCid?: string;
  sha256Hash: string;
  hederaTxId: string;
  summary: ReportSummary;
}

export interface ReportSummary {
  jobNumber: string;
  lossAddress: string;
  lossDate: string;
  claimNumber?: string;
  totalDryingDays: number;
  equipmentCount: number;
  documentCount: number;
  complianceStandards: string[];
  signedParties: string[];
}

// ─── API Contracts ────────────────────────────────────────────────────────────

export interface CreateJobRequest {
  type: JobType;
  lossDate: string;
  address: JobAddress;
  claimNumber?: string;
  policyNumber?: string;
  insuranceCompany?: string;
  estimatedLoss?: number;
  waterCategory?: WaterCategory;
  waterClass?: MaterialClass;
  fireCategory?: FireSmokeCategory;
  affectedSqFt: number;
  affectedRooms: string[];
  initialParties?: Omit<JobParty, 'id' | 'jobId' | 'createdAt'>[];
}

export interface CreateJobResponse {
  job: RestorationJob;
  qrCodeSvg: string;
  hederaTopicId: string;
  aleoCommitment: string;
}

export interface UploadDocumentRequest {
  jobId: string;
  partyId: string;
  type: DocumentType;
  description?: string;
  tags?: string[];
}

export interface UploadDocumentResponse {
  document: JobDocument;
  bethelnetCid: string;
  hederaTxId: string;
  zkProof: string;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthToken {
  partyId: string;
  jobId: string;
  role: PartyRole;
  exp: number;
  iat: number;
}

export interface ScanQRResponse {
  jobId: string;
  job: RestorationJob;
  accessToken: string;
  role: PartyRole;
  permissions: Permission[];
}

export type Permission =
  | 'job:read'
  | 'job:write'
  | 'document:upload'
  | 'document:read'
  | 'moisture:log'
  | 'equipment:manage'
  | 'report:generate'
  | 'report:read'
  | 'audit:read'
  | 'party:manage';

export const ROLE_PERMISSIONS: Record<PartyRole, Permission[]> = {
  mitigation_company: [
    'job:read', 'job:write', 'document:upload', 'document:read',
    'moisture:log', 'equipment:manage', 'report:generate', 'report:read',
    'audit:read', 'party:manage',
  ],
  homeowner: [
    'job:read', 'document:read', 'report:read', 'audit:read',
  ],
  insurance_adjuster: [
    'job:read', 'document:read', 'document:upload', 'report:generate',
    'report:read', 'audit:read',
  ],
  vendor: [
    'job:read', 'document:upload', 'document:read', 'equipment:manage',
  ],
  subcontractor: [
    'job:read', 'document:upload', 'document:read',
  ],
  public_adjuster: [
    'job:read', 'document:read', 'report:read', 'audit:read',
  ],
  attorney: [
    'job:read', 'document:read', 'audit:read',
  ],
};
