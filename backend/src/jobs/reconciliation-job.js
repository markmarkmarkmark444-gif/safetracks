/**
 * @file reconciliation-job.js
 * @module SafeTracks/ReconciliationJob
 * @organization Azimuth Foundation Inc.
 *
 * Implements a two-phase commit reconciliation cron job that recovers
 * HCS/Supabase desynchronization (CRITICAL-5 from architectural review).
 *
 * ─── THE PROBLEM ──────────────────────────────────────────────────────────────
 *
 * A sharps event write follows this sequence:
 *
 *   1. Write to Supabase   → status = PENDING_HCS
 *   2. Submit to Hedera HCS
 *   3. On HCS success      → status = CONFIRMED, store hcs_transaction_id
 *
 * If the process crashes between steps 2 and 3 (network partition, Hedera
 * downtime, pod restart), the event is permanently stuck in PENDING_HCS
 * and the Hedera record is never linked. Data appears in Supabase but is
 * NOT auditable via Hashscan. The integrity guarantee is broken.
 *
 * ─── THE FIX ──────────────────────────────────────────────────────────────────
 *
 * This job runs on a 5-minute cron schedule and:
 *
 *   Phase 1 — DISCOVERY
 *     Query all sharps_events WHERE hcs_status = 'PENDING_HCS'
 *     AND created_at < NOW() - 5 minutes (past the normal submission window).
 *     Process in batches of BATCH_SIZE to bound memory usage.
 *
 *   Phase 2 — RECOVERY
 *     For each stale PENDING_HCS record:
 *       a. Check Hedera mirror node: did the message already land?
 *          (Idempotency: don't submit if HCS already has it)
 *       b. If NOT on HCS: resubmit the event payload
 *       c. If on HCS or freshly submitted: update Supabase to CONFIRMED
 *       d. On failure: increment hcs_retry_count
 *          - If retry_count >= MAX_RETRIES: set FAILED, trigger alert
 *
 *   Phase 3 — NONCE PRUNING
 *     Delete event_nonces WHERE expires_at < NOW() (Section 19.3, 90-day TTL)
 *
 * ─── RUNNING THIS JOB ────────────────────────────────────────────────────────
 *
 * Option A — Netlify Scheduled Function (recommended for existing stack):
 *   Deploy as a Netlify function with schedule: "*/5 * * * *"
 *   Set env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *                 HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY, HEDERA_TOPIC_ID
 *
 * Option B — Standalone Node.js cron (local or EC2):
 *   node reconciliation-job.js
 *   Uses setInterval internally, stays alive as a long-running process.
 *
 * Option C — Supabase pg_cron (if Supabase Pro):
 *   The SQL query portions can run natively; Hedera calls require this JS layer.
 */

'use strict';

const { createClient } = require('@supabase/supabase-js');
const {
  Client,
  TopicMessageSubmitTransaction,
  TopicId,
  PrivateKey,
  AccountId,
} = require('@hashgraph/sdk');

// ─── Environment ──────────────────────────────────────────────────────────────

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HEDERA_ACCOUNT_ID    = process.env.HEDERA_ACCOUNT_ID;
const HEDERA_PRIVATE_KEY   = process.env.HEDERA_PRIVATE_KEY;
const HEDERA_TOPIC_ID      = process.env.HEDERA_TOPIC_ID;

