import type { VisualNode } from '../utils/geometryMapper';

interface InspectorPanelProps {
  node: VisualNode;
  onClose: () => void;
}

export default function InspectorPanel({
  node,
  onClose,
}: InspectorPanelProps) {
  return (
    <div className="w-80 bg-slate-900/90 border border-slate-700 backdrop-blur-md rounded-lg p-5 shadow-2xl">
      <div className="flex justify-between items-start mb-4 border-b border-slate-700 pb-2">
        <div>
          <h2 className="text-xs uppercase tracking-wider text-slate-400">
            Zero-PII Audit Receipt
          </h2>
          <p className="text-lg font-mono text-white mt-1">
            #{node.metadata.sequence}
          </p>
        </div>

        <button
          onClick={onClose}
          className="text-slate-500 hover:text-white"
          aria-label="Close receipt inspector"
        >
          ✕
        </button>
      </div>

      <div className="space-y-3 text-sm font-mono">
        <div>
          <span className="text-slate-500 block text-xs">
            Domain & Category
          </span>
          <span className="text-slate-200">
            {node.metadata.domain} / {node.label}
          </span>
        </div>

        <div>
          <span className="text-slate-500 block text-xs">
            Spatial & Temporal Bucket
          </span>
          <span className="text-slate-200">
            {node.metadata.spatial} • {node.metadata.temporal}
          </span>
        </div>

        <div>
          <span className="text-slate-500 block text-xs">
            Cryptographic Proof Reference
          </span>
          <span className="text-slate-200 truncate block">
            HCS: {node.hcsTimestamp}
          </span>
          <span className="text-slate-200 truncate block text-xs mt-1">
            ALEO: {node.proofHash}
          </span>
        </div>

        <div>
          <span className="text-slate-500 block text-xs">
            Audit Notes
          </span>
          <span className="text-slate-300 text-xs leading-relaxed">
            {node.metadata.notes}
          </span>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-800">
          <span className="text-slate-500 block text-xs mb-1">Status</span>
          <span
            className="inline-block px-2 py-1 text-xs rounded bg-slate-800 text-white"
            style={{ borderLeft: `3px solid ${node.colorToken}` }}
          >
            {node.status}
          </span>
        </div>
      </div>
    </div>
  );
}
