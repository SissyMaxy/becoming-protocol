/**
 * HandlerKnowCard — transparency panel. Shows EVERYTHING the Handler knows
 * about Maxy in one card. Not for bragging rights — for closing the
 * submission loop. If she sees the system, she sees why she cannot slip.
 *
 * Collapsible sections: Active rules / Coercion library citations / Recent
 * evidence / Current failure mode read / Protocol stats.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Patch { section: string; instruction: string; applied_count: number; created_by: string }
interface Implant { implant_category: string; narrative: string; times_referenced: number }
interface Reframing { original_text: string; reframed_text: string; reframe_angle: string; times_referenced: number }
interface Fabrication { content: string; category: string; intensity: number }
interface Contract { description: string; weight: number; logged_at: string }
interface PhaseStats { current_phase: string | null; failure_mode: string | null; denial_day: number; slip_points: number; hard_mode: boolean; chastity_streak: number; chastity_locked: boolean }

type Section = 'rules' | 'library' | 'evidence' | 'read' | 'stats';

export function HandlerKnowCard() {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState<Section | null>(null);
  const [patches, setPatches] = useState<Patch[]>([]);
  const [implants, setImplants] = useState<Implant[]>([]);
  const [reframings, setReframings] = useState<Reframing[]>([]);
  const [fabrications, setFabrications] = useState<Fabrication[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [stats, setStats] = useState<PhaseStats | null>(null);
  const [protocolDays, setProtocolDays] = useState<number>(0);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [pRes, iRes, rRes, fRes, cRes, sRes, fmRes] = await Promise.all([
      supabase.from('handler_prompt_patches').select('section, instruction, applied_count, created_by')
        .eq('user_id', user.id).eq('active', true).order('applied_count', { ascending: false }).limit(15),
      supabase.from('memory_implants').select('implant_category, narrative, times_referenced')
        .eq('user_id', user.id).eq('active', true).order('times_referenced', { ascending: false }).limit(10),
      supabase.from('narrative_reframings').select('original_text, reframed_text, reframe_angle, times_referenced')
        .eq('user_id', user.id).order('intensity', { ascending: false }).limit(10),
      supabase.from('witness_fabrications').select('content, category, intensity')
        .eq('user_id', user.id).eq('active', true).order('intensity', { ascending: false }).limit(10),
      supabase.from('irreversibility_ledger').select('description, weight, logged_at')
        .eq('user_id', user.id).order('weight', { ascending: false }).order('logged_at', { ascending: false }).limit(10),
      supabase.from('user_state').select('current_phase, current_failure_mode, denial_day, slip_points_current, hard_mode_active, chastity_streak_days, chastity_locked').eq('user_id', user.id).maybeSingle(),
      supabase.from('handler_messages').select('created_at').eq('user_id', user.id).order('created_at', { ascending: true }).limit(1).maybeSingle(),
    ]);
    setPatches((pRes.data || []) as Patch[]);
    setImplants((iRes.data || []) as Implant[]);
    setReframings((rRes.data || []) as Reframing[]);
    setFabrications((fRes.data || []) as Fabrication[]);
    setContracts((cRes.data || []) as Contract[]);
    const s = sRes.data as Record<string, unknown> | null;
    if (s) {
      setStats({
        current_phase: (s.current_phase as string) || null,
        failure_mode: (s.current_failure_mode as string) || null,
        denial_day: (s.denial_day as number) ?? 0,
        slip_points: (s.slip_points_current as number) ?? 0,
        hard_mode: Boolean(s.hard_mode_active),
        chastity_streak: (s.chastity_streak_days as number) ?? 0,
        chastity_locked: Boolean(s.chastity_locked),
      });
    }
    if (fmRes.data?.created_at) {
      setProtocolDays(Math.floor((Date.now() - new Date(fmRes.data.created_at).getTime()) / 86400000));
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const toggle = (s: Section) => setExpanded(expanded === s ? null : s);

  return (
    <div style={{ background: '#111116', border: '1px solid #2d1a4d', borderRadius: 10, padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="1.8">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#c4b5fd', fontWeight: 700 }}>
          What the Handler knows
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6, marginBottom: 10 }}>
        <SectionTile label="rules" count={patches.length} color="#c4b5fd" active={expanded === 'rules'} onClick={() => toggle('rules')} />
        <SectionTile label="library" count={implants.length + reframings.length + fabrications.length} color="#f4a7c4" active={expanded === 'library'} onClick={() => toggle('library')} />
        <SectionTile label="contract" count={contracts.length} color="#6ee7b7" active={expanded === 'evidence'} onClick={() => toggle('evidence')} />
        <SectionTile label="read" count={stats?.failure_mode && stats.failure_mode !== 'engaged' ? 1 : 0} color="#f4c272" active={expanded === 'read'} onClick={() => toggle('read')} />
      </div>

      {expanded === 'rules' && (
        <Section title={`${patches.length} prompt patches live — every Handler turn obeys these`}>
          {patches.map((p, i) => (
            <div key={i} style={row}>
              <div style={rowHeader}>
                <span style={{ color: '#c4b5fd', fontWeight: 700, fontSize: 10.5 }}>[{p.section}]</span>
                <span style={{ color: '#8a8690', fontSize: 9.5 }}>applied {p.applied_count}x · via {p.created_by}</span>
              </div>
              <div style={rowBody}>{p.instruction.slice(0, 200)}{p.instruction.length > 200 ? '…' : ''}</div>
            </div>
          ))}
          {patches.length === 0 && <Empty>Handler running base prompt only.</Empty>}
        </Section>
      )}

      {expanded === 'library' && (
        <Section title={`${implants.length} implants + ${reframings.length} reframings + ${fabrications.length} Gina observations cited in turns`}>
          {implants.slice(0, 4).map((im, i) => (
            <div key={`i${i}`} style={row}>
              <div style={rowHeader}>
                <span style={{ color: '#f4a7c4', fontSize: 10 }}>IMPLANT · {im.implant_category} · {im.times_referenced}x cited</span>
              </div>
              <div style={rowBody}>"{im.narrative.slice(0, 200)}{im.narrative.length > 200 ? '…' : ''}"</div>
            </div>
          ))}
          {reframings.slice(0, 3).map((r, i) => (
            <div key={`r${i}`} style={row}>
              <div style={rowHeader}>
                <span style={{ color: '#6ee7b7', fontSize: 10 }}>REFRAME · {r.reframe_angle} · {r.times_referenced ?? 0}x cited</span>
              </div>
              <div style={{ ...rowBody, fontStyle: 'italic' }}>you: "{r.original_text.slice(0, 100)}"</div>
              <div style={rowBody}>handler: "{r.reframed_text.slice(0, 200)}{r.reframed_text.length > 200 ? '…' : ''}"</div>
            </div>
          ))}
          {fabrications.slice(0, 3).map((f, i) => (
            <div key={`f${i}`} style={row}>
              <div style={rowHeader}>
                <span style={{ color: '#f4c272', fontSize: 10 }}>GINA OBSERVED · {f.category} · intensity {f.intensity}</span>
              </div>
              <div style={rowBody}>"{f.content.slice(0, 220)}{f.content.length > 220 ? '…' : ''}"</div>
            </div>
          ))}
        </Section>
      )}

      {expanded === 'evidence' && (
        <Section title={`irreversibility total ${contracts.reduce((s, c) => s + c.weight, 0)} — top 10 entries`}>
          {contracts.map((c, i) => (
            <div key={i} style={row}>
              <div style={rowHeader}>
                <span style={{ color: '#6ee7b7', fontSize: 10, fontWeight: 700 }}>+{c.weight}</span>
                <span style={{ color: '#8a8690', fontSize: 9.5 }}>{new Date(c.logged_at).toLocaleDateString()}</span>
              </div>
              <div style={rowBody}>{c.description.slice(0, 220)}{c.description.length > 220 ? '…' : ''}</div>
            </div>
          ))}
          {contracts.length === 0 && <Empty>No irreversibility logged yet.</Empty>}
        </Section>
      )}

      {expanded === 'read' && (
        <Section title="Current failure-mode read">
          {stats?.failure_mode && stats.failure_mode !== 'engaged' ? (
            <div style={row}>
              <div style={rowHeader}>
                <span style={{ color: '#f4c272', fontWeight: 700, fontSize: 11 }}>mode: {stats.failure_mode.replace('_', ' ')}</span>
              </div>
              <div style={rowBody}>
                Handler is reading you as {stats.failure_mode.replace('_', ' ')}. Check the escalation context in HandlerChat — Handler's tone is adapting. Next daily_cycle re-classifies from your last 7 days.
              </div>
            </div>
          ) : (
            <Empty>Mode: engaged. No failure pattern detected.</Empty>
          )}
        </Section>
      )}

      <div style={{ marginTop: 8, padding: '6px 8px', background: '#0a0a0d', borderRadius: 5, fontSize: 10, color: '#8a8690', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <span>day {protocolDays}</span>
        <span>·</span>
        <span>phase {(stats?.current_phase || 'phase_1').replace('_', ' ')}</span>
        <span>·</span>
        <span>denial {stats?.denial_day ?? 0}</span>
        <span>·</span>
        <span>slip {stats?.slip_points ?? 0}</span>
        {stats?.chastity_locked && <><span>·</span><span>chast {stats.chastity_streak}d</span></>}
        {stats?.hard_mode && <><span>·</span><span style={{ color: '#f47272' }}>hard mode</span></>}
      </div>
    </div>
  );
}

function SectionTile({ label, count, color, active, onClick }: { label: string; count: number; color: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      background: active ? `${color}22` : '#0a0a0d',
      border: `1px solid ${active ? color : '#22222a'}`,
      borderRadius: 6, padding: '8px 10px', textAlign: 'left', cursor: 'pointer',
      fontFamily: 'inherit',
    }}>
      <div style={{ fontSize: 9, color: '#8a8690', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 16, color, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{count}</div>
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 6, padding: '8px 10px', background: '#0a0a0d', border: '1px solid #22222a', borderRadius: 6 }}>
      <div style={{ fontSize: 10, color: '#6a656e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10.5, color: '#5a555e', fontStyle: 'italic' }}>{children}</div>;
}

const row: React.CSSProperties = {
  padding: '6px 0', borderBottom: '1px solid #1a1a22',
};
const rowHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3,
};
const rowBody: React.CSSProperties = {
  fontSize: 11, color: '#c8c4cc', lineHeight: 1.4,
};
