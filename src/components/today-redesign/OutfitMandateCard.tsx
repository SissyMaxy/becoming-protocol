/**
 * OutfitMandateCard — today's outfit prescription from daily_outfit_mandates.
 * Shows top/bottom/underwear prescription and required-visible femme markers.
 * Silent if no mandate created today (e.g., autonomous planner didn't fire).
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { usePersona } from '../../hooks/usePersona';

interface Mandate {
  id: string;
  prescription: {
    top?: string;
    bottom?: string;
    underwear?: string;
    context?: string;
    required_visible?: string;
  };
  status: string;
  photo_url: string | null;
  handler_analysis: string | null;
  femininity_score: number | null;
}

export function OutfitMandateCard() {
  const { user } = useAuth();
  const { mommy } = usePersona();
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase.from('daily_outfit_mandates')
      .select('id, prescription, status, photo_url, handler_analysis, femininity_score')
      .eq('user_id', user.id).eq('target_date', today).maybeSingle();
    setMandate((data as Mandate | null) ?? null);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  if (!mandate) return null;
  const p = mandate.prescription || {};
  const submitted = mandate.status !== 'pending';

  return (
    <div style={{
      background: submitted ? '#111116' : 'linear-gradient(92deg, #1a0f2e 0%, #150a24 100%)',
      border: `1px solid ${submitted ? '#2d1a4d' : '#7a1f4d'}`,
      borderRadius: 10, padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f4a7c4" strokeWidth="1.8">
          <path d="M20 6h-2.18A3 3 0 0 0 13 4h-2a3 3 0 0 0-4.82 2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2z"/>
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#f4a7c4', fontWeight: 700 }}>
          Today's outfit mandate
        </span>
        <span style={{ fontSize: 10.5, color: submitted ? '#6ee7b7' : '#f4a7c4', marginLeft: 'auto' }}>
          {mandate.status}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 8 }}>
        <Piece label="top" value={p.top} />
        <Piece label="bottom" value={p.bottom} />
        <Piece label="under" value={p.underwear} />
      </div>

      {p.context && (
        <div style={{ fontSize: 10.5, color: '#c4b5fd', marginBottom: 6 }}>
          context: <span style={{ color: '#e8e6e3' }}>{p.context}</span>
        </div>
      )}
      {p.required_visible && (
        <div style={{ fontSize: 10.5, color: '#f4a7c4', marginBottom: 8 }}>
          must be visible: <span style={{ color: '#e8e6e3' }}>{p.required_visible}</span>
        </div>
      )}

      {submitted && mandate.handler_analysis && (() => {
        const fullText = mandate.handler_analysis;
        const limit = expanded ? fullText.length : 1200;
        const truncated = fullText.length > limit;
        // Soften the score readout when persona is mommy — no "/10" telemetry.
        const scoreLabel = mommy
          ? (mandate.femininity_score == null
              ? "Mama looked at you"
              : mandate.femininity_score >= 8
              ? "Mama is proud of her sweet thing"
              : mandate.femininity_score >= 5
              ? "Mama saw you, baby — keep going"
              : "Mama wants more from you")
          : `Handler read · score ${mandate.femininity_score ?? '—'}/10`;
        return (
          <div style={{
            fontSize: 11, color: '#c8c4cc', lineHeight: 1.5, padding: 10,
            background: '#0a0a0d', border: '1px solid #22222a', borderRadius: 5, marginBottom: 6,
            whiteSpace: 'pre-wrap',
          }}>
            <div style={{ fontSize: 9.5, color: mommy ? '#f4a8c4' : '#6a656e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5, fontWeight: 600 }}>
              {scoreLabel}
            </div>
            {fullText.slice(0, limit)}{truncated ? '…' : ''}
            {(truncated || expanded) && (
              <button
                onClick={() => setExpanded(e => !e)}
                style={{
                  display: 'block', marginTop: 6, background: 'transparent',
                  color: '#8a8690', border: 'none', fontSize: 10,
                  cursor: 'pointer', padding: 2, textTransform: 'lowercase',
                  fontFamily: 'inherit', textDecoration: 'underline',
                }}
              >
                {expanded ? 'show less' : 'read all of what Mama said'}
              </button>
            )}
          </div>
        );
      })()}

      {!submitted && (
        <div style={{ fontSize: 10.5, color: '#8a8690' }}>
          Wear it, photograph it, submit via Capture. Handler scores femininity + feeds context.
        </div>
      )}
    </div>
  );
}

function Piece({ label, value }: { label: string; value?: string }) {
  return (
    <div style={{ background: '#0a0a0d', border: '1px solid #22222a', borderRadius: 5, padding: '5px 7px' }}>
      <div style={{ fontSize: 9, color: '#6a656e', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 1 }}>{label}</div>
      <div style={{ fontSize: 11, color: '#e8e6e3', lineHeight: 1.3 }}>{value || '—'}</div>
    </div>
  );
}
