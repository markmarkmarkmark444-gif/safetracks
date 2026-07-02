'use client';

/**
 * /map — Public SSP Service Map
 *
 * Read-only view of active harm reduction services in Maine.
 * Uses Leaflet (no Mapbox API key required) with OpenStreetMap tiles.
 * Works offline: last-fetched GeoJSON cached in sessionStorage.
 *
 * Consumed by: Margaret Chase Smith Policy Center, Maine Drug Data Hub,
 * public-facing embed on Azimuth Foundation site.
 *
 * Privacy: all coordinates are census tract centroids. The map intentionally
 * does not show street-level precision. Zoom is limited to level 13 max
 * to reinforce the census-tract-only granularity commitment.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { fetchActiveServices, verifyHcsMessage, type GeoJSONFeature } from '@/lib/gis-api';

const SUPPLY_COLOR: Record<string, string> = {
  well_stocked: '#10b981',
  low:          '#f59e0b',
  out:          '#ef4444',
};

const STATUS_EMOJI: Record<string, string> = {
  active:    '🟢',
  delayed:   '🟡',
  scheduled: '🔵',
  completed: '⚫',
};

const HEDERA_CACHE_KEY = 'safetracks_geojson_cache';

export default function MapPage() {
  const mapRef       = useRef<HTMLDivElement>(null);
  const leafletRef   = useRef<unknown>(null);
  const [features, setFeatures] = useState<GeoJSONFeature[]>([]);
  const [selected, setSelected] = useState<GeoJSONFeature | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean; ts: string | null } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Load GeoJSON
  const loadServices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const collection = await fetchActiveServices({ hours_ahead: 24 });
      setFeatures(collection.features);
      setLastUpdated(new Date().toLocaleTimeString());
      sessionStorage.setItem(HEDERA_CACHE_KEY, JSON.stringify(collection));
    } catch {
      // Try cached data if network fails
      const cached = sessionStorage.getItem(HEDERA_CACHE_KEY);
      if (cached) {
        const c = JSON.parse(cached);
        setFeatures(c.features ?? []);
        setError('Using cached data — network unavailable');
      } else {
        setError('Could not load service data. Check your connection.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadServices(); }, [loadServices]);

  // Mount Leaflet map
  useEffect(() => {
    if (!mapRef.current || typeof window === 'undefined') return;

    // Lazy-load Leaflet (avoids SSR issues)
    import('leaflet').then(L => {
      if (leafletRef.current) return; // already mounted

      const map = L.map(mapRef.current!, {
        center:  [44.8, -69.0],   // Maine centroid
        zoom:    8,
        maxZoom: 13,              // census-tract granularity ceiling
        minZoom: 6,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      leafletRef.current = { map, L, markerGroup: L.layerGroup().addTo(map) };
    });

    return () => {
      const ref = leafletRef.current as { map: { remove(): void } } | null;
      ref?.map.remove();
      leafletRef.current = null;
    };
  }, []);

  // Re-render markers when features change
  useEffect(() => {
    const ref = leafletRef.current as {
      map: unknown; L: typeof import('leaflet'); markerGroup: { clearLayers(): void; addLayer(l: unknown): void }
    } | null;
    if (!ref || !features.length) return;

    const { L, markerGroup } = ref;
    markerGroup.clearLayers();

    features.forEach(feature => {
      const [lon, lat] = feature.geometry.coordinates;
      const p = feature.properties;

      // Color marker by worst supply level
      const worstSupply = worstOf(p.supplies.narcan, p.supplies.syringes, p.supplies.fentanyl_strips);
      const color = SUPPLY_COLOR[worstSupply ?? 'well_stocked'];

      const icon = L.divIcon({
        html: `<div style="
          width:22px;height:22px;border-radius:50%;
          background:${color};border:2px solid white;
          box-shadow:0 1px 4px rgba(0,0,0,0.5);
        "></div>`,
        iconSize:   [22, 22],
        iconAnchor: [11, 11],
        className:  '',
      });

      const marker = L.marker([lat, lon], { icon });
      marker.on('click', () => setSelected(feature));
      markerGroup.addLayer(marker);
    });
  }, [features]);

  async function handleVerify(feature: GeoJSONFeature) {
    const v = feature.properties.verification;
    if (!v.hcs_topic_id || !v.hcs_sequence_number) return;
    setVerifying(true);
    setVerifyResult(null);
    const result = await verifyHcsMessage(v.hcs_topic_id, v.hcs_sequence_number);
    setVerifyResult({ valid: result.valid, ts: result.consensusTimestamp });
    setVerifying(false);
  }

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 z-10">
        <div>
          <h1 className="font-semibold text-base">SSP Service Map</h1>
          <p className="text-xs text-slate-500">Maine Drug Data Hub · Azimuth Foundation</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-slate-500">Updated {lastUpdated}</span>
          )}
          <button
            onClick={loadServices}
            disabled={loading}
            className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg disabled:opacity-40"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && (
        <div className="bg-amber-900/50 border-b border-amber-700 px-4 py-2 text-sm text-amber-300">
          {error}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Map */}
        <div ref={mapRef} className="flex-1" style={{ zIndex: 0 }} />

        {/* Side panel */}
        <div className="w-80 flex flex-col bg-slate-900 border-l border-slate-800 overflow-y-auto">

          {/* Service list */}
          <div className="p-3 border-b border-slate-800">
            <h2 className="text-xs text-slate-400 uppercase tracking-wide mb-2">
              Active services ({features.length})
            </h2>
            <div className="flex flex-col gap-2">
              {features.map(f => (
                <ServiceCard
                  key={f.properties.id}
                  feature={f}
                  isSelected={selected?.properties.id === f.properties.id}
                  onClick={() => setSelected(f)}
                />
              ))}
              {!loading && features.length === 0 && (
                <p className="text-sm text-slate-600 py-4 text-center">No active services in the next 24 hours.</p>
              )}
            </div>
          </div>

          {/* Detail panel */}
          {selected && (
            <div className="p-3 flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-slate-100">{selected.properties.provider}</div>
                  <div className="text-xs text-slate-500 mt-0.5">Tract {selected.properties.census_tract}</div>
                </div>
                <button onClick={() => setSelected(null)} className="text-slate-600 hover:text-slate-400 text-lg leading-none">×</button>
              </div>

              {/* Window */}
              <div className="text-xs text-slate-400">
                <div>{formatWindow(selected.properties.window_start, selected.properties.window_end)}</div>
                {selected.properties.delay_minutes && (
                  <div className="text-amber-400 mt-0.5">⚠ Running ~{selected.properties.delay_minutes} min late</div>
                )}
              </div>

              {/* Supplies */}
              <div className="rounded-lg bg-slate-800 p-3">
                <div className="text-xs text-slate-400 mb-2">Supplies</div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ['Narcan', selected.properties.supplies.narcan],
                    ['Syringes', selected.properties.supplies.syringes],
                    ['Fentanyl strips', selected.properties.supplies.fentanyl_strips],
                  ].map(([name, level]) => (
                    <div key={name as string} className="text-center">
                      <div
                        className="w-3 h-3 rounded-full mx-auto mb-1"
                        style={{ background: SUPPLY_COLOR[level as string ?? 'well_stocked'] }}
                      />
                      <div className="text-[10px] text-slate-400">{name as string}</div>
                      <div className="text-[10px] text-slate-300 capitalize">{(level as string)?.replace('_', ' ') ?? '—'}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cryptographic verification */}
              <div className="rounded-lg bg-slate-800 p-3">
                <div className="text-xs text-slate-400 mb-2">Hedera Verification</div>
                {selected.properties.verification.hcs_transaction_id ? (
                  <>
                    <div className="text-[10px] text-slate-500 font-mono break-all mb-2">
                      {selected.properties.verification.hcs_transaction_id}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleVerify(selected)}
                        disabled={verifying}
                        className="flex-1 text-xs bg-slate-700 hover:bg-slate-600 rounded-lg py-1.5 disabled:opacity-40"
                      >
                        {verifying ? 'Checking…' : 'Verify on HCS'}
                      </button>
                      {selected.properties.verification.verify_url && (
                        <a
                          href={selected.properties.verification.verify_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 text-center text-xs bg-slate-700 hover:bg-slate-600 rounded-lg py-1.5"
                        >
                          Hashscan ↗
                        </a>
                      )}
                    </div>
                    {verifyResult && (
                      <div className={`mt-2 text-xs rounded px-2 py-1 ${verifyResult.valid ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300'}`}>
                        {verifyResult.valid
                          ? `✓ Verified · ${verifyResult.ts ? new Date(verifyResult.ts).toLocaleString() : 'timestamp pending'}`
                          : '✗ Not found on HCS mirror node'}
                      </div>
                    )}
                    {selected.properties.verification.zk_commitment && (
                      <div className="mt-2">
                        <div className="text-[10px] text-slate-500 mb-0.5">ZK commitment</div>
                        <div className="text-[10px] text-slate-400 font-mono break-all">
                          {selected.properties.verification.zk_commitment.slice(0, 32)}…
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-xs text-slate-500">Awaiting HCS confirmation…</div>
                )}
              </div>

              <p className="text-[10px] text-slate-600">
                Location shown is the census tract centroid. No exact address is recorded or displayed.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ServiceCard
// ---------------------------------------------------------------------------

function ServiceCard({ feature, isSelected, onClick }: {
  feature:    GeoJSONFeature;
  isSelected: boolean;
  onClick:    () => void;
}) {
  const p = feature.properties;
  const worst = worstOf(p.supplies.narcan, p.supplies.syringes, p.supplies.fentanyl_strips);

  return (
    <button
      onClick={onClick}
      className={`
        text-left rounded-lg px-3 py-2.5 border transition-all
        ${isSelected
          ? 'bg-slate-800 border-slate-600 ring-1 ring-emerald-500'
          : 'bg-slate-850 border-slate-800 hover:border-slate-700'}
      `}
    >
      <div className="flex items-start gap-2">
        <div
          className="w-2.5 h-2.5 rounded-full mt-1 shrink-0"
          style={{ background: SUPPLY_COLOR[worst ?? 'well_stocked'] }}
        />
        <div className="min-w-0">
          <div className="text-sm font-medium text-slate-100 truncate">{p.provider}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {STATUS_EMOJI[p.status]} {formatTimeRange(p.window_start, p.window_end)}
          </div>
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function worstOf(...levels: (string | null)[]): string | null {
  if (levels.some(l => l === 'out'))          return 'out';
  if (levels.some(l => l === 'low'))          return 'low';
  if (levels.some(l => l === 'well_stocked')) return 'well_stocked';
  return null;
}

function formatWindow(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const today = new Date();
  const isToday = s.toDateString() === today.toDateString();
  const dateStr = isToday ? 'Today' : s.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return `${dateStr}, ${formatTimeRange(start, end)}`;
}

function formatTimeRange(start: string, end: string): string {
  const fmt = (d: string) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${fmt(start)} – ${fmt(end)}`;
}
