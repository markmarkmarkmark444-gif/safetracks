# ADR-001: Hedera Consensus Service as the Immutable Audit Layer

**Status:** Accepted  
**Date:** May 2026  
**Deciders:** Azimuth Foundation Inc. Technical Committee  
**Applicability:** SafeTracks SHARPS_COLLECTION — all field event anchoring  

---

## Context

SafeTracks requires an immutable, publicly verifiable audit log for every
sharps collection event and FTIR drug-checking result. The log must satisfy
four simultaneous requirements:

1. **Tamper evidence** — Azimuth Foundation should not be able to silently
   modify or delete event records without that modification being detectable
   by an independent third party (grant auditors, state health departments,
   federal oversight bodies).

2. **Public verifiability at no cost to the verifier** — Research partners
   at UMaine, the Maine Drug Data Hub, and SAMHSA must be able to confirm
   data integrity without running any infrastructure or holding any tokens.

3. **Predictable, grant-budgetable cost** — Azimuth is a 501(c)(3) with
   grant-cycle funding. Transaction costs that fluctuate by 10–100× (as
   Ethereum gas fees do) are operationally incompatible with nonprofit budgeting.

4. **Privacy-preserving by design** — Only hashes and census-tract-level
   aggregates go on the public ledger. Exact GPS coordinates remain exclusively
   in Supabase behind RLS. The ledger technology must not impose any data
   structure that would make re-identification easier.

We evaluated four candidate technologies against these requirements.

---

## Decision

**Use Hedera Consensus Service (HCS)** on the Hedera public mainnet.

HCS is Hedera's append-only message log. Each `TopicMessageSubmitTransaction`
produces a consensus timestamp with aBFT (Asynchronous Byzantine Fault
Tolerant) finality, publicly queryable via the Hedera mirror node REST API
and the Hashscan block explorer with no authentication or token holdings.

---

## Rationale

### 1. aBFT Finality vs. Probabilistic Finality

Ethereum and its L2s use probabilistic finality — a block is "final" only
after N subsequent blocks confirm it (typically 12–64 blocks, taking
3–15 minutes on mainnet). Reorgs, while rare, can reverse recent transactions.

Hedera's hashgraph algorithm achieves **mathematical aBFT finality in 3–5
seconds**. Once a message appears in a Hedera consensus round, it cannot
be reversed under any network condition short of >⅔ of Governing Council
members colluding. For a tamper-evident health data audit trail, mathematical
certainty is more appropriate than probabilistic confidence.

### 2. Cost Predictability (Critical for Nonprofit Operations)

| Platform | Cost per event anchor | Annual cost @ 100k events/yr |
|---|---|---|
| Ethereum mainnet | $0.50 – $50.00 (gas volatility) | $50,000 – $5,000,000 |
| Polygon PoS (L2) | $0.01 – $0.50 | $1,000 – $50,000 |
| **Hedera HCS** | **~$0.0001 (USD-denominated)** | **~$10** |
| Hyperledger Fabric | $0 (permissioned) | Validator node infra: $5,000–20,000/yr |

Hedera charges are denominated in USD (not HBAR speculation), billed through
the Hedera Portal. Azimuth can line-item this cost in grant budgets as
"blockchain audit fees: $10–50/year." No ETH/HBAR price-risk exposure.

### 3. Carbon Footprint and ESG Alignment

Hedera Hashgraph consensus consumes approximately **0.00017 kWh per
transaction** — orders of magnitude below Ethereum proof-of-work (before
the Merge) and significantly below Ethereum proof-of-stake.

The Hedera Council has certified Hedera as **carbon-negative** through
verified offset certificates. For a public health nonprofit positioning
itself for ESG-aligned grants and ESRS-framework reporting, anchoring to a
carbon-negative ledger is a substantive differentiator.

### 4. Public Verifiability Without Token Holdings

Any researcher can verify a SafeTracks HCS message by:

```
GET https://mainnet-public.mirrornode.hedera.com/api/v1/topics/{TOPIC_ID}/messages/{SEQ_NUMBER}
```

The response includes the JSON payload and consensus timestamp. No wallet,
no tokens, no gas. This is analogous to verifying a certificate transparency
log — a public append-only record anyone can audit.

