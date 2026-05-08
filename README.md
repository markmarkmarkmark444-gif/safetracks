# SafeTracks — Verified Restore: Insurance Restoration Platform

> Blockchain-verified, IICRC S500/S700 compliant insurance restoration documentation system.
> Built on **Hedera Hashgraph** + **Aleo ZK** + **Bethelnet ZKP Storage**.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     VERIFIED RESTORE — INSURANCE                        │
│                         (Parallel to Public Health)                     │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────────┐
│  Mobile App  │  │  Web App     │  │  External Parties                │
│ (React Native│  │  (Next.js)   │  │  (Insurance adjuster, homeowner) │
│  Expo)       │  │              │  │                                  │
└──────┬───────┘  └──────┬───────┘  └───────────────┬──────────────────┘
       │                 │                           │
       │    QR Scan / REST API                       │ Scan QR Code
       ▼                 ▼                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Express API (Node.js)                           │
│                                                                         │
│  POST /api/jobs          → Create job, QR code, HCS topic               │
│  POST /api/uploads       → Route file to Bethelnet or local             │
│  POST /api/moisture/reading → Log moisture reading → Hedera             │
│  POST /api/moisture/psychro → Log psychrometric data                    │
│  POST /api/equipment     → Place/remove equipment → Hedera              │
│  POST /api/reports/:id/generate → Build PDF → Bethelnet → Hedera       │
│  GET  /api/audit/:jobId  → Mirror node audit trail                      │
└───────────────┬──────────────────────────────┬──────────────────────────┘
                │                              │
         ┌──────▼──────┐               ┌──────▼──────┐
         │  PostgreSQL  │               │  Blockchain  │
         │  (Prisma)    │               │  Layer       │
         │              │               └──────┬──────┘
         │  Jobs        │                      │
         │  Parties     │         ┌────────────┼────────────┐
         │  Documents   │         │            │            │
         │  Moisture    │         ▼            ▼            ▼
         │  Equipment   │   ┌──────────┐ ┌─────────┐ ┌──────────────┐
         │  Reports     │   │  Hedera  │ │  Aleo   │ │  Bethelnet   │
         └──────────────┘   │  HCS     │ │  ZK     │ │  ZKP Storage │
                            │          │ │ Program  │ │              │
                            │ Topic per│ │          │ │ Large files: │
                            │ job =    │ │ Privacy  │ │ photos,      │
                            │ immutable│ │ commitmt │ │ videos,      │
                            │ audit    │ │ Doc proof│ │ PDFs,        │
                            │ trail    │ │ Access   │ │ Xactimate    │
                            │          │ │ proof    │ │              │
                            │ ~$0.0001 │ │          │ │ Returns:     │
                            │ per msg  │ │          │ │ CID + ZKproof│
                            └──────────┘ └─────────┘ └──────────────┘
```

## Integration Flow: Hedera → Aleo → Bethelnet

### Job Creation
```
1. API creates job in PostgreSQL
2. API calls Hedera: TopicCreateTransaction() → unique HCS Topic ID
3. API calls Aleo: commit_job() → privacy commitment (Poseidon hash of PII)
4. QR code generated: encodes jobId + hederaTopicId + checksum
5. HCS message submitted: { type: JOB_CREATED, jobId, aleoCommitment }
```

### Document Upload
```
1. Party scans QR → email login → JWT issued with role
2. File uploaded to API (up to 500 MB)
3. If file >= 512 KB → Bethelnet.uploadBuffer()
   - Bethelnet chunks file → distributes to DeStor nodes
   - Returns: CID + ZK storage proof + chunk manifest
