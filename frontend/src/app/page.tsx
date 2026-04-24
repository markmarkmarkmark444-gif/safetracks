'use client';

/**
 * QR Entry Page — first screen after QR scan
 * Creates an anonymous session and routes to consent
 */

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSession } from '@/lib/api';
import { Suspense } from 'react';

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionCreated, setSessionCreated] = useState(false);

  // QR code ID can be passed via ?qr= param (embedded in the QR code)
  const qrCodeId = searchParams.get('qr') ?? `demo-${Date.now()}`;
  const locationTag = searchParams.get('loc') ?? undefined;

  useEffect(() => {
    // Auto-start session on landing (QR scan behavior)
    if (!sessionCreated) {
      handleStart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleStart() {
    setLoading(true);
    setError(null);

    try {
      const { session_id } = await createSession(qrCodeId, locationTag);
      setSessionCreated(true);
      // Store session in sessionStorage (never localStorage — clears on tab close)
      sessionStorage.setItem('safetracks_session_id', session_id);
      sessionStorage.setItem('safetracks_qr_id', qrCodeId);
      router.push('/consent');
    } catch {
      setError('Unable to connect. Please check your connection and try again.');
      setLoading(false);
    }
  }

  return (
    <main className="screen">
      <div className="container-sm flex flex-col items-center gap-8 mt-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-3xl bg-brand-600 flex items-center justify-center shadow-lg">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-bold text-slate-900">SafeTracks</h1>
            <p className="text-slate-500 mt-1 text-sm">Anonymous • Secure • Community</p>
          </div>
        </div>

        {/* Hero */}
        <div className="card w-full text-center">
          <div className="text-4xl mb-3">🔒</div>
          <h2 className="text-xl font-semibold text-slate-800 mb-2">
            Your Privacy, Protected
          </h2>
          <p className="text-slate-500 text-sm leading-relaxed">
            SafeTracks collects anonymous health signals to help your community.
            No account. No personal data. Cryptographically verified.
          </p>
        </div>

        {/* Privacy pillars */}
        <div className="w-full grid grid-cols-3 gap-3">
          {[
            { icon: '🕶️', label: 'No PII', sub: 'Zero personal data' },
            { icon: '⚡', label: 'ZK Proof', sub: 'Math-backed privacy' },
            { icon: '⛓️', label: 'Hedera', sub: 'Blockchain verified' },
          ].map(item => (
            <div key={item.label} className="card text-center p-4">
              <div className="text-2xl mb-1">{item.icon}</div>
              <div className="text-xs font-semibold text-slate-700">{item.label}</div>
              <div className="text-xs text-slate-400 mt-0.5">{item.sub}</div>
            </div>
          ))}
        </div>

        {/* CTA */}
        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
            <p className="text-slate-500 text-sm">Starting your session...</p>
          </div>
        ) : error ? (
          <div className="w-full">
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4 text-center">
              <p className="text-red-700 text-sm">{error}</p>
            </div>
            <button className="btn-primary" onClick={handleStart}>
              Try Again
            </button>
          </div>
        ) : (
          <button className="btn-primary" onClick={handleStart}>
            Begin Anonymous Report
          </button>
        )}

        {/* Trust footer */}
        <p className="text-xs text-slate-400 text-center leading-relaxed">
          By participating, you earn up to $25 per session.
          All data is anonymized before collection.
          {' '}
          <span className="text-brand-600">HIPAA-aware architecture.</span>
        </p>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <main className="screen">
        <div className="container-sm flex justify-center mt-20">
          <div className="w-12 h-12 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
        </div>
      </main>
    }>
      <HomeContent />
    </Suspense>
  );
}