Ethereum-based alternatives require either running a node or trusting a
centralized RPC provider (Infura, Alchemy), which introduces a trust
assumption. HCS mirror nodes are operated by multiple independent entities
(Google, IBM, Swirlds) with public SLAs.

### 5. Governance Model Appropriate for Healthcare Data

Hedera's Governing Council includes Google, IBM, LG Electronics, Boeing,
Deutsche Telekom, and Ubisoft, each holding one vote. The hashgraph
protocol is governed by an LLC agreement, not an anonymous miner community.
This governance structure is compatible with:

- **HIPAA Business Associate Agreement (BAA) discussions** — there is a
  known legal entity to negotiate with
- **Grant audit requirements** — "we use a Google/IBM-governed ledger"
  is more auditor-legible than "we use a pseudonymous miner network"
- **CJIS Compliance Note (Section 20.2)** — the Council's known-entity
  governance supports data-use policy enforcement

### 6. Prior Healthcare Precedent

Hedera HCS is used by:
- **The Counsyl/Myriad Genetics** supply chain integrity program
- **ServiceNow** for healthcare workflow audit trails
- **Avery Dennison** for pharmaceutical track-and-trace

This precedent demonstrates that HCS is operationally viable in regulated
healthcare-adjacent contexts, reducing legal and compliance risk for Azimuth.

---

## Alternatives Considered and Rejected

### Ethereum Mainnet
**Rejected.** Gas cost volatility makes budget forecasting impossible for a
nonprofit. 15-minute probabilistic finality is slower than needed. No
meaningful cost or governance advantage over HCS.

### Polygon PoS (Ethereum L2)
**Rejected.** Lower fees than mainnet but still denominated in volatile MATIC.
Polygon has experienced multiple reorg incidents. Validator set less
decentralized than presented. Privacy tooling ecosystem less mature for
healthcare-adjacent use.

### Hyperledger Fabric (Permissioned)
**Rejected.** The core audit trail requirement is *public* verifiability —
a permissioned chain that only Azimuth and its partners can read does not
satisfy the independent verification requirement. Additionally, operating
Fabric ordering and peer nodes requires dedicated infrastructure and
engineering capacity a small nonprofit cannot sustain.

### PostgreSQL Append-Only Audit Log
**Rejected as sole mechanism.** An append-only PostgreSQL log controlled by
Azimuth can be modified by Azimuth database administrators. It cannot satisfy
the tamper-evidence requirement. However, PostgreSQL remains the operational
data store (via Supabase) — Hedera provides independent verification of the
hashes that PostgreSQL stores.

### Ethereum Attestation Service (EAS) on Base L2
**Considered but deferred.** EAS is architecturally interesting for structured
attestations. Deferred pending EAS mainnet stability and healthcare attestation
schema standardization. Could complement HCS in a future version (HCS for
audit timestamps, EAS for structured claim attestations).

---

## Consequences

**Positive:**
- Audit trail is independently verifiable by any party with internet access
- Annual costs are negligible and predictable
- Carbon-negative alignment supports ESG grant applications
- Legal entity (Hedera LLC) can sign MOUs if required by state health department

**Negative / Accepted Risks:**
- Hedera is less developer-familiar than Ethereum ecosystem
- HBAR-denominated wallet required for paying HCS fees (small HBAR holdings needed)
- If Hedera Governing Council dissolves, mirror nodes and historical data remain
  accessible but future writes would require migration

**Migration Path:**
The HCS message payload is self-contained JSON. If Hedera becomes unavailable,
the same payload format can be submitted to any alternative append-only log
(IPFS + Ethereum timestamp, Amazon QLDB) by modifying `reconciliation-job.js`'s
`submitToHcs()` function. No application-layer changes required.

---

## Compliance References

- HIPAA §164.312(c)(1): Integrity controls — HCS provides cryptographic integrity
- HIPAA §164.312(b): Audit controls — HCS provides tamper-evident audit trail
- Section 20.2 (CJIS Note): HCS data not accessible to law enforcement without court order because Hedera returns only the hash/census tract; exact coordinates remain in Supabase under Azimuth's control
