# Section 14: SafeTracks Threat Model

**Classification:** Internal — Azimuth Foundation Inc.  
**Date:** May 2026  
**Methodology:** STRIDE + Attack Surface Analysis  
**Scope:** SafeTracks SHARPS_COLLECTION field operations system  

---

## 14.1 Trust Boundaries

The system has five distinct trust zones. Data flowing between zones crosses
a trust boundary and must be authenticated, validated, and sanitized.

```
┌─────────────────────────────────────────────────────────────────────┐
│  ZONE 0: FIELD (Untrusted)                                          │
│  Worker's mobile device, browser, offline paper forms               │
│  Trust level: NONE — treat all input as adversarial                 │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ HTTPS + event_nonce
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ZONE 1: EDGE (Partially Trusted)                                   │
│  Netlify Edge Functions — fraud detection, input validation         │
│  Trust level: LIMITED — authenticated by JWT, validated by schema   │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ Supabase service_role key (server-only)
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ZONE 2: DATA STORE (Trusted, Access-Controlled)                    │
│  Supabase (PostgreSQL + PostGIS)                                    │
│  Trust level: HIGH — service_role key, RLS, column-level grants     │
└───────────────────┬───────────────────────────────────────────────┘
                    │ Hedera private key (server-only, never Zone 0)
                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ZONE 3: PUBLIC LEDGER (Publicly Readable, Append-Only)             │
│  Hedera HCS — hashes and census-tract aggregates only              │
│  Trust level: N/A (public, immutable, no write access without key)  │
└─────────────────────────────────────────────────────────────────────┘
                    │ Read-only RLS policy, aggregated only
                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ZONE 4: RESEARCH PARTNERS (Read-Only Consumers)                    │
│  UMaine R Shiny, Maine Drug Data Hub, SAMHSA NEDEWS                 │
│  Trust level: LIMITED — authenticated read, census-tract only       │
└─────────────────────────────────────────────────────────────────────┘
```

**Critical invariant:** Exact GPS coordinates (`lat`, `lon`) must never cross
Zone 2 → Zone 3 or Zone 2 → Zone 4 boundaries under any code path.
This is enforced at three layers: (a) buildHcsPayload() omits coordinates,
(b) RLS revokes `SELECT` on `lat`/`lon` from the `public_read` role (CRITICAL-2),
(c) the public GeoJSON API returns only `census_tract`, never a geometry point.

---

## 14.2 Threat Actors

| Actor | Motivation | Capability |
|---|---|---|
| **Law enforcement** | Obtain precise location of drug use sites for prosecution | Subpoena, social engineering, RLS bypass attempts |
| **Malicious insider** | Access exact coordinates for personal use or sale | Supabase dashboard access, service_role key theft |
| **Script kiddie / automated bot** | Flood the system with fake sharps reports, spam HCS topic | High-volume HTTP requests, replayed tokens |
| **Organized fraud actor** | Replay valid Aleo proofs to claim duplicate Impact Credits | Captured network traffic, proof re-submission |
| **GPS spoofer** | Submit false coordinates (Atlantic Ocean, Canada) to corrupt heat maps | SDR-based GPS spoofing, coordinate injection in API calls |
| **Nation-state / advanced adversary** | De-anonymize service users via correlation attack | Cross-dataset join attacks, traffic analysis |

---

## 14.3 STRIDE Threat Enumeration

### S — Spoofing

**S-1: Device Identity Spoofing**  
*Threat:* An attacker submits events using a stolen or forged `device_fingerprint`,
making fraudulent events appear to originate from a trusted field device.  
*Impact:* Corrupt heatmap data, false chain-of-custody records.  
*Mitigation:*
- `device_fingerprint` is an HMAC of hardware identifiers, signed with a
  device-specific secret provisioned during device enrollment
- Impossible travel check flags sudden device "appearances" in new locations
- Staff audit dashboard shows per-device event frequency anomalies

**S-2: Worker Credential Theft**  
*Threat:* A worker's Supabase JWT is stolen (XSS, phishing, shoulder-surfing).  
*Impact:* Attacker can submit fraudulent events under worker's identity.  
*Mitigation:*
- JWTs expire in 1 hour; refresh tokens require re-authentication
- All events include `device_fingerprint` — a stolen JWT from device A cannot
  submit events that appear to come from device B
