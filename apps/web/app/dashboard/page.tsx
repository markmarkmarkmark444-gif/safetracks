'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '../../lib/api';

const STATUS_COLORS: Record<string, string> = {
  created:        'bg-slate-100 text-slate-700',
  active:         'bg-blue-100 text-blue-700',
  drying:         'bg-cyan-100 text-cyan-700',
  remediation:    'bg-yellow-100 text-yellow-700',
  reconstruction: 'bg-orange-100 text-orange-700',
  complete:       'bg-green-100 text-green-700',
  disputed:       'bg-red-100 text-red-700',
  closed:         'bg-slate-100 text-slate-500',
};

const TYPE_BADGE: Record<string, string> = {
  water: 'badge-water',
  fire:  'badge-fire',
  mold:  'badge-mold',
  storm: 'badge-storm',
};

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => api.jobs.list().then(r => r.data),
  });

  const jobs = data?.jobs ?? [];

  // Summary stats
  const active = jobs.filter((j: any) => ['active', 'drying', 'remediation'].includes(j.status));
  const complete = jobs.filter((j: any) => j.status === 'complete');
  const disputed = jobs.filter((j: any) => j.status === 'disputed');

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-brand-700 text-white px-6 py-4 flex items-center justify-between shadow-lg">
        <div>
          <h1 className="text-xl font-bold tracking-tight">SafeTracks</h1>
          <p className="text-brand-200 text-xs">Verified Restore — Insurance Restoration</p>
        </div>
        <Link href="/jobs/new" className="btn-primary text-sm">+ New Job</Link>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Jobs" value={jobs.length} color="text-brand-700" />
          <StatCard label="Active" value={active.length} color="text-blue-600" />
          <StatCard label="Complete" value={complete.length} color="text-green-600" />
          <StatCard label="Disputed" value={disputed.length} color="text-red-600" />
        </div>

        {/* Jobs Table */}
        <div className="card p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">All Jobs</h2>
            <span className="text-sm text-slate-500">{jobs.length} total</span>
          </div>

          {isLoading && (
            <div className="px-6 py-12 text-center text-slate-400">Loading jobs...</div>
          )}
          {error && (
            <div className="px-6 py-12 text-center text-red-500">Failed to load jobs</div>
          )}

          {!isLoading && jobs.length === 0 && (
            <div className="px-6 py-12 text-center">
              <p className="text-slate-400 mb-4">No jobs yet.</p>
              <Link href="/jobs/new" className="btn-primary">Create First Job</Link>
            </div>
          )}

          {jobs.length > 0 && (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Job #</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Address</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Claim #</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Loss Date</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Docs</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((job: any) => (
                  <tr key={job.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-mono font-semibold text-brand-700">{job.jobNumber}</td>
                    <td className="px-6 py-4">
                      <span className={TYPE_BADGE[job.type] ?? 'badge-water'}>{job.type}</span>
                    </td>
                    <td className="px-6 py-4 text-slate-700 max-w-xs truncate">
                      {job.street}, {job.city}, {job.state}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[job.status] ?? ''}`}>
                        {job.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500 font-mono text-xs">{job.claimNumber ?? '—'}</td>
                    <td className="px-6 py-4 text-slate-500 text-xs">
                      {new Date(job.lossDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs">{job._count?.documents ?? 0}</td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/jobs/${job.id}`}
                        className="text-brand-500 hover:text-brand-700 font-medium text-xs"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="card text-center">
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500 mt-1 font-medium uppercase tracking-wide">{label}</div>
    </div>
  );
}
