/**
 * EdgeCounter — Dot progress display for edge tracking.
 * Shows filled/empty dots for small targets, numeric for large targets.
 */

import { SESSION_COLORS } from './session-types';

interface EdgeCounterProps {
  count: number;
  target: number;
}

export function EdgeCounter({ count, target }: EdgeCounterProps) {
  // Numeric display for large targets
  if (target > 15) {
    return (
      <span className="text-sm font-medium" style={{ color: SESSION_COLORS.gold }}>
        {count}/{target}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: target }, (_, i) => (
        <div
          key={i}
          className="w-2 h-2 rounded-full transition-colors duration-300"
          style={{
            backgroundColor: i < count ? SESSION_COLORS.gold : 'rgba(255,255,255,0.15)',
          }}
        />
      ))}
    </div>
  );
}
