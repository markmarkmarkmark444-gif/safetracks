import { useEffect, useRef } from 'react';
import type { SafeTracksEvent } from '../utils/geometryMapper';

interface LedgerFeedProps {
  events: SafeTracksEvent[];
}

export default function LedgerFeed({ events }: LedgerFeedProps) {
  const feedEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'VERIFIED':
        return 'bg-emerald-900/40 text-emerald-400 border-emerald-800';
      case 'PENDING':
        return 'bg-amber-900/40 text-amber-400 border-amber-800';
      case 'ESCALATED':
        return 'bg-red-900/40 text-red-400 border-red-800';
      case 'CLOSED':
        return 'bg-blue-900/40 text-blue-400 border-blue-800';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  return (
    <div className="h-full bg-[#05080f] font-mono p-4 overflow-y-auto text-xs flex flex-col">
      <div className="text-slate-500 mb-2 border-b border-slate-800 pb-2 uppercase tracking-widest flex shrink-0">
        <span className="w-24">Sequence</span>
        <span className="w-48">Timestamp</span>
        <span className="w-32">Bucket</span>
        <span className="w-64">Evidence Category</span>
        <span className="w-24">Status</span>
        <span className="flex-1">Notarization Ref</span>
      </div>

      <div className="flex-1 space-y-1">
        {events.map((event) => (
          <div
            key={event.sequence_number}
            className="flex hover:bg-slate-800/50 py-1.5 transition-colors items-center"
          >
            <span className="w-24 text-emerald-500">
              #{event.sequence_number}
            </span>
            <span className="w-48 text-slate-400">
              {new Date(event.timestamp).toLocaleString()}
            </span>
            <span className="w-32 text-slate-300">
              {event.spatial_bucket}
            </span>
            <span className="w-64 text-slate-300 truncate pr-4">
              {event.evidence_category}
            </span>
            <span className="w-24">
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] border ${getStatusColor(
                  event.verification_status
                )}`}
              >
                {event.verification_status}
              </span>
            </span>
            <span className="flex-1 text-slate-600 truncate">
              HCS: {event.proof_metadata.hcs_timestamp_placeholder}
            </span>
          </div>
        ))}
        <div ref={feedEndRef} />
      </div>
    </div>
  );
}
