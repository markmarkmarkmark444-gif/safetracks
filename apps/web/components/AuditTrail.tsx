'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

const EVENT_ICONS: Record<string, string> = {
  JOB_CREATED:         '🏠',
  DOCUMENT_UPLOADED:   '📎',
  MOISTURE_READING:    '💧',
  EQUIPMENT_PLACED:    '⚙️',
  EQUIPMENT_REMOVED:   '✅',
  REPORT_GENERATED:    '📄',
  WORK_PLAN_SIGNED:    '✍️',
  STATUS_CHANGED:      '🔄',
};

interface Props {
  jobId: string;
  hederaTopicId: string;
}

export function AuditTrail({ jobId, hederaTopicId }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['audit', jobId],
    queryFn: () => api.audit.get(jobId).then(r => r.data),
  });

  const network = process.env.NEXT_PUBLIC_HEDERA_NETWORK ?? 'testnet';

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800">Immutable Audit Trail</h3>
          <a
            href={`https://hashscan.io/${network}/topic/${hederaTopicId}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-brand-500 hover:text-brand-700 font-medium"
          >
            Verify on HashScan →
          </a>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-4 text-xs text-emerald-800">
          <span className="font-semibold">Hedera Topic:</span>{' '}
          <span className="font-mono">{hederaTopicId}</span>
          <br />
          Every event is cryptographically timestamped by Hedera's network consensus.
          This audit trail cannot be modified or deleted.
        </div>

        {isLoading && <div className="text-slate-400 text-sm py-4">Loading audit trail from Hedera mirror node...</div>}
        {error && <div className="text-red-500 text-sm">Failed to load audit trail</div>}

        {data && (
          <div className="space-y-1">
            <div className="text-xs text-slate-400 mb-3">{data.totalMessages} events on-chain</div>
            <ol className="relative border-l border-slate-200 ml-3 space-y-4">
              {data.messages?.map((msg: any, i: number) => (
                <li key={i} className="ml-4">
                  <div className="absolute -left-1.5 w-3 h-3 rounded-full bg-brand-500 border-2 border-white" />
                  <div className="flex items-start gap-2">
                    <span className="text-base">{EVENT_ICONS[msg.payload?.type as string] ?? '📌'}</span>
                    <div>
                      <div className="text-xs font-semibold text-slate-700">
                        {msg.payload?.type ?? 'Event'}
                      </div>
                      <div className="text-xs text-slate-400 font-mono">
                        {msg.consensusTimestamp} · Seq #{msg.sequenceNumber}
                      </div>
                      {msg.payload?.data && (
                        <div className="text-xs text-slate-500 mt-0.5">
                          {JSON.stringify(msg.payload.data).slice(0, 80)}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
