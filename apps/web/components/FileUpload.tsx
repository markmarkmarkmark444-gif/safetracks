'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { api } from '../lib/api';
import { DocumentType } from '@safetracks/shared';

const DOC_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'photo',                       label: 'Photo' },
  { value: 'video',                       label: 'Video' },
  { value: 'moisture_log',                label: 'Moisture Log' },
  { value: 'psychrometric_chart',         label: 'Psychrometric Chart' },
  { value: 'equipment_report',            label: 'Equipment Report' },
  { value: 'xactimate_export',            label: 'Xactimate Export' },
  { value: 'work_plan_s500',              label: 'S500 Work Plan' },
  { value: 'work_plan_s700',              label: 'S700 Work Plan' },
  { value: 'certificate_of_completion',   label: 'Certificate of Completion' },
  { value: 'scope_of_loss',              label: 'Scope of Loss' },
  { value: 'invoice',                     label: 'Invoice' },
  { value: 'subcontractor_receipt',       label: 'Subcontractor Receipt' },
  { value: 'permit',                      label: 'Permit' },
  { value: 'other',                       label: 'Other' },
];

interface Props {
  jobId: string;
  onSuccess?: () => void;
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

interface UploadItem {
  file: File;
  type: DocumentType;
  description: string;
  state: UploadState;
  progress?: number;
  result?: any;
  error?: string;
}

export function FileUpload({ jobId, onSuccess }: Props) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [defaultType, setDefaultType] = useState<DocumentType>('photo');

  const onDrop = useCallback((accepted: File[]) => {
    const newItems: UploadItem[] = accepted.map(file => ({
      file,
      type: defaultType,
      description: '',
      state: 'idle',
    }));
    setItems(prev => [...prev, ...newItems]);
  }, [defaultType]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    maxSize: 500 * 1024 * 1024, // 500 MB
  });

  const uploadItem = async (idx: number) => {
    const item = items[idx];
    if (!item || item.state === 'uploading') return;

    setItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx]!, state: 'uploading' };
      return next;
    });

    try {
      const res = await api.uploads.upload(jobId, item.file, item.type, item.description || undefined);
      setItems(prev => {
        const next = [...prev];
        next[idx] = { ...next[idx]!, state: 'success', result: res.data.document };
        return next;
      });
      onSuccess?.();
    } catch (err: any) {
      setItems(prev => {
        const next = [...prev];
        next[idx] = { ...next[idx]!, state: 'error', error: err.response?.data?.error ?? 'Upload failed' };
        return next;
      });
    }
  };

  const uploadAll = () => {
    items.forEach((_, idx) => { if (items[idx]!.state === 'idle') uploadItem(idx); });
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const pendingCount = items.filter(i => i.state === 'idle').length;

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">Upload Documents</h3>
        <div className="flex items-center gap-3">
          <select
            value={defaultType}
            onChange={e => setDefaultType(e.target.value as DocumentType)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white"
          >
            {DOC_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          {pendingCount > 0 && (
            <button onClick={uploadAll} className="btn-primary text-sm">
              Upload All ({pendingCount})
            </button>
          )}
        </div>
      </div>

      {/* Drop Zone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-brand-400 bg-slate-50'
        }`}
      >
        <input {...getInputProps()} />
        <div className="text-4xl mb-3">📁</div>
        <p className="font-medium text-slate-700">
          {isDragActive ? 'Drop files here...' : 'Drag & drop files, or click to select'}
        </p>
        <p className="text-xs text-slate-400 mt-1">
          Photos, videos, PDFs, Xactimate exports, moisture logs — up to 500 MB each.
          Large files are automatically stored on Bethelnet with ZK proof.
        </p>
      </div>

      {/* Upload Queue */}
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item, idx) => (
            <li key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm text-slate-800 truncate">{item.file.name}</span>
                  <span className="text-xs text-slate-400">({formatBytes(item.file.size)})</span>
                  <StateIcon state={item.state} />
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={item.type}
                    onChange={e => setItems(prev => {
                      const next = [...prev];
                      next[idx] = { ...next[idx]!, type: e.target.value as DocumentType };
                      return next;
                    })}
                    disabled={item.state !== 'idle'}
                    className="text-xs border border-slate-300 rounded px-2 py-1 bg-white disabled:bg-slate-100"
                  >
                    {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <input
                    placeholder="Description (optional)"
                    value={item.description}
                    onChange={e => setItems(prev => {
                      const next = [...prev];
                      next[idx] = { ...next[idx]!, description: e.target.value };
                      return next;
                    })}
                    disabled={item.state !== 'idle'}
                    className="text-xs border border-slate-300 rounded px-2 py-1 bg-white flex-1 disabled:bg-slate-100"
                  />
                </div>
                {item.state === 'success' && item.result && (
                  <div className="text-xs text-green-600 mt-1 font-mono truncate">
                    CID: {item.result.bethelnetCid}
                  </div>
                )}
                {item.state === 'error' && (
                  <div className="text-xs text-red-500 mt-1">{item.error}</div>
                )}
              </div>
              <div className="flex items-center gap-1">
                {item.state === 'idle' && (
                  <button onClick={() => uploadItem(idx)} className="btn-primary text-xs px-3 py-1">Upload</button>
                )}
                <button
                  onClick={() => removeItem(idx)}
                  className="text-slate-400 hover:text-red-500 text-xs px-2"
                  disabled={item.state === 'uploading'}
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StateIcon({ state }: { state: UploadState }) {
  if (state === 'uploading') return <span className="text-xs text-blue-500 animate-pulse">Uploading...</span>;
  if (state === 'success') return <span className="text-xs text-green-500">✓ Done</span>;
  if (state === 'error') return <span className="text-xs text-red-500">✗ Error</span>;
  return null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
