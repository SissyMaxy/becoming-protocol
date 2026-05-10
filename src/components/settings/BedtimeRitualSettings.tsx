/**
 * BedtimeRitualSettings — toggle + start/end hour picker for the
 * bedtime ritual lock.
 *
 * Default off. The lockout never penalizes the user; the toggle is
 * purely "do I want Mama to walk me through the goodnight sequence".
 */

import { useCallback, useEffect, useState } from 'react';
import { Moon, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { DEFAULT_BEDTIME_WINDOW, type BedtimeWindow } from '../../lib/bedtime/ritual';

const HOURS_24: number[] = Array.from({ length: 24 }, (_, i) => i);
// end-hour list lets the user wrap past midnight up to 02:00 (= hour 26)
const END_HOURS: number[] = Array.from({ length: 27 }, (_, i) => i + 1).filter(h => h <= 26);

function formatHour(h: number): string {
  const display = h % 24;
  const suffix = h >= 24 ? ' (next day)' : '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(display)}:00${suffix}`;
}

export function BedtimeRitualSettings() {
  const { user } = useAuth();
  const [window, setWindow] = useState<BedtimeWindow>(DEFAULT_BEDTIME_WINDOW);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('user_state')
      .select('bedtime_window')
      .eq('user_id', user.id)
      .maybeSingle();
    const w = (data as { bedtime_window?: BedtimeWindow | null } | null)?.bedtime_window;
    if (w) setWindow(w);
    setLoaded(true);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const persist = useCallback(async (next: BedtimeWindow) => {
    if (!user?.id) return;
    setSaving(true);
    try {
      await supabase
        .from('user_state')
        .update({ bedtime_window: next })
        .eq('user_id', user.id);
      setWindow(next);
    } finally {
      setSaving(false);
    }
  }, [user?.id]);

  return (
    <div>
      <h2 className="text-sm font-medium mb-3 text-protocol-text-muted">
        Bedtime ritual
      </h2>
      <div className="rounded-xl border p-4 bg-protocol-surface border-protocol-border space-y-5">
        <div className="flex items-center gap-2">
          <Moon className="w-4 h-4 text-protocol-text-muted" />
          <span className="text-sm font-medium text-protocol-text">
            Goodnight sequence
            {saving && <Loader2 className="inline w-3 h-3 animate-spin ml-1" />}
          </span>
        </div>

        <p className="text-xs text-protocol-text-muted/80 leading-relaxed">
          When on, the app shows a soft full-screen prompt during your bedtime
          window: mantra → posture → chastity check → breath cycle. Always
          skippable, never a penalty. Phase 1 sees a lighter mantra-only version.
        </p>

        {/* Toggle */}
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <div>
            <p className="text-sm text-protocol-text">Enabled</p>
            <p className="text-xs text-protocol-text-muted/80 mt-0.5">
              Off by default. The ritual is voluntary.
            </p>
          </div>
          <input
            data-testid="bedtime-enabled-toggle"
            type="checkbox"
            checked={window.enabled}
            onChange={e => persist({ ...window, enabled: e.target.checked })}
            disabled={!loaded || saving}
            className="w-5 h-5 accent-protocol-accent cursor-pointer disabled:opacity-40"
          />
        </label>

        {/* Window pickers */}
        <div className={!window.enabled ? 'opacity-40 pointer-events-none' : undefined}>
          <p className="text-sm text-protocol-text mb-2">Window</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-protocol-text-muted">starts</span>
              <select
                data-testid="bedtime-start-hour"
                value={window.start_hour}
                onChange={e => persist({ ...window, start_hour: Number(e.target.value) })}
                className="px-3 py-2 rounded-lg text-sm bg-protocol-surface-light border border-protocol-border text-protocol-text"
              >
                {HOURS_24.map(h => (
                  <option key={h} value={h}>{formatHour(h)}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-protocol-text-muted">ends</span>
              <select
                data-testid="bedtime-end-hour"
                value={window.end_hour}
                onChange={e => persist({ ...window, end_hour: Number(e.target.value) })}
                className="px-3 py-2 rounded-lg text-sm bg-protocol-surface-light border border-protocol-border text-protocol-text"
              >
                {END_HOURS.map(h => (
                  <option key={h} value={h}>{formatHour(h)}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-[11px] text-protocol-text-muted/70 mt-2">
            Wrap past midnight by picking an end hour above 24.
          </p>
        </div>
      </div>
    </div>
  );
}