4. Aleo: prove_document_integrity() → doc integrity ZK proof
5. HCS message: { type: DOCUMENT_UPLOADED, bethelnetCid, sha256Hash }
6. PostgreSQL: store doc metadata (NOT the file itself)
```

### Report Generation
```
1. PDF built from all DB records (moisture, psychro, equipment, documents)
2. PDF uploaded to Bethelnet → CID returned
3. HCS message: { type: REPORT_GENERATED, pdfCid, sha256Hash }
4. Insurance adjuster can download PDF → verify against Hedera CID hash
```

## Data Model

```
RestorationJob
├── id, jobNumber, type (water/fire/mold), status
├── address (street, city, state, zip)
├── claimNumber, policyNumber, insuranceCompany (insurance metadata)
├── hederaTopicId → links to HCS topic (audit trail)
├── aleoCommitment → privacy-preserving hash of PII
├── qrCodeUrl, qrCodeData
├── parties[] → JobParty (role, email, Aleo address)
├── documents[] → JobDocument (bethelnetCid, zkProof, hederaTxId)
├── moistureReadings[] → MoistureReading (hederaTxId)
├── psychroReadings[] → PsychrometricReading
├── equipment[] → Equipment (hederaTxId)
├── s500WorkPlan → S500WorkPlan
├── s700WorkPlan → S700WorkPlan
└── reports[] → InsuranceReport (pdfBethelnetCid, hederaTxId)
```

## Cost Estimation (Hedera Testnet → Mainnet)

| Operation | Cost (HBAR) | USD (at $0.08/HBAR) |
|---|---|---|
| Create HCS Topic | ~0.05 HBAR | ~$0.004 |
| Submit HCS Message | ~0.0001 HBAR | ~$0.000008 |
| 50 messages/job | ~0.005 HBAR | ~$0.0004 |
| **Total Hedera/job** | **~0.055 HBAR** | **~$0.004** |

| Bethelnet Storage | Cost |
|---|---|
| Per GB stored (est.) | ~$0.01–0.05/GB/month |
| Typical water job (200 photos + video + PDFs ~2 GB) | ~$0.10–0.20/month |
| Large fire job (4K video, full scope, 5 GB) | ~$0.25–0.50/month |
| **Total Bethelnet/job** | **~$1–5 for 12 months** |

**Total blockchain + storage cost per $10k–$100k job: ~$2–10 USD**

## Role-Based Access Control

| Role | Permissions |
|---|---|
| mitigation_company | Full access — create jobs, upload, log moisture, manage equipment, generate reports |
| homeowner | Read job, read documents, read reports, read audit trail |
| insurance_adjuster | Read/upload documents, generate reports, read audit trail |
| vendor | Read job, upload documents, manage equipment |
| subcontractor | Read job, upload documents |
| public_adjuster | Read job, documents, reports, audit trail |
| attorney | Read job, documents, audit trail |

## Directory Structure

```
safetracks/
├── apps/
│   ├── api/              # Node.js Express API (port 4000)
│   ├── web/              # Next.js dashboard (port 3000)
│   └── mobile/           # React Native / Expo
├── packages/
│   ├── shared/           # Types, IICRC constants, utilities
│   ├── blockchain/       # Hedera + Aleo clients
│   └── storage/          # Bethelnet client
├── aleo/
│   └── restoration_proof/
│       └── src/main.leo  # Leo ZK program
├── prisma/
│   └── schema.prisma     # Database schema
├── docker/               # Dockerfiles + docker-compose
├── scripts/              # Setup and deployment scripts
└── .env.example          # Environment variable template
```

## Quick Start (Testnet)

```bash
# 1. Clone and configure
cp .env.example .env
# Fill in HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY, BETHELNET_API_KEY

# 2. Start database
docker compose -f docker/docker-compose.yml up postgres -d

# 3. Setup
./scripts/setup-testnet.sh

# 4. Run
npm run dev   # starts API + web dashboard simultaneously

# 5. Deploy Aleo program (optional, uses Aleo testnet)
./scripts/deploy-aleo.sh testnet
```

## IICRC Compliance

- **S500-2021 (Water Damage):** Category 1/2/3, Class 1/2/3/4, daily moisture monitoring, psychrometric tracking, structural drying goals
- **S700-2025 (Fire/Smoke):** Wet/Dry/Protein/Fuel oil smoke categories, deodorization protocols, air quality testing thresholds
- All compliance checklists are enforced in PDF report generation and visible in the web dashboard

## Shared Codebase with Public Health Version

The `packages/shared`, `packages/blockchain` (Hedera + Aleo), and core API patterns are identical between the public health version and this insurance version. Only these components are insurance-specific:

- `packages/storage` — Bethelnet client (new, replaces inline storage)
- `prisma/schema.prisma` — Extended with restoration-specific tables
- `packages/shared/src/constants/iicrc.ts` — S500/S700 standards (new)
- `apps/api/src/services/report.service.ts` — Insurance PDF generation (new)
- Equipment tracking, moisture/psychrometric logging — new for insurance

**Shared code reuse: ~80%+**
