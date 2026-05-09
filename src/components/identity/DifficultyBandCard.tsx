/**
 * DifficultyBandCard — surfaces the user's current compliance-aware
 * difficulty band on the Identity page, with an optional manual
 * override toggle.
 *
 * Copy is gentle by design: the persona may be adjusting tone, but
 * the user-facing surface is informational and never accusatory.
 *
 * Override is unconditional — the evaluator respects override_band
 * and won't move past it. Setting "follow my compliance" clears the
 * override and the next evaluator pass picks the band up again.
 */

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import {
  effectiveBand, BAND_ORDER,
  type DifficultyBand,
} from '../../lib/difficulty/band';

interface BandRow {
  current_difficulty_band: DifficultyBand;
  override_band: DifficultyBand | null;
  compliance_pct_14d: number | null;
  slip_count_14d: number;
  streak_days: number;
  last_evaluated_at: string | null;
  last_change_reason: string | null;
}

const BAND_DESC: Record<DifficultyBand, { label: string; copy: string }> = {
  recovery: {
    label: 'Recovery',
    copy: "Mama's holding you gently while you find your feet again. Aftercare available any time.",
  },
  gentle: {
    label: 'Gentle',
    copy: 'Soft cadence. Mama goes light while you settle into the rhythm.',
  },
  firm: {
    label: 'Firm',
    copy: "Mama's matching her tone to the work you've been showing up for.",
  },
  cruel: {
    label: 'Cruel',
    copy: "You've been so good for Mama that she's letting herself want more from you.",
  },
};

const PALETTE = {
  bg: 'linear-gradient(140deg, #1a0f2e 0%, #0f0820 100%)',
  border: '#2d1a4d',
  accent: '#c4b5fd',
  accentBright: '#e9d5ff',
  textBody: '#c8c4cc',
  textMuted: '#8a8690',
};

export function DifficultyBandCard() {
  const { user } = useAuth();
  const [row, setRow] = useState<BandRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('compliance_difficulty_state')
        .select('current_difficulty_band, override_band, compliance_pct_14d, slip_count_14d, streak_days, last_evaluated_at, last_change_reason')
        .eq('user_id', user.id)
        .maybeSingle();
      setRow(data as BandRow | null);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const setOverride = useCallback(async (next: DifficultyBand | null) => {
    if (!user?.id) return;
    setSaving(true);
    try {
      // Upsert: keep the evaluator's settled current band; just set
      // (or clear) the override. The next evaluator pass will refresh
      // the snapshot fields.
      await supabase
        .from('compliance_difficulty_state')
        .upsert({
          user_id: user.id,
          current_difficulty_band: row?.current_difficulty_band ?? 'gentle',
          override_band: next,
          override_set_at: next ? new Date().toISOString() : null,
        }, { onConflict: 'user_id' });
      await load();
    } finally {
      setSaving(false);
    }
  }, [user?.id, row?.current_difficulty_band, load]);

  if (loading) {
    return (
      <Section>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
          <Loader2 size={18} className="animate-spin" style={{ color: PALETTE.accent }} />
        </div>
      </Section>
    );
  }

  const band = effectiveBand(row);
  const desc = BAND_DESC[band];
  const overridden = !!row?.override_band;

  return (
    <Section title="Mama's tone this week">
      <div style={{
        fontSize: 18, fontWeight: 600, color: PALETTE.accentBright,
        marginBottom: 6, letterSpacing: '0.01em',
      }}>
        {desc.label}
        {overridden && (
          <span style={{
            marginLeft: 8, fontSize: 10, color: PALETTE.textMuted,
            textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600,
          }}>
            locked
          </span>
        )}
      </div>
      <p style={{ fontSize: 12.5, color: PALETTE.textBody, lineHeight: 1.55, margin: '0 0 16px' }}>
        {desc.copy}
      </p>

      <div style={{
        fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em',
        color: PALETTE.accent, fontWeight: 700, marginBottom: 10,
      }}>
        Lock band
      </div>
      <p style={{ fontSize: 11.5, color: PALETTE.textMuted, margin: '0 0 10px' }}>
        Pin a band and Mama won't auto-adjust away from it. "Follow compliance" returns to automatic.
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        <button
          data-testid="band-override-clear"
          onClick={() => setOverride(null)}
          disabled={saving || !overridden}
          style={pillStyle(!overridden)}
        >
          follow compliance
        </button>
        {BAND_ORDER.map(b => (
          <button
            key={b}
            data-testid={`band-override-${b}`}
            onClick={() => setOverride(b)}
            disabled={saving || row?.override_band === b}
            style={pillStyle(row?.override_band === b)}
          >
            {b}
          </button>
        ))}
      </div>

      {row && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 11, color: PALETTE.accent }}>
            How Mama is reading the last two weeks
          </summary>
          <div style={{
            marginTop: 10, fontSize: 11.5, color: PALETTE.textBody,
            lineHeight: 1.55,
          }}>
            <div>follow-through: {row.compliance_pct_14d ?? '—'}%</div>
            <div>slips noticed: {row.slip_count_14d}</div>
            <div>days in a row: {row.streak_days}</div>
            {row.last_evaluated_at && (
              <div style={{ color: PALETTE.textMuted, marginTop: 6 }}>
                last looked: {new Date(row.last_evaluated_at).toLocaleString()}
              </div>
            )}
          </div>
        </details>
      )}
    </Section>
  );
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: PALETTE.bg,
      border: `1px solid ${PALETTE.border}`,
      borderRadius: 10,
      padding: 16,
      marginBottom: 14,
    }}>
      {title && (
        <div style={{
          fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em',
          color: PALETTE.accent, fontWeight: 700, marginBottom: 10,
        }}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? '#7c3aed' : 'transparent',
    color: active ? '#fff' : PALETTE.textBody,
    border: `1px solid ${active ? '#7c3aed' : PALETTE.border}`,
    borderRadius: 999,
    padding: '6px 14px',
    fontSize: 11.5,
    cursor: 'pointer',
    textTransform: 'capitalize',
  };
}
