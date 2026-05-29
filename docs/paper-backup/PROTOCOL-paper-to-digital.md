# Paper-to-Digital Reconciliation Protocol
### SafeTracks SHARPS_COLLECTION · Azimuth Foundation Inc.

**Applicability:** This protocol activates when SafeTracks digital collection is  
unavailable due to power failure, device failure, network outage, or any other  
electronics failure. Paper forms serve as the authoritative record during outage.

---

## When to Activate Paper Backup

Activate immediately when ANY of the following are true:

- SafeTracks mobile app cannot connect after 2 retry attempts
- Device battery is below 10% with no charging option available
- Device is lost, damaged, or stolen
- Site has no cellular or Wi-Fi signal and offline mode is not available
- Supervisor instructs paper-only collection

**Do not wait for electronics to fully fail.** Switch to paper at the first sign of  
extended unavailability.

---

## Paper Packet Contents

Each field worker should carry a pre-printed backup packet containing:

| Form | Purpose | Copies per Shift |
|------|---------|-----------------|
| **Form A** — Sharps Collection Log | One row per collection stop | 1 (covers 12 stops) |
| **Form B** — Participant Harm Reduction Intake | One per participant | 20 (standard supply) |
| **Form C** — Supply Distribution Log | One per session | 1 (covers 20 participants) |
| **This protocol** | Reference | 1 |

**Where packets are stored:** ________________________________________________  
**Supervisor responsible for restocking packets:** ________________________________

---

## Field Instructions During Outage

### Step 1 — Assign Session Codes Manually

Session codes replace the digital session ID. Use this format:

```
[Worker initials 2 chars] - [Date MMDD] - [Sequential number 01–99]
```

Example: `JR-0527-01` = worker JR, May 27, first session of the day.

Write the session code on Form B **before** beginning the participant intake.  
Use the same session code on Form C for that participant's row.

### Step 2 — Complete Form B for Each Participant

- One Form B per participant
- Assign a unique session code to each
- Dispense requested supplies and check off Form C
- If participant declines intake: write "DECLINED" in session code box; still log supplies on Form C

### Step 3 — Complete Form A for Each Sharps Stop

- One Form A per shift (covers up to 12 stops)
- If more than 12 stops, begin a second Form A sheet
- Confirm OSHA PPE fields at shift end — do not leave blank

### Step 4 — Secure Completed Forms

- Keep forms face-down and stacked during transport
- Do not photograph forms on personal devices
- Return all forms to site supervisor at end of shift
- Site supervisor stores forms in the locked filing cabinet: ____________________

---

## Data Entry Protocol (When Electronics Restored)

The data entry operator follows these steps to reconcile paper forms into SafeTracks.

### Priority Order

Enter data in this sequence to preserve audit integrity:

1. **Form A** — Creates sharps collection event records (no consent gate needed)
2. **Form B** — Creates check-in session records (consent = staff-witnessed verbal)
3. **Form C** — Verifies supply counts against Form B totals before filing

### Entry Steps for Each Form B

1. Open SafeTracks staff data entry panel
2. Click **"Enter Paper Backup Record"**
3. Enter the session code from Form B in the Reference field
4. Select site/location from the dropdown (do not type a street address)
5. Enter the date and time from Form B (not today's date — use the original form date)
6. Complete all Section 1–4 fields from the form
7. Select supply items from Section 5
8. In the **Consent Method** field, select **"Paper — staff-witnessed verbal"**
9. Submit — system generates a consent artifact and ZK proof using the entered data
10. Write the generated **Event ID** in the top-right corner of the paper Form B
11. File the completed Form B in the paper archive

### Entry Steps for Each Form A Row

1. Open SafeTracks staff data entry panel
2. Click **"Enter Sharps Collection Stop"**
3. Enter the date and stop time from Form A
4. Enter the location (address or landmark from form)
5. Enter sharps count
6. Enter container type
7. Confirm PPE checklist
8. In the **Entry Method** field, select **"Paper backup — reconciliation"**
9. Submit — system queues the event for HCS anchoring
10. Note: HCS anchoring may be delayed up to the next reconciliation cycle (max 15 minutes after system restoration)

### Verification After Entry

After all forms from a batch are entered:

- Run the **Paper Reconciliation Report** from the staff dashboard
- Confirm that event count matches Form A and Form B totals
- Confirm supply counts match Form C totals
- Mark the paper batch as **RECONCILED** with operator initials and date

---

## Quality Assurance

### Double-Entry Rule

For batches of 5 or more paper forms, a second staff member must independently  
verify 20% of records against the paper originals. Discrepancies are flagged  
for supervisor review.

### Flagging Conventions

If a paper record is illegible, incomplete, or internally inconsistent:

- Enter what is readable
- Flag the record as **PAPER_INCOMPLETE** in the notes field
- Attach a photocopy of the paper form to the digital record
- Do not invent or estimate missing values

### Timing Window

Paper records should be entered within **24 hours** of the outage ending.  
Records entered more than 72 hours late are automatically flagged for supervisor  
review and noted as **LATE_PAPER_ENTRY** in the HCS payload.

---

## What Cannot Be Recovered from Paper

The following SafeTracks features are unavailable during electronics outage  
and cannot be fully reconstructed from paper records:

| Feature | Paper Substitute | Notes |
|---------|----------------|-------|
| ZK proof (real-time) | Deferred — generated at entry time | Proof timestamp reflects entry time, not collection time |
| HCS anchoring (real-time) | Deferred — anchored after entry | HCS sequence number will not match collection timestamp |
| Variable reward token | Not issued | Reward is not available for paper-only sessions |
| GPS coordinates (exact) | Not captured | Entry uses location name/landmark only |
| Impossible travel check | Not applicable | No device fingerprint during paper collection |

**These gaps are acceptable** for occasional paper-backup use. If outage  
exceeds 48 hours, notify the Azimuth CTO for escalation.

---

## Supplies and Printing

### Print Settings

All forms should be printed:
- Letter size (8.5" × 11")
- Portrait orientation
- Black ink only (color printing not required)
- Double-sided printing is acceptable for Forms B and C

### Restocking Trigger

Restock the paper packet supply when the on-hand count drops below **5 packets**  
per active site. One packet = 1× Form A + 20× Form B + 1× Form C.

### Storage Requirements

- Store paper packets in a waterproof sleeve or ziplock bag in the field kit
- Do not store in direct sunlight (ink fading)
- Completed forms: locked filing cabinet, sorted by date
- Retention: 3 years per Section 19.3, then cross-cut shred

---

*Last reviewed: May 2026 · Owner: Azimuth Foundation Operations*  
*Next review due: May 2027 or on any major form redesign*