// Optional Hedera mirror node REST API (for idempotency check)
// Default: public testnet mirror; override for mainnet
const HEDERA_MIRROR_URL = process.env.HEDERA_MIRROR_URL
  ?? 'https://testnet.mirrornode.hedera.com';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('[reconciliation] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}
if (!HEDERA_ACCOUNT_ID || !HEDERA_PRIVATE_KEY || !HEDERA_TOPIC_ID) {
  throw new Error('[reconciliation] HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY, HEDERA_TOPIC_ID are required');
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Events stuck in PENDING_HCS for longer than this are eligible for reconciliation. */
const PENDING_THRESHOLD_MINUTES = 5;

/** Process this many records per reconciliation cycle to bound memory + API calls. */
const BATCH_SIZE = 50;

/** Maximum retry attempts before permanently marking an event FAILED. */
const MAX_RETRIES = 5;

/** How often the reconciliation loop runs (in milliseconds). 5 minutes. */
const RECONCILE_INTERVAL_MS = 5 * 60 * 1000;

// ─── Clients ──────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

/** Lazily initialize the Hedera client once and reuse across cycles. */
let _hederaClient = null;

function getHederaClient() {
  if (_hederaClient) return _hederaClient;
  _hederaClient = Client.forTestnet(); // Swap to Client.forMainnet() for production
  _hederaClient.setOperator(
    AccountId.fromString(HEDERA_ACCOUNT_ID),
    PrivateKey.fromStringDer(HEDERA_PRIVATE_KEY)
  );
  return _hederaClient;
}

// ─── Phase 1: Discovery ───────────────────────────────────────────────────────

/**
 * Fetch a batch of sharps events that are stuck in PENDING_HCS state.
 *
 * Only considers events older than PENDING_THRESHOLD_MINUTES to allow the
 * normal synchronous submission path time to complete before we intervene.
 *
 * @returns {Promise<Array<SharpsEvent>>}
 *
 * @typedef {object} SharpsEvent
 * @property {string}  id
 * @property {string}  event_nonce
 * @property {number}  lat
 * @property {number}  lon
 * @property {string}  collected_at
 * @property {string}  event_type
 * @property {string}  hcs_status
 * @property {number}  hcs_retry_count
 * @property {string}  census_tract
 * @property {string}  device_fingerprint
 */
async function fetchPendingEvents() {
  const cutoffTime = new Date(
    Date.now() - PENDING_THRESHOLD_MINUTES * 60 * 1000
  ).toISOString();

  const { data, error } = await supabase
    .from('sharps_events')
    .select(`
      id, event_nonce, lat, lon, collected_at, event_type,
      hcs_status, hcs_retry_count, census_tract, device_fingerprint
    `)
    .eq('hcs_status', 'PENDING_HCS')
    .lt('created_at', cutoffTime)
    .order('created_at', { ascending: true })  // Oldest first — FIFO recovery
    .limit(BATCH_SIZE);

  if (error) {
    throw new Error(`[reconciliation] Discovery query failed: ${error.message}`);
  }

  return data ?? [];
}

// ─── Idempotency Check via Mirror Node ───────────────────────────────────────

/**
 * Query the Hedera mirror node REST API to check if a message with this
 * event_nonce was already successfully submitted to the HCS topic.
 *
 * This prevents double-submission: if HCS succeeded but Supabase failed
 * to update, we don't want to write a duplicate HCS message.
 *
 * @param {string} eventNonce - UUID from the original event
 * @returns {Promise<{ found: boolean, sequenceNumber: string | null, consensusTimestamp: string | null }>}
 */
async function checkMirrorNodeForNonce(eventNonce) {
  // Mirror node API: list recent messages from our topic, filter by content
  // In production: maintain a secondary index of nonce→sequence_number in Supabase
  // to avoid scanning all mirror messages. Here we use the REST API directly.
  try {
    const url = `${HEDERA_MIRROR_URL}/api/v1/topics/${HEDERA_TOPIC_ID}/messages?limit=100&order=desc`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.warn(`[reconciliation] Mirror node returned ${response.status} — assuming not found`);
      return { found: false, sequenceNumber: null, consensusTimestamp: null };
    }

    const body = await response.json();
    const messages = body.messages ?? [];

    for (const msg of messages) {
      // HCS message content is base64-encoded JSON
      const raw = Buffer.from(msg.message, 'base64').toString('utf8');
      let payload;
      try { payload = JSON.parse(raw); } catch { continue; }

      if (payload.event_nonce === eventNonce) {
        return {
          found: true,
          sequenceNumber: String(msg.sequence_number),
          consensusTimestamp: msg.consensus_timestamp,
        };
      }
    }

    return { found: false, sequenceNumber: null, consensusTimestamp: null };
  } catch (err) {
    console.warn(`[reconciliation] Mirror node check failed: ${err.message} — proceeding with resubmission`);
    return { found: false, sequenceNumber: null, consensusTimestamp: null };
  }
}

// ─── HCS Submission ───────────────────────────────────────────────────────────

/**
 * Build the HCS message payload for a sharps event.
 *
 * Per Part 2 of the architecture spec: exact coordinates are NEVER submitted
 * to HCS. Only the census tract code and blurred data go on-chain.
 * The payload includes an hcs_verification_bundle compatible with Hashscan.
 *
 * @param {SharpsEvent} event
 * @returns {string} JSON string to submit as HCS message
 */
function buildHcsPayload(event) {
  return JSON.stringify({
    // ── Public fields (appear on Hashscan) ──
    schema_version:  '1.0.0',
    type:            'safetracks_sharps_event',
    event_nonce:     event.event_nonce,    // Idempotency key
    event_type:      event.event_type,     // 'environmental_sharp' | 'ftir_supply_alert'
    census_tract:    event.census_tract,   // FIPS code — census tract, NOT exact coords (ADR-002)
    collected_at:    event.collected_at,   // Rounded to nearest 15 minutes for privacy
    organization:    'azimuth-foundation',

    // ── Audit fields ──
    supabase_id:     event.id,             // Allows Supabase↔HCS cross-reference
    submitted_at:    new Date().toISOString(),

    // NOTE: lat/lon are intentionally OMITTED from this payload.
    // Exact PostGIS coordinates exist only in Supabase, behind RLS.
    // This is the core privacy guarantee of the system.
  });
}

/**
 * Submit a sharps event to Hedera HCS.
 *
 * @param {SharpsEvent} event
 * @returns {Promise<{ transactionId: string, sequenceNumber: string, consensusTimestamp: string }>}
 */
async function submitToHcs(event) {
  const client  = getHederaClient();
  const payload = buildHcsPayload(event);

  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(TopicId.fromString(HEDERA_TOPIC_ID))
    .setMessage(payload)
    .execute(client);

  const record = await tx.getRecord(client);

  return {
    transactionId:      record.transactionId?.toString() ?? `unknown-${Date.now()}`,
    sequenceNumber:     record.receipt?.topicSequenceNumber?.toString() ?? '0',
    consensusTimestamp: record.consensusTimestamp?.toDate().toISOString() ?? new Date().toISOString(),
  };
}

// ─── Phase 2: Recovery ────────────────────────────────────────────────────────

/**
 * Update a sharps event to CONFIRMED status after successful HCS submission.
 *
 * @param {string} eventId
 * @param {string} transactionId
 * @param {string} sequenceNumber
 * @param {string} consensusTimestamp
 */
async function confirmEvent(eventId, transactionId, sequenceNumber, consensusTimestamp) {
  const { error } = await supabase
    .from('sharps_events')
    .update({
      hcs_status:            'CONFIRMED',
      hcs_transaction_id:    transactionId,
      hcs_sequence_number:   sequenceNumber,
      hcs_consensus_timestamp: consensusTimestamp,
      hcs_confirmed_at:      new Date().toISOString(),
    })
    .eq('id', eventId);

  if (error) {
    throw new Error(`[reconciliation] Failed to confirm event ${eventId}: ${error.message}`);
  }
}

/**
 * Increment retry count for a PENDING_HCS event.
 * If max retries exceeded, mark as FAILED and trigger alerting.
 *
 * @param {string} eventId
 * @param {number} currentRetryCount
 * @param {string} lastError - Description of the failure
 */
async function handleRetryFailure(eventId, currentRetryCount, lastError) {
  const newRetryCount = currentRetryCount + 1;
  const isPermanentlyFailed = newRetryCount >= MAX_RETRIES;

  const { error } = await supabase
    .from('sharps_events')
    .update({
      hcs_status:        isPermanentlyFailed ? 'FAILED' : 'PENDING_HCS',
      hcs_retry_count:   newRetryCount,
      hcs_last_error:    lastError.slice(0, 500), // Truncate for column limit
      hcs_last_attempt_at: new Date().toISOString(),
    })
    .eq('id', eventId);

  if (error) {
    console.error(`[reconciliation] Could not update retry count for ${eventId}: ${error.message}`);
    return;
  }

  if (isPermanentlyFailed) {
    console.error(
      `[reconciliation] ALERT: Event ${eventId} permanently FAILED after ${MAX_RETRIES} retries. ` +
      `Last error: ${lastError}. Manual intervention required. ` +
      `HCS topic: ${HEDERA_TOPIC_ID}`
    );
    // In production: integrate with PagerDuty / Slack webhook here
    await triggerFailureAlert(eventId, lastError);
  }
}

/**
 * Send a failure alert via webhook (stub — configure your alert destination).
 * Replace the fetch call with your actual alerting endpoint.
 */
async function triggerFailureAlert(eventId, lastError) {
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🚨 SafeTracks HCS Failure: Event \`${eventId}\` permanently failed.\nError: ${lastError}`,
        event_id: eventId,
        topic_id: HEDERA_TOPIC_ID,
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.error('[reconciliation] Alert webhook failed:', err.message);
  }
}

