// ==========================================
// 1. CORE TYPE DEFINITIONS
// ==========================================

export type SpatialBucket =
  | "Kennebec"
  | "Oxford"
  | "Franklin"
  | "Augusta"
  | "Lewiston"
  | "Statewide";

export type GovernanceDomain =
  | "COMMUNITY"
  | "CLINICAL_BHP"
  | "MUNICIPAL"
  | "COUNTY_DA"
  | "MAINE_CDC"
  | "GRANT_AUDIT";

export type EvidenceCategory =
  | "Sharps & Biohazard Recovery"
  | "Naloxone Distribution"
  | "Outreach Contact"
  | "Referral / Warm Handoff"
  | "Public Hazard Report"
  | "Municipal Response";

export type VerificationStatus =
  | "PENDING"
  | "VERIFIED"
  | "CLOSED"
  | "ESCALATED";

export interface SafeTracksEvent {
  sequence_number: number;
  timestamp: string;
  spatial_bucket: SpatialBucket;
  temporal_bucket: string;
  governance_domain: GovernanceDomain;
  evidence_category: EvidenceCategory;
  verification_status: VerificationStatus;
  proof_metadata: {
    hcs_timestamp_placeholder: string;
    aleo_proof_hash: string;
  };
  audit_notes: string;
}

export interface Vector3Position {
  x: number;
  y: number;
  z: number;
}

export interface VisualNode {
  id: string;
  position: Vector3Position;
  label: string;
  radius: number;
  intensity: number;
  status: VerificationStatus;
  colorToken: string;
  proofHash: string;
  hcsTimestamp: string;
  metadata: Record<string, string | number>;
}

export interface VisualEdge {
  id: string;
  sourceId: string;
  targetId: string;
  weight: number;
  relationshipType: string;
}

// ==========================================
// 2. THE GOVERNANCE COORDINATE SYSTEM
// ==========================================

// X-Axis: Geography Bucket, left to right.
// This is symbolic civic geography, not GPS.
export const spatialBucketToX: Record<SpatialBucket, number> = {
  Oxford: -25,
  Franklin: -15,
  Lewiston: -5,
  Augusta: 5,
  Kennebec: 15,
  Statewide: 25,
};

// Y-Axis: Governance Layer, bottom to top.
export const governanceDomainToY: Record<GovernanceDomain, number> = {
  COMMUNITY: 0,
  CLINICAL_BHP: 8,
  MUNICIPAL: 16,
  COUNTY_DA: 24,
  MAINE_CDC: 32,
  GRANT_AUDIT: 40,
};

// Z-Axis: Evidence category depth.
// This prevents 2D clustering and gives semantic depth.
export const evidenceCategoryToZ: Record<EvidenceCategory, number> = {
  "Public Hazard Report": -12,
  "Sharps & Biohazard Recovery": -4,
  "Outreach Contact": 4,
  "Naloxone Distribution": 12,
  "Referral / Warm Handoff": 20,
  "Municipal Response": 28,
};

// Visual Encoding: Receipt Status -> Color & Scale.
export const verificationStatusToVisualStyle: Record<
  VerificationStatus,
  { color: string; radius: number }
> = {
  PENDING: { color: "#F59E0B", radius: 0.8 },
  VERIFIED: { color: "#10B981", radius: 1.0 },
  CLOSED: { color: "#3B82F6", radius: 0.6 },
  ESCALATED: { color: "#EF4444", radius: 1.2 },
};

// ==========================================
// 3. DETERMINISTIC MAPPING FUNCTIONS
// ==========================================

/**
 * Creates stable pseudo-random 3D offsets so receipts in the same bucket
 * do not perfectly overlap. This ensures the visual layout remains identical
 * across re-renders.
 */
const getDeterministicJitter = (sequence: number): Vector3Position => {
  const hashX = ((sequence * 137) % 100) / 100;
  const hashY = ((sequence * 251) % 100) / 100;
  const hashZ = ((sequence * 389) % 100) / 100;

  return {
    x: (hashX - 0.5) * 6,
    y: (hashY - 0.5) * 6,
    z: (hashZ - 0.5) * 6,
  };
};

export const mapEventToPosition = (event: SafeTracksEvent): Vector3Position => {
  const baseX = spatialBucketToX[event.spatial_bucket];
  const baseY = governanceDomainToY[event.governance_domain];
  const baseZ = evidenceCategoryToZ[event.evidence_category];

  const jitter = getDeterministicJitter(event.sequence_number);

  return {
    x: baseX + jitter.x,
    y: baseY + jitter.y,
    z: baseZ + jitter.z,
  };
};

export const getNodeAgeIntensity = (timestamp: string): number => {
  const eventTime = new Date(timestamp).getTime();
  const now = Date.now();
  const ageMs = now - eventTime;

  // Brightest at creation, fades to 20% opacity over 7 days.
  const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
  const intensity = 1.0 - Math.min(ageMs / maxAgeMs, 0.8);

  return Math.max(intensity, 0.2);
};

