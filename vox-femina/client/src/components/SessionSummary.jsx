import { CompositeScorer } from '../audio/CompositeScorer';

const PILLARS = [
  { key: 'lightness', label: 'Lightness', color: '#10b981' },
  { key: 'resonance', label: 'Resonance', color: '#6366f1' },
  { key: 'variability', label: 'Variability', color: '#f59e0b' },
  { key: 'pitch', label: 'Pitch', color: '#ec4899' },
];

/**
 * SessionSummary — Post-session overlay showing composite + pillar scores with trends.
 *
 * @param {{
 *   summary: object,
 *   previousSummary: object|null,
 *   onRequestCoaching: () => void,
 *   onNewSession: () => void,
 *   onClose: () => void,
 * }} props
 */
export function SessionSummary({ summary, previousSummary, onRequestCoaching, onNewSession, onClose }) {
  if (!summary) return null;

  const durationMin = Math.floor(summary.durationSeconds / 60);
  const durationSec = summary.durationSeconds % 60;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-[#0f0f14] rounded-2xl border border-gray-800 p-6 space-y-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-100">Session Complete</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Duration */}
        <p className="text-sm text-gray-400">
          Duration: {durationMin}m {durationSec}s
          {summary.sampleCount != null && (
            <span className="text-gray-600 ml-2">({summary.sampleCount} samples)</span>
          )}
        </p>

        {/* Composite score hero */}
        <div className="text-center py-4">
          <div
            className="text-6xl font-bold font-mono tabular-nums"
            style={{ color: CompositeScorer.getScoreColor(summary.compositeScore) }}
          >
            {summary.compositeScore ?? '—'}
          </div>
          <div className="text-sm text-gray-400 mt-1">
            {summary.compositeScore != null ? CompositeScorer.getScoreLabel(summary.compositeScore) : 'No data'}
          </div>
        </div>

        {/* Pillar scores with trends */}
        <div className="space-y-2">
          {PILLARS.map(p => {
            const pillar = summary.pillarScores?.[p.key];
            const trend = summary.pillarTrends?.[p.key];
            const prev = previousSummary?.pillarScores?.[p.key];

            return (
              <div
                key={p.key}
                className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-gray-900/50 border border-gray-800"
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                  <span className="text-sm text-gray-300 font-medium">{p.label}</span>
                </div>
                <div className="flex items-center gap-3 text-sm font-mono">
                  {pillar ? (
                    <>
                      <span className="text-gray-100 font-semibold">{pillar.avg}</span>
                      <span className="text-gray-600 text-xs">
                        {pillar.min}–{pillar.max}
                      </span>
                      {trend && <TrendArrow trend={trend} current={pillar.avg} previous={prev?.avg} />}
                    </>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Extras */}
        {summary.extras && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            {summary.extras.timeInTargetPct != null && (
              <div className="px-3 py-2 rounded-lg bg-gray-900/30 border border-gray-800/50">
                <span className="text-gray-500">Target Range</span>
                <span className="text-gray-300 ml-1 font-mono">{summary.extras.timeInTargetPct}%</span>
              </div>
            )}
            {summary.extras.pitchAvgHz != null && (
              <div className="px-3 py-2 rounded-lg bg-gray-900/30 border border-gray-800/50">
                <span className="text-gray-500">Avg Pitch</span>
                <span className="text-gray-300 ml-1 font-mono">{summary.extras.pitchAvgHz} Hz</span>
              </div>
            )}
            {summary.extras.h1h2Avg != null && (
              <div className="px-3 py-2 rounded-lg bg-gray-900/30 border border-gray-800/50">
                <span className="text-gray-500">H1-H2</span>
                <span className="text-gray-300 ml-1 font-mono">{summary.extras.h1h2Avg} dB</span>
              </div>
            )}
            {summary.extras.f2Avg != null && (
              <div className="px-3 py-2 rounded-lg bg-gray-900/30 border border-gray-800/50">
                <span className="text-gray-500">F2 Avg</span>
                <span className="text-gray-300 ml-1 font-mono">{summary.extras.f2Avg} Hz</span>
              </div>
            )}
          </div>
        )}

        {/* Radar comparison */}
        {summary.pillarScores && (
          <div className="flex justify-center">
            <ComparisonRadar current={summary.pillarScores} previous={previousSummary?.pillarScores} />
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-2">
          <button
            onClick={onRequestCoaching}
            className="w-full px-6 py-3 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-500 transition-colors"
          >
            Get AI Coaching
          </button>
          <button
            onClick={onNewSession}
            className="w-full px-6 py-3 rounded-xl bg-gray-800 text-gray-300 font-medium hover:bg-gray-700 transition-colors"
          >
            Start New Session
          </button>
        </div>
      </div>
    </div>
  );
}

function TrendArrow({ trend, current, previous }) {
  if (trend === 'up') {
    const delta = previous != null ? `+${Math.round((current - previous) * 10) / 10}` : '';
    return (
      <span className="text-emerald-400 text-xs flex items-center gap-0.5">
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
          <path d="M6 2l4 5H2z" />
        </svg>
        {delta}
      </span>
    );
  }
  if (trend === 'down') {
    const delta = previous != null ? `${Math.round((current - previous) * 10) / 10}` : '';
    return (
      <span className="text-red-400 text-xs flex items-center gap-0.5">
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
          <path d="M6 10l4-5H2z" />
        </svg>
        {delta}
      </span>
    );
  }
  return <span className="text-gray-600 text-xs">—</span>;
}

/**
 * Inline comparison radar chart (SVG) showing current vs previous session.
 */
function ComparisonRadar({ current, previous }) {
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = 70;
  const axes = ['lightness', 'resonance', 'variability', 'pitch'];
  const angles = axes.map((_, i) => (Math.PI * 2 * i) / axes.length - Math.PI / 2);

  function scoreToPoint(axis, score, idx) {
    const r = (score / 100) * maxR;
    return {
      x: cx + r * Math.cos(angles[idx]),
      y: cy + r * Math.sin(angles[idx]),
    };
  }

  function polygonPoints(scores) {
    return axes
      .map((key, i) => {
        const s = scores?.[key]?.avg ?? 0;
        const p = scoreToPoint(key, s, i);
        return `${p.x},${p.y}`;
      })
      .join(' ');
  }

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-40 h-40">
      {/* Level rings */}
      {[25, 50, 75, 100].map(level => (
        <circle
          key={level}
          cx={cx}
          cy={cy}
          r={(level / 100) * maxR}
          fill="none"
          stroke="#374151"
          strokeWidth={0.5}
          opacity={0.4}
        />
      ))}

      {/* Axis lines */}
      {angles.map((angle, i) => (
        <line
          key={i}
          x1={cx}
          y1={cy}
          x2={cx + maxR * Math.cos(angle)}
          y2={cy + maxR * Math.sin(angle)}
          stroke="#374151"
          strokeWidth={0.5}
          opacity={0.4}
        />
      ))}

      {/* Previous session polygon (dashed) */}
      {previous && (
        <polygon
          points={polygonPoints(previous)}
          fill="rgba(156, 163, 175, 0.1)"
          stroke="#9ca3af"
          strokeWidth={1}
          strokeDasharray="3,3"
        />
      )}

      {/* Current session polygon */}
      <polygon
        points={polygonPoints(current)}
        fill="rgba(16, 185, 129, 0.15)"
        stroke="#10b981"
        strokeWidth={1.5}
      />

      {/* Axis labels */}
      {axes.map((key, i) => {
        const labelR = maxR + 14;
        const x = cx + labelR * Math.cos(angles[i]);
        const y = cy + labelR * Math.sin(angles[i]);
        return (
          <text
            key={key}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-[8px] fill-gray-500"
          >
            {key.charAt(0).toUpperCase() + key.slice(1, 4)}
          </text>
        );
      })}
    </svg>
  );
}
