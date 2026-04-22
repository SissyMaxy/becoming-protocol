import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface IdentityFadingBarProps {
  userId?: string;
}

export function IdentityFadingBar({ userId }: IdentityFadingBarProps) {
  const [score, setScore] = useState<number | null>(null);
  const [trend, setTrend] = useState<'up' | 'down' | 'stable' | null>(null);

  useEffect(() => {
    if (!userId) return;

    async function loadScore() {
      try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
        const { data } = await supabase
          .from('identity_displacement_log')
          .select('displacement_score, log_date')
          .eq('user_id', userId)
          .gte('log_date', sevenDaysAgo)
          .order('log_date', { ascending: false })
          .limit(7);

        if (!data || data.length === 0) {
          setScore(null);
          return;
        }

        const latest = parseFloat(data[0].displacement_score);
        setScore(isNaN(latest) ? null : latest);

        if (data.length >= 2) {
          const oldest = parseFloat(data[data.length - 1].displacement_score);
          if (!isNaN(oldest)) {
            if (latest > oldest + 0.05) setTrend('up');
            else if (latest < oldest - 0.05) setTrend('down');
            else setTrend('stable');
          }
        }
      } catch {
        // Non-critical
      }
    }

    loadScore();
    const interval = setInterval(loadScore, 120000); // refresh every 2 min
    return () => clearInterval(interval);
  }, [userId]);

  if (score === null) return null;

  const femininePercent = Math.round(score * 100);
  const masculinePercent = 100 - femininePercent;

  // Color: more feminine = more purple, more masculine = more gray/red
  const barColor = femininePercent >= 70 ? 'bg-purple-500' : femininePercent >= 40 ? 'bg-purple-400/60' : 'bg-red-400/60';
  const trendIcon = trend === 'up' ? '\u2191' : trend === 'down' ? '\u2193' : '\u2192';
  const trendColor = trend === 'up' ? 'text-purple-400' : trend === 'down' ? 'text-red-400' : 'text-gray-500';

  return (
    <div className="px-4 py-1.5 border-b border-gray-800/30 bg-black/30">
      <div className="flex items-center gap-2 text-[11px]">
        <span className="uppercase tracking-wider text-gray-500 text-[10px]">Identity</span>
        <span className="text-purple-300 font-medium tabular-nums">Maxy {femininePercent}%</span>
        <span className={trendColor}>{trendIcon}</span>
        <span className="text-gray-500 tabular-nums">David {masculinePercent}%</span>
      </div>
      <div className="h-1 bg-gray-800 rounded-full mt-1 overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full transition-all duration-1000`}
          style={{ width: `${femininePercent}%` }}
        />
      </div>
    </div>
  );
}
