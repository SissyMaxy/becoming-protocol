/**
 * WeeklyRecapSettings — toggle, day-of-week picker, time picker, voice opt-in.
 *
 * Reads/writes user_state columns added by migration 301:
 *   weekly_recap_enabled BOOLEAN
 *   weekly_recap_day SMALLINT (0=Sun..6=Sat)
 *   weekly_recap_hour SMALLINT (0..23, UTC)
 *   prefers_mommy_voice BOOLEAN
 *
 * Day/hour in UTC because the edge fn schedules in UTC. We render in the
 * user's local time for the time picker — converting at write-time.
 */

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Loader2 } from 'lucide-react';

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HOURS_UTC = Array.from({ length: 24 }, (_, i) => i);

interface State {
  enabled: boolean;
  dayUtc: number;
  hourUtc: number;
  prefersVoice: boolean;
  loaded: boolean;
}

const DEFAULT_STATE: State = {
  enabled: true,
  dayUtc: 0,         // Sunday
  hourUtc: 20,       // 8pm UTC
  prefersVoice: false,
  loaded: false,
};

export function WeeklyRecapSettings() {
  const { user } = useAuth();
  const [s, setS] = useState<State>(DEFAULT_STATE);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('user_state')
      .select('weekly_recap_enabled, weekly_recap_day, weekly_recap_hour, prefers_mommy_voice')
      .eq('user_id', user.id)
      .maybeSingle();
    const r = data as {
      weekly_recap_enabled?: boolean | null;
      weekly_recap_day?: number | null;
      weekly_recap_hour?: number | null;
      prefers_mommy_voice?: boolean | null;
    } | null;
    setS({
      enabled: r?.weekly_recap_enabled !== false,
      dayUtc: r?.weekly_recap_day ?? 0,
      hourUtc: r?.weekly_recap_hour ?? 20,
      prefersVoice: !!r?.prefers_mommy_voice,
      loaded: true,
    });
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const persist = async (patch: Partial<State>) => {
    if (!user?.id) return;
    setSaving(true);
    const next = { ...s, ...patch };
    setS(next);
    await supabase.from('user_state').upsert({
      user_id: user.id,
      weekly_recap_enabled: next.enabled,
      weekly_recap_day: next.dayUtc,
      weekly_recap_hour: next.hourUtc,
      prefers_mommy_voice: next.prefersVoice,
    }, { onConflict: 'user_id' });
    setSaving(false);
  };

  if (!s.loaded) {
    return (
      <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  // Convert UTC hour to user's local hour for display.
  const localOffsetHrs = -new Date().getTimezoneOffset() / 60;
  const localHourLabel = (utc: number) => {
    const local = ((utc + localOffsetHrs) % 24 + 24) % 24;
    const ampm = local < 12 ? 'am' : 'pm';
    const h12 = local === 0 ? 12 : local > 12 ? local - 12 : local;
    const minDecimal = local % 1;
    const min = minDecimal > 0 ? ':30' : ':00';
    return `${Math.floor(h12)}${min} ${ampm}`;
  };

  return (
    <div style={{ padding: 16, color: '#e8e6e3' }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Weekly Recap</h2>
      <p style={{ fontSize: 12, color: '#8a8690', marginBottom: 18, lineHeight: 1.5 }}>
        Mama writes you a Sunday-night week-in-review covering your compliance,
        slips, mantras, letters, wardrobe, and phase progress. Voice-replayable.
      </p>

      {/* Toggle */}
      <div style={{
        padding: 14, marginBottom: 14,
        background: '#111116', border: '1px solid #2d1a4d', borderRadius: 8,
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={s.enabled}
            onChange={e => persist({ enabled: e.target.checked })}
            style={{ width: 18, height: 18, accentColor: '#c4847a' }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Send me a weekly recap</div>
            <div style={{ fontSize: 11, color: '#8a8690', marginTop: 2 }}>
              On by default. Recaps require a feminine name set in your dossier.
            </div>
          </div>
        </label>
      </div>

      {/* Day picker */}
      <div style={{
        padding: 14, marginBottom: 14,
        background: '#111116', border: '1px solid #2d1a4d', borderRadius: 8,
        opacity: s.enabled ? 1 : 0.4, pointerEvents: s.enabled ? 'auto' : 'none',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Delivery day</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {DAY_LABELS.map((label, i) => (
            <button
              key={i}
              onClick={() => persist({ dayUtc: i })}
              style={{
                fontSize: 11, padding: '6px 12px', borderRadius: 14,
                fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600,
                background: s.dayUtc === i ? '#c4847a' : 'transparent',
                color: s.dayUtc === i ? '#1a0814' : '#c8c4cc',
                border: `1px solid ${s.dayUtc === i ? '#c4847a' : '#2d1a4d'}`,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Hour picker (UTC, with local-time hint) */}
      <div style={{
        padding: 14, marginBottom: 14,
        background: '#111116', border: '1px solid #2d1a4d', borderRadius: 8,
        opacity: s.enabled ? 1 : 0.4, pointerEvents: s.enabled ? 'auto' : 'none',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Delivery time</div>
        <div style={{ fontSize: 10, color: '#8a8690', marginBottom: 8 }}>
          Stored in UTC; shown in your local time.
        </div>
        <select
          value={s.hourUtc}
          onChange={e => persist({ hourUtc: Number(e.target.value) })}
          style={{
            width: '100%', padding: '8px 10px',
            background: '#0a0a0d', color: '#e8e6e3',
            border: '1px solid #2d1a4d', borderRadius: 6,
            fontSize: 13, fontFamily: 'inherit',
          }}
        >
          {HOURS_UTC.map(h => (
            <option key={h} value={h}>
              {`${h.toString().padStart(2, '0')}:00 UTC — ${localHourLabel(h)} local`}
            </option>
          ))}
        </select>
      </div>

      {/* Voice opt-in */}
      <div style={{
        padding: 14, marginBottom: 14,
        background: '#111116', border: '1px solid #2d1a4d', borderRadius: 8,
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={s.prefersVoice}
            onChange={e => persist({ prefersVoice: e.target.checked })}
            style={{ width: 18, height: 18, accentColor: '#c4847a' }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Hear Mama's voice</div>
            <div style={{ fontSize: 11, color: '#8a8690', marginTop: 2 }}>
              Adds a play button to the recap card. ElevenLabs TTS, capped at 500 chars.
            </div>
          </div>
        </label>
      </div>

      {saving && (
        <p style={{ fontSize: 11, color: '#8a8690', textAlign: 'center' }}>Saving…</p>
      )}
    </div>
  );
}