- Supabase Auth rate-limiting on login attempts

**S-3: GPS Coordinate Injection**  
*Threat:* Attacker modifies the API request body to substitute false coordinates
(e.g., coordinates in the Atlantic Ocean, or in another state).  
*Impact:* Corrupt GIS data, invalidated epidemiological analysis.  
*Mitigation:*
- Layer 1 fraud detection (Maine bounds check) rejects out-of-state coordinates
- Layer 2 impossible travel check catches sudden location jumps
- PostGIS `ST_Contains` against Maine state boundary polygon is the definitive check

---

### T — Tampering

**T-1: Database Record Modification**  
*Threat:* A compromised Supabase admin account modifies historical event records
(change coordinates, alter timestamps, delete events).  
*Impact:* Audit trail integrity compromised; research partner data corrupted.  
*Mitigation:*
- Hedera HCS anchoring provides independent verification. The HCS sequence number
  and consensus timestamp are stored in `sharps_events.hcs_sequence_number`.
  Any modification to a Supabase record that doesn't match its HCS entry is
  detectable by replaying the HCS topic against the database.
- Supabase audit logging captures all `UPDATE`/`DELETE` on `sharps_events`
- Service_role key is not exposed in any frontend code path

**T-2: HCS Message Payload Tampering**  
*Threat:* A man-in-the-middle modifies the JSON payload between `buildHcsPayload()`
and the Hedera network.  
*Impact:* HCS record contains false data; integrity guarantee fails.  
*Mitigation:*
- All Hedera SDK communication is TLS 1.3
- Hedera node validates the transaction signature using the operator's Ed25519 key
- The `event_nonce` in the HCS payload must match the nonce in Supabase —
  independently verifiable by anyone with the topic ID

**T-3: Reconciliation Job Injection**  
*Threat:* An attacker with write access to the `sharps_events` table inserts
a PENDING_HCS record with a malicious payload, causing the reconciliation job
to submit attacker-controlled data to HCS.  
*Impact:* False events anchored to the public audit trail.  
*Mitigation:* See Section 14.4 (Queue Poisoning Attack Surface).

---

### R — Repudiation

**R-1: Worker Denies Submitting Fraudulent Report**  
*Threat:* A field worker submits falsified collection data, then claims the
device was compromised.  
*Impact:* No accountability for data quality.  
*Mitigation:*
- Each event is bound to a `device_fingerprint` that is device-hardware-tied
- HCS consensus timestamp provides immutable proof of submission time
- Staff review queue (soft-flagged events) requires supervisor sign-off

**R-2: Organization Denies Data Was Modified**  
*Threat:* Azimuth is accused of modifying data post-submission; denies it.  
*Impact:* Loss of trust from research partners and grant agencies.  
*Mitigation:*
- Any external party can verify event integrity by cross-referencing:
  (a) The Supabase record's `hcs_sequence_number`
  (b) The corresponding Hedera mirror node message
  (c) The SHA-256 of the original event payload
- This verification requires no access to Azimuth systems

---

### I — Information Disclosure

**I-1: GPS Coordinate Exfiltration via API (CRITICAL-2)**  
*Threat:* The `public_read` Supabase role is misconfigured and accidentally
exposes `lat`/`lon` columns, allowing correlation attacks to identify
individual service users' locations.  
*Impact:* Severe — could enable surveillance of vulnerable individuals.  
*Mitigation:*
- Column-level RLS: `REVOKE SELECT (lat, lon) FROM public_read;`
- The public GeoJSON API function is a Netlify Edge Function that queries
  only the census-tract-aggregate view, not the raw `sharps_events` table
- Integration tests verify that the public API response never contains
  `lat`, `lon`, or any sub-tract geometry

**I-2: Re-identification via Temporal + Spatial Correlation**  
*Threat:* An adversary combines the public census-tract event counts with
external data (311 calls, social media posts) to narrow event locations
to specific addresses.  
*Impact:* Individual surveillance of service users.  
*Mitigation:*
- Timestamps are rounded to the nearest 15 minutes before HCS submission
- Census tract is the minimum public granularity (ADR-002)
- Small-cell suppression hides counts < 5 (G-2)
- No user or worker identity is associated with any event in any public-facing record

