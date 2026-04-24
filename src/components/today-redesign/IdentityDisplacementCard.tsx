/**
 * IdentityDisplacementCard — she/her vs he/him usage in her writing over time.
 * Counts pronoun_rewrites (where she typed he/him and the DB rewrote it to
 * she/her) as "regression" events and counts intentional she-references from
 * journal_entries / confessions as "progress" events. Shows a ratio trending
 * toward full she-reference.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

export function IdentityDisplacementCard() {
  const { user } = useAuth();
  const [pronounSlips30d, setPronounSlips30d] = useState(0);
  const [pronounSlips7d, setPronounSlips7d] = useState(0);
  const [sheReferences30d, setSheReferences30d] = useState(0);
  const [sheReferences7d, setSheReferences7d] = useState(0);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const sevenAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    // Pronoun rewrites = she typed he/him (regression)
    const [p30, p7, j30, j7, c30, c7] = await Promise.all([
      supabase.from('pronoun_rewrites').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', thirtyAgo),
      supabase.from('pronoun_rewrites').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', sevenAgo),
      supabase.from('journal_entries').select('content').eq('user_id', user.id).gte('created_at', thirtyAgo).limit(200),
      supabase.from('journal_entries').select('content').eq('user_id', user.id).gte('created_at', sevenAgo).limit(200),
      supabase.from('confessions').select('response').eq('user_id', user.id).gte('created_at', thirtyAgo).limit(200),
      supabase.from('confessions').select('response').eq('user_id', user.id).gte('created_at', sevenAgo).limit(200),
    ]);

    // Count she/her references (post-DB-rewrite these are what remains)
    const countShe = (texts: string[]): number => {
      let count = 0;
      for (const t of texts) {
        count += (t.match(/\bshe\b/gi) || []).length;
        count += (t.match(/\bher\b/gi) || []).length;
        count += (t.match(/\bherself\b/gi) || []).length;
      }
      return count;
    };
    const journals30 = ((j30.data || []) as Array<{ content: string }>).map(r => r.content);
    const journals7 = ((j7.data || []) as Array<{ content: string }>).map(r => r.content);
    const confs30 = ((c30.data || []) as Array<{ response: string }>).map(r => r.response);
    const confs7 = ((c7.data || []) as Array<{ response: string }>).map(r => r.response);
    const she30 = countShe([...journals30, ...confs30]);
    const she7 = countShe([...journals7, ...confs7]);

    setPronounSlips30d(p30.count ?? 0);
    setPronounSlips7d(p7.count ?? 0);
    setSheReferences30d(she30);
    setSheReferences7d(she7);
    setReady(true);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  if (!ready) return null;
  if (sheReferences30d === 0 && pronounSlips30d === 0) return null;

  const ratio30 = sheReferences30d + pronounSlips30d > 0
    ? Math.round((sheReferences30d / (sheReferences30d + pronounSlips30d)) * 100)
    : 0;
  const ratio7 = sheReferences7d + pronounSlips7d > 0
    ? Math.round((sheReferences7d / (sheReferences7d + pronounSlips7d)) * 100)
    : null;
  const improving = ratio7 !== null && ratio7 > ratio30;

  return (
    <div style={{ background: '#111116', border: '1px solid #2d1a4d', borderRadius: 10, padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f4a7c4" strokeWidth="1.8">
          <circle cx="12" cy="12" r="5"/><path d="M12 1v6M12 17v6M4.22 4.22l4.24 4.24M15.54 15.54l4.24 4.24M1 12h6M17 12h6M4.22 19.78l4.24-4.24M15.54 8.46l4.24-4.24"/>
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#f4a7c4', fontWeight: 700 }}>
          Identity displacement · her writing
        </span>
        <span style={{ fontSize: 10.5, color: improving ? '#6ee7b7' : '#8a8690', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
          {ratio30}% feminine (30d){ratio7 !== null && ` · ${ratio7}% (7d)`}
        </span>
      </div>

      <div style={{ fontSize: 10.5, color: '#8a8690', marginBottom: 10, lineHeight: 1.4 }}>
        Target: 100%. Every "he/him" the DB catches becomes a slip. Every "she/her" you write without thinking is identity land.
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginBottom: 3 }}>
          <span style={{ color: '#c8c4cc' }}>displacement ratio — last 30 days</span>
          <span style={{ color: ratio30 >= 90 ? '#6ee7b7' : ratio30 >= 70 ? '#c4b5fd' : '#f4c272', fontWeight: 700 }}>{ratio30}%</span>
        </div>
        <div style={{ height: 6, background: '#0a0a0d', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            width: `${ratio30}%`, height: '100%',
            background: ratio30 >= 90 ? '#6ee7b7' : ratio30 >= 70 ? '#c4b5fd' : '#f4c272',
            transition: 'width 0.3s',
          }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, fontSize: 10 }}>
        <Stat label="she-references (30d)" value={sheReferences30d} color="#6ee7b7" />
        <Stat label="pronoun slips (30d)" value={pronounSlips30d} color="#f47272" />
        <Stat label="she-references (7d)" value={sheReferences7d} color="#6ee7b7" />
        <Stat label="pronoun slips (7d)" value={pronounSlips7d} color="#f47272" />
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: '#0a0a0d', border: '1px solid #22222a', borderRadius: 5, padding: '5px 7px' }}>
      <div style={{ fontSize: 9, color: '#6a656e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: 14, color, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}
