'use client';

/**
 * Consent Page — REQUIRED gate before any data collection
 * Consent generates a cryptographic artifact anchored to all downstream data.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { submitConsent } from '@/lib/api';

const CONSENT_VERSION = '1.0';

const CONSENT_POINTS = [
  {
    icon: '🔑',
    title: 'Cryptographic Consent',
    body: 'Your consent generates a unique cryptographic artifact — a mathematical proof that you agreed. This artifact seeds all downstream privacy guarantees.',
  },
  {
    icon: '🕶️',
    title: 'Zero Personal Data',
    body: 'We collect no name, email, phone, or device ID. Your session is identified only by a random UUID that expires when you close this tab.',
  },
  {
    icon: '⚡',
    title: 'Zero-Knowledge Proof',
    body: 'Your answers are processed through a ZK circuit. Only a cryptographic commitment (not the answers) is anchored to the blockchain.',
  },
  {
    icon: '🏥',
    title: 'HIPAA-Aware Design',
    body: 'Raw health data never leaves your device unencrypted. Our architecture separates identity, data, and billing layers by design.',
  },
  {
    icon: '💰',
    title: 'Reward System',
    body: 'You earn $2–$25 per session. Rewards are issued via an opaque token unlinked to your identity.',
  },
];

export default function ConsentPage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    const id = sessionStorage.getItem('safetracks_session_id');
    if (!id) {
      router.replace('/');
      return;
    }
    setSessionId(id);
  }, [router]);

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 40;
    if (atBottom) setScrolledToBottom(true);
  }

  async function handleConsent(given: boolean) {
    if (!sessionId) return;
    setLoading(true);
    setError(null);

    try {
      const result = await submitConsent(sessionId, given, CONSENT_VERSION);

      if (!given) {
        router.push('/?declined=true');
        return;
      }

      sessionStorage.setItem('safetracks_consent_id', result.consent_id);
      sessionStorage.setItem('safetracks_consent_artifact', result.consent_artifact);
      router.push('/survey');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record consent');
      setLoading(false);
    }
  }

  if (!sessionId) return null;

  return (
    <main className="screen">
      <div className="container-sm flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-brand-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Your Consent Matters</h1>
            <p className="text-xs text-slate-500">Step 1 of 3 — Required</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 bg-slate-100 rounded-full">
          <div className="h-full w-1/3 bg-brand-500 rounded-full transition-all" />
        </div>

        {/* Consent details — scrollable */}
        <div
          className="card overflow-y-auto max-h-72 flex flex-col gap-4"
          onScroll={handleScroll}
        >
          <p className="text-sm text-slate-600 leading-relaxed font-medium">
            Before we begin, please read how SafeTracks protects your privacy.
            Scroll to the bottom to enable consent.
          </p>

          {CONSENT_POINTS.map((point, i) => (
            <div key={i} className="border border-slate-100 rounded-2xl overflow-hidden">
              <button
                className="w-full text-left p-4 flex items-center gap-3 hover:bg-slate-50 transition-colors"
                onClick={() => setExpanded(expanded === i ? null : i)}
              >
                <span className="text-2xl">{point.icon}</span>
                <span className="font-medium text-slate-800 text-sm flex-1">{point.title}</span>
                <svg
                  className={`w-4 h-4 text-slate-400 transition-transform ${expanded === i ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expanded === i && (
                <div className="px-4 pb-4 text-sm text-slate-500 leading-relaxed border-t border-slate-100 pt-3">
                  {point.body}
                </div>
              )}
            </div>
          ))}

          {/* Scroll sentinel */}
          <div className="text-center py-2">
            <p className="text-xs text-slate-400">↑ Scroll up to review details</p>
          </div>
        </div>

        {/* Consent artifact notice */}
        <div className="bg-brand-50 border border-brand-200 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-brand-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-brand-800">
              Consenting generates a <strong>cryptographic artifact</strong> — a unique mathematical fingerprint of your agreement. This artifact anchors all privacy guarantees.
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-center">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Action buttons */}
        {loading ? (
          <div className="flex justify-center py-4">
            <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <button
              className="btn-primary disabled:opacity-40"
              disabled={!scrolledToBottom}
              onClick={() => handleConsent(true)}
            >
              {scrolledToBottom ? 'I Consent — Continue' : 'Scroll to enable consent ↑'}
            </button>
            <button
              className="btn-secondary"
              onClick={() => handleConsent(false)}
            >
              Decline — Exit
            </button>
          </div>
        )}

        <p className="text-xs text-slate-400 text-center">
          You may withdraw consent at any time. Declining removes all session data immediately.
        </p>
      </div>
    </main>
  );
}
