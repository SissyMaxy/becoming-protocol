import { IntonationTracker } from '../audio/IntonationTracker';

/**
 * VariabilityIndicator — Displays variability score with classification
 * and per-phrase breakdown.
 *
 * Visual style matches LightnessMeter and ResonanceMeter (SVG arc gauge).
 *
 * @param {{ variabilityScore: number|null, phraseHistory: Array, currentContour: string|null }} props
 */
export function VariabilityIndicator({ variabilityScore, phraseHistory, currentContour }) {
  const hasSignal = variabilityScore !== null;
  const info = hasSignal ? IntonationTracker.getVariabilityInfo(variabilityScore) : null;
  const contourInfo = currentContour ? IntonationTracker.getContourInfo(currentContour) : null;

  const arcAngle = hasSignal ? (variabilityScore / 100) * 180 : 0;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Main gauge */}
      <div className="relative w-64 h-36">
        <svg viewBox="0 0 200 110" className="w-full h-full">
          {/* Background arc segments */}
          <ArcSegment startAngle={0} endAngle={45} color="#6366f130" />
          <ArcSegment startAngle={45} endAngle={90} color="#f59e0b30" />
          <ArcSegment startAngle={90} endAngle={135} color="#10b98130" />
          <ArcSegment startAngle={135} endAngle={180} color="#ec489930" />

          {/* Active arc fill */}
          {hasSignal && (
            <ArcSegment startAngle={0} endAngle={arcAngle} color={info.color} />
          )}

          {/* Gauge labels */}
          <text x="20" y="108" fill="#6b7280" fontSize="8" textAnchor="middle">Flat</text>
          <text x="180" y="108" fill="#6b7280" fontSize="8" textAnchor="middle">Melodic</text>

          {/* Needle */}
          {hasSignal && <Needle angle={arcAngle} color={info.color} />}

          {/* Center score */}
          <text
            x="100"
            y="82"
            textAnchor="middle"
            fill={info?.color || '#6b7280'}
            fontSize="28"
            fontWeight="bold"
            fontFamily="ui-monospace, monospace"
          >
            {hasSignal ? variabilityScore : '—'}
          </text>
          <text x="100" y="98" textAnchor="middle" fill="#6b7280" fontSize="10">
            {hasSignal ? info.label : 'No signal'}
          </text>
        </svg>
      </div>

      {/* Category badges */}
      <div className="flex gap-1">
        <Badge label="Monotone" active={info?.category === 'monotone'} color="#6366f1" />
        <Badge label="Moderate" active={info?.category === 'moderate'} color="#f59e0b" />
        <Badge label="Melodic" active={info?.category === 'melodic'} color="#10b981" />
        <Badge label="Animated" active={info?.category === 'very_animated'} color="#ec4899" />
      </div>

      {/* Current contour + sub-metrics */}
      {hasSignal && (
        <div className="flex gap-4 mt-1 text-center">
          <div>
            <div className="text-xs text-gray-500">Contour</div>
            <div className="text-sm font-mono" style={{ color: info.color }}>
              {contourInfo ? `${contourInfo.symbol} ${contourInfo.label}` : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Phrases</div>
            <div className="text-sm font-mono" style={{ color: info.color }}>
              {phraseHistory.length}
            </div>
          </div>
        </div>
      )}

      {/* Phrase history breakdown */}
      {phraseHistory.length > 0 && (
        <div className="w-full max-w-xs space-y-1 mt-1">
          <div className="text-xs text-gray-500 text-center">Recent Phrases</div>
          {phraseHistory.slice(-5).reverse().map((phrase, i) => {
            const pInfo = IntonationTracker.getVariabilityInfo(phrase.variabilityScore);
            const cInfo = IntonationTracker.getContourInfo(phrase.contour);
            return (
              <div
                key={phrase.startTime}
                className="flex items-center justify-between px-2 py-1 rounded bg-gray-900/50 text-xs"
                style={{ opacity: 1 - i * 0.15 }}
              >
                <span className="font-mono" style={{ color: pInfo.color }}>
                  {phrase.variabilityScore}
                </span>
                <span className="text-gray-500">
                  {cInfo.symbol} {cInfo.label}
                </span>
                <span className="text-gray-600">
                  {phrase.range.toFixed(0)} Hz range
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ArcSegment({ startAngle, endAngle, color }) {
  const cx = 100, cy = 100, r = 80;
  const startRad = (Math.PI * (180 - startAngle)) / 180;
  const endRad = (Math.PI * (180 - endAngle)) / 180;

  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy - r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy - r * Math.sin(endRad);

  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  const d = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;

  return (
    <path d={d} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" />
  );
}

function Needle({ angle, color }) {
  const cx = 100, cy = 100, needleLen = 60;
  const rad = (Math.PI * (180 - angle)) / 180;
  const x = cx + needleLen * Math.cos(rad);
  const y = cy - needleLen * Math.sin(rad);

  return (
    <g>
      <line
        x1={cx} y1={cy} x2={x} y2={y}
        stroke={color} strokeWidth="2.5" strokeLinecap="round"
        className="transition-all duration-100"
      />
      <circle cx={cx} cy={cy} r="4" fill={color} />
    </g>
  );
}

function Badge({ label, active, color }) {
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium transition-all ${
        active ? 'scale-110' : 'opacity-40'
      }`}
      style={{
        backgroundColor: active ? `${color}20` : 'transparent',
        color: active ? color : '#6b7280',
        border: active ? `1px solid ${color}40` : '1px solid transparent',
      }}
    >
      {label}
    </span>
  );
}
