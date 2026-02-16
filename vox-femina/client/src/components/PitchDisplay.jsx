import { PitchDetector } from '../audio/PitchDetector';

/**
 * PitchDisplay — Shows current pitch in Hz and vocal range
 * @param {{ pitch: number | null, clarity: number }} props
 */
export function PitchDisplay({ pitch, clarity }) {
  const hasSignal = pitch !== null && clarity > 0.5;
  const rangeInfo = hasSignal ? PitchDetector.getRangeInfo(pitch) : null;

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Big Hz number */}
      <div className="text-6xl font-mono font-bold tracking-tight" style={{ color: rangeInfo?.color || '#6b7280' }}>
        {hasSignal ? `${Math.round(pitch)}` : '—'}
      </div>
      <div className="text-sm text-gray-400">
        {hasSignal ? 'Hz' : 'No signal'}
      </div>

      {/* Range indicator */}
      <div className="flex gap-1 mt-2">
        <RangeBadge label="Masculine" range="masculine" active={rangeInfo?.range === 'masculine'} color="#6366f1" />
        <RangeBadge label="Androgynous" range="androgynous" active={rangeInfo?.range === 'androgynous'} color="#f59e0b" />
        <RangeBadge label="Feminine" range="feminine" active={rangeInfo?.range === 'feminine'} color="#10b981" />
        <RangeBadge label="High Fem" range="high_feminine" active={rangeInfo?.range === 'high_feminine'} color="#ec4899" />
      </div>

      {/* Clarity indicator */}
      {hasSignal && (
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-gray-500">Clarity</span>
          <div className="w-20 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${clarity * 100}%`, backgroundColor: rangeInfo?.color }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function RangeBadge({ label, active, color }) {
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
