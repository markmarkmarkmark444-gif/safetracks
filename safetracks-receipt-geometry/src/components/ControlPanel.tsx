interface ControlPanelProps {
  activeFilter: string;
  setActiveFilter: (filter: string) => void;
}

export default function ControlPanel({
  activeFilter,
  setActiveFilter,
}: ControlPanelProps) {
  const filters = [
    { label: 'All Layers', value: 'All' },
    { label: 'Community', value: 'COMMUNITY' },
    { label: 'Clinical / BHP', value: 'CLINICAL_BHP' },
    { label: 'Municipal', value: 'MUNICIPAL' },
    { label: 'County DA', value: 'COUNTY_DA' },
    { label: 'Maine CDC', value: 'MAINE_CDC' },
    { label: 'Grant Audit', value: 'GRANT_AUDIT' },
  ];

  return (
    <div className="flex space-x-2 bg-slate-900/50 p-1.5 rounded-md border border-slate-700/50 backdrop-blur-md">
      {filters.map((filter) => (
        <button
          key={filter.value}
          onClick={() => setActiveFilter(filter.value)}
          className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
            activeFilter === filter.value
              ? 'bg-slate-700 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}