export const mapEventToVisualNode = (event: SafeTracksEvent): VisualNode => {
  const style = verificationStatusToVisualStyle[event.verification_status];

  return {
    id: `receipt-${event.sequence_number}`,
    position: mapEventToPosition(event),
    label: event.evidence_category,
    radius: style.radius,
    intensity: getNodeAgeIntensity(event.timestamp),
    status: event.verification_status,
    colorToken: style.color,
    proofHash: event.proof_metadata.aleo_proof_hash,
    hcsTimestamp: event.proof_metadata.hcs_timestamp_placeholder,
    metadata: {
      type: "Zero-PII Audit Receipt",
      sequence: event.sequence_number,
      spatial: event.spatial_bucket,
      temporal: event.temporal_bucket,
      domain: event.governance_domain,
      notes: event.audit_notes,
    },
  };
};

// ==========================================
// 4. RELATIONSHIP GENERATOR
// ==========================================

export const generateEdges = (events: SafeTracksEvent[]): VisualEdge[] => {
  const edges: VisualEdge[] = [];

  // Group by spatial and temporal buckets to constrain edge generation logically.
  const groups = new Map<string, SafeTracksEvent[]>();

  events.forEach((event) => {
    const key = `${event.spatial_bucket}-${event.temporal_bucket}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(event);
  });

  groups.forEach((groupEvents) => {
    const sorted = [...groupEvents].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const source = sorted[i];
        const target = sorted[j];

        let weight = 0;
        let relationshipType = "";

        if (
          source.evidence_category === "Public Hazard Report" &&
          target.evidence_category === "Municipal Response"
        ) {
          weight = target.verification_status === "VERIFIED" ? 0.9 : 0.4;
          relationshipType = "Hazard Closure";
        } else if (
          source.evidence_category === "Outreach Contact" &&
          target.evidence_category === "Referral / Warm Handoff"
        ) {
          weight = target.verification_status === "VERIFIED" ? 0.9 : 0.5;
          relationshipType = "Clinical Escalation";
        } else if (
          source.evidence_category === "Outreach Contact" &&
          target.evidence_category === "Naloxone Distribution"
        ) {
          weight = target.verification_status === "VERIFIED" ? 0.8 : 0.5;
          relationshipType = "Supply Follow-Up";
        }

        if (weight > 0) {
          edges.push({
            id: `edge-${source.sequence_number}-${target.sequence_number}`,
            sourceId: `receipt-${source.sequence_number}`,
            targetId: `receipt-${target.sequence_number}`,
            weight,
            relationshipType,
          });
        }
      }
    }
  });

  return edges;
};

// ==========================================
// 5. SECURE SYNTHETIC DATA GENERATOR
// ==========================================

const getWeekNumber = (d: Date): number => {
  const start = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor(
    (d.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)
  );
  return Math.floor(days / 7) + 1;
};

const randomPick = <T,>(arr: T[]): T =>
  arr[Math.floor(Math.random() * arr.length)];

export const generateMockSafeTracksEvent = (
  previousSequence = 184000
): SafeTracksEvent => {
  const spatialBuckets: SpatialBucket[] = [
    "Kennebec",
    "Oxford",
    "Franklin",
    "Augusta",
    "Lewiston",
    "Statewide",
  ];

  const domains: GovernanceDomain[] = [
    "COMMUNITY",
    "CLINICAL_BHP",
    "MUNICIPAL",
    "COUNTY_DA",
    "MAINE_CDC",
    "GRANT_AUDIT",
  ];

  const categories: EvidenceCategory[] = [
    "Sharps & Biohazard Recovery",
    "Naloxone Distribution",
    "Outreach Contact",
    "Referral / Warm Handoff",
    "Public Hazard Report",
    "Municipal Response",
  ];

  // Weighted to simulate a functioning governance pipeline.
  const statuses: VerificationStatus[] = [
    "PENDING",
    "VERIFIED",
    "VERIFIED",
    "CLOSED",
    "ESCALATED",
  ];

  const sequence = previousSequence + 1;
  const now = new Date();

  // Distribute mock events within the last 48 hours.
  const timeOffsetMs = Math.floor(Math.random() * 48 * 60 * 60 * 1000);
  const eventDate = new Date(now.getTime() - timeOffsetMs);
  const temporalBucket = `W${getWeekNumber(eventDate)}-${eventDate.getFullYear()}`;

  return {
    sequence_number: sequence,
    timestamp: eventDate.toISOString(),
    spatial_bucket: randomPick(spatialBuckets),
    temporal_bucket: temporalBucket,
    governance_domain: randomPick(domains),
    evidence_category: randomPick(categories),
    verification_status: randomPick(statuses),
    proof_metadata: {
      hcs_timestamp_placeholder: `0.0.${Math.floor(
        40000 + Math.random() * 10000
      )}-${Math.floor(eventDate.getTime() / 1000)}`,
      aleo_proof_hash: `ab3f${Math.random()
        .toString(16)
        .substring(2, 8)}...88e1`,
    },
    audit_notes:
      "Zero-PII receipt generated via field operations. Identity abstracted at source.",
  };
};
