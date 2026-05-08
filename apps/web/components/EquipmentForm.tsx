'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

const EQUIPMENT_TYPES = [
  'dehumidifier', 'air_mover', 'air_scrubber', 'hepa_air_scrubber',
  'hydroxyl_generator', 'ozone_generator', 'thermal_fogger',
  'desiccant_dehumidifier', 'negative_air_machine', 'moisture_meter',
  'thermo_hygrometer', 'infrared_camera', 'other',
];

export function EquipmentForm({ jobId }: { jobId: string }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    type: 'dehumidifier',
    make: '',
    model: '',
    serialNumber: '',
    assetTag: '',
    placedRoom: '',
    dailyRentalRate: '',
  });

  const { data } = useQuery({
    queryKey: ['equipment', jobId],
    queryFn: () => api.equipment.list(jobId).then(r => r.data),
  });

  const placeEquipment = useMutation({
    mutationFn: () => api.equipment.place({
      jobId,
      ...form,
      dailyRentalRate: form.dailyRentalRate ? parseFloat(form.dailyRentalRate) : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipment', jobId] });
      setShowForm(false);
      setForm({ type: 'dehumidifier', make: '', model: '', serialNumber: '', assetTag: '', placedRoom: '', dailyRentalRate: '' });
    },
  });

  const removeEquipment = useMutation({
    mutationFn: ({ id, hoursOnJob }: { id: string; hoursOnJob: number }) =>
      api.equipment.remove(id, { hoursOnJob }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['equipment', jobId] }),
  });

  const equipment = data?.equipment ?? [];
  const active = equipment.filter((e: any) => !e.removedAt);
  const removed = equipment.filter((e: any) => e.removedAt);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-800">Equipment Tracking</h3>
          <p className="text-xs text-slate-400 mt-0.5">{active.length} active pieces, {removed.length} removed</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary text-sm">
          {showForm ? 'Cancel' : '+ Place Equipment'}
        </button>
      </div>

      {showForm && (
        <div className="card space-y-4 max-w-xl">
          <h4 className="font-medium text-slate-700">Place New Equipment</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
              <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                {EQUIPMENT_TYPES.map(t => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            {['make', 'model', 'serialNumber', 'assetTag', 'placedRoom', 'dailyRentalRate'].map(field => (
              <div key={field}>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {field === 'dailyRentalRate' ? 'Daily Rate ($)' : field.replace(/([A-Z])/g, ' $1').trim()}
                </label>
                <input
                  type={field === 'dailyRentalRate' ? 'number' : 'text'}
                  value={form[field as keyof typeof form]}
                  onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  required={['make', 'model', 'serialNumber', 'placedRoom'].includes(field)}
                />
              </div>
            ))}
          </div>
          <button
            onClick={() => placeEquipment.mutate()}
            disabled={placeEquipment.isPending || !form.make || !form.model || !form.serialNumber || !form.placedRoom}
            className="btn-primary"
          >
            {placeEquipment.isPending ? 'Placing...' : 'Place Equipment'}
          </button>
          {placeEquipment.isSuccess && <span className="text-green-600 text-sm">✓ Placed & anchored on Hedera</span>}
        </div>
      )}

      {/* Active Equipment */}
      {active.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-6 py-3 border-b border-slate-200 bg-blue-50">
            <h4 className="font-semibold text-sm text-blue-800">Active Equipment ({active.length})</h4>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                {['Type', 'Make/Model', 'Serial #', 'Room', 'Placed', 'Daily Rate', ''].map(h => (
                  <th key={h} className="px-4 py-2 text-left font-medium text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {active.map((eq: any) => (
                <tr key={eq.id}>
                  <td className="px-4 py-3 font-medium capitalize">{eq.type.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3">{eq.make} {eq.model}</td>
                  <td className="px-4 py-3 font-mono text-slate-500">{eq.serialNumber}</td>
                  <td className="px-4 py-3">{eq.placedRoom}</td>
                  <td className="px-4 py-3 text-slate-400">{new Date(eq.placedAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-slate-400">
                    {eq.dailyRentalRate ? `$${eq.dailyRentalRate}/day` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <RemoveButton equipId={eq.id} onRemove={(hours) => removeEquipment.mutate({ id: eq.id, hoursOnJob: hours })} />
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

function RemoveButton({ equipId, onRemove }: { equipId: string; onRemove: (hours: number) => void }) {
  const [hours, setHours] = useState('');
  const [open, setOpen] = useState(false);

  if (!open) {
    return <button onClick={() => setOpen(true)} className="text-red-400 hover:text-red-600 text-xs">Remove</button>;
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={hours}
        onChange={e => setHours(e.target.value)}
        placeholder="Hours"
        className="w-16 border border-slate-300 rounded px-2 py-1 text-xs"
      />
      <button
        onClick={() => hours && onRemove(parseFloat(hours))}
        className="text-red-500 font-semibold text-xs hover:text-red-700"
      >
        ✓
      </button>
      <button onClick={() => setOpen(false)} className="text-slate-400 text-xs">✕</button>
    </div>
  );
}
