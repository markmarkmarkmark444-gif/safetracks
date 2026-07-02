'use client';

/**
 * ServiceStatusForm
 *
 * PWA form for field workers to submit real-time service status updates.
 * Works offline — queues submissions to localStorage when network is unavailable.
 * Designed for one-hand operation on mobile; large tap targets.
 *
 * Privacy: no GPS, no participant counts. Worker submits:
 *   - Which census tract / route stop they're at (dropdown, not freeform)
 *   - Operational status (active / delayed / completed)
 *   - Supply levels (categorical: well_stocked / low / out)
 */

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  submitStatusUpdate,
  flushOfflineQueue,
  getOfflineQueueLength,
  type StatusUpdatePayload,
} from '@/lib/gis-api';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

type SupplyLevel = 'well_stocked' | 'low' | 'out';
type ServiceStatus = 'active' | 'delayed' | 'completed';

interface RouteStop {
  id:           string;
  stop_name:    string;
  census_tract: string;
  route_id:     string;
  stop_sequence: number;
}

const SUPPLY_LABELS: Record<SupplyLevel, string> = {
  well_stocked: 'Well stocked',
  low:          'Low — getting there',
  out:          'Out — need restock',
};

const STATUS_LABELS: Record<ServiceStatus, string> = {
  active:    "We're here",
  delayed:   'Running late',
  completed: 'Wrapped up',
};

const SUPPLY_COLORS: Record<SupplyLevel, string> = {
  well_stocked: 'bg-emerald-700 ring-emerald-400',
  low:          'bg-amber-700 ring-amber-400',
  out:          'bg-red-800 ring-red-500',
};

const STATUS_COLORS: Record<ServiceStatus, string> = {
  active:    'bg-emerald-700 ring-emerald-400',
  delayed:   'bg-amber-700 ring-amber-400',
  completed: 'bg-slate-700 ring-slate-400',
};

