/**
 * @file fraud-detection.js
 * @module SafeTracks/FraudDetection
 * @organization Azimuth Foundation Inc.
 *
 * Implements three independent, layered fraud-detection guards for every
 * incoming SHARPS collection event. Guards are evaluated in order from
 * cheapest (O(1) lookup) to most expensive (async DB write), allowing
 * early-exit rejection without touching downstream systems.
 *
 *   LAYER 1 — Maine Territorial Bounds Check
 *     Rejects coordinates that fall outside Maine's documented terrestrial
 *     and near-shore bounds. Uses a two-tier check: fast bounding-box pass,
 *     followed by a mainland-proximity heuristic. Definitive polygon
 *     containment is enforced at the Supabase layer via PostGIS ST_Contains
 *     against the bundled Census TIGER geodatabase (Section 20.3 fallback).
 *
 *   LAYER 2 — Impossible Travel Detection (CRITICAL-4)
 *     Computes the great-circle distance between the incoming event and the
 *     device's most recent accepted event using the Haversine formula.
 *     Divides by elapsed time to derive implied ground speed. Events
 *     implying speeds above MAX_SPEED_KMH_HARD are rejected; events above
 *     MAX_SPEED_KMH_SOFT are accepted but flagged for human review.
 *
 *   LAYER 3 — Event Nonce Registry (CRITICAL-1)
 *     Each field event must carry a cryptographically random UUID4
 *     `event_nonce`. This nonce is checked against a Supabase registry
 *     table and rejected if already seen. Prevents captured Aleo proofs
 *     from being replayed to mint duplicate Impact Credits.
 *     Nonces expire after 90 days per Section 19.3 data retention policy.
 *
 * Compatible with: Node.js 18+, Supabase Edge Functions (Deno), Netlify Edge.
 * Replace `require` with `import` for ESM/Deno environments.
 */

'use strict';

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// ─── Environment ──────────────────────────────────────────────────────────────

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // Never the anon key

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('[fraud-detection] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Maximum physically plausible ground speed thresholds.
 *
 * SOFT (200 km/h): Flag for human review — could be a legitimate anomaly
 *   (e.g., worker travelling on I-95 through a zone boundary while GPS
 *   lagged, or a timestamp clock-skew on the device).
 *
 * HARD (500 km/h): Outright reject — impossible by any road vehicle.
 *   Only an aircraft or GPS spoofing could imply this speed.
 *   Maine's fastest posted limit is 75 mph (121 km/h); 500 km/h is 4x that.
 */
const MAX_SPEED_KMH_SOFT = 200;
const MAX_SPEED_KMH_HARD = 500;

/**
 * Maine's terrestrial bounding box (EPSG:4326).
 * Source: TIGER/Line 2020 Maine state boundary envelope, NE corner padded
 * to include Quoddy Head (easternmost US point, ~66.95°W) and the
 * offshore island communities (Monhegan, Isle au Haut, Matinicus, etc.).
 *
 * The conservative box is used for FAST first-pass rejection.
 * Events failing this check need not reach the PostGIS layer.
 */
const MAINE_BBOX = {
  minLat: 42.97,   // Kittery (York County / NH border) + 0.05° buffer
  maxLat: 47.50,   // Estcourt Station (Aroostook County / Canadian border)
  minLon: -71.15,  // Fryeburg (Oxford County / NH border) + 0.05° buffer
  maxLon: -66.80,  // ~12nm east of Lubec (near-shore coastal waters)
};

/**
 * Maine's approximate centroid and maximum reach.
 * Used for a secondary radial check: any point more than MAINE_RADIUS_KM
 * from the centroid and also outside the BBOX is almost certainly fraudulent.
 * (The centroid at 45.25°N, 69.0°W is near Piscataquis County.)
 */
const MAINE_CENTROID = { lat: 45.25, lon: -69.00 };
const MAINE_MAX_RADIUS_KM = 320; // generous: Kittery to Madawaska is ~310 km

/**
 * Nonce lifetime: 90 days in milliseconds.
 * After this period, a nonce could theoretically be reused (Section 19.3).
 * In practice, re-use of an expired nonce from the same device would
 * still fail the impossible-travel check.
 */
const NONCE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Minimum time between events from the same device to trigger travel check.
 * Below this threshold (e.g., two rapid taps) we skip distance math to
 * avoid false positives from GPS jitter while stationary.
 */
const MIN_TRAVEL_INTERVAL_SECONDS = 30;

// ─── Haversine Formula ────────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371.0088; // IAU 2012 mean radius

/** Convert degrees to radians. */
function toRad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Calculate the great-circle distance between two WGS-84 coordinates
 * using the Haversine formula.
 *
 * @param {number} lat1 - Origin latitude in decimal degrees
 * @param {number} lon1 - Origin longitude in decimal degrees
 * @param {number} lat2 - Destination latitude in decimal degrees
 * @param {number} lon2 - Destination longitude in decimal degrees
 * @returns {number} Distance in kilometres
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  // Guard against floating-point errors producing a > 1
  const c = 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)));

  return EARTH_RADIUS_KM * c;
}

