'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { DRY_STANDARDS_BY_MATERIAL } from '@safetracks/shared';

const MATERIALS = Object.keys(DRY_STANDARDS_BY_MATERIAL);

export function MoistureLogForm({ jobId }: { jobId: string }) {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'moisture' | 'psychro'>('moisture');

  const { data } = useQuery({
    queryKey: ['moisture', jobId],
    queryFn: () => api.moisture.list(jobId).then(r => r.data),
  });

  const [moistureForm, setMoisture] = useState({
    room: '', material: 'drywall', location: '', readingPct: '', dryStandard: '14',
  });

  const [psychroForm, setPsychro] = useState({
    room: '', temperatureF: '', relativeHumidityPct: '',
  });

  const logMoisture = useMutation({
    mutationFn: () => api.moisture.logReading({
      jobId,
      ...moistureForm,
      readingPct: parseFloat(moistureForm.readingPct),
      dryStandard: parseFloat(moistureForm.dryStandard),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['moisture', jobId] });
      setMoisture(prev => ({ ...prev, readingPct: '' }));
    },
  });

  const logPsychro = useMutation({
    mutationFn: () => api.moisture.logPsychro({
      jobId,
      ...psychroForm,
      temperatureF: parseFloat(psychroForm.temperatureF),
      relativeHumidityPct: parseFloat(psychroForm.relativeHumidityPct),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['moisture', jobId] });
      setPsychro({ room: '', temperatureF: '', relativeHumidityPct: '' });
    },
  });

  const updateMaterial = (mat: string) => {
    const std = DRY_STANDARDS_BY_MATERIAL[mat as keyof typeof DRY_STANDARDS_BY_MATERIAL] ?? 14;
    setMoisture(prev => ({ ...prev, material: mat, dryStandard: String(std) }));
  };

  return (
    <div className="space-y-6">
      {/* Tab selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('moisture')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${activeTab === 'moisture' ? 'bg-brand-700 text-white' : 'btn-secondary'}`}
        >
          Moisture Reading
        </button>
        <button
          onClick={() => setActiveTab('psychro')}
          className={`px-4 py-2 rounded-lg text-sm font-medium ${activeTab === 'psychro' ? 'bg-brand-700 text-white' : 'btn-secondary'}`}
        >
          Psychrometric Reading
        </button>
      </div>

      {activeTab === 'moisture' && (
        <div className="card space-y-4 max-w-xl">
          <h3 className="font-semibold text-slate-800">Log Moisture Reading (S500 §11)</h3>
          <div className="grid grid-cols-2 gap-3">
            <InputField label="Room" value={moistureForm.room}
              onChange={v => setMoisture(p => ({ ...p, room: v }))} placeholder="e.g. Master Bedroom" />
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Material</label>
              <select
                value={moistureForm.material}
                onChange={e => updateMaterial(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
              >
                {MATERIALS.map(m => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <InputField label="Location" value={moistureForm.location}
              onChange={v => setMoisture(p => ({ ...p, location: v }))} placeholder="e.g. N wall, 12in from floor" />
            <InputField label="Reading (%)" value={moistureForm.readingPct} type="number"
              onChange={v => setMoisture(p => ({ ...p, readingPct: v }))} placeholder="e.g. 22" />
            <InputField label="Dry Standard (%)" value={moistureForm.dryStandard} type="number"
              onChange={v => setMoisture(p => ({ ...p, dryStandard: v }))} placeholder="e.g. 14" />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => logMoisture.mutate()}
              disabled={logMoisture.isPending || !moistureForm.room || !moistureForm.readingPct}
              className="btn-primary"
            >
              {logMoisture.isPending ? 'Logging...' : 'Log Reading'}
            </button>
            {logMoisture.isSuccess && <span className="text-green-600 text-sm">✓ Anchored on Hedera</span>}
          </div>
        </div>
      )}

      {activeTab === 'psychro' && (
        <div className="card space-y-4 max-w-xl">
          <h3 className="font-semibold text-slate-800">Log Psychrometric Reading (S500 §12)</h3>
          <p className="text-xs text-slate-500">Dew point and grains/lb are calculated automatically.</p>
          <div className="grid grid-cols-2 gap-3">
            <InputField label="Room" value={psychroForm.room}
              onChange={v => setPsychro(p => ({ ...p, room: v }))} placeholder="e.g. Living Room" />
            <InputField label="Temperature (°F)" value={psychroForm.temperatureF} type="number"
              onChange={v => setPsychro(p => ({ ...p, temperatureF: v }))} placeholder="e.g. 76" />
            <InputField label="Relative Humidity (%)" value={psychroForm.relativeHumidityPct} type="number"
              onChange={v => setPsychro(p => ({ ...p, relativeHumidityPct: v }))} placeholder="e.g. 58" />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => logPsychro.mutate()}
              disabled={logPsychro.isPending || !psychroForm.room || !psychroForm.temperatureF}
              className="btn-primary"
            >
              {logPsychro.isPending ? 'Logging...' : 'Log Reading'}
            </button>
            {logPsychro.isSuccess && <span className="text-green-600 text-sm">✓ Saved</span>}
          </div>
        </div>
      )}

      {/* Readings table */}
      {data?.moistureReadings?.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-6 py-3 border-b border-slate-200">
            <h3 className="font-semibold text-sm text-slate-800">Moisture History</h3>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                {['Date', 'Room', 'Material', 'Location', 'Reading', 'Std', 'Status', 'Hedera TX'].map(h => (
                  <th key={h} className="px-4 py-2 text-left font-medium text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.moistureReadings.map((r: any) => (
                <tr key={r.id} className={r.readingPct > r.dryStandard ? 'bg-red-50' : 'bg-green-50/30'}>
                  <td className="px-4 py-2 text-slate-600">{new Date(r.timestamp).toLocaleDateString()}</td>
                  <td className="px-4 py-2 font-medium">{r.room}</td>
                  <td className="px-4 py-2 text-slate-500">{r.material}</td>
                  <td className="px-4 py-2 text-slate-400 max-w-24 truncate">{r.location}</td>
                  <td className="px-4 py-2 font-bold">{r.readingPct}%</td>
                  <td className="px-4 py-2 text-slate-400">{r.dryStandard}%</td>
                  <td className="px-4 py-2">
                    {r.readingPct <= r.dryStandard
                      ? <span className="text-green-600 font-semibold">DRY ✓</span>
                      : <span className="text-red-500 font-semibold">WET</span>
                    }
                  </td>
                  <td className="px-4 py-2 font-mono text-slate-300 text-[10px] truncate max-w-24">
                    {r.hederaTxId?.slice(0, 20)}…
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function InputField({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  );
}
