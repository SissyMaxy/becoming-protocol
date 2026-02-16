/**
 * RadarChart — Four-axis SVG spider chart for voice feminization pillars.
 *
 * Axes: Lightness, Resonance, Variability, Pitch
 * Current values plotted as a filled polygon.
 * Optional target overlay showing ideal ranges.
 *
 * @param {{ lightness: number|null, resonance: number|null, variability: number|null, pitch: number|null }} props
 */
export function RadarChart({ lightness, resonance, variability, pitch }) {
  const cx = 120;
  const cy = 120;
  const maxR = 90;
  const levels = 4; // Concentric rings

  const axes = [
    { key: 'lightness', label: 'Lightness', value: lightness, angle: -Math.PI / 2, color: '#10b981' },
    { key: 'resonance', label: 'Resonance', value: resonance, angle: 0, color: '#6366f1' },
    { key: 'variability', label: 'Variability', value: variability, angle: Math.PI / 2, color: '#f59e0b' },
    { key: 'pitch', label: 'Pitch', value: pitch, angle: Math.PI, color: '#ec4899' },
  ];

  // Target polygon (50-80 range = ideal feminine voice)
  const targetMin = 50;
  const targetMax = 80;

  const targetInnerPoints = axes.map(a => ({
    x: cx + (targetMin / 100) * maxR * Math.cos(a.angle),
    y: cy + (targetMin / 100) * maxR * Math.sin(a.angle),
  }));

  const targetOuterPoints = axes.map(a => ({
    x: cx + (targetMax / 100) * maxR * Math.cos(a.angle),
    y: cy + (targetMax / 100) * maxR * Math.sin(a.angle),
  }));

  // Current values polygon
  const valuePoints = axes.map(a => {
    const v = a.value !== null ? Math.max(0, Math.min(100, a.value)) : 0;
    return {
      x: cx + (v / 100) * maxR * Math.cos(a.angle),
      y: cy + (v / 100) * maxR * Math.sin(a.angle),
      hasValue: a.value !== null,
    };
  });

  const hasAnyValue = axes.some(a => a.value !== null);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 240 240" className="w-full max-w-[280px]">
        {/* Concentric level rings */}
        {Array.from({ length: levels }, (_, i) => {
          const r = (maxR * (i + 1)) / levels;
          const pts = axes.map(a => ({
            x: cx + r * Math.cos(a.angle),
            y: cy + r * Math.sin(a.angle),
          }));
          return (
            <polygon
              key={i}
              points={pts.map(p => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
            />
          );
        })}

        {/* Axis lines */}
        {axes.map(a => (
          <line
            key={a.key}
            x1={cx}
            y1={cy}
            x2={cx + maxR * Math.cos(a.angle)}
            y2={cy + maxR * Math.sin(a.angle)}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="1"
          />
        ))}

        {/* Target zone (ideal range polygon) */}
        <polygon
          points={targetOuterPoints.map(p => `${p.x},${p.y}`).join(' ')}
          fill="rgba(16, 185, 129, 0.05)"
          stroke="rgba(16, 185, 129, 0.2)"
          strokeWidth="1"
          strokeDasharray="4 3"
        />
        <polygon
          points={targetInnerPoints.map(p => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="rgba(16, 185, 129, 0.15)"
          strokeWidth="1"
          strokeDasharray="4 3"
        />

        {/* Current values polygon */}
        {hasAnyValue && (
          <polygon
            points={valuePoints.map(p => `${p.x},${p.y}`).join(' ')}
            fill="rgba(224, 224, 232, 0.1)"
            stroke="#e0e0e8"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        )}

        {/* Value dots */}
        {valuePoints.map((p, i) => (
          p.hasValue && (
            <circle
              key={axes[i].key}
              cx={p.x}
              cy={p.y}
              r="4"
              fill={axes[i].color}
              stroke="#0f0f14"
              strokeWidth="1.5"
            />
          )
        ))}

        {/* Axis labels */}
        {axes.map(a => {
          const labelR = maxR + 18;
          const lx = cx + labelR * Math.cos(a.angle);
          const ly = cy + labelR * Math.sin(a.angle);
          const anchor = Math.abs(a.angle) < 0.1 ? 'start'
            : Math.abs(a.angle - Math.PI) < 0.1 || Math.abs(a.angle + Math.PI) < 0.1 ? 'end'
            : 'middle';

          return (
            <g key={a.key}>
              <text
                x={lx}
                y={ly - 4}
                textAnchor={anchor}
                fill={a.color}
                fontSize="10"
                fontWeight="600"
              >
                {a.label}
              </text>
              <text
                x={lx}
                y={ly + 8}
                textAnchor={anchor}
                fill="#6b7280"
                fontSize="9"
                fontFamily="ui-monospace, monospace"
              >
                {a.value !== null ? Math.round(a.value) : '—'}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