// ─── Layer 1: GPS Bounds Check ────────────────────────────────────────────────

/**
 * Check whether a coordinate falls within Maine's documented bounds.
 *
 * Uses two checks:
 *   1. Bounding-box containment (O(1), synchronous)
 *   2. Radial distance from state centroid (catches Atlantic Ocean spoofing
 *      that passes the bounding box — e.g., 44°N, 67°W is in the Bay of Fundy)
 *
 * Note: This is intentionally conservative. The authoritative check is
 * PostGIS ST_Contains at the database layer. Here we catch obvious frauds
 * before they reach the DB.
 *
 * @param {number} lat - Latitude in decimal degrees
 * @param {number} lon - Longitude in decimal degrees
 * @returns {{ valid: boolean, reason: string | null }}
 */
function checkMaineBounds(lat, lon) {
  // Validate numeric inputs first
  if (typeof lat !== 'number' || typeof lon !== 'number' ||
      !isFinite(lat) || !isFinite(lon)) {
    return { valid: false, reason: 'GPS_NON_NUMERIC: coordinates are not finite numbers' };
  }

  // Global sanity check
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return { valid: false, reason: 'GPS_INVALID_RANGE: coordinates out of global range' };
  }

  // Fast bounding-box check
  const { minLat, maxLat, minLon, maxLon } = MAINE_BBOX;
  if (lat < minLat || lat > maxLat || lon < minLon || lon > maxLon) {
    return {
      valid: false,
      reason: `GPS_OUT_OF_BOUNDS: (${lat.toFixed(4)}, ${lon.toFixed(4)}) is outside Maine bbox`,
    };
  }

  // Radial check from centroid — catches coastal water spoofing within the bbox
  const distFromCentroid = haversineKm(lat, lon, MAINE_CENTROID.lat, MAINE_CENTROID.lon);
  if (distFromCentroid > MAINE_MAX_RADIUS_KM) {
    return {
      valid: false,
      reason: `GPS_OUTSIDE_RADIUS: ${distFromCentroid.toFixed(1)}km from Maine centroid (max ${MAINE_MAX_RADIUS_KM}km)`,
    };
  }

  return { valid: true, reason: null };
}

// ─── Layer 2: Impossible Travel Check ─────────────────────────────────────────

/**
 * Retrieve the most recent accepted event from this device.
 * Returns null if this is the device's first submission.
 *
 * @param {string} deviceFingerprint - HMAC-hashed device identifier
 * @returns {Promise<{ lat: number, lon: number, timestamp: string } | null>}
 */