**I-3: Hedera Service_Role Key Leakage**  
*Threat:* The Hedera operator private key appears in source code, logs, or
environment variable dumps.  
*Impact:* Attacker can submit arbitrary messages to the HCS topic.  
*Mitigation:*
- Key is stored exclusively in Netlify environment variables (encrypted at rest)
- Key never appears in frontend code (Netlify Edge Functions are server-side)
- Key rotation procedure: documented in ops runbook, executable in < 30 minutes

---

### D — Denial of Service

**D-1: HCS Topic Flooding**  
*Threat:* An attacker with access to the Hedera operator key submits thousands
of messages to the HCS topic, inflating costs and polluting the audit trail.  
*Impact:* Operational disruption; corrupted audit trail requiring forensic cleanup.  
*Mitigation:*
- Hedera operator key is server-side only — no frontend path to HCS submission
- Rate limiter in the Edge Function: maximum N events per `device_fingerprint` per hour
- HCS topic created with Azimuth's account only as submit key — no other party can write

**D-2: Supabase Table Flooding**  
*Threat:* An attacker submits thousands of fake field events, filling the
`sharps_events` table and degrading query performance.  
*Impact:* Operational disruption; database bloat.  
*Mitigation:*
- Edge Function rate limiter: 10 events per IP per 10 minutes
- All events must pass fraud detection before DB write
- Supabase RLS prevents `INSERT` without a valid worker JWT

**D-3: Reconciliation Job Overload**  
*Threat:* A burst of HCS failures leaves thousands of PENDING_HCS records;
the reconciliation job processes them all simultaneously, exhausting the
Hedera rate limit and Supabase connection pool.  
*Impact:* Reconciliation job crashes; events remain unconfirmed.  
*Mitigation:*
- `BATCH_SIZE = 50` caps per-cycle processing
- 200ms inter-event delay respects Hedera TPS limits
- Exponential backoff on Hedera submission failures

---

### E — Elevation of Privilege

**E-1: Anon Key Used as Service Role Key**  
*Threat:* A developer misconfigures the Edge Function to use the Supabase
`anon` key where the `service_role` key is needed, or vice versa — exposing
the service role key in frontend code.  
*Impact:* If service_role key leaks to frontend: full database access bypassing RLS.  
*Mitigation:*
- Service_role key is only in Netlify Edge Function environment variables
- Frontend uses the anon key, which has RLS restrictions
- Code review checklist: verify `SUPABASE_SERVICE_ROLE_KEY` never appears in
  any file under `frontend/`

**E-2: RLS Policy Bypass via PostgREST Direct Access**  
*Threat:* A researcher with the anon key crafts a PostgREST query that exploits
a gap in RLS policies to access exact coordinates.  
*Impact:* Information disclosure (see I-1).  
*Mitigation:*
- Column-level revocation (CRITICAL-2): `REVOKE SELECT (lat, lon) FROM anon, authenticated;`
- PostgREST access to `sharps_events` is disabled for external roles; only the
  public-API edge function queries this table via service_role
- Automated RLS policy tests run in CI: verify that `anon` role cannot retrieve
  lat/lon under any query pattern

---

## 14.4 Queue Poisoning Attack Surface

The PENDING_HCS → CONFIRMED state machine in `reconciliation-job.js` is a
specific attack surface that warrants dedicated analysis.

**Attack scenario:**
An attacker with `INSERT` on `sharps_events` (e.g., via a compromised worker JWT
that bypasses fraud detection) writes a record directly into PENDING_HCS status
with a crafted payload — malicious census tract, false event type, or a nonce
already registered to a different event. The reconciliation job then blindly
submits this to HCS, permanently anchoring the false data.

**Mitigations in depth:**

1. **Fraud detection runs before any DB write.** `evaluateEvent()` in
   `fraud-detection.js` must return `accepted: true` before the event is
   written. The fraud check is not bypassable by direct DB insert because
   RLS requires a valid worker JWT for INSERT, and worker JWTs cannot set
   `hcs_status` — it defaults to PENDING_HCS via the column default.

