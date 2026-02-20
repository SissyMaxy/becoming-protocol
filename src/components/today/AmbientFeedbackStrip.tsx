/**
 * AmbientFeedbackStrip — Thin read-only stats bar at bottom of Today View.
 * Shows tasks done, streak days, denial day.
 */

import { CheckCircle, Flame, Lock } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';

interface AmbientFeedbackStripProps {
  tasksCompleted: number;
  totalTasks: number;
  currentStreak: number;
  denialDay: number;
}

export function AmbientFeedbackStrip({
  tasksCompleted,
  totalTasks,
  currentStreak,
  denialDay,
}: AmbientFeedbackStripProps) {
  const { isBambiMode } = useBambiMode();

  return (
    <div className={`flex justify-around items-center rounded-xl px-3 py-2 opacity-50 ${
      isBambiMode
        ? 'bg-pink-50/30'
        : ''
    }`}>
      <StatPill
        icon={<CheckCircle className="w-3 h-3" />}
        value={`${tasksCompleted}/${totalTasks}`}
        isBambiMode={isBambiMode}
        color={isBambiMode ? 'text-pink-500' : 'text-emerald-400/70'}
      />
      <Divider isBambiMode={isBambiMode} />
      <StatPill
        icon={<Flame className="w-3 h-3" />}
        value={currentStreak > 0 ? `${currentStreak}d` : '--'}
        isBambiMode={isBambiMode}
        color={isBambiMode ? 'text-pink-500' : 'text-amber-400/70'}
      />
      <Divider isBambiMode={isBambiMode} />
      <StatPill
        icon={<Lock className="w-3 h-3" />}
        value={`D${denialDay}`}
        isBambiMode={isBambiMode}
        color={isBambiMode ? 'text-pink-500' : 'text-purple-400/70'}
      />
    </div>
  );
}

function StatPill({
  icon,
  value,
  isBambiMode,
  color,
}: {
  icon: React.ReactNode;
  value: string;
  isBambiMode: boolean;
  color: string;
}) {
  return (
    <div className={`flex items-center gap-1 ${color}`}>
      {icon}
      <span className={`text-[11px] font-medium tabular-nums ${
        isBambiMode ? 'text-pink-700' : 'text-protocol-text-muted'
      }`}>
        {value}
      </span>
    </div>
  );
}

function Divider({ isBambiMode }: { isBambiMode: boolean }) {
  return (
    <div className={`w-px h-3 ${
      isBambiMode ? 'bg-pink-200/50' : 'bg-protocol-border/30'
    }`} />
  );
}
