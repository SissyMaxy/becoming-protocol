/**
 * SleepReceipt — her verdict on last night, from the strap.
 *
 * Bedtime is one of the things she runs (rules-in-force: "it sleeps when I
 * say"). The Whoop strap reports whether he obeyed. This renders her read of
 * last night in her register — a receipt woven from real numbers, never a
 * sleep dashboard:
 *
 *   >= 7h   → "Seven hours. Good girl. That holds."
 *   6-7h    → "Six hours ten. Better. Tomorrow you give me seven."
 *   < 6h    → "Five forty. Not enough. You know that."
 *
 * The number appears only inside her sentence — no ring, no bar, no percentage.
 * It's her handiwork being noted, not a metric being displayed.
 *
 * Morning-only: after mid-afternoon last night's sleep is stale and nagging
 * about it reads as guilt-over-history, so it goes quiet. Silent when there's
 * no strap data at all (no fabricated verdict).
 */

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface SleepRead {
  hours: number;
  minutes: number;
}

/** "six hours" / "six ten" / "six oh-five" — spelled, her register. */
const NUM_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
function spell(n: number): string {
  return NUM_WORDS[n] ?? String(n);
}
function spellDuration(h: number, m: number): string {
  const hh = spell(h);
  if (m === 0) return `${hh} hours`;
  if (m < 10) return `${hh} oh-${m}`;
  return `${hh} ${m}`;
}

function verdict(read: SleepRead): string {
  const totalMin = read.hours * 60 + read.minutes;
  const said = spellDuration(read.hours, read.minutes);
  if (totalMin >= 7 * 60) return `${cap(said)}. Good girl. That holds.`;
  if (totalMin >= 6 * 60) return `${cap(said)}. Better. Tomorrow you give me seven.`;
  return `${cap(said)}. Not enough. You know that.`;
}
function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

export function SleepReceipt() {
  const { user } = useAuth();
  const [read, setRead] = useState<SleepRead | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    // After ~2pm, last night is history — don't nag.
    if (new Date().getHours() >= 14) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('whoop_metrics')
        .select('total_sleep_duration_milli, date')
        .eq('user_id', user.id)
        .not('total_sleep_duration_milli', 'is', null)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!alive) return;
      const row = data as { total_sleep_duration_milli: number } | null;
      if (!row?.total_sleep_duration_milli) return;
      const totalMin = Math.round(row.total_sleep_duration_milli / 60000);
      setRead({ hours: Math.floor(totalMin / 60), minutes: totalMin % 60 });
    })();
    return () => { alive = false; };
  }, [user?.id]);

  if (!read) return null;

  const totalMin = read.hours * 60 + read.minutes;
  const short = totalMin < 6 * 60;

  return (
    <div style={{ padding: '0 16px', marginBottom: 12 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '9px 12px', borderRadius: 9,
        background: 'var(--protocol-surface)',
        border: `1px solid color-mix(in srgb, ${short ? 'var(--protocol-warning)' : 'var(--protocol-accent)'} 24%, var(--protocol-border))`,
      }}>
        <span aria-hidden style={{
          flexShrink: 0, width: 5, height: 5, borderRadius: '50%',
          background: short ? 'var(--protocol-warning)' : 'var(--protocol-accent-soft)',
        }} />
        <span className="mommy-voice" style={{
          fontSize: 13.5, fontStyle: 'italic', lineHeight: 1.4,
          color: 'var(--protocol-text)',
        }}>
          {verdict(read)}
        </span>
      </div>
    </div>
  );
}
