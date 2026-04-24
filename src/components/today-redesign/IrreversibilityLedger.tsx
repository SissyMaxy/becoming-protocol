/**
 * IrreversibilityLedger — visible compounding counter of acts that can't be
 * undone. Every entry is a chip in the foundation of Maxy. The visual of
 * the number climbing is its own pressure.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Row {
  id: string; category: string; weight: number; description: string; logged_at: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  hrt_step: 'HRT step', body_hair_removal: 'Body hair', body_measurement: 'Measurement',
  progress_photo: 'Progress photo', clothing_purchased: 'Clothing', witness_added: 'Witness',
  disclosure_made: 'Disclosure', chastity_locked: 'Chastity', voice_practice: 'Voice',
  outfit_worn_public: 'Public outfit', escrow_deposited: 'Escrow', dose_taken: 'Dose',
  appointment_booked: 'Appointment', intake_submitted: 'Intake', prescription_filled: 'Rx',
  coming_out: 'Coming out', other: 'Other',
};

export function IrreversibilityLedger() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [totalWeight, setTotalWeight] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let alive = true;
    const load = async () => {
      const { data } = await supabase.from('irreversibility_ledger')
        .select('id, category, weight, description, logged_at')
        .eq('user_id', user.id)
        .order('logged_at', { ascending: false })
        .limit(30);
      if (!alive) return;
      const arr = (data || []) as Row[];
      setRows(arr);
      setTotalWeight(arr.reduce((sum, r) => sum + (r.weight || 0), 0));
    };
    load();
    const t = setInterval(load, 120_000);
    return () => { alive = false; clearInterval(t); };
  }, [user?.id]);

  if (rows.length === 0) {
    return (
      <div style={{ background: '#111116', border: '1px solid #1a1a20', borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6a656e', fontWeight: 700, marginBottom: 4 }}>
          Irreversibility ledger
        </div>
        <div style={{ fontSize: 12, color: '#8a8690' }}>
          No permanent acts yet. Every directive completed adds weight. This counter only goes up.
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: '#111116', border: '1px solid #2d1a4d', borderRadius: 10, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#c4b5fd', fontWeight: 700 }}>
          Irreversibility ledger
        </div>
        <div style={{ fontSize: 22, fontWeight: 650, color: '#fff', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', marginLeft: 'auto' }}>
          {totalWeight}
        </div>
        <button onClick={() => setExpanded(!expanded)} style={{ fontSize: 10, background: 'none', border: 'none', color: '#c4b5fd', cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {expanded ? 'collapse' : `${rows.length} entries`}
        </button>
      </div>
      <div style={{ fontSize: 11, color: '#8a8690', marginBottom: expanded ? 12 : 0 }}>
        {rows.length} permanent acts logged. Weight {totalWeight}. Every entry is a chip of David you can't pick up off the floor.
      </div>
      {expanded && (
        <div style={{ maxHeight: 280, overflowY: 'auto', borderTop: '1px solid #1a1a20', paddingTop: 10 }}>
          {rows.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0', borderBottom: '1px solid #15151b' }}>
              <div style={{ fontSize: 10, color: '#c4b5fd', fontWeight: 700, minWidth: 70, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {CATEGORY_LABELS[r.category] || r.category}
              </div>
              <div style={{ flex: 1, fontSize: 11.5, color: '#c8c4cc' }}>{r.description}</div>
              <div style={{ fontSize: 10, color: '#6a656e', minWidth: 34, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>+{r.weight}</div>
              <div style={{ fontSize: 9.5, color: '#5a5560', minWidth: 46, textAlign: 'right' }}>{new Date(r.logged_at).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