export default function ServiceStatusForm({ providerId, shiftCode }: {
  providerId: string;
  shiftCode:  string;
}) {
  const [stops, setStops]       = useState<RouteStop[]>([]);
  const [selectedStop, setSelectedStop] = useState<RouteStop | null>(null);
  const [status, setStatus]     = useState<ServiceStatus>('active');
  const [delayMin, setDelayMin] = useState(0);
  const [narcan, setNarcan]     = useState<SupplyLevel>('well_stocked');
  const [syringes, setSyringes] = useState<SupplyLevel>('well_stocked');
  const [ftStrips, setFtStrips] = useState<SupplyLevel>('well_stocked');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult]     = useState<{ success: boolean; message: string; queued?: boolean } | null>(null);
  const [queueLen, setQueueLen] = useState(0);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    loadRouteStops();
    setQueueLen(getOfflineQueueLength());
    setIsOnline(navigator.onLine);
    const onOnline  = () => { setIsOnline(true);  tryFlushQueue(); };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadRouteStops() {
    const { data } = await supabase
      .from('route_stops')
      .select('id, stop_name, census_tract, route_id, stop_sequence')
      .order('stop_sequence');
    if (data) setStops(data);
  }

  async function tryFlushQueue() {
    const flushed = await flushOfflineQueue(supabase);
    if (flushed > 0) setQueueLen(getOfflineQueueLength());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStop) return;

    setSubmitting(true);
    setResult(null);

    const now = new Date();
    const windowEnd = new Date(now.getTime() + 3 * 3600 * 1000);

    const payload: StatusUpdatePayload = {
      provider_id:         providerId,
      route_id:            selectedStop.route_id,
      census_tract:        selectedStop.census_tract,
      service_date:        now.toISOString().slice(0, 10),
      window_start:        now.toISOString(),
      window_end:          windowEnd.toISOString(),
      status,
      delay_minutes:       status === 'delayed' ? delayMin : undefined,
      narcan_level:        narcan,
      syringe_level:       syringes,
      fentanyl_test_level: ftStrips,
      shift_code:          shiftCode,
    };

    try {
      const res = await submitStatusUpdate(supabase, payload);
      setQueueLen(getOfflineQueueLength());
      setResult({
        success: true,
        queued:  res.queued,
        message: res.queued
          ? "Saved offline — will sync when you're back online."
          : res.duplicate
          ? 'Already submitted for this window.'
          : 'Status updated. Queued for Hedera verification.',
      });
    } catch (err) {
      setResult({ success: false, message: String(err) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 max-w-md mx-auto p-4">
      {!isOnline && (
        <div className="rounded-lg bg-amber-900/60 border border-amber-600 px-3 py-2 text-sm text-amber-200 flex items-center gap-2">
          <span>📵</span>
          <span>You&apos;re offline — updates will sync when connected.</span>
        </div>
      )}
      {queueLen > 0 && isOnline && (
        <div className="rounded-lg bg-sky-900/60 border border-sky-600 px-3 py-2 text-sm text-sky-200 flex items-center justify-between">
          <span>{queueLen} update{queueLen > 1 ? 's' : ''} queued offline</span>
          <button type="button" onClick={tryFlushQueue} className="underline text-sky-300 text-xs">Sync now</button>
        </div>
      )}

      <div>
        <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wide">Current stop</label>
        <div className="grid gap-2">
          {stops.map(stop => (
            <button
              key={stop.id}
              type="button"
              onClick={() => setSelectedStop(stop)}
              className={`text-left rounded-xl px-4 py-3 border transition-all ${
                selectedStop?.id === stop.id
                  ? 'bg-emerald-900/70 border-emerald-500 ring-1 ring-emerald-400'
                  : 'bg-slate-800 border-slate-700 hover:border-slate-500'
              }`}
            >
              <div className="font-medium text-slate-100">{stop.stop_name}</div>
              <div className="text-xs text-slate-500 mt-0.5">Tract {stop.census_tract}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wide">Service status</label>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(STATUS_LABELS) as ServiceStatus[]).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-xl py-3 text-sm font-semibold border transition-all ${
                status === s
                  ? `${STATUS_COLORS[s]} ring-2 text-white`
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        {status === 'delayed' && (
          <div className="mt-3">
            <label className="block text-xs text-slate-400 mb-1">Minutes behind schedule</label>
            <input
              type="number"
              min={1} max={240}
              value={delayMin}
              onChange={e => setDelayMin(Number(e.target.value))}
              className="w-24 rounded-lg bg-slate-800 border border-slate-600 px-3 py-2 text-white text-center focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-2 uppercase tracking-wide">Supply levels</label>
        {([
          ['Narcan / Naloxone', narcan, setNarcan],
          ['Syringes', syringes, setSyringes],
          ['Fentanyl test strips', ftStrips, setFtStrips],
        ] as [string, SupplyLevel, (v: SupplyLevel) => void][]).map(([label, val, setter]) => (
          <div key={label} className="mb-3">
            <div className="text-sm text-slate-300 mb-1.5">{label}</div>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(SUPPLY_LABELS) as SupplyLevel[]).map(level => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setter(level)}
                  className={`rounded-lg py-2 text-xs font-medium border transition-all ${
                    val === level
                      ? `${SUPPLY_COLORS[level]} ring-2 text-white`
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  {SUPPLY_LABELS[level]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        type="submit"
        disabled={!selectedStop || submitting}
        className="btn-primary py-4 text-base font-semibold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {submitting ? 'Submitting…' : 'Update Status'}
      </button>

      {result && (
        <div className={`rounded-xl px-4 py-3 text-sm ${
          result.success
            ? result.queued
              ? 'bg-amber-900/50 border border-amber-600 text-amber-200'
              : 'bg-emerald-900/50 border border-emerald-600 text-emerald-200'
            : 'bg-red-900/50 border border-red-700 text-red-300'
        }`}>
          {result.message}
        </div>
      )}

      <p className="text-xs text-slate-600 text-center mt-2">
        Location is census-tract only — no GPS is recorded or transmitted.
      </p>
    </form>
  );
}
