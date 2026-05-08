# SafeTracks — Project Context & Status

> Last updated: 2026-05-08  
> Read this before touching any code.

---

## Two Branches — Know Which One You're On

| Branch | Purpose | Status |
|---|---|---|
| `claude/insurance-restoration-platform-ZaMO7` | Full architecture spec | Scaffolded — not pilot-ready |
| `v1-pilot` | Stripped-down, deployable pilot | Active development — **use this** |

**For Power Dry's first live job: work on `v1-pilot` only.**

---

## What's Actually Working vs. Scaffolded

| Component | v1-pilot Status | Notes |
|---|---|---|
| Hedera HCS timestamping | **Code complete — needs live testnet account** | Get account at portal.hedera.com, fill `.env`, test with `scripts/test-hedera.sh` |
| IPFS storage via Pinata | **Code complete — needs API key** | Free tier at pinata.cloud, fill `PINATA_JWT` in `.env` |
| PDF report generation | **Code complete** | PDFKit, no external dependency |
| QR code generation | **Code complete** | Pure Node.js |
| PostgreSQL database | **Schema complete — needs running Postgres** | `docker compose up postgres -d` |
| Web dashboard | **Scaffolded** | Renders but not field-tested |
| Mobile app | **Scaffolded** | Not field-tested |
| AI vision (meter OCR, damage classifier) | **Code complete — needs ANTHROPIC_API_KEY** | Uses Claude claude-opus-4-7 |

**Aleo ZK proofs: intentionally removed from v1-pilot.** See below.

---

## Why Aleo Was Removed for v1

Aleo requires:
1. The `leo` CLI installed locally
2. A deployed program on the Aleo testnet (`restoration_proof_v1.aleo`)
3. A funded Aleo account for gas
4. ~hours of compilation/deployment setup

None of that is needed to prove the core value of SafeTracks to an adjuster.
**Hedera HCS alone gives you an immutable, timestamped, independently verifiable audit trail.**

Aleo ZK privacy commitments are a compelling v2 feature — added when you have a
carrier pilot in place and want to prove compliance with state privacy regulations.
The code is preserved in `packages/blockchain/src/aleo/` but is not called.

---

## Why Pinata Replaced Bethelnet

Bethelnet (`bethelnet.io`) was referenced in the original architecture spec but
its production readiness is unconfirmed — we could not verify an active API or
documentation comparable to established IPFS services.

Pinata is:
- Used in production by thousands of web3 apps
- Has a documented REST API (`api.pinata.cloud`)
- Has a free tier (1 GB pinned storage)
- Returns standard IPFS CIDs retrievable from any IPFS gateway
- Takes ~5 minutes to sign up and get a JWT

**The storage abstraction is identical** — same interface, same CID concept.
If you later want to add Filecoin, Arweave, or even S3 as a backend, the
`packages/storage` package is the only thing that changes.

---

## Minimum Viable .env for v1 Pilot

```bash
# Database
DATABASE_URL="postgresql://safetracks:password@localhost:5432/safetracks_dev"

# Auth
JWT_SECRET="$(openssl rand -hex 32)"   # run this, paste result

# Hedera testnet (portal.hedera.com — free account)
HEDERA_NETWORK="testnet"
HEDERA_ACCOUNT_ID="0.0.XXXXXXX"
HEDERA_PRIVATE_KEY="302e..."

# Pinata IPFS (pinata.cloud — free tier)
PINATA_JWT="eyJ..."

# Claude AI vision (console.anthropic.com)
ANTHROPIC_API_KEY="sk-ant-..."

# Web
WEB_BASE_URL="http://localhost:3000"
NEXT_PUBLIC_API_URL="http://localhost:4000"
```

Everything else in `.env.example` is optional for the pilot.

---

## The Actual v1 User Flow (Power Dry Pilot)

```
Tech arrives on job
  → Opens web app / mobile app
  → Creates job (address, type, claim #, policy #)
       → Hedera HCS topic created (1 API call, ~$0.004)
       → QR code generated
  → Takes photos throughout job
       → Each photo uploaded → Pinata IPFS → CID returned
       → SHA-256 hash + CID anchored to Hedera HCS
  → Logs moisture readings daily
       → Each reading anchored to Hedera HCS
  → Places/removes equipment
       → Each event anchored to Hedera HCS
  → Generates report at job close
       → PDF built from all DB records
       → PDF uploaded to Pinata → CID
       → PDF CID anchored to Hedera HCS

Adjuster receives PDF
  → PDF contains Hedera topic ID + transaction IDs
  → Opens HashScan (hashscan.io), enters topic ID
  → Sees every event in chronological order, tamper-proof
  → Can download any photo from IPFS using CID in PDF
  → Verifies SHA-256 of photo matches what's on chain
```

**That's the demo. That's what wins the pilot.**

---

## What's Intentionally Not in v1

- Aleo ZK proofs (v2 — privacy compliance layer)
- Bethelnet / custom DeStor nodes (unverified)
- RiskStream interoperability export endpoint (v2 — after carrier pilot)
- Full carrier-facing portal (v2)
- Mobile offline mode (v2)
- Automated IICRC checklist enforcement (partial — PDF includes checklists)

---

## Key File Locations

```
packages/storage/src/pinata/    → IPFS storage (Pinata)
packages/blockchain/src/hedera/ → Hedera HCS client + messages
packages/blockchain/src/aleo/   → Aleo ZK (preserved, not called in v1)
apps/api/src/services/          → Core business logic
apps/api/src/routes/            → Express API endpoints
apps/web/                       → Next.js dashboard
apps/mobile/                    → React Native (Expo)
prisma/schema.prisma            → Database schema
```

---

## First Steps to Get Running

```bash
# 1. Start Postgres
docker compose -f docker/docker-compose.yml up postgres -d

# 2. Configure environment
cp .env.example .env
# Edit .env — fill in HEDERA_*, PINATA_JWT, JWT_SECRET, ANTHROPIC_API_KEY

# 3. Run
./start.sh
```

For Hedera testnet account: https://portal.hedera.com (takes 2 minutes, free)  
For Pinata JWT: https://app.pinata.cloud/developers/api-keys (free tier, 1 GB)
