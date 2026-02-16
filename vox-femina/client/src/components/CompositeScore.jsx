import { CompositeScorer } from '../audio/CompositeScorer';

const PILLAR_CONFIG = [
  { key: 'lightness', label: 'Lightness', color: '#10b981' },
  { key: 'resonance', label: 'Resonance', color: '#6366f1' },
  { key: 'variability', label: 'Variability', color: '#f59e0b' },
  { key: 'pitch', label: 'Pitch', color: '#ec4899' },
];

/**
 * CompositeScore — Hero display of the overall voice feminization score.
 *
 * Shows a large 0-100 number with color gradient, and a horizontal stacked
 * bar showing per-pillar contribution breakdown.
 *
 * @param {{ compositeScore: number|null, breakdown: object }} props
 */
export function CompositeScore({ compositeScore, breakdown }) {
  const hasScore = compositeScore !== null;
  const scoreColor = hasScore ? CompositeScorer.getScoreColor(compositeScore) : '#6b7280';
  const scoreLabel = hasScore ? CompositeScorer.getScoreLabel(compositeScore) : 'No signal';

  // Build breakdown segments (only non-null pillars)
  const segments = PILLAR_CONFIG
    .filter(p => breakdown && breakdown[p.key] !== null && breakdown[p.key] !== undefined)
    .map(p => ({
      ...p,
      value: breakdown[p.key],
    }));

  const totalContribution = segments.reduce((s, seg) => s + seg.value, 0);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Score number */}
      <div className="text-center">
        <div
          className="text-6xl font-bold font-mono tabular-nums transition-colors duration-300"
          style={{ color: scoreColor }}
        >
          {hasScore ? compositeScore : '—'}
        </div>
        <div className="text-sm mt-1" style={{ color: scoreColor }}>
          {scoreLabel}
        </div>
      </div>

      {/* Breakdown bar */}
      {hasScore && segments.length > 0 && (
        <div className="w-full max-w-md">
          {/* Stacked bar */}
          <div className="flex h-4 rounded-full overflow-hidden bg-gray-800">
            {segments.map(seg => {
              const widthPct = totalContribution > 0
                ? (seg.value / totalContribution) * 100
                : 0;
              return (
                <div
                  key={seg.key}
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: seg.color,
                    opacity: 0.8,
                  }}
                  title={`${seg.label}: ${seg.value.toFixed(1)}`}
                />
              );
            })}
          </div>

          {/* Segment labels */}
          <div className="flex justify-between mt-1.5">
            {segments.map(seg => (
              <div key={seg.key} className="text-center flex-1">
                <div className="text-[10px] font-medium" style={{ color: seg.color }}>
                  {seg.label}
                </div>
                <div className="text-[10px] text-gray-500">
                  {seg.value.toFixed(1)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
