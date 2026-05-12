/**
 * MantraDrillCard — thousand-rep ladder progress.
 *
 * Shows today's drill state (target / completed / weighted-credit) and
 * lifetime weighted reps. When lifetime crosses the next milestone the
 * milestone outreach card surfaces separately; this card just shows
 * progress toward the next tier.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const MILESTONES = [1000, 10000, 100000];

interface TodayDrill {
  weightedToday: number;
  voiceToday: number;
  typedToday: number;
  targetToday: number;
  lastMantra: string;
}

export function MantraDrillCard() {
  const { user } = useAuth();
  const [lifetime, setLifetime] = useState<number>(0);
  const [lastFired, setLastFired] = useState<number>(0);
  const [today, setToday] = useState<TodayDrill | null>(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const [stateRes, drillsRes] = await Promise.all([
      supabase.from('user_state')
        .select('mantra_lifetime_reps, mantra_milestone_last_fired')
        .eq('user_id', user.id).maybeSingle(),
      supabase.from('mantra_drill_sessions')
        .select('mantra_text, target_rep_count, voice_rep_count, typed_rep_count, weighted_rep_count, started_at')
        .eq('user_id', user.id)
        .gte('started_at', startOfDay.toISOString())
        .order('started_at', { ascending: false }),
    ]);
    const state = stateRes.data as { mantra_lifetime_reps?: number | string | null; mantra_milestone_last_fired?: number | null } | null;
    setLifetime(Number(state?.mantra_lifetime_reps ?? 0));
    setLastFired(state?.mantra_milestone_last_fired ?? 0);
    const drills = (drillsRes.data || []) as Array<{
      mantra_text: string; target_rep_count: number
      voice_rep_count: number; typed_rep_count: number; weighted_rep_count: number | string
      started_at: string
    }>;
    if (drills.length === 0) {
      setToday(null);
    } else {
      const sumVoice = drills.reduce((a, d) => a + d.voice_rep_count, 0);
      const sumTyped = drills.reduce((a, d) => a + d.typed_rep_count, 0);
      const sumWeighted = drills.reduce((a, d) => a + Number(d.weighted_rep_count), 0);
      setToday({
        weightedToday: sumWeighted,
        voiceToday: sumVoice,
        typedToday: sumTyped,
        targetToday: drills[0].target_rep_count,
        lastMantra: drills[0].mantra_text,
      });
    }
    setReady(true);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  if (!ready) return null;

  const nextMilestone = MILESTONES.find(m => lifetime < m) ?? null;
  const pctTowardNext = nextMilestone ? Math.min(100, Math.floor((lifetime / nextMilestone) * 100)) : 100;
  const milestoneLabel = nextMilestone
    ? `${Math.round(lifetime).toLocaleString()} / ${nextMilestone.toLocaleString()}`
    : `${Math.round(lifetime).toLocaleString()} (top tier reached)`;

  return (
    <div style={{ background: '#111116', border: '1px solid #2d1a4d', borderRadius: 10, padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth="1.8">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#ec4899', fontWeight: 700 }}>
          Mantra drill
        </span>
      </div>

      {today ? (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: '#c4b5fd', marginBottom: 4 }}>
            today: {today.voiceToday} voice · {today.typedToday} typed · {Math.round(today.weightedToday)} weighted toward target {today.targetToday}
          </div>
          <div style={{ fontSize: 10.5, color: '#8a8690', fontStyle: 'italic' }}>
            "{today.lastMantra}"
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: '#8a8690', marginBottom: 10 }}>
          no drill submitted today
        </div>
      )}

      <div style={{ marginTop: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8a8690', marginBottom: 4 }}>
          <span>lifetime weighted reps</span>
          <span>{milestoneLabel}</span>
        </div>
        <div style={{ height: 6, background: '#1f1a2e', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${pctTowardNext}%`, height: '100%', background: '#ec4899' }} />
        </div>
        {lastFired > 0 && (
          <div style={{ fontSize: 9.5, color: '#6a656e', marginTop: 5 }}>
            last milestone fired: {lastFired.toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}