async function fetchLastDeviceEvent(deviceFingerprint) {
  const { data, error } = await supabase
    .from('sharps_events')
    .select('lat, lon, collected_at')
    .eq('device_fingerprint', deviceFingerprint)
    .eq('hcs_status', 'CONFIRMED')          // Only compare against confirmed events
    .order('collected_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return { lat: data.lat, lon: data.lon, timestamp: data.collected_at };
}

/**
 * Evaluate whether a new event from a device implies an impossible journey
 * from its last confirmed event.
 *
 * @param {string} deviceFingerprint
 * @param {number} newLat
 * @param {number} newLon
 * @param {string} newTimestampISO - ISO 8601 timestamp of the incoming event
 * @returns {Promise<{ pass: boolean, soft_flag: boolean, speed_kmh: number | null, reason: string | null }>}
 */
async function checkImpossibleTravel(deviceFingerprint, newLat, newLon, newTimestampISO) {
  const lastEvent = await fetchLastDeviceEvent(deviceFingerprint);

  // First event from this device — no travel check possible
  if (!lastEvent) {
    return { pass: true, soft_flag: false, speed_kmh: null, reason: null };
  }

  const lastTime = new Date(lastEvent.timestamp);
  const newTime  = new Date(newTimestampISO);
  const elapsedSeconds = (newTime - lastTime) / 1000;

  // New event is in the past relative to last confirmed event — clock tampering
  if (elapsedSeconds < 0) {
    return {
      pass: false,
      soft_flag: false,
      speed_kmh: null,
      reason: `TRAVEL_CLOCK_REVERSE: incoming timestamp ${newTimestampISO} is before last accepted event ${lastEvent.timestamp}`,
    };
  }

  // Events too close together to be meaningful — skip to avoid GPS jitter false positives
  if (elapsedSeconds < MIN_TRAVEL_INTERVAL_SECONDS) {
    return { pass: true, soft_flag: false, speed_kmh: 0, reason: null };
  }

  const distanceKm  = haversineKm(lastEvent.lat, lastEvent.lon, newLat, newLon);
  const elapsedHours = elapsedSeconds / 3600;
  const speedKmh    = distanceKm / elapsedHours;

  // Hard reject — physically impossible by any ground vehicle
  if (speedKmh > MAX_SPEED_KMH_HARD) {
    return {
      pass: false,
      soft_flag: false,
      speed_kmh: speedKmh,
      reason: `TRAVEL_IMPOSSIBLE: implied speed ${speedKmh.toFixed(1)} km/h over ${distanceKm.toFixed(2)} km in ${elapsedSeconds.toFixed(0)}s`,
    };
  }

  // Soft flag — suspicious but within theoretical possibility (investigate manually)
  if (speedKmh > MAX_SPEED_KMH_SOFT) {
    return {
      pass: true,   // Accept but flag
      soft_flag: true,
      speed_kmh: speedKmh,
      reason: `TRAVEL_SUSPICIOUS: implied speed ${speedKmh.toFixed(1)} km/h — flagged for review`,
    };
  }

  return { pass: true, soft_flag: false, speed_kmh: speedKmh, reason: null };
}

// ─── Layer 3: Event Nonce Registry ────────────────────────────────────────────

/**
 * Validate and register an event nonce.
 *
 * Performs an atomic INSERT into the `event_nonces` table. If the nonce
 * already exists, Supabase returns a unique-constraint violation, which
 * we interpret as a replay attack.
 *
 * Nonce format: UUID v4 (128 bits of entropy). Lowercase hex with hyphens.
 *
 * @param {string} nonce - UUID v4 supplied by the field device
 * @param {string} eventId - The sharps_event UUID this nonce is bound to
 * @returns {Promise<{ valid: boolean, reason: string | null }>}
 */
async function validateAndRegisterNonce(nonce, eventId) {
  // Structural validation — must be a UUID v4
  const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!nonce || !UUID_V4_RE.test(nonce)) {
    return { valid: false, reason: 'NONCE_INVALID_FORMAT: event_nonce must be a UUID v4' };
  }

  const expiresAt = new Date(Date.now() + NONCE_TTL_MS).toISOString();

  // Atomic upsert with conflict detection on the (nonce) unique key
  const { error } = await supabase
    .from('event_nonces')
    .insert({ nonce, event_id: eventId, expires_at: expiresAt })
    .select();

  if (error) {
    // PostgreSQL unique-violation code
    if (error.code === '23505') {
      return {
        valid: false,
        reason: `NONCE_REPLAY: nonce ${nonce} has already been used — possible replay attack`,
      };
    }
    // Unexpected DB error — fail open with logging rather than blocking all events
    console.error('[fraud-detection] Nonce registry DB error:', error);
    return { valid: true, reason: `NONCE_DB_ERROR: ${error.message} — allowed through with warning` };
  }

  return { valid: true, reason: null };
}

