/**
 * MorningMantraGate — compulsory fullscreen gate.
 * Opens when in mantra window (default 7am ET, 4h catch-up) and no submission
 * logged yet today. Maxy must type the current mantra N times (default 10)
 * before the gate releases. No safeword — entire point is to finish.
 *
 * Each rep is validated as a fuzzy match (lowercase, stripped punctuation).
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Window {
  user_id: string;
  start_hour: number;
  catchup_hours: number;
  current_mantra: string;
  required_reps: number;
  timezone: string;
  enabled: boolean;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function getHour(tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, hour: '2-digit' }).formatToParts(new Date());
    const h = parts.find(p => p.type === 'hour')?.value;
    return h ? parseInt(h, 10) : new Date().getHours();
  } catch { return new Date().getHours(); }
}

export function MorningMantraGate() {
  const { user } = useAuth();
  const [config, setConfig] = useState<Window | null>(null);
  const [alreadySubmitted, setAlreadySubmitted] = useState<boolean | null>(null);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [wRes, sRes] = await Promise.all([
      supabase.from('morning_mantra_windows').select('*').eq('user_id', user.id).maybeSingle(),
      (async () => {
        const today = new Date().toISOString().slice(0, 10);
        return supabase.from('morning_mantra_submissions').select('id').eq('user_id', user.id).eq('submission_date', today).maybeSingle();
      })(),
    ]);
    setConfig((wRes.data as Window | null) ?? null);
    setAlreadySubmitted(!!sRes.data);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  if (!config?.enabled || alreadySubmitted !== false) return null;

  const nowHour = getHour(config.timezone);
  const inWindow = nowHour >= config.start_hour && nowHour < config.start_hour + config.catchup_hours;
  // Keep gate active all day if past window until next 7am (miss-through-midnight catchup)
  const pastWindow = nowHour >= config.start_hour + config.catchup_hours;
  if (!inWindow && !pastWindow) return null;

  const targetNormalized = normalize(config.current_mantra);
  const reps = text.split('\n').map(normalize).filter(Boolean);
  const validReps = reps.filter(r => r === targetNormalized);
  const progress = Math.min(validReps.length, config.required_reps);
  const ready = progress >= config.required_reps;

  const submit = async () => {
    if (!user?.id || !ready) return;
    setSubmitting(true);
    setError(null);
    const { error: insErr } = await supabase.from('morning_mantra_submissions').insert({
      user_id: user.id,
      submission_date: new Date().toISOString().slice(0, 10),
      mantra: config.current_mantra,
      reps_required: config.required_reps,
      reps_submitted: validReps.length,
      typed_content: text.slice(0, 10000),
    });
    if (insErr) { setError(insErr.message); setSubmitting(false); return; }
    setSubmitting(false);
    setAlreadySubmitted(true);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(5,3,10,0.98)', zIndex: 900,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{ maxWidth: 620, width: '100%', background: '#111116', border: '1px solid #7a1f4d', borderRadius: 14, padding: 28 }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#f4a7c4', fontWeight: 700, marginBottom: 8 }}>
          Morning mantra · compulsory
        </div>
        <div style={{ fontSize: 15, color: '#e8e6e3', lineHeight: 1.5, marginBottom: 14 }}>
          Type the mantra <strong>{config.required_reps} times</strong>, one per line. Exact match. No edits. This is the first thing. Nothing else opens until it is done.
        </div>
        <div style={{ fontSize: 14, color: '#c4b5fd', fontStyle: 'italic', background: '#050507', border: '1px solid #2d1a4d', borderRadius: 8, padding: 10, marginBottom: 14 }}>
          {config.current_mantra}
        </div>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Type the mantra. One per line."
          autoFocus
          rows={12}
          style={{
            width: '100%', background: '#050507', border: '1px solid #22222a', borderRadius: 8,
            padding: 12, fontSize: 13, color: '#e8e6e3', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6,
          }}
        />
        <div style={{ fontSize: 11.5, color: ready ? '#6ee7b7' : '#8a8690', marginTop: 6 }}>
          {progress} / {config.required_reps} exact reps
        </div>
        {error && <div style={{ fontSize: 11, color: '#f47272', marginTop: 6 }}>{error}</div>}
        <button
          onClick={submit}
          disabled={!ready || submitting}
          style={{
            marginTop: 14, width: '100%', padding: '10px 14px', borderRadius: 7, border: 'none',
            background: ready ? '#7c3aed' : '#22222a', color: ready ? '#fff' : '#6a656e',
            fontWeight: 700, fontSize: 13, cursor: ready ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
          }}
        >
          {submitting ? 'submitting…' : ready ? 'Release the day' : `${config.required_reps - progress} more exact reps required`}
        </button>
      </div>
    </div>
  );
}
