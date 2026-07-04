export default function HowToReadPanel() {
  return (
    <div className="w-80 bg-slate-900/80 border border-slate-700 backdrop-blur-md rounded-lg p-5 shadow-2xl">
      <h2 className="text-xs uppercase tracking-wider text-slate-400 mb-2">
        How to Read This Geometry
      </h2>

      <p className="text-sm text-slate-300 leading-relaxed mb-4">
        This dashboard visualizes governance receipts, not citizen records.
        No names, GPS points, case files, or individual profiles are displayed.
      </p>

      <div className="space-y-3 text-xs font-mono">
        <div>
          <span className="text-slate-500 block">X-axis</span>
          <span className="text-slate-200">
            County or civic geography bucket
          </span>
        </div>

        <div>
          <span className="text-slate-500 block">Y-axis</span>
          <span className="text-slate-200">Governance layer</span>
        </div>

        <div>
          <span className="text-slate-500 block">Z-axis</span>
          <span className="text-slate-200">Evidence category</span>
        </div>

        <div>
          <span className="text-slate-500 block">Node</span>
          <span className="text-slate-200">Zero-PII audit receipt</span>
        </div>

        <div>
          <span className="text-slate-500 block">Edge</span>
          <span className="text-slate-200">
            Relationship between receipts
          </span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-800">
        <p className="text-xs text-slate-500 leading-relaxed">
          Receipts show system activity and verification status. They do not
          identify or track people.
        </p>
      </div>
    </div>
  );
}
