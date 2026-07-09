# SafeTracks × Margaret Chase Smith Policy Center / Maine Drug Data Hub Integration

**Status:** Architecture specification only. Nothing in this document is implemented. No live Supabase, Hedera HCS, Aleo, or dashboard integration exists yet. This is a design for a future phase, written so the Policy Center, Maine CDC, SSPs, and municipal partners can evaluate the model before any code is written against it.

**One-line framing:**

> SafeTracks is the privacy-preserving update rail between field work and public health intelligence.

---

## 0. Why This Module Exists

The Maine Drug Data Hub already provides public-facing drug policy and harm-reduction data infrastructure for the state. SafeTracks is not a replacement for it and does not compete with it.

SafeTracks' role is narrower and complementary: it is a **field-level update layer**. Outreach workers, SSPs, municipal responders, and recovery programs generate activity every day — naloxone handed out, sharps recovered, a hazard reported, a referral made. Today that activity typically reaches public dashboards as a static or annualized rollup, long after the fact, hand-compiled from disparate program reports.

SafeTracks helps Maine move from static or annualized public health reporting toward **privacy-preserving, near-real-time public health signal infrastructure** — feeding fresher, better-structured, audit-ready signals into the dashboards that already exist (the Maine Drug Data Hub, Maine CDC reporting, a Policy Center dashboard), rather than building a new public-facing system that duplicates them.

Two framing pairs anchor every design decision below:

- **Public truth, private identity.**
- **Aggregate-only by default.**

And two boundary statements that apply everywhere in this document:

- **No individual-level table in the public dashboard.**
- **Verified service signals, not surveillance records.**

This is not a surveillance system. It does not produce individual-level public maps, participant identities, exact client locations, treatment notes, or encounter narratives — anywhere, at any layer, for any audience. Where this document allows more location precision or more detail (the Research/Policy Analyst layer), it still stops well short of anything identifying, and is gated by governance review, not open access.

---

## 1. Architecture Section: The MCS Policy Center Integration Layer

This is a new layer sitting between the existing SafeTracks receipt/ledger model (see the main [README](../../safetracks-receipt-geometry/README.md)) and any public-facing dashboard. It does not change how field receipts are captured; it adds a pipeline that turns verified receipts into public-safe aggregate signals.

```
┌─────────────────────────────────────────────────────────────────────┐
│                      SafeTracks Core (existing)                     │
│   Field event → Zero-PII receipt → Governance coordinate mapping    │
└───────────────────────────────┬───────────────────────────────────┘
                                 │ verified, notarized receipts
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│              MCS Policy Center Integration Layer (new)              │
│                                                                       │
│  Data minimization  →  GIS precision control  →  Small-cell          │
│  suppression  →  Methodology versioning  →  Aggregate export API     │
│  →  Dashboard-ready CSV/JSON  →  Optional live API  →  Audit         │
│  receipt lookup  →  Data provenance records  →  Research governance  │
│  approval workflow                                                   │
└───────────────────────────────┬───────────────────────────────────┘
                                 │ aggregate-only, suppressed, versioned
                 ┌───────────────┴────────────────┐
                 ▼                                 ▼
   ┌───────────────────────────┐     ┌───────────────────────────────┐
   │   Public Dashboard Layer   │     │  Research / Policy Analyst    │
   │  (Maine Drug Data Hub,     │     │  Layer (MCS Policy Center,    │
   │   city councils, press,    │     │  approved Maine CDC / academic│
   │   funders, general public) │     │  researchers)                 │
   └───────────────────────────┘     └───────────────────────────────┘
```

The layer's job is to take something that is already true (a verified receipt) and make it *safe to say publicly* — never the reverse. Nothing flows from a public dashboard back down into identifying detail.

---

## 2. Data Flow (Governance Workflow, 12 Steps)

