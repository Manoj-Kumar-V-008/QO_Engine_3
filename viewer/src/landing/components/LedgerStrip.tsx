import type { LandingDataBundle } from '../data/loadLandingData';

interface LedgerStripProps {
  data: LandingDataBundle | null;
}

export default function LedgerStrip({ data }: LedgerStripProps) {
  const generated = data?.scoreboard.generated_gb ?? 3000;
  const passesCount = data?.passesDoc.passes.length ?? 61;
  const conflictsCount = data?.conflictCounts.total ?? 63;
  const greedyRow = data?.waterfallRows.find((r) => r.method === 'greedy');

  const items = [
    {
      value: `${generated.toLocaleString('en-US')} GB`,
      label: 'Generated in 24 h',
      color: 'var(--ink-void)',
    },
    {
      value: `${passesCount}`,
      label: 'Candidate passes',
      color: 'var(--ink-void)',
    },
    {
      value: `${conflictsCount}`,
      label: 'Conflict pairs',
      color: 'var(--amber)',
    },
    {
      value: `${(greedyRow?.deliveredGb ?? 691.4).toFixed(1)} GB`,
      label: 'Greedy delivered',
      color: 'var(--cyan)',
    },
    {
      value: `${(greedyRow?.overflowGb ?? 1708.6).toFixed(1)} GB`,
      label: 'Greedy overflow',
      color: 'var(--red)',
    },
    {
      value: `${(greedyRow?.storedGb ?? 600.0).toFixed(1)} GB`,
      label: 'In buffers at 24:00',
      color: 'var(--ink-void-2)',
    },
  ];

  return (
    <div className="lp-ledger-strip" aria-label="24-hour baseline summary">
      <div className="lp-container !px-0">
        <dl className="lp-ledger-grid m-0">
          {items.map((item) => (
            <div key={item.label} className="lp-ledger-cell">
              <dd
                className="lp-mono m-0 text-[20px] sm:text-[22px] font-semibold leading-tight"
                style={{ color: item.color }}
              >
                {item.value}
              </dd>
              <dt
                className="m-0 text-[13px] font-medium"
                style={{ color: 'var(--ink-void-2)' }}
              >
                {item.label}
              </dt>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
