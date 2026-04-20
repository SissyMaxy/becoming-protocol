/**
 * Chastity Lock Starter
 *
 * Shown in Force Dashboard when chastity is unlocked. Lets Maxy voluntarily
 * lock in with a Handler-floored minimum duration based on her current streak.
 */

import { useState } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Props {
  userId: string;
  currentStreak: number;
  onLocked: () => void;
}

// Handler-set floors: can't cheat with 1-hour locks
function minDurationHours(streak: number): number {
  if (streak >= 30) return 72;
  if (streak >= 14) return 48;
  if (streak >= 7) return 24;
  return 12;
}

const PRESETS = [12, 24, 48, 72, 168];

export function ChastityLockStarter({ userId, currentStreak, onLocked }: Props) {
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState(false);
  const min = minDurationHours(currentStreak);

  const lock = async () => {
    if (hours < min) return;
    setBusy(true);
    try {
      const now = new Date();
      const unlock = new Date(now.getTime() + hours * 3600000);
      const newStreakDay = currentStreak + Math.round(hours / 24);

      const { data } = await supabase
        .from('chastity_sessions')
        .insert({
          user_id: userId,
          locked_at: now.toISOString(),
          scheduled_unlock_at: unlock.toISOString(),
          duration_hours: hours,
          streak_day: newStreakDay,
          lock_set_by: 'self',
          status: 'locked',
        })
        .select('id')
        .single();

      if (data) {
        await supabase
          .from('user_state')
          .update({
            chastity_locked: true,
            chastity_current_session_id: (data as { id: string }).id,
            chastity_scheduled_unlock_at: unlock.toISOString(),
            chastity_streak_days: newStreakDay,
          })
          .eq('user_id', userId);
      }
      onLocked();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full p-3 rounded-lg border border-dashed border-purple-500/40 bg-purple-950/10 text-purple-300 text-sm flex items-center justify-center gap-2 hover:bg-purple-950/20"
      >
        <Lock className="w-4 h-4" />
        Lock in chastity
      </button>
    );
  }

  return (
    <div className="p-4 rounded-xl border border-purple-500/30 bg-purple-950/10 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-semibold text-white">Lock in</span>
        </div>
        <button onClick={() => setOpen(false)} className="text-xs text-gray-500">cancel</button>
      </div>

      <div className="text-xs text-gray-400">
        Handler floor at your current streak ({currentStreak} days): minimum <span className="text-purple-300 font-semibold">{min} hours</span>.
      </div>

      <div className="grid grid-cols-5 gap-1">
        {PRESETS.map(h => (
          <button
            key={h}
            onClick={() => setHours(h)}
            disabled={h < min}
            className={`py-2 text-xs rounded border ${
              hours === h
                ? 'bg-purple-600 border-purple-500 text-white'
                : h < min
                  ? 'bg-gray-900 border-gray-800 text-gray-600 cursor-not-allowed'
                  : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-purple-500/50'
            }`}
          >
            {h >= 168 ? `${h / 168}w` : h >= 24 ? `${h / 24}d` : `${h}h`}
          </button>
        ))}
      </div>

      <div className="text-xs text-gray-500">
        Unlocks {new Date(Date.now() + hours * 3600000).toLocaleString()}
      </div>

      <div className="text-xs text-red-300/80 p-2 rounded border border-red-500/30 bg-red-950/20">
        Break-glass early = streak reset + public post + Gina disclosure bump + 7-day denial extension.
      </div>

      <button
        onClick={lock}
        disabled={busy || hours < min}
        className="w-full py-2 rounded-lg bg-purple-600 text-white font-semibold disabled:bg-gray-700"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : `Lock for ${hours}h`}
      </button>
    </div>
  );
}
