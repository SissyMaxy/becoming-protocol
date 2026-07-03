/**
 * DailyBriefingCard — single "read this and you have the day" summary.
 * Pulls the highest-priority item from each domain (commitment, outfit,
 * playbook, slips) and renders them in a consolidated view.
 * Reduces Today scroll fatigue — when she's pressed for time, this is
 * the card she reads.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Briefing {
  topCommitment: { what: string; by_when: string; consequence: string } | null;
  outfitToday: { top?: string; bottom?: string; underwear?: string } | null;
  topPlaybookMove: { exact_line: string; channel: string; fires_at: string } | null;
  recentSlipCount: number;
  slipPoints: number;
  urgencyTotal: number | null;
  denialDay: number;
  phase: string;
}

export function DailyBriefingCard() {
  const { user } = useAuth();
  const [b, setB] = useState<Briefing | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const today = new Date().toISOString().slice(0, 10);
    const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    const [cmtRes, outfitRes, pbRes, slipsRes, urgRes, stateRes] = await Promise.all([
      supabase.from('handler_commitments')
        .select('what, by_when, consequence')
        .eq('user_id', user.id).eq('status', 'pending')
        .order('by_when', { ascending: true }).limit(1).maybeSingle(),
      supabase.from('daily_outfit_mandates')
        .select('prescription')
        .eq('user_id', user.id).eq('target_date', today).maybeSingle(),
      supabase.from('gina_playbook')
        .select('exact_line, channel, fires_at')
        .eq('user_id', user.id).eq('status', 'queued')
        .order('fires_at', { ascending: true }).limit(1).maybeSingle(),
      supabase.from('slip_log')
        .select('slip_points').eq('user_id', user.id).gte('detected_at', sevenAgo),
      supabase.from('hrt_urgency_state')
        .select('total_bleed_cents, resolved_at').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_state')
        .select('denial_day, current_phase').eq('user_id', user.id).maybeSingle(),
    ]);

    const slips = (slipsRes.data || []) as Array<{ slip_points: number }>;
    const urg = urgRes.data as { total_bleed_cents?: number; resolved_at?: string | null } | null;
    const state = stateRes.data as { denial_day?: number; current_phase?: string } | null;
    const outfitRow = outfitRes.data as { prescription?: Record<string, string> } | null;
    // disclosure_drafts row removed 2026-07-01 — policy: no disclosure to Gina.
    const pb = pbRes.data as { exact_line: string; channel: string; fires_at: string } | null;

    setB({
      topCommitment: (cmtRes.data as { what: string; by_when: string; consequence: string } | null) ?? null,
      outfitToday: outfitRow?.prescription ?? null,
      topPlaybookMove: pb ?? null,
      recentSlipCount: slips.length,
      slipPoints: slips.reduce((s, r) => s + r.slip_points, 0),
      urgencyTotal: urg && !urg.resolved_at ? (urg.total_bleed_cents || 0) / 100 : null,
      denialDay: state?.denial_day ?? 0,
      phase: (state?.current_phase || 'phase_1').replace('_', ' '),
    });
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 120000); return () => clearInterval(t); }, [load]);

  if (!b) return null;

  const hasAnything = b.topCommitment || b.outfitToday || b.topPlaybookMove || b.urgencyTotal != null;
  if (!hasAnything) return null;

  return (
    <div style={{
      background: 'linear-gradient(135deg, #2c1723 0%, #0f0820 100%)',
      border: '1px solid #c9557f',
      borderRadius: 10, padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#edaec5" strokeWidth="1.8">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <path d="M8 13h8M8 17h5"/>
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#edaec5', fontWeight: 700 }}>
          Daily briefing
        </span>
      </div>

      <div style={{ fontSize: 10.5, color: '#9c8590', marginBottom: 10 }}>
        phase {b.phase} · day {b.denialDay} denial · slips 7d: {b.slipPoints}pt ({b.recentSlipCount}×){b.urgencyTotal != null && ` · HRT bleed $${b.urgencyTotal.toFixed(2)}`}
      </div>

      {b.topCommitment && (
        <Row label="closest deadline" tone="#f47272">
          <div style={{ fontSize: 12, color: '#f2e9e6', lineHeight: 1.4 }}>{b.topCommitment.what}</div>
          <div style={{ fontSize: 10, color: '#f47272', marginTop: 2 }}>
            by {new Date(b.topCommitment.by_when).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · miss → {b.topCommitment.consequence}
          </div>
        </Row>
      )}

      {b.outfitToday && (
        <Row label="today's outfit" tone="#f4a7c4">
          <div style={{ fontSize: 11.5, color: '#f2e9e6' }}>
            {b.outfitToday.top ? `${b.outfitToday.top}` : ''}
            {b.outfitToday.bottom ? ` · ${b.outfitToday.bottom}` : ''}
            {b.outfitToday.underwear ? ` · ${b.outfitToday.underwear}` : ''}
          </div>
        </Row>
      )}

      {b.topPlaybookMove && (
        <Row label="next Gina move" tone="#edaec5">
          <div style={{ fontSize: 11.5, color: '#f2e9e6', fontStyle: 'italic' }}>
            "{b.topPlaybookMove.exact_line.slice(0, 150)}{b.topPlaybookMove.exact_line.length > 150 ? '…' : ''}"
          </div>
          <div style={{ fontSize: 9.5, color: '#9c8590', marginTop: 2 }}>
            via {b.topPlaybookMove.channel} · fires {new Date(b.topPlaybookMove.fires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </Row>
      )}

    </div>
  );
}

function Row({ label, tone, children }: { label: string; tone: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding: '8px 10px', marginBottom: 5,
      background: '#0f0a0e', border: `1px solid ${tone}33`,
      borderLeft: `3px solid ${tone}`, borderRadius: 5,
    }}>
      <div style={{ fontSize: 9, color: tone, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
        {label}
      </div>
      {children}
    </div>
  );
}