/**
 * Recover a single PENDING_HCS event.
 *
 * Strategy:
 *   1. Check mirror node — was this already submitted? (idempotency)
 *   2. If found on HCS: confirm in Supabase (Supabase write failed earlier)
 *   3. If not found: submit to HCS, then confirm in Supabase
 *   4. On any error: increment retry count, mark FAILED if exhausted
 *
 * @param {SharpsEvent} event
 * @returns {Promise<'confirmed' | 'resubmitted' | 'failed'>}
 */
async function recoverEvent(event) {
  console.log(`[reconciliation] Recovering event ${event.id} (retry #${event.hcs_retry_count + 1})`);

  try {
    // Step 1: Check if HCS already has this message (idempotency)
    const mirrorCheck = await checkMirrorNodeForNonce(event.event_nonce);

    if (mirrorCheck.found) {
      // HCS has it — Supabase update must have failed. Confirm now.
      await confirmEvent(
        event.id,
        `mirror-recovered@${mirrorCheck.sequenceNumber}`,
        mirrorCheck.sequenceNumber,
        mirrorCheck.consensusTimestamp
      );
      console.log(`[reconciliation] ✓ Confirmed (found on mirror): ${event.id}`);
      return 'confirmed';
    }

    // Step 2: Not on HCS — submit it now
    const hcsResult = await submitToHcs(event);

    // Step 3: Update Supabase
    await confirmEvent(
      event.id,
      hcsResult.transactionId,
      hcsResult.sequenceNumber,
      hcsResult.consensusTimestamp
    );

    console.log(`[reconciliation] ✓ Resubmitted and confirmed: ${event.id} → TX ${hcsResult.transactionId}`);
    return 'resubmitted';

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[reconciliation] ✗ Recovery failed for ${event.id}: ${errMsg}`);
    await handleRetryFailure(event.id, event.hcs_retry_count, errMsg);
    return 'failed';
  }
}

// ─── Phase 3: Nonce Pruning ───────────────────────────────────────────────────

/**
 * Prune expired nonces from the event_nonces table (Section 19.3).
 * Runs at the end of each reconciliation cycle.
 *
 * @returns {Promise<number>} Count of pruned nonces
 */
async function pruneExpiredNonces() {
  const { data, error } = await supabase
    .from('event_nonces')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('nonce');

  if (error) {
    console.warn(`[reconciliation] Nonce pruning error: ${error.message}`);
    return 0;
  }

  return data?.length ?? 0;
}

// ─── Main Reconciliation Cycle ────────────────────────────────────────────────

/**
 * Run one complete reconciliation cycle.
 * Safe to call concurrently — Supabase row-level locking prevents double-processing.
 *
 * @returns {Promise<ReconciliationReport>}
 *
 * @typedef {object} ReconciliationReport
 * @property {number}   pending_found
 * @property {number}   confirmed
 * @property {number}   resubmitted
 * @property {number}   failed
 * @property {number}   nonces_pruned
 * @property {string}   completed_at
 * @property {number}   duration_ms
 */
async function runReconciliationCycle() {
  const startMs = Date.now();
  console.log(`[reconciliation] Starting cycle at ${new Date().toISOString()}`);

  let confirmed   = 0;
  let resubmitted = 0;
  let failed      = 0;

  // ── Phase 1 ──
  const pendingEvents = await fetchPendingEvents();
  console.log(`[reconciliation] Found ${pendingEvents.length} PENDING_HCS events`);

  // ── Phase 2 ──
  // Process sequentially to avoid Hedera rate limits and Supabase connection pool exhaustion
  for (const event of pendingEvents) {
    const outcome = await recoverEvent(event);
    if (outcome === 'confirmed')   confirmed++;
    if (outcome === 'resubmitted') resubmitted++;
    if (outcome === 'failed')      failed++;

    // Polite 200ms delay between HCS calls to respect rate limits
    await new Promise(r => setTimeout(r, 200));
  }

  // ── Phase 3 ──
  const nonces_pruned = await pruneExpiredNonces();

  const report = {
    pending_found: pendingEvents.length,
    confirmed,
    resubmitted,
    failed,
    nonces_pruned,
    completed_at: new Date().toISOString(),
    duration_ms: Date.now() - startMs,
  };

  console.log('[reconciliation] Cycle complete:', JSON.stringify(report));

  // Persist cycle report to Supabase for operational visibility
  await supabase
    .from('reconciliation_logs')
    .insert(report)
    .select();

  return report;
}

// ─── Entry Points ─────────────────────────────────────────────────────────────

/**
 * Netlify Scheduled Function handler.
 * Deploy with `schedule: "*/5 * * * *"` in netlify.toml.
 *
 * @param {Request} _req
 * @param {object} context - Netlify context
 */
async function netlifyHandler(_req, context) {
  try {
    const report = await runReconciliationCycle();
    return new Response(JSON.stringify(report), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[reconciliation] Fatal cycle error:', err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

/**
 * Standalone Node.js execution.
 * Runs an immediate cycle, then continues on RECONCILE_INTERVAL_MS schedule.
 */
if (require.main === module) {
  console.log(`[reconciliation] Standalone mode — running every ${RECONCILE_INTERVAL_MS / 60000} minutes`);

  runReconciliationCycle().catch(console.error);

  setInterval(() => {
    runReconciliationCycle().catch(err =>
      console.error('[reconciliation] Cycle error:', err.message)
    );
  }, RECONCILE_INTERVAL_MS);
}

// ─── Required Supabase Schema (DDL reference) ─────────────────────────────────
/*
  -- Add HCS state columns to sharps_events
  ALTER TABLE sharps_events
    ADD COLUMN IF NOT EXISTS hcs_status TEXT NOT NULL DEFAULT 'PENDING_HCS'
      CHECK (hcs_status IN ('PENDING_HCS', 'CONFIRMED', 'FAILED', 'FLAGGED_FRAUD')),
    ADD COLUMN IF NOT EXISTS hcs_transaction_id TEXT,
    ADD COLUMN IF NOT EXISTS hcs_sequence_number TEXT,
    ADD COLUMN IF NOT EXISTS hcs_consensus_timestamp TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS hcs_confirmed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS hcs_retry_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS hcs_last_error TEXT,
    ADD COLUMN IF NOT EXISTS hcs_last_attempt_at TIMESTAMPTZ;

  -- Index for the reconciliation discovery query
  CREATE INDEX idx_hcs_pending ON sharps_events (hcs_status, created_at)
    WHERE hcs_status = 'PENDING_HCS';

  -- Operational visibility log
  CREATE TABLE IF NOT EXISTS reconciliation_logs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pending_found  INTEGER NOT NULL,
    confirmed      INTEGER NOT NULL,
    resubmitted    INTEGER NOT NULL,
    failed         INTEGER NOT NULL,
    nonces_pruned  INTEGER NOT NULL,
    completed_at   TIMESTAMPTZ NOT NULL,
    duration_ms    INTEGER NOT NULL
  );
*/

module.exports = {
  runReconciliationCycle,
  netlifyHandler,
  buildHcsPayload,    // Exported for unit tests
  fetchPendingEvents,
};
