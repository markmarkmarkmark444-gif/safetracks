'use client';

/**
 * Supplies Page — kit and service selection (operational, staff-visible)
 * Unlike survey answers, supply selections are stored as readable JSON
 * so harm reduction staff can prepare kits before the participant leaves.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getSupplyOptions, submitSupplies } from '@/lib/api';

const KIT_ICONS: Record<string, string> = {
  'NARCAN':             '💉',
  'BASIC FIRST AID KIT': '🩹',
  'WOUND CARE KIT':     '🩺',
  'SAFER USE SUPPLIES': '🧪',
  'BASIC HYGIENE KIT':  '🧼',
  'SAFE SEX SUPPLIES':  '🛡️',
};

export default function SuppliesPage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [consentId, setConsentId] = useState<string | null>(null);
  const [availableItems, setAvailableItems] = useState<string[]>([]);
  const [availableServices, setAvailableServices] = useState<string[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOptions = useCallback(async () => {
    try {
      const opts = await getSupplyOptions();
      setAvailableItems([...opts.items]);
      setAvailableServices([...opts.services]);
    } catch {
      setError('Failed to load supply options');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const sid = sessionStorage.getItem('safetracks_session_id');
    const cid = sessionStorage.getItem('safetracks_consent_id');
    if (!sid || !cid) { router.replace('/'); return; }
    setSessionId(sid);
    setConsentId(cid);
    loadOptions();
  }, [router, loadOptions]);

  function toggleItem(name: string) {
    setSelectedItems(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  function toggleService(name: string) {
    setSelectedServices(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  async function handleSubmit() {
    if (!sessionId || !consentId) return;
    setSubmitting(true);
    setError(null);

    try {
      const result = await submitSupplies(
        sessionId, consentId,
        Array.from(selectedItems),
        Array.from(selectedServices)
      );
      sessionStorage.setItem('safetracks_supply_id', result.supply_id);
      router.push('/reward');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
      setSubmitting(false);
    }
  }

  function handleSkip() {
    router.push('/reward');
  }

  if (loading) {
    return (
      <main className="screen">
        <div className="container-sm flex flex-col items-center gap-4 mt-20">
          <div className="w-12 h-12 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          <p className="text-slate-500">Loading options…</p>
        </div>
      </main>
    );
  }

  const hasSelection = selectedItems.size > 0 || selectedServices.size > 0;

  return (
    <main className="screen">
      <div className="container-sm flex flex-col gap-5 pb-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-brand-100 flex items-center justify-center">
            <span className="text-xl">📦</span>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Supplies & Services</h1>
            <p className="text-xs text-slate-500">Optional — select what you need today</p>
          </div>
        </div>

        {/* Progress */}
        <div className="w-full h-1.5 bg-slate-100 rounded-full">
          <div className="h-full w-5/6 bg-brand-500 rounded-full" />
        </div>

        {/* Kits */}
        <div className="card flex flex-col gap-3">
          <h2 className="font-semibold text-slate-800 text-sm">What can we get you today?</h2>
          <p className="text-xs text-slate-400">Select all that apply</p>
          <div className="flex flex-col gap-2">
            {availableItems.map(item => {
              const selected = selectedItems.has(item);
              return (
                <button
                  key={item}
                  onClick={() => toggleItem(item)}
                  className={`w-full p-3.5 rounded-2xl text-left transition-all duration-200 border-2 ${
                    selected
                      ? 'bg-brand-50 border-brand-500'
                      : 'bg-white border-slate-200 hover:border-brand-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      selected ? 'border-brand-500 bg-brand-500' : 'border-slate-300'
                    }`}>
                      {selected && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className="text-lg">{KIT_ICONS[item] ?? '📦'}</span>
                    <span className={`text-sm font-medium ${selected ? 'text-brand-800' : 'text-slate-700'}`}>
                      {item}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Services */}
        <div className="card flex flex-col gap-3">
          <h2 className="font-semibold text-slate-800 text-sm">Services you&apos;re interested in?</h2>
          <p className="text-xs text-slate-400">We can connect you with any of the following</p>
          <div className="flex flex-wrap gap-2">
            {availableServices.map(svc => {
              const selected = selectedServices.has(svc);
              return (
                <button
                  key={svc}
                  onClick={() => toggleService(svc)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium transition-all duration-200 border ${
                    selected
                      ? 'bg-brand-600 border-brand-600 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-brand-300'
                  }`}
                >
                  {svc}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
            <p className="text-red-700 text-sm text-center">{error}</p>
          </div>
        )}

        {/* Summary */}
        {hasSelection && (
          <div className="bg-brand-50 border border-brand-200 rounded-2xl p-4 text-sm">
            <p className="font-medium text-brand-800 mb-1">Selected:</p>
            {selectedItems.size > 0 && (
              <p className="text-brand-700">{Array.from(selectedItems).join(', ')}</p>
            )}
            {selectedServices.size > 0 && (
              <p className="text-brand-600 mt-1 text-xs">{Array.from(selectedServices).join(' · ')}</p>
            )}
          </div>
        )}

        {/* Actions */}
        {submitting ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
            <p className="text-slate-500 text-sm">Recording your request…</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <button className="btn-primary" onClick={handleSubmit}>
              {hasSelection ? `Submit & Get Reward →` : 'Continue to Reward →'}
            </button>
            <button className="btn-secondary text-base" onClick={handleSkip}>
              Skip for now
            </button>
          </div>
        )}

        <p className="text-xs text-slate-400 text-center">
          Supply requests are seen by harm reduction staff only. Never shared externally.
        </p>
      </div>
    </main>
  );
}
