'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { FileUpload } from '../../../components/FileUpload';
import { MoistureLogForm } from '../../../components/MoistureLogForm';
import { EquipmentForm } from '../../../components/EquipmentForm';
import { AuditTrail } from '../../../components/AuditTrail';
import Image from 'next/image';

type Tab = 'overview' | 'documents' | 'moisture' | 'equipment' | 'report' | 'audit';

export default function JobDetailPage({ params }: { params: { id: string } }) {
  const [tab, setTab] = useState<Tab>('overview');
  const qc = useQueryClient();

  const { data: job, isLoading } = useQuery({
    queryKey: ['job', params.id],
    queryFn: () => api.jobs.get(params.id).then(r => r.data),
  });

  const { data: docsData } = useQuery({
    queryKey: ['docs', params.id],
    queryFn: () => api.uploads.list(params.id).then(r => r.data),
    enabled: tab === 'documents',
  });

  const generateReport = useMutation({
    mutationFn: () => api.reports.generate(params.id).then(r => r.data),
  });

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading...</div>;
  }

  if (!job) {
    return <div className="min-h-screen flex items-center justify-center text-red-500">Job not found</div>;
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview',   label: 'Overview' },
    { id: 'documents',  label: 'Documents' },
    { id: 'moisture',   label: 'Moisture Logs' },
    { id: 'equipment',  label: 'Equipment' },
    { id: 'report',     label: 'Generate Report' },
    { id: 'audit',      label: 'Audit Trail' },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-brand-700 text-white px-6 py-4 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold">{job.jobNumber}</h1>
              <span className="bg-brand-500 text-white text-xs px-2 py-0.5 rounded font-medium uppercase">
                {job.type}
              </span>
              <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded font-medium">
                {job.status}
              </span>
            </div>
            <p className="text-brand-200 text-sm mt-0.5">
              {job.street}, {job.city}, {job.state} {job.zip}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={api.jobs.qrPng(params.id)}
              target="_blank"
              className="btn-secondary text-sm"
              rel="noreferrer"
            >
              Download QR
            </a>
          </div>
        </div>
      </header>

      {/* Blockchain verification banner */}
      <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2">
        <div className="max-w-7xl mx-auto flex items-center gap-4 text-xs text-emerald-700">
          <span className="font-semibold">Hedera Topic:</span>
          <a
            href={`https://hashscan.io/${process.env.NEXT_PUBLIC_HEDERA_NETWORK ?? 'testnet'}/topic/${job.hederaTopicId}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono hover:underline"
          >
            {job.hederaTopicId}
          </a>
          {job.aleoCommitment && (
            <>
              <span className="text-emerald-400">|</span>
              <span className="font-semibold">Aleo:</span>
              <span className="font-mono truncate max-w-xs">{job.aleoCommitment.slice(0, 32)}...</span>
            </>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white rounded-xl p-1 border border-slate-200 shadow-sm w-fit">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'bg-brand-700 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {tab === 'overview' && <OverviewTab job={job} />}
        {tab === 'documents' && (
          <div className="space-y-6">
            <FileUpload jobId={params.id} onSuccess={() => qc.invalidateQueries({ queryKey: ['docs', params.id] })} />
            <DocumentList docs={docsData?.documents ?? []} jobId={params.id} />
          </div>
        )}
        {tab === 'moisture' && <MoistureLogForm jobId={params.id} />}
        {tab === 'equipment' && <EquipmentForm jobId={params.id} />}
        {tab === 'report' && (
          <div className="card max-w-xl">
            <h3 className="font-semibold text-slate-800 mb-2">Generate Insurance Report</h3>
            <p className="text-sm text-slate-500 mb-6">
              Generates a professional PDF claim package with all IICRC-compliant data,
              uploads it to Bethelnet, and anchors the hash on Hedera.
            </p>
            <button
              onClick={() => generateReport.mutate()}
              disabled={generateReport.isPending}
              className="btn-primary"
            >
              {generateReport.isPending ? 'Generating...' : 'Generate Report PDF'}
            </button>
            {generateReport.isSuccess && (
              <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200 text-sm">
                <p className="font-semibold text-green-800">Report Generated!</p>
                <p className="text-green-700 mt-1">Bethelnet CID: <span className="font-mono">{generateReport.data.bethelnetCid}</span></p>
                <p className="text-green-700">Hedera TX: <span className="font-mono">{generateReport.data.hederaTxId}</span></p>
              </div>
            )}
          </div>
        )}
        {tab === 'audit' && <AuditTrail jobId={params.id} hederaTopicId={job.hederaTopicId} />}
      </div>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ job }: { job: any }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Job Details */}
      <div className="card">
        <h3 className="font-semibold text-slate-800 mb-4">Job Details</h3>
        <dl className="space-y-2 text-sm">
          <Row label="Job Number" value={job.jobNumber} mono />
          <Row label="Type" value={job.type.toUpperCase()} />
          <Row label="Status" value={job.status} />
          <Row label="Loss Date" value={new Date(job.lossDate).toLocaleDateString()} />
          <Row label="Affected Area" value={`${job.affectedSqFt} sq ft`} />
          <Row label="Affected Rooms" value={job.affectedRooms?.join(', ')} />
          {job.waterCategory && <Row label="Water Category" value={job.waterCategory.replace('_', ' ').toUpperCase()} />}
          {job.waterClass && <Row label="Water Class" value={job.waterClass.replace('_', ' ').toUpperCase()} />}
          {job.fireCategory && <Row label="Smoke Type" value={job.fireCategory.replace(/_/g, ' ').toUpperCase()} />}
        </dl>
      </div>

      {/* Insurance Info */}
      <div className="card">
        <h3 className="font-semibold text-slate-800 mb-4">Insurance Information</h3>
        <dl className="space-y-2 text-sm">
          <Row label="Claim #" value={job.claimNumber ?? '—'} mono />
          <Row label="Policy #" value={job.policyNumber ?? '—'} mono />
          <Row label="Carrier" value={job.insuranceCompany ?? '—'} />
          <Row label="Est. Loss" value={job.estimatedLoss ? `$${job.estimatedLoss.toLocaleString()}` : '—'} />
          <Row label="Deductible" value={job.deductible ? `$${job.deductible.toLocaleString()}` : '—'} />
        </dl>
      </div>

      {/* Parties */}
      <div className="card md:col-span-2">
        <h3 className="font-semibold text-slate-800 mb-4">Parties of Record</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {job.parties?.map((party: any) => (
            <div key={party.id} className="border border-slate-200 rounded-lg p-3">
              <div className="text-xs font-semibold text-brand-600 uppercase tracking-wide mb-1">
                {party.role.replace(/_/g, ' ')}
              </div>
              <div className="font-medium text-slate-800">{party.name}</div>
              {party.company && <div className="text-slate-500 text-xs">{party.company}</div>}
              <div className="text-slate-400 text-xs mt-1">{party.email}</div>
            </div>
          ))}
        </div>
      </div>

      {/* QR Code */}
      <div className="card flex flex-col items-center gap-4">
        <h3 className="font-semibold text-slate-800 self-start">Job QR Code</h3>
        <img
          src={`/api/qr/${job.id}/png`}
          alt={`QR code for job ${job.jobNumber}`}
          className="w-48 h-48"
        />
        <p className="text-xs text-slate-400 text-center">
          Any authorized party can scan this QR code to access the job and upload data.
        </p>
      </div>
    </div>
  );
}

// ─── Document List ────────────────────────────────────────────────────────────

function DocumentList({ docs, jobId }: { docs: any[]; jobId: string }) {
  if (docs.length === 0) return (
    <div className="card text-center text-slate-400 py-8">No documents yet.</div>
  );

  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200">
        <h3 className="font-semibold text-slate-800">{docs.length} Documents</h3>
      </div>
      <ul className="divide-y divide-slate-100">
        {docs.map((doc: any) => (
          <li key={doc.id} className="px-6 py-4 flex items-center justify-between">
            <div>
              <div className="font-medium text-slate-800 text-sm">{doc.filename}</div>
              <div className="text-xs text-slate-400 mt-0.5 flex gap-3">
                <span>{doc.type?.replace(/_/g, ' ')}</span>
                <span>{doc.uploader?.name}</span>
                <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="font-mono text-xs text-slate-300 mt-0.5 truncate max-w-md">
                CID: {doc.bethelnetCid}
              </div>
            </div>
            <button
              onClick={() => api.uploads.getUrl(doc.id).then(r => window.open(r.data.url, '_blank'))}
              className="btn-secondary text-xs"
            >
              View
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`font-medium text-slate-800 ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}
