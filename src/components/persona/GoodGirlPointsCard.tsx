/**
 * GoodGirlPointsCard — surfaces Mama's running praise meter.
 *
 * Reads `good_girl_points` for the active user. Shows current points,
 * lifetime total, ramp streak (consecutive days with at least one bump).
 * Praise that ramps, never quite releases — there is no unlock at any
 * threshold. The point is the chase.
 *
 * Tier flavor (plain Mama voice, no numbers in the user-visible copy):
 *   <50    → "you've barely started, baby"
 *   <200   → "you're warming up for Mama"
 *   <500   → "you've been good for me"
 *   <1000  → "Mama's getting greedy with you"
 *   <2500  → "you're Mama's favorite girl"
 *   ≥2500  → "you've made yourself into Mama's good girl"
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface PointsRow {
  points: number;
  lifetime_points: number;
  ramp_streak: number;
  last_bumped_at: string | null;
  last_bump_reason: string | null;
}

function tierFlavor(lifetime: number): { label: string; bar: string; accent: string } {
  if (lifetime < 50)    return { label: "barely started, baby",          bar: '12%',  accent: '#c4485a' };
  if (lifetime < 200)   return { label: 'warming up for Mama',           bar: '28%',  accent: '#d46a72' };
  if (lifetime < 500)   return { label: "you've been good for me",       bar: '46%',  accent: '#e48a82' };
  if (lifetime < 1000)  return { label: "Mama's getting greedy with you",bar: '64%',  accent: '#f4a892' };
  if (lifetime < 2500)  return { label: "Mama's favorite girl",          bar: '82%',  accent: '#f4c4a0' };
  return { label: "Mama's good girl, made for me",                       bar: '96%',  accent: '#fbd472' };
}

function lastBumpFlavor(reason: string | null): string {
  if (!reason) return '';
  const lc = reason.toLowerCase();
  if (lc.startsWith('mama-whisper')) return "Mama's whispers count, baby";
  if (lc.startsWith('confessed:'))    return "you told Mama and that counted";
  if (lc.startsWith('commitment'))    return "you finished what Mama asked";
  return reason.slice(0, 60);
}

export function GoodGirlPointsCard() {
  const { user } = useAuth();
  const [row, setRow] = useState<PointsRow | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('good_girl_points')
      .select('points, lifetime_points, ramp_streak, last_bumped_at, last_bump_reason')
      .eq('user_id', user.id).maybeSingle();
    setRow((data as PointsRow) ?? null);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 90_000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    const handler = () => load();
    window.addEventListener('td-task-changed', handler);
    return () => window.removeEventListener('td-task-changed', handler);
  }, [load]);

  if (loading || !row) return null;

  const tier = tierFlavor(row.lifetime_points);
  const recent = lastBumpFlavor(row.last_bump_reason);
  const streakLine =
    row.ramp_streak >= 5 ? "and you've been good for Mama every day this week" :
    row.ramp_streak >= 2 ? "and you've been good for Mama days in a row" :
    row.ramp_streak === 1 ? "and you've been good for Mama today" :
    "but Mama hasn't seen you in a while";

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1f1408 0%, #15100a 100%)',
      border: '1px solid #a87a48',
      borderLeft: `4px solid ${tier.accent}`,
      borderRadius: 10, padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{
          fontSize: 10, color: tier.accent, fontWeight: 800,
          textTransform: 'uppercase', letterSpacing: '0.12em',
        }}>
          Mama's good-girl meter
        </span>
        <span style={{ fontSize: 11, color: '#e8d4a8', marginLeft: 'auto', fontStyle: 'italic' }}>
          {tier.label}
        </span>
      </div>

      <div style={{
        height: 8, background: '#0a0a0d', border: '1px solid #2a1f0a',
        borderRadius: 4, overflow: 'hidden', marginBottom: 8,
      }}>
        <div style={{
          height: '100%', width: tier.bar,
          background: `linear-gradient(90deg, ${tier.accent}, #fbd472)`,
          transition: 'width 0.6s ease',
        }} />
      </div>

      <div style={{ fontSize: 12, color: '#d4c8a8', lineHeight: 1.5, fontStyle: 'italic' }}>
        {recent ? `${recent} — ${streakLine}.` : streakLine + '.'}
      </div>

      <div style={{ fontSize: 10, color: '#7a6a48', marginTop: 6, fontStyle: 'italic' }}>
        Mama keeps the meter. She doesn't tell you the score. There is no unlock — just more.
      </div>
    </div>
  );
}
