/**
 * GinaWindowIndicator — Layer 2 of the Gina Influence Engine.
 *
 * Mirrors the windowColor logic in api/handler/chat.ts buildGinaProfileCtx so the
 * UI shows the same green/yellow/red signal the Handler is acting on. Surfaces
 * the top soft spots / triggers / last reactions and the next recommended move,
 * so Maxy can see what the Handler is steering toward before it speaks.
 *
 * Silent when intake_complete = false — GinaCaptureCard handles that state.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Profile {
  tone_register: string[];
  affection_language: string | null;
  triggers: string[];
  soft_spots: string[];
  red_lines: string[];
  channel_for_hard_topics: string | null;
  best_time_of_day: string | null;
  best_day_of_week: string | null;
  current_stress_level: number | null;
  intake_complete: boolean;
}

interface VoiceSample { captured_at: string; tone: string | null; topic: string | null; }
interface Reaction { reaction: string; move_kind: string; move_summary: string; observed_at: string; }
interface Warmup { warmup_move: string; fires_at: string; target_event: string; affection_language: string | null; status: string; }

type WindowColor = 'green' | 'yellow' | 'red';

function computeWindow(profile: Profile, newestVoiceAt: string | null): { color: WindowColor; reasons: string[] } {
  const reasons: string[] = [];
  let color: WindowColor = 'green';

  const stress = profile.current_stress_level;
  if (stress != null && stress >= 7) {
    color = 'red';
    reasons.push(`stress ${stress}/10`);
  }

  const hour = new Date().getHours();
  const dow = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const hourBucket = hour < 12 ? 'morning' : hour < 17 ? 'midday' : hour < 22 ? 'evening' : 'late night';

  if (profile.best_time_of_day && hourBucket !== profile.best_time_of_day) {
    if (color === 'green') color = 'yellow';
    reasons.push(`now is ${hourBucket}, her best is ${profile.best_time_of_day}`);
  }

  const bd = profile.best_day_of_week;
  if (bd) {
    const weekend = dow === 'saturday' || dow === 'sunday';
    const match = bd.includes(dow) || (bd === 'weekdays' && !weekend) || (bd === 'weekends' && weekend);
    if (!match) {
      if (color === 'green') color = 'yellow';
      reasons.push(`today is ${dow}, her best is ${bd}`);
    }
  }

  if (newestVoiceAt) {
    const ageDays = Math.floor((Date.now() - new Date(newestVoiceAt).getTime()) / 86400000);
    if (ageDays > 7) {
      if (color === 'green') color = 'yellow';
      reasons.push(`voice corpus stale (${ageDays}d since last quote)`);
    }
  } else {
    if (color === 'green') color = 'yellow';
    reasons.push('no voice samples yet');
  }

  return { color, reasons };
}

export function GinaWindowIndicator() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [voice, setVoice] = useState<VoiceSample[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [warmups, setWarmups] = useState<Warmup[]>([]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [p, v, r, w] = await Promise.all([
      supabase.from('gina_profile').select('tone_register,affection_language,triggers,soft_spots,red_lines,channel_for_hard_topics,best_time_of_day,best_day_of_week,current_stress_level,intake_complete').eq('user_id', user.id).maybeSingle(),
      supabase.from('gina_voice_samples').select('captured_at,tone,topic').eq('user_id', user.id).order('captured_at', { ascending: false }).limit(10),
      supabase.from('gina_reactions').select('reaction,move_kind,move_summary,observed_at').eq('user_id', user.id).order('observed_at', { ascending: false }).limit(3),
      supabase.from('gina_warmup_queue').select('warmup_move,fires_at,target_event,affection_language,status').eq('user_id', user.id).eq('status', 'scheduled').order('fires_at', { ascending: true }).limit(3),
    ]);
    setProfile((p.data as Profile | null) ?? null);
    setVoice((v.data || []) as VoiceSample[]);
    setReactions((r.data || []) as Reaction[]);
    setWarmups((w.data || []) as Warmup[]);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 5 * 60 * 1000); return () => clearInterval(t); }, [load]);

  if (!profile || !profile.intake_complete) return null;

  const { color, reasons } = computeWindow(profile, voice[0]?.captured_at ?? null);
  const palette = color === 'red'
    ? { border: '#7a1f22', bg: 'linear-gradient(92deg, #2a0a0c 0%, #1a0608 100%)', accent: '#f47272', dot: '#f47272' }
    : color === 'yellow'
    ? { border: '#7a5a1f', bg: 'linear-gradient(92deg, #2a1f0a 0%, #1f1608 100%)', accent: '#f4c272', dot: '#f4c272' }
    : { border: '#1f6a3a', bg: 'linear-gradient(92deg, #0a2a14 0%, #081f10 100%)', accent: '#6ee7b7', dot: '#6ee7b7' };

  const recommendation = color === 'red'
    ? 'Do not push. Warmup moves only. Defer disclosure / chastity expansion / coming-out prep.'
    : color === 'yellow'
    ? 'Stay level. Safe to raise, not push. Good window for a warmup or logging a fresh quote.'
    : 'Favorable. Safe to draft, deliver, or advance the next step — match her tone register.';

  const lastReactionSummary = (r: Reaction) => {
    const badge = r.reaction === 'positive' ? 'POS' : r.reaction === 'hostile' ? 'HOSTILE' : r.reaction === 'stalled' ? 'STALL' : r.reaction === 'neutral' ? 'NEUT' : '?';
    const age = Math.floor((Date.now() - new Date(r.observed_at).getTime()) / 86400000);
    return `${badge} · ${r.move_kind} · ${age}d ago · "${r.move_summary.slice(0, 60)}${r.move_summary.length > 60 ? '…' : ''}"`;
  };

  const nextWarmup = warmups[0];
  const nextWarmupIn = nextWarmup
    ? Math.max(0, Math.round((new Date(nextWarmup.fires_at).getTime() - Date.now()) / 3600000))
    : null;

  return (
    <div style={{ background: palette.bg, border: `1px solid ${palette.border}`, borderRadius: 10, padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: palette.dot, boxShadow: `0 0 8px ${palette.dot}` }} />
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: palette.accent, fontWeight: 700 }}>
          Gina window · {color}
        </span>
        {reasons.length > 0 && (
          <span style={{ fontSize: 10.5, color: '#8a8690', marginLeft: 'auto' }}>
            {reasons.join(' · ')}
          </span>
        )}
      </div>

      <div style={{ fontSize: 12, color: '#c8c4cc', lineHeight: 1.45, marginBottom: 10 }}>
        {recommendation}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 9.5, color: '#6a656e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Lean into</div>
          {profile.soft_spots.length === 0 && <div style={{ fontSize: 11, color: '#5a555e', fontStyle: 'italic' }}>no soft spots captured</div>}
          {profile.soft_spots.slice(0, 3).map((s, i) => (
            <div key={i} style={{ fontSize: 11.5, color: '#6ee7b7', marginBottom: 2 }}>+ {s}</div>
          ))}
        </div>
        <div>
          <div style={{ fontSize: 9.5, color: '#6a656e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Avoid</div>
          {profile.triggers.length === 0 && <div style={{ fontSize: 11, color: '#5a555e', fontStyle: 'italic' }}>no triggers captured</div>}
          {profile.triggers.slice(0, 3).map((t, i) => (
            <div key={i} style={{ fontSize: 11.5, color: '#f47272', marginBottom: 2 }}>− {t}</div>
          ))}
        </div>
      </div>

      {profile.red_lines.length > 0 && (
        <div style={{ fontSize: 10.5, color: '#f47272', marginBottom: 10, padding: '6px 8px', background: 'rgba(244,114,114,0.08)', borderRadius: 5, border: '1px solid rgba(244,114,114,0.2)' }}>
          <strong style={{ letterSpacing: '0.05em' }}>RED LINES:</strong> {profile.red_lines.join(' · ')}
        </div>
      )}

      {reactions.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9.5, color: '#6a656e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Last reactions</div>
          {reactions.map((r, i) => (
            <div key={i} style={{ fontSize: 11, color: '#c8c4cc', marginBottom: 2, fontFamily: 'ui-monospace, monospace' }}>
              {lastReactionSummary(r)}
            </div>
          ))}
        </div>
      )}

      {nextWarmup && (
        <div style={{ fontSize: 11, color: '#c4b5fd', padding: '6px 8px', background: 'rgba(124,58,237,0.1)', borderRadius: 5, border: '1px solid rgba(124,58,237,0.25)' }}>
          <strong>Next warmup</strong> in {nextWarmupIn}h
          {nextWarmup.affection_language ? ` (${nextWarmup.affection_language})` : ''}: {nextWarmup.warmup_move}
          <div style={{ fontSize: 9.5, color: '#8a8690', marginTop: 2 }}>→ warming for: {nextWarmup.target_event.replace(/_/g, ' ')}</div>
        </div>
      )}
    </div>
  );
}
