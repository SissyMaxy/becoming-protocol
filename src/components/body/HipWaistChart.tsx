/**
 * HipWaistChart — inline SVG line chart for hip-to-waist ratio trend.
 * Renders target zone band (0.7–0.8) and data points.
 * Needs 3+ measurements with ratio data to render.
 */

import type { BodyMeasurement } from '../../types/exercise';

interface HipWaistChartProps {
  history: BodyMeasurement[];
}

const CHART_W = 240;
const CHART_H = 80;
const PAD_X = 28;
const PAD_Y = 10;
const TARGET_LOW = 0.7;
const TARGET_HIGH = 0.8;

export function HipWaistChart({ history }: HipWaistChartProps) {
  const ratioPoints = history
    .filter((m) => m.hipWaistRatio != null)
    .map((m) => ({ date: m.measuredAt, value: m.hipWaistRatio as number }));

  if (ratioPoints.length < 3) return null;

  const values = ratioPoints.map((p) => p.value);
  const minV = Math.min(...values, TARGET_LOW - 0.02);
  const maxV = Math.max(...values, TARGET_HIGH + 0.02);
  const rangeV = maxV - minV || 0.1;

  const plotW = CHART_W - PAD_X * 2;
  const plotH = CHART_H - PAD_Y * 2;

  const toX = (i: number) => PAD_X + (i / (ratioPoints.length - 1)) * plotW;
  const toY = (v: number) => PAD_Y + plotH - ((v - minV) / rangeV) * plotH;

  // Target zone band
  const bandTop = toY(TARGET_HIGH);
  const bandBottom = toY(TARGET_LOW);

  // Line path
  const linePath = ratioPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p.value).toFixed(1)}`)
    .join(' ');

  const latest = ratioPoints[ratioPoints.length - 1];
  const inTarget = latest.value >= TARGET_LOW && latest.value <= TARGET_HIGH;

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-white/40">Hip-to-Waist Ratio</span>
        <span className={`text-xs font-medium ${inTarget ? 'text-green-400' : 'text-purple-400'}`}>
          {latest.value.toFixed(2)}
        </span>
      </div>
      <svg
        width={CHART_W}
        height={CHART_H}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full"
        preserveAspectRatio="none"
      >
        {/* Target zone */}
        <rect
          x={PAD_X}
          y={bandTop}
          width={plotW}
          height={bandBottom - bandTop}
          fill="rgba(168,85,247,0.08)"
          rx={2}
        />

        {/* Target zone labels */}
        <text x={PAD_X - 2} y={bandTop + 4} textAnchor="end" className="fill-white/20" fontSize={8}>
          {TARGET_HIGH}
        </text>
        <text x={PAD_X - 2} y={bandBottom + 4} textAnchor="end" className="fill-white/20" fontSize={8}>
          {TARGET_LOW}
        </text>

        {/* Data line */}
        <path d={linePath} fill="none" stroke="rgb(168,85,247)" strokeWidth={1.5} />

        {/* Data points */}
        {ratioPoints.map((p, i) => (
          <circle
            key={i}
            cx={toX(i)}
            cy={toY(p.value)}
            r={2.5}
            fill={p.value >= TARGET_LOW && p.value <= TARGET_HIGH ? 'rgb(74,222,128)' : 'rgb(168,85,247)'}
          />
        ))}
      </svg>
    </div>
  );
}
