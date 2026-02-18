/**
 * Identity Odometer
 *
 * Visual gauge showing the user's current identity state
 * from survival through breakthrough. Arc-style meter.
 */

import { useBambiMode } from '../../context/BambiModeContext';
import type { OdometerState } from '../../lib/dashboard-analytics';

interface IdentityOdometerProps {
  state: OdometerState;
}

const STATES: { id: OdometerState; label: string; color: string; position: number }[] = [
  { id: 'survival', label: 'Survival', color: '#ef4444', position: 0 },
  { id: 'caution', label: 'Caution', color: '#f59e0b', position: 1 },
  { id: 'coasting', label: 'Coasting', color: '#eab308', position: 2 },
  { id: 'progress', label: 'Progress', color: '#22c55e', position: 3 },
  { id: 'momentum', label: 'Momentum', color: '#3b82f6', position: 4 },
  { id: 'breakthrough', label: 'Breakthrough', color: '#a855f7', position: 5 },
];

export function IdentityOdometer({ state }: IdentityOdometerProps) {
  const { isBambiMode } = useBambiMode();
  const currentState = STATES.find(s => s.id === state) || STATES[2];
  const progress = (currentState.position / (STATES.length - 1)) * 100;

  // SVG arc parameters
  const cx = 100;
  const cy = 90;
  const r = 70;
  const startAngle = -180;
  const endAngle = 0;
  const totalAngle = endAngle - startAngle;
  const currentAngle = startAngle + (totalAngle * progress / 100);

  const polarToCartesian = (angle: number) => {
    const rad = (angle * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  const arcStart = polarToCartesian(startAngle);
  const arcEnd = polarToCartesian(endAngle);
  const needleEnd = polarToCartesian(currentAngle);

  const arcPath = `M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 0 1 ${arcEnd.x} ${arcEnd.y}`;

  return (
    <div className={`rounded-lg p-4 ${
      isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
    }`}>
      <h3 className={`text-sm font-medium mb-3 text-center ${
        isBambiMode ? 'text-pink-800' : 'text-protocol-text'
      }`}>
        Identity State
      </h3>

      <div className="flex justify-center">
        <svg width="200" height="110" viewBox="0 0 200 110">
          {/* Background arc */}
          <path
            d={arcPath}
            fill="none"
            stroke={isBambiMode ? '#fce7f3' : '#1e1e2e'}
            strokeWidth="12"
            strokeLinecap="round"
          />

          {/* Colored segments */}
          {STATES.map((s, idx) => {
            const segStart = startAngle + (totalAngle * idx / STATES.length);
            const segEnd = startAngle + (totalAngle * (idx + 1) / STATES.length);
            const p1 = polarToCartesian(segStart);
            const p2 = polarToCartesian(segEnd);
            return (
              <path
                key={s.id}
                d={`M ${p1.x} ${p1.y} A ${r} ${r} 0 0 1 ${p2.x} ${p2.y}`}
                fill="none"
                stroke={s.color}
                strokeWidth="12"
                strokeLinecap="round"
                opacity={s.position <= currentState.position ? 1 : 0.2}
              />
            );
          })}

          {/* Needle */}
          <line
            x1={cx}
            y1={cy}
            x2={needleEnd.x}
            y2={needleEnd.y}
            stroke={currentState.color}
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx={cx} cy={cy} r="5" fill={currentState.color} />

          {/* Center label */}
          <text
            x={cx}
            y={cy + 25}
            textAnchor="middle"
            className="text-sm font-bold"
            fill={currentState.color}
          >
            {currentState.label}
          </text>
        </svg>
      </div>

      {/* State indicators */}
      <div className="flex justify-between mt-2 px-2">
        {STATES.map(s => (
          <div
            key={s.id}
            className={`w-2 h-2 rounded-full transition-opacity ${
              s.position <= currentState.position ? 'opacity-100' : 'opacity-30'
            }`}
            style={{ backgroundColor: s.color }}
            title={s.label}
          />
        ))}
      </div>
    </div>
  );
}
