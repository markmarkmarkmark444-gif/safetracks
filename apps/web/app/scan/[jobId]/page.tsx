'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '../../../lib/api';

export default function ScanPage({ params }: { params: { jobId: string } }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const checksum = searchParams.get('t') ?? '';

  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'verify' | 'login' | 'done'>('verify');

  // Resolve QR code
  const { data: jobPreview, isLoading, error } = useQuery({
    queryKey: ['qr-resolve', params.jobId, checksum],
    queryFn: () => api.qr.resolve(params.jobId, checksum).then(r => r.data),
    retry: false,
  });

  const scanMutation = useMutation({
    mutationFn: () => api.jobs.scan(params.jobId, email),
    onSuccess: (res) => {
      const data = res.data;
      localStorage.setItem('safetracks_token', data.accessToken);
      localStorage.setItem('safetracks_job_id', params.jobId);
      localStorage.setItem('safetracks_role', data.role);
      router.push(`/jobs/${params.jobId}`);
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-brand-700 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="text-5xl mb-4">🔍</div>
          <p className="text-brand-200">Verifying QR code...</p>
        </div>
      </div>
    );
  }

  if (error || !jobPreview) {
    return (
      <div className="min-h-screen bg-red-700 flex items-center justify-center">
        <div className="text-white text-center max-w-sm px-6">
          <div className="text-5xl mb-4">❌</div>
          <h2 className="text-xl font-bold mb-2">Invalid QR Code</h2>
          <p className="text-red-200 text-sm">This QR code is invalid or has expired.</p>
        </div>
      </div>
    );
  }

  const TYPE_LABELS: Record<string, string> = {
    water: '💧 Water Damage', fire: '🔥 Fire & Smoke', mold: '🌿 Mold', storm: '⛈️ Storm', multi: '⚡ Multiple',
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-700 to-brand-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-brand-700 text-white px-6 py-5 text-center">
          <div className="text-3xl mb-2">✅</div>
          <h1 className="text-lg font-bold">Verified Restore</h1>
          <p className="text-brand-200 text-xs">Blockchain-Verified Restoration Job</p>
        </div>

        {/* Job Preview */}
        <div className="px-6 py-5 border-b border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Job Number</span>
            <span className="font-mono font-bold text-brand-700">{jobPreview.jobNumber}</span>
          </div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Type</span>
            <span className="text-sm">{TYPE_LABELS[jobPreview.type] ?? jobPreview.type}</span>
          </div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Address</span>
            <span className="text-sm text-right max-w-48">{jobPreview.address}</span>
          </div>
          {jobPreview.claimNumber && (
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Claim #</span>
              <span className="font-mono text-sm">{jobPreview.claimNumber}</span>
            </div>
          )}

          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mt-3 text-xs text-emerald-700">
            <a href={jobPreview.verifyUrl} target="_blank" rel="noreferrer" className="hover:underline font-medium">
              Verify on Hedera HashScan →
            </a>
          </div>
        </div>

        {/* Login */}
        <div className="px-6 py-5">
          <p className="text-sm text-slate-600 mb-4">
            Enter your email address to access this job and upload data.
          </p>
          <div className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending || !email}
              className="w-full btn-primary py-3 rounded-xl"
            >
              {scanMutation.isPending ? 'Verifying...' : 'Access Job'}
            </button>
            {scanMutation.isError && (
              <p className="text-red-500 text-sm text-center">
                Your email is not registered for this job.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
