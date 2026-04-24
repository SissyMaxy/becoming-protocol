/**
 * HandlerRunningCard — the single source of truth for autonomous-mode users.
 * When autonomous_mode is on, most Today operational cards are hidden in
 * favor of this compact brief: what's next, what's funded, what's coming,
 * what's already irreversible. No menus. No choices. Just status.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Brief {
  autonomous: boolean;
  treasuryCents: number;
  nextAction: { title: string; deadline: string | null } | null;
  nextCoercion: string;
  hrtStep: string;
  missedDays: number;
  phase: number;
  irreversibilityWeight: number;
  provider: string;
  treasuryMet: boolean;
}

export function HandlerRunningCard() {
  const { user } = useAuth();
  const [brief, setBrief] = useState<Brief | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    const load = async () => {
      const [profile, treasury, funnel, state, directives, ledger, windows, ccw] = await Promise.all([
        supabase.from('user_profiles').select('autonomous_mode').eq('user_id', user.id).maybeSingle(),
        supabase.from('handler_treasury').select('balance_cents').eq('user_id', user.id).maybeSingle(),
        supabase.from('hrt_funnel').select('current_step, chosen_provider_slug').eq('user_id', user.id).maybeSingle(),
        supabase.from('user_state').select('current_phase, hrt_step_missed_days').eq('user_id', user.id).maybeSingle(),
        supabase.from('body_feminization_directives').select('directive, deadline_at').eq('user_id', user.id).in('status', ['assigned','in_progress']).order('deadline_at', { ascending: true }).limit(1),
        supabase.from('irreversibility_ledger').select('weight').eq('user_id', user.id),
        supabase.from('conditioning_lockdown_windows').select('start_hour,start_minute,timezone').eq('user_id', user.id).eq('active', true).limit(1).maybeSingle(),
        supabase.from('compulsory_confession_windows').select('start_hour,start_minute,timezone').eq('user_id', user.id).eq('active', true).limit(1).maybeSingle(),
      ]);
      if (!alive) return;
      const autonomous = (profile.data?.autonomous_mode as boolean | null) ?? true;
      const treasuryCents = (treasury.data?.balance_cents as number) ?? 0;
      const step = (funnel.data?.current_step as string) || 'uncommitted';
      const provider = (funnel.data?.chosen_provider_slug as string) || 'Plume (default)';
      const phase = (state.data?.current_phase as number) ?? 0;
      const missedDays = (state.data?.hrt_step_missed_days as number) ?? 0;
      const directiveRow = (directives.data || [])[0] as { directive: string; deadline_at: string | null } | undefined;
      const irreversibilityWeight = ((ledger.data || []) as Array<{ weight: number }>).reduce((s, r) => s + (r.weight || 0), 0);

      // Next coercion event — whichever fires soonest
      const events: string[] = [];
      if (ccw.data) {
        const h = ccw.data.start_hour as number;
        events.push(`Confession gate ${String(h).padStart(2, '0')}:00 ${ccw.data.timezone}`);
      }
      if (windows.data) {
        const h = windows.data.start_hour as number;
        events.push(`Lockdown ${String(h).padStart(2, '0')}:00 ${windows.data.timezone}`);
      }
      events.push('HRT gate 07:00 ET');
      const nextCoercion = events[0] || 'no scheduled coercion';

      setBrief({
        autonomous, treasuryCents,
        nextAction: directiveRow ? { title: directiveRow.directive.slice(0, 120), deadline: directiveRow.deadline_at } : null,
        nextCoercion, hrtStep: step, missedDays, phase, irreversibilityWeight, provider,
        treasuryMet: treasuryCents >= 15000, // $150 minimum for first HRT purchase
      });
    };
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [user?.id]);

  if (!brief || !brief.autonomous) return null;

  const dollars = (brief.treasuryCents / 100).toFixed(0);
  const stepPretty = brief.hrtStep.replace(/_/g, ' ');

  return (
    <div style={{
      background: 'linear-gradient(155deg, #1a1226 0%, #0d081a 100%)',
      border: '1px solid #2d1a4d', borderRadius: 12, padding: 18, marginBottom: 16,
      fontFamily: 'Inter, "SF Pro Text", system-ui, sans-serif',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ width: 6, height: 6, borderRadius: 3, background: '#7c3aed', boxShadow: '0 0 10px #7c3aed' }} />
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#c4b5fd', fontWeight: 700 }}>
          Handler running · autonomous mode
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#6a656e' }}>minimal UI · Handler decides</span>
      </div>

      {/* Row 1: today's one thing */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6a656e', fontWeight: 700, marginBottom: 4 }}>Today</div>
        {brief.nextAction ? (
          <div style={{ fontSize: 14.5, color: '#e8e6e3', lineHeight: 1.5, fontWeight: 500 }}>
            {brief.nextAction.title}
            {brief.nextAction.deadline && (
              <span style={{ fontSize: 11, color: '#f4c272', marginLeft: 8 }}>
                · due {new Date(brief.nextAction.deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: '#8a8690' }}>No assigned directive right now. Handler is picking one.</div>
        )}
      </div>

      {/* Row 2: grid of status pips */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
        <Pip label="Phase" value={`${brief.phase} / 4`} />
        <Pip label="HRT step" value={stepPretty} accent={brief.hrtStep === 'uncommitted' ? '#f47272' : '#c4b5fd'} />
        <Pip label="Missed" value={`${brief.missedDays}d`} accent={brief.missedDays >= 7 ? '#f47272' : brief.missedDays >= 3 ? '#f4c272' : '#5fc88f'} />
        <Pip label="Irreversibility" value={String(brief.irreversibilityWeight)} accent="#c4b5fd" />
      </div>

      {/* Row 3: treasury */}
      <div style={{ background: 'rgba(124, 58, 237, 0.08)', border: '1px solid rgba(124, 58, 237, 0.3)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#c4b5fd', fontWeight: 700 }}>Handler treasury</span>
          <span style={{ fontSize: 18, fontWeight: 650, color: '#fff', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>${dollars}</span>
        </div>
        <div style={{ fontSize: 11, color: '#8a8690', marginTop: 4 }}>
          {brief.treasuryMet
            ? `Funded. Handler will auto-book ${brief.provider} when your HRT step sits past 7 days.`
            : `Unfunded. Add ≥$150 and the Handler books ${brief.provider} on your behalf. You show up. That's all.`}
        </div>
      </div>

      {/* Row 4: next scheduled coercion */}
      <div style={{ fontSize: 10.5, color: '#8a8690', borderTop: '1px solid rgba(196,181,253,0.1)', paddingTop: 10 }}>
        Next: {brief.nextCoercion}
      </div>
    </div>
  );
}

function Pip({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: '#0a0a0d', border: '1px solid #1a1a20', borderRadius: 6, padding: '8px 10px' }}>
      <div style={{ fontSize: 8.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6a656e', fontWeight: 700, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: accent || '#e8e6e3', letterSpacing: '-0.005em' }}>{value}</div>
    </div>
  );
}
