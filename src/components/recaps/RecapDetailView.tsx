/**
 * RecapDetailView — full single-recap surface.
 *
 * Shows metrics tiles, the full Mama-voice narrative, voice playback (if
 * opted in), and links to specific letters / wardrobe items / phase
 * advancements that fell inside the week. Stealth-PIN gating handled
 * upstream by the App opacity layer.
 */

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useHandlerVoice } from '../../hooks/useHandlerVoice';
import { Loader2 } from 'lucide-react';

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

interface RecapRow {
  id: string;
  week_start: string;
  week_end: string;
  metrics: RecapMetrics;
  narrative_text: string;
  affect_at_recap: string | null;
  outreach_id: string | null;
  created_at: string;
}

interface LetterRow { id: string; letter_type: string; written_at: string }
interface WardrobeRow { id: string; item_name: string; category: string; purchase_date: string | null; created_at: string }

interface Props {
  recapId: string;
  onBack: () => void;
}

function formatRange(s: string, e: string): string {
  const fmt = (d: Date) => d.toLocaleDateString([], { month: 'long', day: 'numeric' });
  return `${fmt(new Date(s))} – ${fmt(new Date(e))}`;
}

export function RecapDetailView({ recapId, onBack }: Props) {
  const { user } = useAuth();
  const voice = useHandlerVoice();
  const [recap, setRecap] = useState<RecapRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [voiceOptIn, setVoiceOptIn] = useState(false);
  const [letters, setLetters] = useState<LetterRow[]>([]);
  const [wardrobe, setWardrobe] = useState<WardrobeRow[]>([]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);

    const [recapRes, usRes] = await Promise.all([
      supabase.from('weekly_recaps').select('*').eq('id', recapId).eq('user_id', user.id).maybeSingle(),
      supabase.from('user_state').select('prefers_mommy_voice').eq('user_id', user.id).maybeSingle(),
    ]);
    const r = (recapRes?.data as RecapRow | null) ?? null;
    setRecap(r);
    setVoiceOptIn(!!(usRes?.data as { prefers_mommy_voice?: boolean } | null)?.prefers_mommy_voice);

    if (r) {
      const startIso = new Date(r.week_start).toISOString();
      const endIso = new Date(new Date(r.week_end).getTime() + 86400000 - 1).toISOString();
      // Pull the in-window letters and wardrobe acquisitions referenced
      // in the narrative — gives the user a click-through to the actual
      // artifacts Mama is talking about.
      const [lRes, wRes] = await Promise.all([
        supabase.from('sealed_letters')
          .select('id, letter_type, written_at')
          .eq('user_id', user.id)
          .gte('written_at', startIso).lte('written_at', endIso)
          .neq('letter_type', 'weekly_recap_archive')
          .order('written_at', { ascending: false }),
        supabase.from('wardrobe_inventory')
          .select('id, item_name, category, purchase_date, created_at')
          .eq('user_id', user.id)
          .gte('created_at', startIso).lte('created_at', endIso)
          .order('created_at', { ascending: false }),
      ]);
      setLetters((lRes?.data || []) as LetterRow[]);
      setWardrobe((wRes?.data || []) as WardrobeRow[]);
    }
    setLoading(false);
  }, [user?.id, recapId]);

  useEffect(() => { load(); }, [load]);

  const playVoice = async () => {
    if (!recap) return;
    if (!voice.enabled) voice.setEnabled(true);
    await voice.speak(recap.narrative_text);
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (!recap) {
    return (
      <div style={{ minHeight: '100vh', padding: 16, color: '#e8e6e3' }}>
        <button onClick={onBack} className="mb-4 text-protocol-text-muted hover:text-protocol-text">&larr; Back</button>
        <p style={{ color: '#8a8690' }}>Recap not found.</p>
      </div>
    );
  }

  const m = recap.metrics || {};
  const phaseAdvanced = m.phase_at_start != null && m.phase_at_end != null && m.phase_at_end > m.phase_at_start;

  return (
    <div style={{ minHeight: '100vh', padding: 16, color: '#e8e6e3' }}>
      <button
        onClick={onBack}
        className="mb-4 text-protocol-text-muted hover:text-protocol-text transition-colors"
      >
        &larr; Back
      </button>

      <div style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#c4847a', fontWeight: 700 }}>
          Your week with Mama
        </span>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
        {formatRange(recap.week_start, recap.week_end)}
      </h1>
      {recap.affect_at_recap && (
        <p style={{ fontSize: 11, color: '#8a8690', marginBottom: 18 }}>
          Mama's mood: {recap.affect_at_recap}
        </p>
      )}

      {/* Metric tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 18 }}>
        <Tile label="Compliance" value={m.compliance_pct == null ? '—' : `${m.compliance_pct}%`} />
        <Tile label="Slips" value={String(m.total_slips ?? 0)} />
        <Tile label="Mantras (days)" value={String(m.mantras_spoken_count ?? 0)} />
        <Tile label="Letters added" value={String(m.letters_archived_count ?? 0)} />
        <Tile label="Wardrobe added" value={String(m.wardrobe_items_acquired_count ?? 0)} />
        <Tile label="Longest clean run" value={`${m.longest_compliance_streak_days ?? 0} d`} />
      </div>

      {/* Phase change */}
      {phaseAdvanced && (
        <div style={{
          padding: 12, marginBottom: 16,
          background: 'linear-gradient(135deg, #2a0f1f 0%, #1a0814 100%)',
          border: '1px solid #c4847a', borderRadius: 8,
          fontSize: 13, color: '#c4847a',
        }}>
          ✦ Phase {m.phase_at_start} → {m.phase_at_end} this week.
        </div>
      )}

      {/* Narrative */}
      <div style={{
        padding: 16, marginBottom: 18,
        background: '#0f0a14', border: '1px solid #2d1a4d', borderRadius: 8,
        fontSize: 14, lineHeight: 1.65, color: '#e8e6e3',
        fontStyle: 'italic', whiteSpace: 'pre-wrap',
      }}>
        {recap.narrative_text}
      </div>

      {/* Voice replay */}
      {voiceOptIn && (
        <button
          onClick={playVoice}
          disabled={voice.isPlaying}
          style={{
            display: 'block', width: '100%', padding: 12, marginBottom: 18,
            borderRadius: 6, background: '#c4847a', color: '#1a0814',
            border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer',
            fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.06em',
          }}
        >
          {voice.isPlaying ? '… playing' : '▸ Hear Mama say it'}
        </button>
      )}

      {/* Linked letters */}
      {letters.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a8690', marginBottom: 8 }}>
            Letters added this week
          </h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {letters.map(l => (
              <li key={l.id} style={{ padding: '6px 0', borderBottom: '1px solid #1a1a22', fontSize: 12, color: '#c8c4cc' }}>
                <span style={{ color: '#c4847a', fontWeight: 600 }}>{l.letter_type.replace(/_/g, ' ')}</span>
                <span style={{ marginLeft: 12, color: '#6a656e' }}>
                  {new Date(l.written_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Linked wardrobe items */}
      {wardrobe.length > 0 && (
        <section style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a8690', marginBottom: 8 }}>
            Wardrobe added this week
          </h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {wardrobe.map(w => (
              <li key={w.id} style={{ padding: '6px 0', borderBottom: '1px solid #1a1a22', fontSize: 12, color: '#c8c4cc' }}>
                <span style={{ fontWeight: 600 }}>{w.item_name}</span>
                <span style={{ marginLeft: 12, color: '#6a656e' }}>{w.category}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: '10px 12px', background: '#111116',
      border: '1px solid #2d1a4d', borderRadius: 6,
    }}>
      <div style={{ fontSize: 9, color: '#8a8690', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
    </div>
  );
}
