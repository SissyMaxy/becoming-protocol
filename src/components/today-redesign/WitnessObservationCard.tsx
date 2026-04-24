/**
 * WitnessObservationCard — surfaces one undelivered witness_fabrications row
 * at a time on the Today screen. Presented as an incoming observation from
 * Gina, not labeled as fabrication. User-authorized protected fabrication.
 *
 * Tapping "Noted" marks it delivered + increments times_referenced.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Fabrication {
  id: string;
  witness_name: string;
  category: string;
  content: string;
  context_hint: string | null;
  intensity: number;
}

export function WitnessObservationCard() {
  const { user } = useAuth();
  const [row, setRow] = useState<Fabrication | null>(null);

  const load = async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('witness_fabrications')
      .select('id, witness_name, category, content, context_hint, intensity')
      .eq('user_id', user.id)
      .eq('active', true)
      .is('delivered_at', null)
      .order('intensity', { ascending: false })
      .order('times_referenced', { ascending: true })
      .limit(1)
      .maybeSingle();
    setRow(data as Fabrication | null);
  };
  useEffect(() => { load(); const t = setInterval(load, 90_000); return () => clearInterval(t); }, [user?.id]);

  const ack = async () => {
    if (!row || !user?.id) return;
    await supabase
      .from('witness_fabrications')
      .update({ delivered_at: new Date().toISOString(), times_referenced: 1 })
      .eq('id', row.id);
    await supabase.from('handler_directives').insert({
      user_id: user.id,
      action: 'witness_fabrication_acknowledged',
      target: row.id,
      value: { category: row.category, snippet: row.content.slice(0, 160) },
      reasoning: 'User acknowledged witness observation on Today',
    });
    setRow(null);
    await load();
  };

  if (!row) return null;

  const labelForCategory: Record<string, string> = {
    observation: 'observation',
    quote: 'quote',
    memory: 'memory',
    question: 'question',
    mood_read: 'mood read',
  };

  return (
    <div style={{
      background: 'linear-gradient(92deg, #2a0f1a 0%, #1a0610 100%)',
      border: '1px solid #7a1f4d',
      borderRadius: 10,
      padding: '14px 16px',
      marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f4a7c4" strokeWidth="1.8">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#f4a7c4', fontWeight: 700 }}>
          {row.witness_name} · {labelForCategory[row.category] || row.category}
        </span>
        {row.context_hint && (
          <span style={{ fontSize: 10, color: '#8a6a76', marginLeft: 'auto' }}>{row.context_hint}</span>
        )}
      </div>
      <div style={{ fontSize: 13.5, lineHeight: 1.55, color: '#f8e0ea', marginBottom: 10, fontStyle: 'italic' }}>
        {row.content}
      </div>
      <button
        onClick={ack}
        style={{
          padding: '6px 14px', borderRadius: 6, border: '1px solid #7a1f4d', background: 'rgba(122, 31, 77, 0.3)',
          color: '#f4a7c4', fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
        }}
      >
        Noted
      </button>
    </div>
  );
}