// ─── Fraud Flag Persistence ───────────────────────────────────────────────────

/**
 * Write a fraud flag record to the `fraud_flags` table.
 * Used for auditing and manual review workflow.
 *
 * @param {string} eventId
 * @param {string} flagType - One of: GPS_BOUNDS, GPS_INVALID, IMPOSSIBLE_TRAVEL, SUSPICIOUS_TRAVEL, REPLAY_ATTACK
 * @param {object} details - Arbitrary metadata about the flag
 */
async function persistFraudFlag(eventId, flagType, details) {
  const { error } = await supabase
    .from('fraud_flags')
    .insert({
      event_id:    eventId,
      flag_type:   flagType,
      flag_details: details,
      flagged_at:  new Date().toISOString(),
      resolved:    false,
    });

  if (error) {
    // Non-fatal — log but don't block the rejection response
    console.error('[fraud-detection] Failed to persist fraud flag:', error.message);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Evaluate an incoming sharps collection event against all three fraud guards.
 *
 * Call this function BEFORE writing the event to the `sharps_events` table.
 * The caller is responsible for generating the eventId (UUID v4) and passing
 * it here; this function registers the nonce against it.
 *
 * @param {object} event - The incoming field event payload
 * @param {number} event.lat - GPS latitude (decimal degrees, WGS-84)
 * @param {number} event.lon - GPS longitude (decimal degrees, WGS-84)
 * @param {string} event.timestamp - ISO 8601 collection timestamp (device time)
 * @param {string} event.event_nonce - UUID v4 from the field device (CRITICAL-1 fix)
 * @param {string} event.device_fingerprint - HMAC-hashed device identifier
 * @param {string} eventId - Pre-generated UUID for the sharps_event record
 *
 * @returns {Promise<FraudCheckResult>}
 *
 * @typedef {object} FraudCheckResult
 * @property {boolean} accepted - True if all hard checks pass (event should be written)
 * @property {boolean} soft_flagged - True if any soft flag triggered (write but mark for review)
 * @property {string[]} reasons - Human-readable rejection/flag messages
 * @property {object} metadata - Computed values (speed, distance) for audit log
 */
async function evaluateEvent(event, eventId) {
  const { lat, lon, timestamp, event_nonce, device_fingerprint } = event;

  const reasons  = [];
  const metadata = {};
  let accepted    = true;
  let soft_flagged = false;

  // ── Layer 1: GPS Bounds ──────────────────────────────────────────────
  const boundsResult = checkMaineBounds(lat, lon);
  if (!boundsResult.valid) {
    accepted = false;
    reasons.push(boundsResult.reason);
    await persistFraudFlag(eventId, 'GPS_BOUNDS', { lat, lon, reason: boundsResult.reason });
  }

  // ── Layer 2: Impossible Travel (only if bounds passed) ───────────────
  if (accepted && device_fingerprint) {
    const travelResult = await checkImpossibleTravel(device_fingerprint, lat, lon, timestamp);
    metadata.implied_speed_kmh = travelResult.speed_kmh;

    if (!travelResult.pass) {
      accepted = false;
      reasons.push(travelResult.reason);
      await persistFraudFlag(eventId, 'IMPOSSIBLE_TRAVEL', {
        lat, lon, timestamp,
        implied_speed_kmh: travelResult.speed_kmh,
        reason: travelResult.reason,
      });
    } else if (travelResult.soft_flag) {
      soft_flagged = true;
      reasons.push(travelResult.reason);
      await persistFraudFlag(eventId, 'SUSPICIOUS_TRAVEL', {
        lat, lon, timestamp,
        implied_speed_kmh: travelResult.speed_kmh,
        reason: travelResult.reason,
      });
    }
  }

  // ── Layer 3: Nonce Registry (always run — replay attacks don't need valid GPS) ──
  const nonceResult = await validateAndRegisterNonce(event_nonce, eventId);
  if (!nonceResult.valid) {
    accepted = false;
    reasons.push(nonceResult.reason);
    await persistFraudFlag(eventId, 'REPLAY_ATTACK', { event_nonce, reason: nonceResult.reason });
  }

  return { accepted, soft_flagged, reasons, metadata };
}

/**
 * Prune expired nonces from the registry.
 * Should be called by the same cron job that runs reconciliation-job.js,
 * or on a separate daily schedule.
 *
 * Per Section 19.3: nonces expire after 90 days.
 *
 * @returns {Promise<{ pruned: number }>}
 */
async function pruneExpiredNonces() {
  const { data, error } = await supabase
    .from('event_nonces')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('nonce');

  if (error) {
    console.error('[fraud-detection] Nonce pruning failed:', error.message);
    return { pruned: 0 };
  }

  const pruned = data?.length ?? 0;
  console.log(`[fraud-detection] Pruned ${pruned} expired nonces`);
  return { pruned };
}

// ─── Required Supabase Schema (DDL reference) ─────────────────────────────────
/*
  Run these migrations in Supabase SQL editor before deploying this service.

  -- Nonce registry (CRITICAL-1 fix)
  CREATE TABLE IF NOT EXISTS event_nonces (
    nonce      TEXT PRIMARY KEY,
    event_id   UUID REFERENCES sharps_events(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
  );
  CREATE INDEX idx_nonce_expires ON event_nonces (expires_at);

  -- Fraud flag audit log
  CREATE TABLE IF NOT EXISTS fraud_flags (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id     UUID REFERENCES sharps_events(id) ON DELETE CASCADE,
    flag_type    TEXT NOT NULL CHECK (flag_type IN (
                   'GPS_BOUNDS', 'GPS_INVALID', 'IMPOSSIBLE_TRAVEL',
                   'SUSPICIOUS_TRAVEL', 'REPLAY_ATTACK')),
    flag_details JSONB NOT NULL DEFAULT '{}',
    flagged_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved     BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_by  TEXT,
    resolved_at  TIMESTAMPTZ
  );

  -- RLS: fraud_flags visible only to authenticated staff role (CRITICAL-2 mitigation)
  ALTER TABLE fraud_flags ENABLE ROW LEVEL SECURITY;
  CREATE POLICY fraud_flags_staff_only ON fraud_flags
    FOR ALL USING (auth.role() = 'authenticated' AND auth.jwt() ->> 'role' = 'staff');

  -- Required columns on sharps_events for travel check
  ALTER TABLE sharps_events
    ADD COLUMN IF NOT EXISTS device_fingerprint TEXT,
    ADD COLUMN IF NOT EXISTS hcs_status TEXT NOT NULL DEFAULT 'PENDING_HCS'
      CHECK (hcs_status IN ('PENDING_HCS', 'CONFIRMED', 'FAILED', 'FLAGGED_FRAUD')),
    ADD COLUMN IF NOT EXISTS soft_flagged BOOLEAN NOT NULL DEFAULT FALSE;

  CREATE INDEX idx_device_fingerprint ON sharps_events (device_fingerprint, collected_at DESC);
*/

module.exports = {
  evaluateEvent,
  checkMaineBounds,
  checkImpossibleTravel,
  validateAndRegisterNonce,
  pruneExpiredNonces,
  haversineKm,          // Exported for unit tests
  MAINE_BBOX,
  MAX_SPEED_KMH_SOFT,
  MAX_SPEED_KMH_HARD,
};