2. **Nonce binding.** The event_nonce registered during the INSERT is the
   same nonce embedded in the HCS payload by the reconciliation job. An
   attacker who inserts a record with a nonce they don't control cannot
   control what gets anchored.

3. **Payload construction is server-side.** `buildHcsPayload()` reads the
   event from the database and constructs the HCS message. It cannot be
   influenced by client-supplied JSON beyond what was validated at insertion.

4. **Mirror node idempotency check.** Before resubmitting, the job checks
   whether the nonce already appears on HCS. A poisoned record with a nonce
   that was already used elsewhere will fail the nonce uniqueness check in
   the DB before it reaches the reconciliation queue.

5. **Supervisor review for soft-flagged events.** Any event with `soft_flagged = true`
   is held in a manual review queue and does not proceed to HCS anchoring
   until a staff member approves it.

---

## 14.5 Device Attestation Requirements

Field devices (tablets or phones used by harm reduction workers) must satisfy
the following attestation requirements before they can submit events:

### Minimum Requirements (All Deployments)

| Requirement | Implementation |
|---|---|
| **TLS pinning** | App pins to Netlify's certificate; rejects connections to unexpected CAs |
| **Device fingerprint** | HMAC-SHA256 of device model + OS build ID + enrollment UUID, signed with device key |
| **Enrollment ceremony** | Device is enrolled by Azimuth staff; enrollment generates device keypair; public key stored in Supabase `enrolled_devices` table |
| **JWT binding** | Worker JWT contains `device_id` claim; server verifies JWT device_id matches submitted device_fingerprint |
| **Auto-lock** | Device auto-locks after 5 minutes idle; worker must re-authenticate |
| **No cloud backup of keys** | Device keypair is generated on-device and never uploaded to iCloud/Google Backup |

### Recommended (Grant-Funded Deployments with Dedicated Hardware)

| Requirement | Implementation |
|---|---|
| **Secure Enclave storage** | Device private key stored in iOS Secure Enclave or Android StrongBox; never extractable |
| **Remote wipe capability** | Lost devices can be remotely de-enrolled; Supabase `enrolled_devices.active = false` invalidates all future submissions |
| **MDM enrollment** | Devices enrolled in an MDM (e.g., Jamf, Microsoft Intune) for policy enforcement and remote wipe |
| **GPS hardware attestation** | Use Android SafetyNet / Apple DeviceCheck to attest that GPS coordinates came from hardware sensor, not software injection |

### Explicitly Out of Scope (Do Not Implement)

- **Biometric data collection** — No fingerprints, facial scans, or voice prints
  associated with any worker or participant record
- **Continuous location tracking** — GPS is captured only at the moment of event
  submission; no background location tracking
- **Network traffic analysis** — No packet-level logging that would reveal
  usage patterns

---

## 14.6 Residual Risk Register

| Risk | Likelihood | Impact | Accepted? | Owner |
|---|---|---|---|---|
| Supabase (cloud provider) breach exposes exact GPS data | Low | Critical | No — mitigate with PostGIS encryption at rest | CTO |
| Hedera Governing Council dissolves; HCS unavailable | Very Low | High | Yes — migration path documented in ADR-001 | CTO |
| Field worker submits fraudulent events below fraud-detection thresholds | Medium | Medium | Yes — supervisor review queue provides human backstop | Ops |
| Maine state subpoena for census-tract-level data | Low | Low | Yes — public data, no PII, no mitigation needed | Legal |
| Maine state subpoena for exact coordinates | Low | High | Mitigated — Section 20.2 CJIS note; require court order | Legal |
| GPS spoofing that passes Maine bounds check | Low | Medium | Accepted — PostGIS ST_Contains is authoritative second check | Engineering |
| Paper form reconciliation introduces data entry errors | Medium | Low | Accepted — see paper backup protocol | Ops |

---

## 14.7 Security Review Schedule

| Review Type | Frequency | Responsible Party |
|---|---|---|
| RLS policy audit | Quarterly | Engineering + external reviewer |
| Fraud detection threshold review | After any flagging anomaly | Data team |
| Key rotation (Hedera + Supabase) | Annually or on staff departure | CTO |
| Full threat model review | Annually or on major architecture change | Technical Committee |
| Penetration test (OWASP Top 10) | Annually | External security firm |
