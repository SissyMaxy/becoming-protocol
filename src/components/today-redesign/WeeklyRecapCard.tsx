/**
 * WeeklyRecapCard — surfaces the latest unread weekly recap on Today.
 *
 * Pulls handler_outreach_queue rows where kind='weekly_recap', resolves
 * the linked weekly_recaps row for metric tiles, and renders Mama's prose
 * with a voice-replay button (gated by user_state.prefers_mommy_voice).
 *
 * One-tap "got it" marks the outreach acknowledged and the card disappears
 * on next render. The recap row stays — it's archived to the letters
 * archive and remains accessible via /recaps and /recaps/<id>.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useHandlerVoice } from '../../hooks/useHandlerVoice';

interface RecapMetrics {
  compliance_pct?: number | null;
  total_slips?: number;
  mantras_spoken_count?: number;
  letters_archived_count?: number;
  wardrobe_items_acquired_count?: number;
  phase_at_start?: number | null;
  phase_at_end?: number | null;
  longest_compliance_streak_days?: number;
  dominant_affect?: string | null;
}

interface RecapJoin {
  outreach_id: string;
  outreach_message: string;
  outreach_scheduled_for: string;
  recap_id: string;
  recap_week_start: string;
  recap_week_end: string;
  recap_metrics: RecapMetrics;
}

function formatWeekRange(startIso: string, endIso: string): string {
  const fmt = (d: Date) => d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${fmt(new Date(startIso))} – ${fmt(new Date(endIso))}`;
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      flex: '1 1 80px', minWidth: 80,
      padding: '8px 10px', background: '#0a0a0d',
      border: '1px solid #2d1a4d33', borderRadius: 6,
    }}>
      <div style={{ fontSize: 9, color: '#8a8690', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, color: '#e8e6e3', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  );
}

export function WeeklyRecapCard({ onOpenDetail }: { onOpenDetail?: (recapId: string) => void }) {
  const { user } = useAuth();
  const voice = useHandlerVoice();
  const [card, setCard] = useState<RecapJoin | null>(null);
  const [acking, setAcking] = useState(false);
  const [voiceOptIn, setVoiceOptIn] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;

    // Voice opt-in is on user_state.prefers_mommy_voice — load alongside
    // so we know whether to render the playback button.
    const usRes = await supabase
      .from('user_state')
      .select('prefers_mommy_voice')
      .eq('user_id', user.id)
      .maybeSingle();
    setVoiceOptIn(!!(usRes?.data as { prefers_mommy_voice?: boolean } | null)?.prefers_mommy_voice);

    // Latest unread weekly recap outreach.
    const oRes = await supabase
      .from('handler_outreach_queue')
      .select('id, message, scheduled_for, status')
      .eq('user_id', user.id)
      .eq('kind', 'weekly_recap')
      .neq('status', 'acknowledged')
      .order('scheduled_for', { ascending: false })
      .limit(1)
      .maybeSingle();
    const o = oRes?.data as { id: string; message: string; scheduled_for: string } | null;
    if (!o) { setCard(null); return; }

    // Resolve the linked recap row by outreach_id back-reference.
    const rRes = await supabase
      .from('weekly_recaps')
      .select('id, week_start, week_end, metrics')
      .eq('user_id', user.id)
      .eq('outreach_id', o.id)
      .maybeSingle();
    const r = rRes?.data as {
      id: string; week_start: string; week_end: string; metrics: RecapMetrics
    } | null;
    if (!r) {
      // Outreach exists but recap row not linked — render with the message
      // alone so the user still sees Mama's prose.
      setCard({
        outreach_id: o.id,
        outreach_message: o.message,
        outreach_scheduled_for: o.scheduled_for,
        recap_id: '',
        recap_week_start: '',
        recap_week_end: '',
        recap_metrics: {},
      });
      return;
    }

    setCard({
      outreach_id: o.id,
      outreach_message: o.message,
      outreach_scheduled_for: o.scheduled_for,
      recap_id: r.id,
      recap_week_start: r.week_start,
      recap_week_end: r.week_end,
      recap_metrics: r.metrics || {},
    });
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const ack = async () => {
    if (!card) return;
    setAcking(true);
    await supabase.from('handler_outreach_queue')
      .update({ status: 'acknowledged', delivered_at: new Date().toISOString() })
      .eq('id', card.outreach_id);
    setCard(null);
    setAcking(false);
  };

  const playVoice = async () => {
    if (!card) return;
    if (!voice.enabled) voice.setEnabled(true);
    // useHandlerVoice caps at 500 chars internally — fine for an excerpt.
    // Recap prose is ~250 words / ~1500 chars, so the cap reads the open.
    await voice.speak(card.outreach_message);
  };

  if (!card) return null;

  const m = card.recap_metrics;
  const tiles: Array<{ label: string; value: string }> = [];
  tiles.push({
    label: 'compliance',
    value: m.compliance_pct === null || m.compliance_pct === undefined ? '—' : `${m.compliance_pct}%`,
  });
  tiles.push({ label: 'mantras', value: String(m.mantras_spoken_count ?? 0) });
  tiles.push({ label: 'letters', value: String(m.letters_archived_count ?? 0) });
  tiles.push({ label: 'wardrobe', value: String(m.wardrobe_items_acquired_count ?? 0) });
  tiles.push({ label: 'slips', value: String(m.total_slips ?? 0) });

  const phaseAdvanced = m.phase_at_start !== null && m.phase_at_start !== undefined
    && m.phase_at_end !== null && m.phase_at_end !== undefined
    && m.phase_at_end > m.phase_at_start;

  const weekRange = card.recap_week_start && card.recap_week_end
    ? formatWeekRange(card.recap_week_start, card.recap_week_end)
    : '';

  return (
    <div id="card-weekly-recap" style={{
      background: 'linear-gradient(135deg, #2a0f1f 0%, #1a0814 100%)',
      border: '2px solid #c4847a', borderRadius: 12, padding: 16, marginBottom: 16,
      boxShadow: '0 4px 14px rgba(196, 132, 122, 0.15)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c4847a" strokeWidth="2">
          <path d="M3 4h18v4H3z"/><path d="M7 12h10"/><path d="M7 16h7"/><path d="M3 4v16h18V4"/>
        </svg>
        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#c4847a', fontWeight: 700 }}>
          Your week with Mama
        </span>
        {weekRange && (
          <span style={{ fontSize: 10, color: '#8a8690', marginLeft: 'auto', fontStyle: 'italic' }}>
            {weekRange}
          </span>
        )}
      </div>

      {/* Metric tiles */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {tiles.map(t => <MetricTile key={t.label} label={t.label} value={t.value} />)}
      </div>

      {/* Phase progress mini-widget */}
      {phaseAdvanced && (
        <div style={{
          padding: '7px 10px', marginBottom: 10,
          background: '#1a0a14', border: '1px solid #c4847a55',
          borderRadius: 5, fontSize: 11, color: '#c4847a',
        }}>
          ✦ phase {m.phase_at_start} → {m.phase_at_end} this week
        </div>
      )}

      {/* Mama's narrative */}
      <div style={{
        fontSize: 13, color: '#e8e6e3', whiteSpace: 'pre-wrap', lineHeight: 1.55,
        marginBottom: 12, fontStyle: 'italic',
      }}>
        {card.outreach_message}
      </div>

      {/* Action row */}
      <div style={{ display: 'flex', gap: 8 }}>
        {voiceOptIn && (
          <button
            onClick={playVoice}
            disabled={voice.isPlaying}
            style={{
              flex: '0 0 auto', padding: '10px 14px', borderRadius: 6,
              background: 'transparent', color: '#c4847a',
              border: '1px solid #c4847a',
              fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}
          >
            {voice.isPlaying ? '…' : '▸ play'}
          </button>
        )}
        {card.recap_id && onOpenDetail && (
          <button
            onClick={() => onOpenDetail(card.recap_id)}
            style={{
              flex: '1 1 auto', padding: 10, borderRadius: 6, border: '1px solid #c4847a55',
              background: 'transparent', color: '#c4847a',
              fontWeight: 600, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}
          >
            Open full recap
          </button>
        )}
        <button
          onClick={ack}
          disabled={acking}
          style={{
            flex: '1 1 auto', padding: 10, borderRadius: 6, border: 'none',
            background: '#c4847a', color: '#1a0814',
            fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}
        >
          {acking ? '…' : 'Heard you, mama'}
        </button>
      </div>
    </div>
  );
}
