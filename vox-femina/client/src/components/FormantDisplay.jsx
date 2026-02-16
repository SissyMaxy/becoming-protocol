/**
 * FormantDisplay — Detailed formant frequency view for advanced users.
 * Shows F1, F2, F3 values with target ranges.
 *
 * @param {{ f1: number|null, f2: number|null, f3: number|null }} props
 */
export function FormantDisplay({ f1, f2, f3 }) {
  const formants = [
    {
      label: 'F1',
      value: f1,
      targetMin: 400,
      targetMax: 800,
      rangeMin: 200,
      rangeMax: 1000,
      description: 'Jaw openness',
    },
    {
      label: 'F2',
      value: f2,
      targetMin: 1800,
      targetMax: 2500,
      rangeMin: 800,
      rangeMax: 2800,
      description: 'Tongue position (front/back)',
    },
    {
      label: 'F3',
      value: f3,
      targetMin: 2500,
      targetMax: 3200,
      rangeMin: 1800,
      rangeMax: 3500,
      description: 'Vocal tract length',
    },
  ];

  return (
    <div className="space-y-3">
      {formants.map(f => (
        <FormantBar key={f.label} {...f} />
      ))}
    </div>
  );
}

function FormantBar({ label, value, targetMin, targetMax, rangeMin, rangeMax, description }) {
  const hasValue = value !== null;
  const inTarget = hasValue && value >= targetMin && value <= targetMax;

  // Calculate positions as percentages of the range
  const targetStartPct = ((targetMin - rangeMin) / (rangeMax - rangeMin)) * 100;
  const targetWidthPct = ((targetMax - targetMin) / (rangeMax - rangeMin)) * 100;
  const valuePct = hasValue
    ? Math.max(0, Math.min(100, ((value - rangeMin) / (rangeMax - rangeMin)) * 100))
    : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-300">{label}</span>
          <span className="text-xs text-gray-600">{description}</span>
        </div>
        <span
          className="text-xs font-mono"
          style={{ color: hasValue ? (inTarget ? '#10b981' : '#f59e0b') : '#6b7280' }}
        >
          {hasValue ? `${value} Hz` : '—'}
        </span>
      </div>

      {/* Bar with target zone and marker */}
      <div className="relative h-2.5 bg-gray-800 rounded-full overflow-visible">
        {/* Target zone */}
        <div
          className="absolute top-0 h-full rounded-full"
          style={{
            left: `${targetStartPct}%`,
            width: `${targetWidthPct}%`,
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
          }}
        />

        {/* Value marker */}
        {hasValue && (
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 transition-all duration-150"
            style={{
              left: `${valuePct}%`,
              backgroundColor: inTarget ? '#10b981' : '#f59e0b',
              borderColor: inTarget ? '#10b981' : '#f59e0b',
            }}
          />
        )}
      </div>

      {/* Range labels */}
      <div className="flex justify-between mt-0.5">
        <span className="text-[9px] text-gray-600">{rangeMin}</span>
        <span className="text-[9px] text-gray-600">{rangeMax}</span>
      </div>
    </div>
  );
}