1. **Program submits field event.** An SSP, outreach worker, or municipal responder logs an event through existing SafeTracks intake (naloxone distributed, sharps recovered, hazard reported, referral made, etc.).
2. **Event is minimized and categorized.** Any field capable of identifying a person or exact location is stripped or generalized before it leaves the program's boundary. What remains is a category, a bucket, and a count.
3. **Receipt is hashed.** A content hash of the minimized event is generated — this is the artifact that gets notarized, not the underlying detail.
4. **Receipt hash is anchored to Hedera HCS.** The hash (not the data) is written to a Hedera Consensus Service topic, producing a sequence number and consensus timestamp that make the receipt's existence and ordering independently verifiable.
5. **Event is stored in Supabase with row-level security (RLS).** The minimized event lands in `public_health_events`, gated by RLS policies scoped to the submitting program and to service roles used by the aggregation job.
6. **Aggregation job runs.** A scheduled job rolls raw events up into county/municipality/service-area buckets and time buckets, producing `gis_rollups` and feeding `aggregate_exports`.
7. **Suppression rules apply.** Any bucket below the small-cell threshold is flagged and withheld from public output (see §5).
8. **GIS precision rules apply.** Location fields are generalized according to category-specific precision rules (see §5) before anything is marked public-eligible.
9. **Public export object is generated.** A `GIS Update Object` and/or `Policy Center Export Schema` row is produced, versioned against a `methodology_versions` record.
10. **Policy-center dashboard or Maine Drug Data Hub-style dashboard receives update.** Via scheduled CSV/JSON export or the optional live read-only API.
11. **Public user sees only aggregate, verified signal.** No individual-level row, no exact location, no name, ever reaches this layer.
12. **Auditor can verify the receipt without seeing private data.** Given a `receipt_hash` or `hcs_sequence_number`, anyone — public, funder, journalist, oversight body — can confirm a signal is real and unaltered without SafeTracks disclosing what it looked like before minimization.

---

## 3. Policy Center Export Schema

Row-level export format used for `aggregate_exports` and any research/policy-center extract.

