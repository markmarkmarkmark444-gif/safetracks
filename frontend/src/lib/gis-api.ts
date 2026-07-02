/**
 * GIS API client — SafeTracks PWA
 *
 * Thin wrapper around the Supabase Edge Functions.
 * Handles offline queuing for service status updates (localStorage for MVP).
 * All writes require an authenticated Supabase JWT.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const FUNCTIONS_URL = process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL!;
const PUBLIC_GEOJSON_URL = `${FUNCTIONS_URL}/public-geojson`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StatusUpdatePayload {
  provider_id:          string;
  route_id?:            string;
  census_tract:         string;
  service_date:         string;
  window_start:         string;
  window_end:           string;
  status:               'scheduled' | 'active' | 'delayed' | 'completed' | 'cancelled';
  delay_minutes?:       number;
  narcan_level?:        'well_stocked' | 'low' | 'out';
  syringe_level?:       'well_stocked' | 'low' | 'out';
  fentanyl_test_level?: 'well_stocked' | 'low' | 'out';
  shift_code?:          string;
}

export interface StatusUpdateResult {
  id:           string;
  hcs_status:   string;
  census_tract: string;
  status:       string;
  window_start: string;
  window_end:   string;
  duplicate?:   boolean;
  queued?:      boolean;
}

export interface GeoJSONFeatureCollection {
  type:      'FeatureCollection';
  features:  GeoJSONFeature[];
  metadata:  Record<string, unknown>;
}

export interface GeoJSONFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    id:            string;
    provider:      string;
    program_type:  string;
    census_tract:  string;
    status:        string;
    window_start:  string;
    window_end:    string;
    is_active_now: boolean;
    delay_minutes: number | null;
    supplies: {
      narcan:          string | null;
      syringes:        string | null;
      fentanyl_strips: string | null;
    };
    verification: {
      hcs_topic_id:        string | null;
      hcs_transaction_id:  string | null;
      hcs_sequence_number: number | null;
      consensus_timestamp: string | null;
      verify_url:          string | null;
      mirror_node_url:     string | null;
      zk_commitment:       string | null;
    };
    updated_at: string;
  };
}

// ---------------------------------------------------------------------------
// Public read — no auth required
// ---------------------------------------------------------------------------

export async function fetchActiveServices(opts: {
  census_tract?: string;
  program_type?: string;
  hours_ahead?:  number;
} = {}): Promise<GeoJSONFeatureCollection> {
  const params = new URLSearchParams();
  if (opts.census_tract) params.set('census_tract', opts.census_tract);
  if (opts.program_type) params.set('program_type',  opts.program_type);
  if (opts.hours_ahead)  params.set('hours_ahead',   String(opts.hours_ahead));

  const url = params.size ? `${PUBLIC_GEOJSON_URL}?${params}` : PUBLIC_GEOJSON_URL;

  const res = await fetch(url, { headers: { Accept: 'application/geo+json' } });
  if (!res.ok) throw new Error(`GeoJSON fetch failed: ${res.status}`);
  return res.json() as Promise<GeoJSONFeatureCollection>;
}

// ---------------------------------------------------------------------------
// Authenticated write — worker JWT required
// ---------------------------------------------------------------------------

export async function submitStatusUpdate(
  supabase: SupabaseClient,
  payload: StatusUpdatePayload,
): Promise<StatusUpdateResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  try {
    const res = await fetch(`${FUNCTIONS_URL}/service-status-update`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((err as { error: string }).error ?? `HTTP ${res.status}`);
    }

    return res.json() as Promise<StatusUpdateResult>;
  } catch (err) {
    if (!navigator.onLine || (err instanceof TypeError && err.message.includes('fetch'))) {
      return queueOffline(payload);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Offline queue
// ---------------------------------------------------------------------------

const OFFLINE_QUEUE_KEY = 'safetracks_gis_offline_queue';

function queueOffline(payload: StatusUpdatePayload): StatusUpdateResult {
  const existing: StatusUpdatePayload[] = JSON.parse(
    localStorage.getItem(OFFLINE_QUEUE_KEY) ?? '[]'
  );
  existing.push(payload);
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(existing));
  return {
    id:           `offline-${Date.now()}`,
    hcs_status:   'QUEUED_OFFLINE',
    census_tract: payload.census_tract,
    status:       payload.status,
    window_start: payload.window_start,
    window_end:   payload.window_end,
    queued:       true,
  };
}

export async function flushOfflineQueue(supabase: SupabaseClient): Promise<number> {
  const queue: StatusUpdatePayload[] = JSON.parse(
    localStorage.getItem(OFFLINE_QUEUE_KEY) ?? '[]'
  );
  if (!queue.length || !navigator.onLine) return 0;

  let flushed = 0;
  const remaining: StatusUpdatePayload[] = [];

  for (const payload of queue) {
    try {
      await submitStatusUpdate(supabase, payload);
      flushed++;
    } catch {
      remaining.push(payload);
    }
  }

  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
  return flushed;
}

export function getOfflineQueueLength(): number {
  const q = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) ?? '[]');
  return Array.isArray(q) ? q.length : 0;
}

// ---------------------------------------------------------------------------
// Hedera Mirror Node verification
// ---------------------------------------------------------------------------

export async function verifyHcsMessage(
  topicId: string,
  sequenceNumber: number,
): Promise<{ valid: boolean; consensusTimestamp: string | null; message: unknown }> {
  const url = `https://mainnet-public.mirrornode.hedera.com/api/v1/topics/${topicId}/messages/${sequenceNumber}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return { valid: false, consensusTimestamp: null, message: null };
    const data = await res.json() as { consensus_timestamp?: string; message?: string };
    return {
      valid:              true,
      consensusTimestamp: data.consensus_timestamp ?? null,
      message:            JSON.parse(atob(data.message ?? '')),
    };
  } catch {
    return { valid: false, consensusTimestamp: null, message: null };
  }
}
