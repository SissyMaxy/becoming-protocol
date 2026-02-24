/**
 * MicroTaskWidget — compact Today View stats for micro-tasks.
 * Shows "Micro-tasks: 5/8 today | 62% this week" with a mini ring.
 */

import { Zap } from 'lucide-react';
import { useMicroTasks } from '../../hooks/useMicroTasks';

export function MicroTaskWidget() {
  const { config, stats, isLoading } = useMicroTasks();

  if (isLoading || !config?.enabled) return null;

  const todayPct = stats.totalToday > 0
    ? Math.round((stats.completedToday / stats.totalToday) * 100)
    : 0;

  const weekPct = stats.totalThisWeek > 0
    ? Math.round((stats.completedThisWeek / stats.totalThisWeek) * 100)
    : 0;

  // Mini SVG ring
  const ringSize = 28;
  const strokeWidth = 3;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dayTarget = config.tasksPerDay;
  const ringPct = Math.min(1, stats.completedToday / dayTarget);
  const dashOffset = circumference * (1 - ringPct);

  return (
    <div className="bg-white/5 rounded-xl p-3 border border-white/10 flex items-center gap-3">
      {/* Mini completion ring */}
      <div className="relative flex-shrink-0">
        <svg width={ringSize} height={ringSize} className="-rotate-90">
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={ringSize / 2}
            cy={ringSize / 2}
            r={radius}
            fill="none"
            stroke="url(#microGrad)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-all duration-500"
          />
          <defs>
            <linearGradient id="microGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#a855f7" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
          </defs>
        </svg>
        <Zap className="w-3 h-3 text-purple-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      </div>

      {/* Stats text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs uppercase tracking-wider text-purple-400/60 mr-1">Micro</span>
          <span className="text-white/80 text-sm font-medium">
            {stats.completedToday}/{dayTarget} today
          </span>
        </div>
        <p className="text-white/30 text-xs">
          {weekPct > 0 ? `${weekPct}% this week` : 'No data this week'}
          {todayPct > 0 && stats.totalToday > 0 && ` · ${todayPct}% today`}
        </p>
      </div>
    </div>
  );
}
