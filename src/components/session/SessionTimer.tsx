/**
 * SessionTimer — Top bar displaying elapsed time, denial day, and edge dot counter.
 */

import { Clock } from 'lucide-react';
import { SESSION_COLORS } from './session-types';
import { EdgeCounter } from './EdgeCounter';

interface SessionTimerProps {
  formatted: string;
  denialDay: number;
  edgeCount: number;
  targetEdges: number;
}

export function SessionTimer({ formatted, denialDay, edgeCount, targetEdges }: SessionTimerProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      {/* Timer */}
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4" style={{ color: SESSION_COLORS.teal }} />
        <span className="font-mono text-lg text-white/80">{formatted}</span>
      </div>

      {/* Denial day */}
      {denialDay > 0 && (
        <span className="text-sm text-white/50">
          Day {denialDay}
        </span>
      )}

      {/* Edge dots */}
      <EdgeCounter count={edgeCount} target={targetEdges} />
    </div>
  );
}
