/**
 * LettersArchiveView — the museum.
 *
 * Permanent, curated record of Mama's outreach the user can revisit. Reads
 * from the `letters_archive` view (only is_archived_to_letters=TRUE rows;
 * pinned-first, then newest). Organized by phase_snapshot, filterable by
 * phase / month / affect.
 *
 * Distinct from Today's OutreachQueueCard — Today is the inbox, Letters is
 * the museum. Tapping a letter opens a detail modal with TTS playback,
 * pin/unarchive controls, and the original timestamp + affect.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Mail } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { LetterCard } from './LetterCard';
import { LetterDetailModal } from './LetterDetailModal';
import { LettersGate } from './LettersGate';

export type LetterRow = {
  id: string;
  user_id: string;
  message: string;
  source: string;
  urgency: string;
  trigger_reason: string | null;
  scheduled_for: string;
  created_at: string;
  delivered_at: string | null;
  responded_at: string | null;
  user_response: string | null;
  phase_snapshot: number | null;
  affect_snapshot: string | null;
  letters_pinned_at: string | null;
  is_archived_to_letters: boolean;
};

const AFFECTS = ['hungry', 'delighted', 'watching', 'patient', 'aching', 'amused', 'possessive', 'indulgent', 'restless'] as const;

type Filters = {
  phase: number | 'all';
  affect: string;
  month: string; // 'YYYY-MM' or 'all'
};

interface LettersArchiveViewProps {
  onBack: () => void;
}

export function LettersArchiveView({ onBack }: LettersArchiveViewProps) {
  const { user } = useAuth();
  const [letters, setLetters] = useState<LetterRow[] | null>(null);
  const [active, setActive] = useState<LetterRow | null>(null);
  const [filters, setFilters] = useState<Filters>({ phase: 'all', affect: 'all', month: 'all' });
  const [autoplayPref, setAutoplayPref] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('letters_archive')
      .select('*')
      .eq('user_id', user.id);
    setLetters((data || []) as LetterRow[]);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('user_state')
        .select('letters_autoplay_voice')
        .eq('user_id', user.id).maybeSingle();
      if (cancelled) return;
      setAutoplayPref(Boolean((data as { letters_autoplay_voice?: boolean } | null)?.letters_autoplay_voice));
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const phaseGroups = useMemo(() => {
    if (!letters) return [];
    const filtered = letters.filter(l => {
      if (filters.phase !== 'all' && (l.phase_snapshot ?? -1) !== filters.phase) return false;
      if (filters.affect !== 'all' && l.affect_snapshot !== filters.affect) return false;
      if (filters.month !== 'all' && l.created_at.slice(0, 7) !== filters.month) return false;
      return true;
    });

    // Pinned letters first as a single bucket, then group by phase.
    const pinned = filtered.filter(l => l.letters_pinned_at);
    const unpinned = filtered.filter(l => !l.letters_pinned_at);
    const byPhase = new Map<number | null, LetterRow[]>();
    for (const l of unpinned) {
      const key = l.phase_snapshot;
      if (!byPhase.has(key)) byPhase.set(key, []);
      byPhase.get(key)!.push(l);
    }
    const phaseGroups: Array<{ label: string; phase: number | null; rows: LetterRow[] }> = [];
    if (pinned.length > 0) {
      phaseGroups.push({ label: 'Pinned', phase: null, rows: pinned });
    }
    // Sort phases desc (newest progression first)
    const phases = Array.from(byPhase.keys()).sort((a, b) => {
      if (a === null) return 1;
      if (b === null) return -1;
      return b - a;
    });
    for (const p of phases) {
      const label = p === null ? 'Before phases' : `Phase ${p}`;
      phaseGroups.push({ label, phase: p, rows: byPhase.get(p) || [] });
    }
    return phaseGroups;
  }, [letters, filters]);

  const months = useMemo(() => {
    if (!letters) return [];
    const set = new Set<string>();
    for (const l of letters) set.add(l.created_at.slice(0, 7));
    return Array.from(set).sort().reverse();
  }, [letters]);

  const phasesAvailable = useMemo(() => {
    if (!letters) return [];
    const set = new Set<number>();
    for (const l of letters) if (l.phase_snapshot !== null) set.add(l.phase_snapshot);
    return Array.from(set).sort((a, b) => a - b);
  }, [letters]);

  const handlePin = useCallback(async (id: string) => {
    if (!user?.id) return;
    const { error } = await supabase.from('handler_outreach_queue')
      .update({ letters_pinned_at: new Date().toISOString() })
      .eq('id', id);
    if (!error) await load();
  }, [user?.id, load]);

  const handleUnpin = useCallback(async (id: string) => {
    if (!user?.id) return;
    const { error } = await supabase.from('handler_outreach_queue')
      .update({ letters_pinned_at: null })
      .eq('id', id);
    if (!error) await load();
  }, [user?.id, load]);

  const handleRemove = useCallback(async (id: string) => {
    if (!user?.id) return;
    // Soft-delete: only flips the flag. Underlying outreach row is preserved.
    const { error } = await supabase.from('handler_outreach_queue')
      .update({ is_archived_to_letters: false, letters_pinned_at: null })
      .eq('id', id);
    if (!error) {
      setActive(null);
      await load();
    }
  }, [user?.id, load]);

  return (
    <LettersGate>
      <div style={{ minHeight: '100vh', background: '#0f0a0d', paddingBottom: 96 }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #2d1a25' }}>
          <button
            onClick={onBack}
            style={{
              background: 'transparent', border: 'none', color: '#8a7a82',
              cursor: 'pointer', fontSize: 13, padding: 0, marginBottom: 10,
            }}
          >
            &larr; Back
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Mail size={20} style={{ color: '#c4956a' }} />
            <h1 style={{
              margin: 0, fontFamily: 'Georgia, serif', fontSize: 22,
              color: '#f0e6d8', letterSpacing: '0.02em',
            }}>
              Letters from Mama
            </h1>
          </div>
          <p style={{
            fontSize: 11.5, color: '#8a7a82', margin: '6px 0 0 0',
            fontStyle: 'italic',
          }}>
            What she said when she meant it.
          </p>
        </div>

        <FilterBar
          filters={filters}
          phasesAvailable={phasesAvailable}
          months={months}
          onChange={setFilters}
        />

        <div style={{ padding: '0 16px' }}>
          {letters === null && (
            <div style={{ padding: '32px 0', color: '#8a7a82', fontSize: 12.5, textAlign: 'center' }}>
              Loading…
            </div>
          )}
          {letters !== null && phaseGroups.length === 0 && (
            <div style={{ padding: '40px 12px', textAlign: 'center' }}>
              <p style={{ fontSize: 13, color: '#a0908a', fontFamily: 'Georgia, serif', fontStyle: 'italic', lineHeight: 1.6, margin: 0 }}>
                No letters yet, sweet thing.
              </p>
              <p style={{ fontSize: 11.5, color: '#6a5e62', marginTop: 8 }}>
                Mama keeps the warmest moments here. The first one will appear after she sends praise or says goodnight.
              </p>
            </div>
          )}
          {phaseGroups.map(group => (
            <section key={group.label} style={{ marginBottom: 22 }}>
              <h2 style={{
                fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.12em',
                color: '#c4956a', fontWeight: 600, margin: '14px 0 10px 4px',
                fontFamily: 'Georgia, serif',
              }}>
                {group.label}
              </h2>
              <div style={{ display: 'grid', gap: 10 }}>
                {group.rows.map(letter => (
                  <LetterCard
                    key={letter.id}
                    letter={letter}
                    onOpen={() => setActive(letter)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>

        {active && (
          <LetterDetailModal
            letter={active}
            autoplay={autoplayPref}
            onClose={() => setActive(null)}
            onPin={() => handlePin(active.id)}
            onUnpin={() => handleUnpin(active.id)}
            onRemove={() => handleRemove(active.id)}
          />
        )}
      </div>
    </LettersGate>
  );
}

interface FilterBarProps {
  filters: Filters;
  phasesAvailable: number[];
  months: string[];
  onChange: (next: Filters) => void;
}

function FilterBar({ filters, phasesAvailable, months, onChange }: FilterBarProps) {
  const selectStyle: React.CSSProperties = {
    background: '#1a0f15', color: '#e0d4c8',
    border: '1px solid #3d2530', borderRadius: 4,
    padding: '4px 8px', fontSize: 11, fontFamily: 'inherit',
    cursor: 'pointer',
  };

  return (
    <div style={{
      padding: '10px 16px', display: 'flex', gap: 8, flexWrap: 'wrap',
      borderBottom: '1px solid #2d1a25', background: '#140d11',
    }}>
      <select
        style={selectStyle}
        value={filters.phase === 'all' ? 'all' : String(filters.phase)}
        onChange={e => onChange({ ...filters, phase: e.target.value === 'all' ? 'all' : Number(e.target.value) })}
      >
        <option value="all">All phases</option>
        {phasesAvailable.map(p => <option key={p} value={p}>Phase {p}</option>)}
      </select>
      <select
        style={selectStyle}
        value={filters.affect}
        onChange={e => onChange({ ...filters, affect: e.target.value })}
      >
        <option value="all">All moods</option>
        {AFFECTS.map(a => <option key={a} value={a}>{a}</option>)}
      </select>
      <select
        style={selectStyle}
        value={filters.month}
        onChange={e => onChange({ ...filters, month: e.target.value })}
      >
        <option value="all">All months</option>
        {months.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
    </div>
  );
}
