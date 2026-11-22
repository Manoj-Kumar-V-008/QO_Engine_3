interface LedgerStripProps {
  generated?: number;
  deliveredBaseline?: number;
  deliveredQslice?: number;
  overflow?: number;
}

/**
 * The page's baseline measurement: six quantities that must add up to 3,000 GB.
 * Intentionally static. It is a readout, not a reveal.
 */
export default function LedgerStrip({
  generated = 3000,
  deliveredBaseline = 691.4,
  deliveredQslice = 999.2,
  overflow = 1708.6,
}: LedgerStripProps) {
  const items = [
    { value: generated.toLocaleString('en-US'), unit: 'GB', label: 'Generated / 24 h', tone: 'default' },
    { value: '61', unit: '', label: 'Passes available', tone: 'default' },
    { value: '63', unit: '', label: 'Conflicts', tone: 'red' },
    { value: deliveredBaseline.toFixed(1), unit: 'GB', label: 'Greedy delivered', tone: 'default' },
    { value: overflow.toFixed(1), unit: 'GB', label: 'Greedy overflow', tone: 'red' },
    { value: deliveredQslice.toFixed(1), unit: 'GB', label: 'Q Slice delivered', tone: 'green' },
  ];

  return (
    <div className="q-ledgerbar" aria-label="Scenario baseline">
      {items.map((item, index) => (
        <div className={`q-ledgerbar__item q-ledgerbar__item--${item.tone}`} key={item.label}>
          <span className="q-ledgerbar__num">
            {item.value}
            {item.unit && <span className="q-ledgerbar__unit">{item.unit}</span>}
          </span>
          <span className="q-ledgerbar__label">
            <span className="q-ledgerbar__tick" aria-hidden="true" />
            {index + 1 < items.length ? item.label : item.label}
          </span>
        </div>
      ))}
    </div>
  );
}
