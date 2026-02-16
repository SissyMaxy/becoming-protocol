import { VocalWeightAnalyzer } from '../audio/VocalWeightAnalyzer';

/**
 * LightnessMeter — Primary visual element showing vocal weight (lightness) score.
 * This is the MOST prominent display in the app — larger and more visually
 * dominant than PitchDisplay.
 *
 * @param {{ lightness: number|null, h1h2: number|null, spectralSlope: number|null }} props
 */
export function LightnessMeter({ lightness, h1h2, spectralSlope }) {
  const hasSignal = lightness !== null;
  const weightInfo = hasSignal ? VocalWeightAnalyzer.getWeightInfo(lightness) : null;

  // Calculate arc position for the gauge (0-100 maps to 180° arc)
  const arcAngle = hasSignal ? (lightness / 100) * 180 : 0;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Main gauge */}
      <div className="relative w-64 h-36">
        {/* SVG arc gauge */}
        <svg viewBox="0 0 200 110" className="w-full h-full">
          {/* Background arc segments */}
          <ArcSegment startAngle={0} endAngle={54} color="#6366f130" />
          <ArcSegment startAngle={54} endAngle={90} color="#f59e0b30" />
          <ArcSegment startAngle={90} endAngle={126} color="#10b98130" />
          <ArcSegment startAngle={126} endAngle={180} color="#ec489930" />

          {/* Active arc fill */}
          {hasSignal && (
            <ArcSegment startAngle={0} endAngle={arcAngle} color={weightInfo.color} />
          )}

          {/* Gauge labels */}
          <text x="20" y="108" fill="#6b7280" fontSize="8" textAnchor="middle">Heavy</text>
          <text x="180" y="108" fill="#6b7280" fontSize="8" textAnchor="middle">Light</text>

          {/* Needle */}
          {hasSignal && <Needle angle={arcAngle} color={weightInfo.color} />}

          {/* Center score */}
          <text
            x="100"
            y="82"
            textAnchor="middle"
            fill={weightInfo?.color || '#6b7280'}
            fontSize="28"
            fontWeight="bold"
            fontFamily="ui-monospace, monospace"
          >
            {hasSignal ? Math.round(lightness) : '—'}
          </text>
          <text x="100" y="98" textAnchor="middle" fill="#6b7280" fontSize="10">
            {hasSignal ? weightInfo.label : 'No signal'}
          </text>
        </svg>
      </div>

      {/* Category badges */}
      <div className="flex gap-1">
        <WeightBadge label="Heavy" category="heavy" active={weightInfo?.category === 'heavy'} color="#6366f1" />
        <WeightBadge label="Moderate" category="moderate" active={weightInfo?.category === 'moderate'} color="#f59e0b" />
        <WeightBadge label="Light" category="light" active={weightInfo?.category === 'light'} color="#10b981" />
        <WeightBadge label="Very Light" category="very_light" active={weightInfo?.category === 'very_light'} color="#ec4899" />
      </div>

      {/* Detail metrics */}
      {hasSignal && (
        <div className="flex gap-6 mt-1">
          <div className="text-center">
            <div className="text-xs text-gray-500">H1-H2</div>
            <div className="text-sm font-mono" style={{ color: weightInfo.color }}>
              {h1h2 !== null ? `${h1h2 > 0 ? '+' : ''}${h1h2.toFixed(1)} dB` : '—'}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500">Spectral Slope</div>
            <div className="text-sm font-mono" style={{ color: weightInfo.color }}>
              {spectralSlope !== null ? `${spectralSlope.toFixed(1)} dB/h` : '—'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * SVG arc segment for the gauge.
 */
function ArcSegment({ startAngle, endAngle, color }) {
  // Convert angles to radians (0° = left, 180° = right, arc goes clockwise along top)
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
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth="12"
      strokeLinecap="round"
    />
  );
}

/**
 * Gauge needle that points to the current lightness value.
 */
function Needle({ angle, color }) {
  const cx = 100, cy = 100, needleLen = 60;
  const rad = (Math.PI * (180 - angle)) / 180;
  const x = cx + needleLen * Math.cos(rad);
  const y = cy - needleLen * Math.sin(rad);

  return (
    <g>
      <line
        x1={cx} y1={cy} x2={x} y2={y}
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        className="transition-all duration-100"
      />
      <circle cx={cx} cy={cy} r="4" fill={color} />
    </g>
  );
}

function WeightBadge({ label, active, color }) {
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
