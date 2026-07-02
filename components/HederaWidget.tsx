interface HederaWidgetProps {
  anchoredCount: number;
  totalCount: number;
  topicId: string | null;
}

/**
 * "Strategic Win" widget from the roadmap: a visible, at-a-glance proof that
 * the public feed isn't just a database dump - a portion of it is
 * independently timestamped on a public ledger. Links out to HashScan so a
 * funder can verify the topic themselves rather than trust the number here.
 */
export function HederaWidget({ anchoredCount, totalCount, topicId }: HederaWidgetProps) {
  const network = process.env.NEXT_PUBLIC_HEDERA_NETWORK ?? "testnet";
  const hashscanUrl = topicId
    ? `https://hashscan.io/${network}/topic/${topicId}`
    : null;

  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-panel px-4 py-3">
      <div>
        <p className="text-sm font-medium text-slate-200">Hedera consensus anchoring</p>
        <p className="text-xs text-slate-500">
          {anchoredCount} of {totalCount} public events anchored to the {network} ledger
        </p>
      </div>
      {hashscanUrl ? (
        <a
          href={hashscanUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-emerald-400 hover:underline"
        >
          View topic on HashScan &rarr;
        </a>
      ) : (
        <span className="text-xs text-slate-600">Topic not yet configured</span>
      )}
    </div>
  );
}
