'use client';

/**
 * Reward Page — variable reward reveal + ZK proof + Hedera anchoring
 * Shows the full cryptographic chain: survey → proof → blockchain
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { issueReward, generateZkProof, anchorProof } from '@/lib/api';

type Stage =
  | 'issuing_reward'
  | 'reward_reveal'
  | 'generating_proof'
  | 'anchoring'
  | 'complete'
  | 'error';

interface RewardData {
  reward_id: string;
  total_amount: number;
  breakdown: { base: number; bonus: number; spike: number };
  reward_token: string;
}

interface ProofData {
  proof_id: string;
  proof_input_hash: string;
  public_signals: string[];
  is_valid: boolean;
  circuit_version: string;
}

interface AnchorData {
  anchor_id: string;
  hedera_transaction_id: string;
  consensus_timestamp: string;
  anchored_hash: string;
}

export default function RewardPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('issuing_reward');
  const [error, setError] = useState<string | null>(null);
  const [reward, setReward] = useState<RewardData | null>(null);
  const [proof, setProof] = useState<ProofData | null>(null);
  const [anchorResult, setAnchorResult] = useState<AnchorData | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const runFullFlow = useCallback(async () => {
    const sessionId = sessionStorage.getItem('safetracks_session_id');
    const consentId = sessionStorage.getItem('safetracks_consent_id');
    const surveyId = sessionStorage.getItem('safetracks_survey_id');

    if (!sessionId || !consentId || !surveyId) {
      router.replace('/');
      return;
    }

    try {
      // Step 1: Issue reward
      setStage('issuing_reward');
      await new Promise(r => setTimeout(r, 800)); // UX: suspense moment

      const rewardResult = await issueReward(sessionId, consentId, surveyId);
      setReward(rewardResult);
      setStage('reward_reveal');

      // Auto-advance to proof generation after reveal
      await new Promise(r => setTimeout(r, 2000));

      // Step 2: Generate ZK proof
      setStage('generating_proof');
      const proofResult = await generateZkProof(
        sessionId, consentId, surveyId, rewardResult.reward_id
      );
      setProof(proofResult);

      await new Promise(r => setTimeout(r, 600));

      // Step 3: Anchor to Hedera
      setStage('anchoring');
      const anchorResult = await anchorProof(sessionId, proofResult.proof_id);
      setAnchorResult(anchorResult);

      // Step 4: Done
      setStage('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setStage('error');
    }
  }, [router]);

  useEffect(() => {
    runFullFlow();
  }, [runFullFlow]);

  const tierColor = (breakdown: RewardData['breakdown']) => {
    if (breakdown.spike > 0) return 'from-amber-400 to-orange-500';
    if (breakdown.bonus > 5) return 'from-brand-500 to-teal-500';
    return 'from-brand-400 to-brand-600';
  };

  const tierLabel = (breakdown: RewardData['breakdown']) => {
    if (breakdown.spike > 0) return { label: '🎉 SPIKE REWARD!', color: 'text-amber-700 bg-amber-50 border-amber-200' };
    if (breakdown.bonus > 5) return { label: '⭐ BONUS EARNED', color: 'text-brand-700 bg-brand-50 border-brand-200' };
    return { label: '✓ REWARD EARNED', color: 'text-slate-700 bg-slate-50 border-slate-200' };
  };

  const stageLabel: Record<Stage, string> = {
    issuing_reward: 'Calculating your reward...',
    reward_reveal: 'Reward issued!',
    generating_proof: 'Generating zero-knowledge proof...',
    anchoring: 'Anchoring to Hedera blockchain...',
    complete: 'All done!',
    error: 'Error occurred',
  };

  return (
    <main className="screen">
      <div className="container-sm flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-brand-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Your Reward</h1>
            <p className="text-xs text-slate-500">Step 3 of 3 — Complete</p>
          </div>
        </div>

        {/* Progress */}
        <div className="w-full h-1.5 bg-slate-100 rounded-full">
          <div className="h-full w-full bg-brand-500 rounded-full transition-all" />
        </div>

        {/* Stage indicator */}
        <div className="flex items-center gap-2">
          {stage !== 'error' && (
            <div className={`w-2 h-2 rounded-full ${stage === 'complete' ? 'bg-brand-500' : 'bg-brand-400 animate-pulse'}`} />
          )}
          <span className="text-sm text-slate-600">{stageLabel[stage]}</span>
        </div>

        {/* Reward reveal */}
        {reward && (
          <div className={`rounded-3xl bg-gradient-to-br ${tierColor(reward.breakdown)} p-1 shadow-xl`}>
            <div className="bg-white rounded-[22px] p-6 text-center">
              <div className={`inline-flex status-badge border mb-3 ${tierLabel(reward.breakdown).color}`}>
                {tierLabel(reward.breakdown).label}
              </div>
              <div className="text-6xl font-black text-slate-900 my-2 animate-slide-up">
                ${reward.total_amount.toFixed(2)}
              </div>
              <div className="text-sm text-slate-500 mb-4">earned this session</div>

              {/* Breakdown */}
              <div className="grid grid-cols-3 gap-2 mt-4">
                {[
                  { label: 'Base', amount: reward.breakdown.base },
                  { label: 'Bonus', amount: reward.breakdown.bonus },
                  { label: 'Spike', amount: reward.breakdown.spike },
                ].map(item => (
                  <div key={item.label} className="bg-slate-50 rounded-xl p-3">
                    <div className="text-xs text-slate-400">{item.label}</div>
                    <div className={`text-lg font-bold ${item.amount > 0 ? 'text-brand-600' : 'text-slate-300'}`}>
                      ${item.amount.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Reward token */}
              <div className="mt-4 p-3 bg-slate-50 rounded-xl">
                <div className="text-xs text-slate-400 mb-1">Redemption Token</div>
                <div className="font-mono text-sm font-semibold text-slate-700">{reward.reward_token}</div>
              </div>
            </div>
          </div>
        )}

        {/* Loading states */}
        {(stage === 'issuing_reward' || stage === 'generating_proof' || stage === 'anchoring') && (
          <div className="card flex items-center gap-4">
            <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin flex-shrink-0" />
            <div>
              <div className="font-medium text-slate-800 text-sm">{stageLabel[stage]}</div>
              <div className="text-xs text-slate-400">
                {stage === 'generating_proof' && 'Creating ZK commitment over your data...'}
                {stage === 'anchoring' && 'Submitting to Hedera Consensus Service...'}
                {stage === 'issuing_reward' && 'Running Huberman reward algorithm...'}
              </div>
            </div>
          </div>
        )}

        {/* Cryptographic receipt */}
        {stage === 'complete' && proof && anchorResult && (
          <div className="card flex flex-col gap-4 animate-slide-up">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-800">Cryptographic Receipt</h3>
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-xs text-brand-600 hover:text-brand-700"
              >
                {showDetails ? 'Hide' : 'Show'} details
              </button>
            </div>

            {/* Chain summary */}
            <div className="flex flex-col gap-2">
              {[
                { icon: '✅', label: 'Consent Artifact', status: 'Generated' },
                { icon: '🔏', label: 'ZK Proof', status: proof.is_valid ? 'Valid' : 'Invalid' },
                { icon: '⛓️', label: 'Hedera Anchor', status: 'Confirmed' },
                { icon: '💰', label: 'Billing Event', status: 'Recorded' },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <span>{item.icon}</span>
                    <span className="text-sm text-slate-700">{item.label}</span>
                  </div>
                  <span className="text-xs font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">
                    {item.status}
                  </span>
                </div>
              ))}
            </div>

            {/* Expanded details */}
            {showDetails && (
              <div className="flex flex-col gap-3 pt-2 border-t border-slate-100">
                <div>
                  <div className="text-xs text-slate-400 mb-1">ZK Proof Input Hash</div>
                  <div className="font-mono text-xs text-slate-600 break-all bg-slate-50 p-2 rounded-lg">
                    {proof.proof_input_hash}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Hedera Transaction</div>
                  <div className="font-mono text-xs text-slate-600 break-all bg-slate-50 p-2 rounded-lg">
                    {anchorResult.hedera_transaction_id}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Consensus Timestamp</div>
                  <div className="font-mono text-xs text-slate-600 bg-slate-50 p-2 rounded-lg">
                    {anchorResult.consensus_timestamp}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Circuit Version</div>
                  <div className="font-mono text-xs text-slate-600 bg-slate-50 p-2 rounded-lg">
                    {proof.circuit_version}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error state */}
        {stage === 'error' && (
          <div className="card flex flex-col gap-3">
            <div className="text-center">
              <div className="text-4xl mb-2">⚠️</div>
              <p className="text-slate-700 font-medium">Something went wrong</p>
              <p className="text-slate-400 text-sm mt-1">{error}</p>
            </div>
            <button className="btn-secondary" onClick={() => router.replace('/')}>
              Start Over
            </button>
          </div>
        )}

        {/* Complete CTA */}
        {stage === 'complete' && (
          <button
            className="btn-primary"
            onClick={() => {
              sessionStorage.clear();
              router.push('/');
            }}
          >
            Submit Another Report
          </button>
        )}

        {/* HIPAA note */}
        <div className="text-xs text-slate-400 text-center leading-relaxed">
          No personal data was collected during this session.
          Your participation is recorded anonymously via cryptographic commitment.
        </div>
      </div>
    </main>
  );
}
