import { PitchDetector } from '../audio/PitchDetector';

const RANGES = [
  { name: 'Masculine', min: 50, max: 150, color: '#6366f1' },
  { name: 'Androgynous', min: 150, max: 180, color: '#f59e0b' },
  { name: 'Feminine', min: 180, max: 250, color: '#10b981' },
  { name: 'High Feminine', min: 250, max: 400, color: '#ec4899' },
];

/**
 * RangeIndicator — Horizontal spectrum showing where current pitch falls
 * @param {{ pitch: number | null }} props
 */
export function RangeIndicator({ pitch }) {
  const totalMin = 50;
  const totalMax = 400;

  const markerPos = pitch !== null
    ? Math.max(0, Math.min(100, ((pitch - totalMin) / (totalMax - totalMin)) * 100))
    : null;

  return (
    <div className="w-full">
      <div className="flex items-center gap-0.5 mb-1">
        <span className="text-xs text-gray-500 w-8">50</span>
        <div className="flex-1 flex h-3 rounded-full overflow-hidden">
          {RANGES.map(range => {
            const width = ((range.max - range.min) / (totalMax - totalMin)) * 100;
            return (
              <div
                key={range.name}
                className="h-full relative"
                style={{ width: `${width}%`, backgroundColor: `${range.color}30` }}
              />
            );
          })}
        </div>
        <span className="text-xs text-gray-500 w-8 text-right">400</span>
      </div>

      {/* Marker */}
      <div className="relative h-4 ml-8 mr-8">
        {markerPos !== null && (
          <div
            className="absolute top-0 -translate-x-1/2 transition-all duration-75"
            style={{ left: `${markerPos}%` }}
          >
            <div className="w-0 h-0 border-l-4 border-r-4 border-t-6 border-l-transparent border-r-transparent"
              style={{ borderTopColor: PitchDetector.getRangeInfo(pitch).color }}
            />
          </div>
        )}
      </div>

      {/* Labels */}
      <div className="flex ml-8 mr-8">
        {RANGES.map(range => {
          const width = ((range.max - range.min) / (totalMax - totalMin)) * 100;
          return (
            <div key={range.name} style={{ width: `${width}%` }} className="text-center">
              <span className="text-[9px]" style={{ color: range.color }}>{range.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
