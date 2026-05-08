'use client';

import { useState, useRef } from 'react';
import { api } from '../lib/api';

// ─── Types (mirror vision.service.ts) ────────────────────────────────────────

interface MeterResult {
  readingPct: number;
  confidence: 'high' | 'medium' | 'low';
  rawDisplay: string;
  units: string;
  notes?: string;
}

interface DamageResult {
  jobType: 'water' | 'fire' | 'mold' | 'unknown';
  waterCategory?: string;
  waterClass?: string;
  fireCategory?: string;
  suggestedRooms: string[];
  affectedMaterials: string[];
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  urgencyNotes?: string;
}

interface DocumentResult {
  claimNumber?: string;
  policyNumber?: string;
  coverageAmount?: number;
  insuranceCompany?: string;
  deductible?: number;
  policyHolder?: string;
  lossDate?: string;
  confidence: 'high' | 'medium' | 'low';
  rawExtracted: Record<string, string>;
}

// ─── Sub-component props ──────────────────────────────────────────────────────

export interface MeterAnalysisProps {
  onApply: (readingPct: number, units: string) => void;
}

export interface DamageClassificationProps {
  onApply: (result: DamageResult) => void;
}

export interface DocumentExtractionProps {
  onApply: (result: DocumentResult) => void;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

const CONFIDENCE_COLORS = {
  high: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-red-100 text-red-800',
};

const WATER_CATEGORY_LABELS: Record<string, string> = {
  category_1: 'Category 1 — Clean Water',
  category_2: 'Category 2 — Gray Water',
  category_3: 'Category 3 — Black Water',
};

const WATER_CLASS_LABELS: Record<string, string> = {
  class_1: 'Class 1 — Slow Evaporation',
  class_2: 'Class 2 — Fast Evaporation',
  class_3: 'Class 3 — Fastest Evaporation',
  class_4: 'Class 4 — Specialty Drying',
};

const FIRE_CATEGORY_LABELS: Record<string, string> = {
  wet_smoke: 'Wet Smoke',
  dry_smoke: 'Dry Smoke',
  protein_smoke: 'Protein Smoke',
  fuel_oil_smoke: 'Fuel Oil Soot',
  other_smoke: 'Other/Chemical Smoke',
};

function ConfidenceBadge({ level }: { level: 'high' | 'medium' | 'low' }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${CONFIDENCE_COLORS[level]}`}>
      {level.charAt(0).toUpperCase() + level.slice(1)} Confidence
    </span>
  );
}

function ImageUploadArea({
  onFile,
  preview,
  accept,
}: {
  onFile: (file: File) => void;
  preview: string | null;
  accept?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onFile(file);
  }

  return (
    <div
      className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 transition-colors"
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept ?? 'image/jpeg,image/png,image/webp'}
        className="hidden"
        onChange={handleChange}
        capture="environment"
      />
      {preview ? (
        <img
          src={preview}
          alt="Preview"
          className="mx-auto max-h-48 rounded object-contain"
        />
      ) : (
        <>
          <svg className="mx-auto h-10 w-10 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-sm text-gray-600">Tap to take photo or select image</p>
          <p className="text-xs text-gray-400 mt-1">JPEG, PNG, WebP up to 10MB</p>
        </>
      )}
    </div>
  );
}

// ─── Moisture Meter OCR ───────────────────────────────────────────────────────

export function MeterOCR({ onApply }: MeterAnalysisProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<MeterResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFile(f: File) {
    setFile(f);
    setResult(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  }

  async function analyze() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('image', file);
      const { data } = await api.post<MeterResult>('/vision/meter', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Point camera at meter display</h3>
        <p className="text-xs text-gray-500 mb-3">AI reads the moisture value and auto-fills the log form — eliminates transcription errors.</p>
        <ImageUploadArea onFile={handleFile} preview={preview} />
      </div>

      {file && !result && (
        <button
          onClick={analyze}
          disabled={loading}
          className="btn-primary w-full"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Reading meter...
            </span>
          ) : 'Read Meter'}
        </button>
      )}

      {error && (
        <div className="rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {result && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">AI Meter Reading</span>
            <ConfidenceBadge level={result.confidence} />
          </div>

          <div className="text-center py-3 bg-blue-50 rounded-lg">
            <span className="text-4xl font-bold text-blue-700">{result.readingPct}</span>
            <span className="text-xl text-blue-500 ml-1">{result.units}</span>
            <p className="text-xs text-gray-500 mt-1">Display: &quot;{result.rawDisplay}&quot;</p>
          </div>

          {result.notes && (
            <p className="text-xs text-gray-600 italic">{result.notes}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => onApply(result.readingPct, result.units)}
              className="btn-primary flex-1"
            >
              Apply to Form
            </button>
            <button
              onClick={() => { setResult(null); setFile(null); setPreview(null); }}
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Retake
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── IICRC Damage Classification ─────────────────────────────────────────────

export function DamageClassifier({ onApply }: DamageClassificationProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<DamageResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFile(f: File) {
    setFile(f);
    setResult(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  }

  async function analyze() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('image', file);
      const { data } = await api.post<DamageResult>('/vision/damage', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Classification failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Upload damage photo for IICRC classification</h3>
        <p className="text-xs text-gray-500 mb-3">Claude Vision analyzes the photo and suggests Category/Class for adjuster confirmation.</p>
        <ImageUploadArea onFile={handleFile} preview={preview} />
      </div>

      {file && !result && (
        <button
          onClick={analyze}
          disabled={loading}
          className="btn-primary w-full"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Analyzing damage...
            </span>
          ) : 'Classify Damage'}
        </button>
      )}

      {error && (
        <div className="rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {result && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">AI Classification</span>
            <ConfidenceBadge level={result.confidence} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-20 shrink-0">Type</span>
              <span className="badge-info capitalize">{result.jobType} Damage</span>
            </div>

            {result.waterCategory && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-20 shrink-0">Category</span>
                <span className="badge-warning">{WATER_CATEGORY_LABELS[result.waterCategory] ?? result.waterCategory}</span>
              </div>
            )}

            {result.waterClass && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-20 shrink-0">Class</span>
                <span className="badge-info">{WATER_CLASS_LABELS[result.waterClass] ?? result.waterClass}</span>
              </div>
            )}

            {result.fireCategory && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-20 shrink-0">Smoke</span>
                <span className="badge-warning">{FIRE_CATEGORY_LABELS[result.fireCategory] ?? result.fireCategory}</span>
              </div>
            )}

            {result.suggestedRooms.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-xs text-gray-500 w-20 shrink-0 pt-0.5">Rooms</span>
                <div className="flex flex-wrap gap-1">
                  {result.suggestedRooms.map(r => (
                    <span key={r} className="inline-block bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded">{r}</span>
                  ))}
                </div>
              </div>
            )}

            {result.affectedMaterials.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-xs text-gray-500 w-20 shrink-0 pt-0.5">Materials</span>
                <div className="flex flex-wrap gap-1">
                  {result.affectedMaterials.map(m => (
                    <span key={m} className="inline-block bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded">{m}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="bg-gray-50 rounded p-2">
            <p className="text-xs text-gray-600">{result.reasoning}</p>
          </div>

          {result.urgencyNotes && (
            <div className="bg-red-50 border border-red-200 rounded p-2">
              <p className="text-xs text-red-700 font-medium">⚠ {result.urgencyNotes}</p>
            </div>
          )}

          <p className="text-xs text-amber-700 bg-amber-50 rounded p-2">
            AI suggestion only — confirm with certified IICRC technician before recording.
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => onApply(result)}
              className="btn-primary flex-1"
            >
              Apply Classification
            </button>
            <button
              onClick={() => { setResult(null); setFile(null); setPreview(null); }}
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Retake
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Insurance Document Code Extraction ──────────────────────────────────────

export function DocumentScanner({ onApply }: DocumentExtractionProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<DocumentResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFile(f: File) {
    setFile(f);
    setResult(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  }

  async function analyze() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('image', file);
      const { data } = await api.post<DocumentResult>('/vision/document', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Extraction failed');
    } finally {
      setLoading(false);
    }
  }

  function fmt(val?: number) {
    if (val == null) return '—';
    return `$${val.toLocaleString()}`;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Scan declaration page or Xactimate printout</h3>
        <p className="text-xs text-gray-500 mb-3">AI extracts claim number, policy number, and coverage amounts automatically.</p>
        <ImageUploadArea onFile={handleFile} preview={preview} />
      </div>

      {file && !result && (
        <button
          onClick={analyze}
          disabled={loading}
          className="btn-primary w-full"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Extracting codes...
            </span>
          ) : 'Extract Codes'}
        </button>
      )}

      {error && (
        <div className="rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {result && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Extracted Insurance Data</span>
            <ConfidenceBadge level={result.confidence} />
          </div>

          <div className="divide-y divide-gray-100">
            {[
              ['Claim #', result.claimNumber],
              ['Policy #', result.policyNumber],
              ['Insurer', result.insuranceCompany],
              ['Policy Holder', result.policyHolder],
              ['Coverage', result.coverageAmount != null ? fmt(result.coverageAmount) : undefined],
              ['Deductible', result.deductible != null ? fmt(result.deductible) : undefined],
              ['Loss Date', result.lossDate],
            ]
              .filter(([, v]) => v != null)
              .map(([label, value]) => (
                <div key={label as string} className="flex py-1.5">
                  <span className="text-xs text-gray-500 w-24 shrink-0">{label}</span>
                  <span className="text-sm text-gray-900 font-medium">{value as string}</span>
                </div>
              ))}
          </div>

          {Object.keys(result.rawExtracted).length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                {Object.keys(result.rawExtracted).length} additional fields
              </summary>
              <div className="mt-2 divide-y divide-gray-100 bg-gray-50 rounded p-2">
                {Object.entries(result.rawExtracted).map(([k, v]) => (
                  <div key={k} className="flex py-1">
                    <span className="text-gray-500 w-28 shrink-0">{k}</span>
                    <span className="text-gray-700">{v}</span>
                  </div>
                ))}
              </div>
            </details>
          )}

          <p className="text-xs text-amber-700 bg-amber-50 rounded p-2">
            Review all values before applying — verify against the original document.
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => onApply(result)}
              className="btn-primary flex-1"
            >
              Apply to Job
            </button>
            <button
              onClick={() => { setResult(null); setFile(null); setPreview(null); }}
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Retake
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Combined VisionAnalysis panel ───────────────────────────────────────────

export interface VisionAnalysisProps {
  mode?: 'meter' | 'damage' | 'document';
  onMeterReading?: (readingPct: number, units: string) => void;
  onDamageClassification?: (result: DamageResult) => void;
  onDocumentExtraction?: (result: DocumentResult) => void;
}

const TABS = [
  { id: 'meter' as const, label: 'Meter OCR' },
  { id: 'damage' as const, label: 'Damage Classifier' },
  { id: 'document' as const, label: 'Doc Scanner' },
];

export function VisionAnalysis({
  mode,
  onMeterReading,
  onDamageClassification,
  onDocumentExtraction,
}: VisionAnalysisProps) {
  const [activeTab, setActiveTab] = useState<'meter' | 'damage' | 'document'>(mode ?? 'meter');

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <svg className="h-5 w-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.347a3.75 3.75 0 01-5.303 0l-.347-.347z" />
        </svg>
        <h2 className="text-sm font-semibold text-gray-800">AI Vision Analysis</h2>
        <span className="ml-auto text-xs text-gray-400">Powered by Claude</span>
      </div>

      {!mode && (
        <div className="flex border-b border-gray-200 mb-4">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {activeTab === 'meter' && (
        <MeterOCR onApply={onMeterReading ?? (() => {})} />
      )}
      {activeTab === 'damage' && (
        <DamageClassifier onApply={onDamageClassification ?? (() => {})} />
      )}
      {activeTab === 'document' && (
        <DocumentScanner onApply={onDocumentExtraction ?? (() => {})} />
      )}
    </div>
  );
}