| Field | Type | Description |
|---|---|---|
| `export_id` | string | Unique identifier for this export row. |
| `reporting_period` | string | Time bucket this row summarizes (e.g., `2026-W27`, `2026-07`). |
| `county` | string | Maine county bucket. |
| `municipality` | string | Municipality bucket, where applicable and not suppressed. |
| `service_area_bucket` | string | Program-defined service area (e.g., a mobile route's coverage zone), not an address. |
| `program_type` | string | e.g., `SSP`, `MUNICIPAL`, `RECOVERY`, `MOBILE_OUTREACH`. |
| `event_category` | string | One of the categories in §6 (naloxone distribution, sharps recovery, etc.). |
| `event_count` | integer | Aggregate count for the bucket/period. |
| `unique_token_count` | integer, nullable | A privacy-safe unique-engagement count using rotating, non-reversible tokens — included only where it cannot be used to re-identify or track an individual across periods; omitted otherwise. |
| `suppression_flag` | boolean | True if this row's count fell below the small-cell threshold and was withheld or generalized. |
| `data_quality_score` | float | Automated completeness/consistency score for this row. |
| `methodology_version` | string | Points to the `methodology_versions` record used to produce this row. |
| `last_updated_at` | timestamp | When this row was last (re)computed. |
| `source_program_id` | string | Internal program identifier — **never** a participant identifier. |
| `receipt_hash` | string | Hash of the underlying minimized receipt(s) this row rolls up. |
| `hcs_sequence_number` | integer | Hedera HCS sequence number for the anchored receipt hash. |
| `hcs_consensus_timestamp` | string | Hedera HCS consensus timestamp. |
| `verification_status` | string | `PENDING`, `VERIFIED`, `SUPPRESSED`, `UNDER_REVIEW`. |
| `notes_public` | string | Short, pre-approved public-facing note (methodology caveat, context) — never free text from a field worker. |

---

## 4. GIS Update Object

The unit consumed by mapping/dashboard front ends (SafeTracks' own or the Maine Drug Data Hub's).

| Field | Type | Description |
|---|---|---|
| `geography_type` | string | `COUNTY`, `MUNICIPALITY`, `SERVICE_AREA`, or `HAZARD_POINT` (see precision rules). |
| `geography_id` | string | Stable identifier for the geography bucket. |
| `geography_label` | string | Human-readable name (e.g., "Kennebec County"). |
| `latitude_centroid_optional` | float, nullable | Present only for `COUNTY`/`MUNICIPALITY`/`SERVICE_AREA` centroids, or for `HAZARD_POINT` under the public-works exception — never a participant or encounter location. |
| `longitude_centroid_optional` | float, nullable | Same rule as above. |
| `location_precision_level` | string | `COUNTY`, `MUNICIPALITY`, `SERVICE_AREA`, `GENERALIZED_POINT` — see §5. |
| `event_category` | string | Matches the categories in §6. |
| `aggregate_count` | integer | Count for this geography/category/time bucket. |
| `time_bucket` | string | Reporting period this object covers. |
| `suppression_status` | string | `VISIBLE`, `SUPPRESSED`, `DELAYED`. |
| `public_visibility` | boolean | Whether this object is eligible for the Public Dashboard Layer. |
| `verification_receipt` | string | Reference to `receipt_hash` / `hcs_sequence_number`. |
| `last_updated_at` | timestamp | Last recomputation time. |

---

## 5. Location Precision Rules

These rules are enforced in code before anything is marked `public_visibility: true`, not left to reviewer judgment at export time.

- **Exact GPS is off by default.** No field event carries participant-level coordinates into any export path.
- **Participant-level maps are prohibited**, full stop — there is no schema field or API response anywhere in this design that supports plotting an individual.
- **Camp-level maps require governance review.** Encampment-related outreach data defaults to service-area or municipality granularity; anything more specific requires a `suppression_reviews` sign-off and is never public-dashboard-eligible.
- **Sharps hazard reports may use more precise location only when the purpose is public works response** (so a municipal crew can find and clean up a hazard) — not participant tracking. This is the one category where `HAZARD_POINT` precision is permitted, and only for the operational-response window; it still carries no participant identity.
- **Recovery engagement data should only be county, municipality, or service-area level.** No finer.
- **Any small cell is suppressed.** A count below the suppression threshold is withheld or merged upward into a larger geography until it clears the threshold.
- **High-risk categories require delayed or generalized location release.** Categories where even aggregate near-real-time disclosure could create risk (e.g., a very low-volume service area) are held back or generalized until volume or time delay makes them safe.

---

## 6. Signal Categories SafeTracks Can Generate

Structured, privacy-preserving updates for:

- SSP service availability
- Mobile route status
- Operating hours
- Supply availability
- Naloxone distribution counts
- Syringe disposal / sharps recovery counts
- Overdose reversal reports (aggregate only)
- Wound-care referral counts
- Detox or treatment referral counts
- Peer-support engagement counts
- Recovery check-in counts
- Municipal outreach events
- Encampment outreach service offers
- Public hazard / discarded sharps reports
- Service gaps by county or municipality
- "Data last updated" status for public dashboards

---

## 7. Two Dashboard Layers

### 7.1 Public Dashboard Layer

Audience: the public, city councils, funders, journalists, general policy audiences.

**May show:**
- County-level or city-level trends
- Service availability
- Aggregate service counts
- Broad public health signals
- Small-cell suppression (as a stated methodology, not just a silent gap)
- "Data last updated"
- Methodology notes
- "How we count"
- "What we never collect"
- "What is independently verifiable"

**Must never show:**
- Individual participants
- Exact homes, camps, or sensitive locations
- Treatment notes
- Worker free-text notes
- Identifiable recovery journeys
- Law-enforcement targeting data
- Small groups below the suppression threshold

### 7.2 Research / Policy Analyst Layer

Audience: approved public health researchers or Policy Center analysts, gated by an explicit governance approval step — not open access.

**May include:**
- De-identified aggregate extracts
- County/service-area trend files
- Event category counts
- Time-bucketed service utilization
- Program participation summaries
- Data-quality indicators
- Missingness indicators
- Suppression flags
- Methodology version
- Cryptographic receipt references

**Must still exclude:**
- Raw PII
- Raw PHI
- Exact participant location
- Encounter narratives
- Names
- Personal identifiers
- Cross-program person tracking, unless explicitly consented to and legally governed — which is out of scope for this design

---

## 8. API Design

All endpoints below are **read-aggregate or write-minimized-event only**. None accept or return participant identity, exact location (outside the hazard-point exception in §5), or free-text case narratives.

| Endpoint | Method | Purpose | Audience |
|---|---|---|---|
| `/public/aggregate-signals` | GET | Returns aggregate, suppressed, versioned signal counts by category/geography/period. | Public |
| `/public/service-availability` | GET | Current SSP/mobile-route/service availability status. | Public |
| `/public/gis-rollups` | GET | `GIS Update Object` records eligible for public mapping. | Public |
| `/public/audit-receipt/:receipt_id` | GET | Verifies a receipt's existence/integrity via its hash and HCS reference, without exposing underlying data. | Public |
| `/research/approved-export/:export_id` | GET | Returns a Research/Policy Analyst-layer export, gated by prior approval. | Approved researchers/analysts |
| `/program/event-receipt` | POST | Program submits a minimized field event. | Authenticated program |
| `/program/service-availability-update` | POST | Program updates its service availability status. | Authenticated program |
| `/municipal/hazard-report` | POST | Municipality or public submits a hazard report (e.g., discarded sharps). | Authenticated municipal user |
| `/admin/suppression-review` | POST | Governance reviewer approves/denies a precision or suppression exception. | Governance/admin role only |

---

## 9. Database Tables

All tables below assume Supabase/Postgres with row-level security (RLS) as the primary access control, not just application-layer checks.

### `public_health_events`
- **Purpose:** Canonical store of minimized field events before aggregation.
- **Fields:** `event_id`, `program_id`, `event_category`, `county`, `municipality`, `service_area_bucket`, `occurred_at_bucket` (time-bucketed, not exact timestamp where category requires it), `receipt_hash`, `verification_status`, `created_at`.
- **Sensitive fields:** None by design — this table never receives raw PII/PHI; minimization happens upstream at intake, not here.
- **RLS policy:** Row visible only to the submitting program's service role and the aggregation job's service role. No direct public or researcher read access.
- **Retention policy:** Raw event rows retained per program data-use agreement (default proposal: 24 months), then rolled into permanent aggregate history and purged.
- **Public exposure rule:** Never exposed directly; only via `gis_rollups`/`aggregate_exports`.
- **Exportable to public dashboard:** No.

### `service_availability_updates`
- **Purpose:** Current/historical SSP, mobile-route, and service operating status.
- **Fields:** `update_id`, `program_id`, `service_area_bucket`, `status` (open/closed/route-active), `operating_hours`, `supply_availability_flag`, `last_updated_at`.
- **Sensitive fields:** None.
- **RLS policy:** Writable by the owning program's service role; readable by the aggregation job and the public API layer (post-minimization check).
- **Retention policy:** Rolling history retained 12 months for trend purposes; current status always available.
- **Public exposure rule:** Status/hours/availability fields are public by design (this table has no participant dimension at all).
- **Exportable to public dashboard:** Yes.

### `gis_rollups`
- **Purpose:** Geography/category/time-bucketed aggregate counts — the direct source for `GIS Update Object` responses.
- **Fields:** matches the GIS Update Object schema in §4.
- **Sensitive fields:** None post-aggregation; `latitude_centroid_optional`/`longitude_centroid_optional` are restricted to centroid/generalized values only, enforced at write time.
- **RLS policy:** Written only by the aggregation job's service role; read access differs by `public_visibility` flag (public API vs. research API).
- **Retention policy:** Retained indefinitely as historical public record (this is the audit-friendly trend data).
- **Public exposure rule:** Exposed only where `public_visibility = true` and `suppression_status != SUPPRESSED`.
- **Exportable to public dashboard:** Yes, conditionally.

### `aggregate_exports`
- **Purpose:** Versioned export rows matching the Policy Center Export Schema (§3), the artifact actually delivered to dashboards/researchers.
- **Fields:** matches §3.
- **Sensitive fields:** None; `source_program_id` is an internal program reference, never a participant reference.
- **RLS policy:** Written by the export-generation job; read access split between public role (suppressed/public-eligible rows only) and research role (approved-export rows only, via `/research/approved-export/:export_id`).
- **Retention policy:** Retained indefinitely; each row is immutable once published (corrections issue a new `export_id` with a note, not a silent overwrite).
- **Public exposure rule:** Public rows only where `suppression_flag = false` and `verification_status = VERIFIED`.
- **Exportable to public dashboard:** Yes, for public-eligible rows; research rows require the approval workflow.

### `suppression_reviews`
- **Purpose:** Governance record of every suppression or precision exception decision.
- **Fields:** `review_id`, `related_export_id` or `related_gis_rollup_id`, `requested_precision_level`, `decision` (`approved`/`denied`), `reviewer_role`, `justification_public_summary`, `decided_at`.
- **Sensitive fields:** `justification_public_summary` is deliberately a public-safe summary field; any underlying sensitive justification detail is not stored in this table.
- **RLS policy:** Writable only by governance/admin roles; readable by governance/admin and, for the public-summary field only, by the public API (transparency without disclosure).
- **Retention policy:** Retained indefinitely as a governance audit trail.
- **Public exposure rule:** Only `justification_public_summary` and the decision outcome are public-eligible.
- **Exportable to public dashboard:** Summary only.

### `methodology_versions`
- **Purpose:** Versioned record of how counts, suppression thresholds, and precision rules are computed, so every export can cite exactly which methodology produced it.
- **Fields:** `version_id`, `effective_from`, `effective_to`, `suppression_threshold`, `precision_rules_summary`, `changelog_public`.
- **Sensitive fields:** None.
- **RLS policy:** Written by governance/admin; publicly readable (methodology transparency is a design goal, not a risk).
- **Retention policy:** Retained indefinitely; versions are never deleted, only superseded.
- **Public exposure rule:** Fully public.
- **Exportable to public dashboard:** Yes — this is the "how we count" content in §7.1.

### `dashboard_public_notes`
- **Purpose:** Pre-approved public-facing context notes (e.g., "County X naloxone counts include a new program that joined in June 2026").
- **Fields:** `note_id`, `scope` (geography/category this note applies to), `note_text`, `approved_by_role`, `published_at`.
- **Sensitive fields:** None — notes are drafted and approved specifically for public consumption, never raw field-worker text.
- **RLS policy:** Writable by governance/communications role only; publicly readable.
- **Retention policy:** Retained indefinitely as part of the public record.
- **Public exposure rule:** Fully public by design.
- **Exportable to public dashboard:** Yes.

### `audit_receipts`
- **Purpose:** Canonical mapping from a receipt hash to its Hedera HCS anchoring metadata, enabling independent verification.
- **Fields:** `receipt_hash`, `hcs_topic_id`, `hcs_sequence_number`, `hcs_consensus_timestamp`, `related_event_category` (category only, not content), `created_at`.
- **Sensitive fields:** None — this table intentionally contains no reference back to underlying event content beyond its category label.
- **RLS policy:** Written by the notarization job; publicly readable via `/public/audit-receipt/:receipt_id` (verification must be publicly checkable to be credible).
- **Retention policy:** Retained indefinitely — this is the permanent proof-of-work record.
- **Public exposure rule:** Fully public.
- **Exportable to public dashboard:** Yes (as a "verify this signal" link/action, not a data table itself).

### `data_quality_checks`
- **Purpose:** Automated completeness/consistency checks feeding `data_quality_score` and missingness indicators.
- **Fields:** `check_id`, `related_export_id`, `check_type`, `result`, `checked_at`.
- **Sensitive fields:** None.
- **RLS policy:** Written by the data-quality job; readable by governance/admin and by the research layer (data-quality indicators are part of the research export); public dashboard sees only a rolled-up quality signal, not raw check detail.
- **Retention policy:** Retained 24 months, then summarized and purged.
- **Public exposure rule:** Rolled-up quality signal only.
- **Exportable to public dashboard:** Summary only.

---

## 10. Strategic Value

**For the Margaret Chase Smith Policy Center:**
SafeTracks offers a way to receive more timely, structured, privacy-safe, audit-ready public health signals from field programs — without asking programs to build new reporting infrastructure or asking participants to accept new exposure.

**For Maine CDC:**
SafeTracks can improve monthly and annual reporting quality without increasing participant surveillance. Verified, versioned aggregate signals reduce the manual reconciliation burden behind existing reports.

**For SSPs and recovery programs:**
SafeTracks reduces duplicate reporting burden and gives programs credible, independently verifiable proof of work — useful for grant reporting without adding a new surveillance obligation on top of service delivery.

**For municipalities:**
SafeTracks creates public accountability around outreach, hazards, referrals, and service availability — a defensible public record that services are happening and hazards are being addressed.

**For participants:**
SafeTracks protects identity and treatment honesty by design. Nothing in this architecture creates an incentive or a mechanism to identify, locate, or track an individual — the schema simply has no field for it.

---

## 11. Plain-Language Policy-Center Pitch

Maine has strong public health data infrastructure — the Maine Drug Data Hub, Maine CDC reporting, and program-level records at SSPs and recovery organizations. What's missing is a fast, trustworthy bridge between the moment field work happens and the moment the public can see that it happened.

SafeTracks is that bridge. It doesn't ask outreach workers, SSPs, or municipalities to change what they do. It takes the activity they're already doing — a naloxone kit handed out, a hazard reported and cleared, a referral made, a mobile route running its hours — and turns it into a minimized, aggregate, cryptographically verifiable signal. That signal can update a public dashboard like the Maine Drug Data Hub in near-real time, with a "last updated" clock instead of a once-a-year PDF.

Nothing about this is surveillance. There is no individual-level table anywhere in the public-facing system, no participant map, no treatment notes, no encounter narratives. Aggregate-only is the default, small counts are suppressed, and locations are generalized to county, municipality, or service-area — never a participant's location. What the public and researchers get instead is public truth without private identity: verified service signals, not surveillance records, and dashboard legitimacy without participant exposure.

The verification layer (Hedera HCS for tamper-evident sequencing, with room for stronger cryptographic proofs later) stays in the background as plumbing. The headline is Maine getting fresher, more credible public health data — not a new crypto product.

---

## 12. One-Paragraph Email Version

SafeTracks is a privacy-preserving update layer designed to feed fresher, better-structured, audit-ready public health signals into dashboards like the Maine Drug Data Hub, without creating any new participant-level data or surveillance capability. It takes routine field activity — naloxone distribution, sharps recovery, hazard reports, referrals, service availability — and turns it into minimized, aggregate, cryptographically verifiable counts by county, municipality, or service area, with small-cell suppression and generalized location by default. The result is near-real-time, independently verifiable public health reporting that reduces duplicate reporting burden for SSPs and municipalities, improves data quality for Maine CDC, and gives the Policy Center a credible, aggregate-only signal source — all while keeping participant identity, exact location, and treatment detail entirely out of the system by design. We'd welcome the chance to walk the Policy Center through the architecture and discuss what a pilot integration with the Maine Drug Data Hub could look like.

---

## 13. One-Page Concept Note

### SafeTracks as a Privacy-Preserving GIS Update Layer for Maine Public Health Dashboards

**The problem.** Maine's public health dashboards — including the Maine Drug Data Hub — depend on program reporting that is often static, annualized, or manually reconciled. By the time the public, funders, or policymakers see a number, the underlying activity may be many months old, and compiling it consumes program staff time that could go to service delivery.

**The proposal.** SafeTracks adds a field-level update layer between program activity and existing public dashboards. It does not replace the Maine Drug Data Hub or any existing reporting system — it feeds them faster, more structured, independently verifiable signals.

**How it works.** Field events (naloxone distributed, sharps recovered, a hazard reported, a referral made, a mobile route's hours) are captured as minimized, zero-PII receipts at the point of activity. Those receipts are hashed and anchored to a tamper-evident ledger (Hedera HCS), stored under row-level security, then rolled up into county/municipality/service-area aggregates. Small counts are suppressed; locations are generalized by category-specific rule; every export cites the methodology version that produced it. The result — a `GIS Update Object` or `Policy Center Export Schema` row — is what reaches a public dashboard or an approved researcher, never the raw event.

**What it is not.** It is not a surveillance system, an operational command tool, or a participant-tracking platform. There is no individual-level table anywhere in the public-facing design, no participant map, no treatment notes, no encounter narratives. Aggregate-only is the default; anything more precise (e.g., a hazard's location, for public-works cleanup) requires an explicit, narrow, governance-reviewed exception that still carries no participant identity.

**Two audiences, two layers.** A **Public Dashboard Layer** shows county/city trends, service availability, and plain-language methodology ("how we count," "what we never collect," "what is independently verifiable") to the public, funders, journalists, and city councils. A **Research/Policy Analyst Layer**, gated by governance approval, gives de-identified aggregate extracts with data-quality and suppression indicators to the Policy Center and approved researchers — still excluding all raw PII/PHI, names, and exact location.

**Why it matters for Maine.**
- *Margaret Chase Smith Policy Center:* timelier, structured, audit-ready signals without building new intake infrastructure.
- *Maine CDC:* better monthly/annual reporting quality without more participant surveillance.
- *SSPs and recovery programs:* less duplicate reporting, credible proof of work for grant reporting.
- *Municipalities:* public accountability for outreach, hazards, referrals, and service availability.
- *Participants:* identity and treatment honesty protected by design — the schema has no field for it.

**The one-line summary.** SafeTracks is the privacy-preserving update rail between field work and public health intelligence — public truth, private identity, aggregate-only by default, verified service signals, not surveillance records.
