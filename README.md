# SafeTracks MVP

A **privacy-preserving, cryptographically verifiable** community health reporting platform.

```
No PII → ZK Proof → Hedera HCS → Verifiable audit trail
```

---

## Architecture

```
User (QR Scan)
    │
    ▼
┌──────────────────────────────────────────────────────────┐
│  FRONTEND  (Next.js 14 + Tailwind)                       │
│  /           QR entry → create anonymous session         │
│  /consent    Cryptographic consent gate                  │
│  /survey     2–3 question anonymous health report        │
│  /reward     Variable reward + ZK proof + Hedera anchor  │
└─────────────────────┬────────────────────────────────────┘
                      │ REST API
                      ▼
┌──────────────────────────────────────────────────────────┐
│  BACKEND  (Express + TypeScript)                         │
│                                                          │
│  POST /session     → anonymous session init              │
│  POST /consent     → consent artifact (SHA-256)          │
│  POST /survey      → answers hashed, raw discarded       │
│  POST /reward      → variable reward (Huberman model)    │
│  POST /zk-proof    → ZK proof generation                 │
│  POST /anchor      → Hedera HCS submission               │
└──────┬───────────────────┬──────────────────────────────┘
       │                   │
       ▼                   ▼
  ┌─────────┐      ┌──────────────────┐
  │ SQLite  │      │  Hedera HCS      │
  │ (local) │      │  (testnet/main)  │
  └─────────┘      └──────────────────┘
```

---

## Privacy & HIPAA Design

### Why this avoids HIPAA violations

| Principle | Implementation |
|-----------|---------------|
| **No PII collected** | Sessions use random UUIDs. No name, email, phone, or device ID. |
| **No PHI on-chain** | Only SHA-256 hashes of answers land in the DB. Raw answers are discarded after hashing. |
| **Minimum necessary** | 3 questions only. No demographics collected. |
| **Separation of layers** | Identity (none), Data (hashed), Billing (consent-linked, not person-linked) |
| **Audit controls** | Every request logged with hashed IP (daily rotation), not raw IP |

### Zero-Knowledge Proof Layer

**What the circuit proves (without revealing):**
```
Given private inputs: consent_artifact, data_hash, reward_token, timestamp
Prove: SHA256(consent_artifact || data_hash || reward_token || timestamp) == proof_input_hash
       AND consent_artifact is non-zero (consent was actually given)
       AND reward_token is non-zero
```

**What the verifier learns:**
- `proof_input_hash` — a commitment to all private data
- `timestamp_commitment` — when the event occurred (no other timing info)

**Upgrade path to real ZK:**
```typescript
// Current (mock Groth16 structure):
const output = await generateProof(input); // zkService.ts

// Production (snarkjs drop-in):
import { groth16 } from 'snarkjs';
const { proof, publicSignals } = await groth16.fullProve(
  input, 'circuit.wasm', 'circuit_final.zkey'
);
```

### Hedera as Trust Layer

- Submits only `proof_input_hash` + `public_signals` to HCS
- Returns `transaction_id` + `consensus_timestamp` (aBFT finality, ~3s)
- HCS messages are immutable — anyone can verify the anchor occurred
- Cost: ~$0.0001 per message on mainnet

---

## Running Locally

### Prerequisites
- Node.js 18+
- (Optional) Free Hedera testnet account: https://portal.hedera.com

### Backend
```bash
cd backend
cp .env.example .env
# Edit .env — Hedera creds optional (system uses simulation if not set)
npm install
npm run dev       # http://localhost:3001
```

### Frontend
```bash
cd frontend
npm install
npm run dev       # http://localhost:3000
```

Then open http://localhost:3000 and scan or click "Begin Anonymous Report".

### Environment Variables

**backend/.env**
```env
HEDERA_ACCOUNT_ID=0.0.XXXXXXX      # From portal.hedera.com (testnet free)
HEDERA_PRIVATE_KEY=302e...          # ED25519 DER-encoded private key
HEDERA_TOPIC_ID=0.0.XXXXXXX        # Create via createAnchorTopic() once
PORT=3001
DATABASE_PATH=./safetracks.db
FRONTEND_URL=http://localhost:3000
```

**frontend/.env.local** (optional)
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/session` | POST | Create anonymous session |
| `/consent` | POST | Record cryptographic consent |
| `/survey/questions` | GET | Fetch survey questions |
| `/survey` | POST | Submit survey answers |
| `/reward` | POST | Issue variable reward |
| `/zk-proof` | POST | Generate ZK proof |
| `/zk-proof/verify` | POST | Verify a ZK proof |
| `/anchor` | POST | Anchor proof hash to Hedera HCS |
| `/reward/billing/:YYYY-MM` | GET | Monthly billing summary |
| `/health` | GET | Service health + config status |

---

## Database Schema

```
sessions          — ephemeral anonymous sessions (UUID only)
consent_events    — cryptographic consent artifacts (no PII)
surveys           — hashed survey data (raw answers never persisted)
rewards           — variable reward amounts + opaque redemption tokens
zk_proofs         — ZK proof artifacts (hashes only)
anchor_logs       — Hedera HCS transaction records
billing_events    — HIPAA-aware billing (consent-linked, not identity-linked)
```

---

## Reward System (Huberman Model)

Variable-ratio reinforcement schedule using cryptographically seeded randomness:

```
Base:   $2.00 – $5.00   (every session, uniform distribution)
Bonus:  $0.00 – $10.00  (log-normal — mostly small, occasionally large)
Spike:  $0.00 – $25.00  (8% probability — dopamine anticipation effect)
Rare:   $25.00 flat      (1% max spike — the jackpot moment)
```

Monthly target: **~$99/month** at 2–3 sessions/week.
All amounts tied to `consent_id`, not user identity.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router) + TailwindCSS |
| Backend | Express + TypeScript |
| Database | SQLite (better-sqlite3) |
| ZK Layer | Mock Groth16 structure → Circom/snarkjs drop-in |
| Blockchain | Hedera Hashgraph HCS |
| Hashing | SHA-256 (Node.js crypto — no external dep) |
