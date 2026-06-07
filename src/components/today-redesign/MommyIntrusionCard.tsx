/**
 * MommyIntrusionCard — unpredictable proof-of-state intrusion (wish c7d35e7b,
 * mig 594). When Mama reaches in, the girl has 10 minutes to answer with text
 * or a photo. The card surfaces only while an intrusion is live (delivered,
 * unanswered, window open) — a hard countdown drives the urgency. Renders
 * null otherwise.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Intrusion {
  id: string;
  question_text: string;
  scheduled_for: string;
  window_expires_at: string;
}

export function MommyIntrusionCard() {
  const { user } = useAuth();
  const [intr, setIntr] = useState<Intrusion | null>(null);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!user?.id) return;
    const nowIso = new Date().toISOString();
    const { data } = await supabase
      .from('mommy_intrusions')
      .select('id, question_text, scheduled_for, window_expires_at')
      .eq('user_id', user.id)
      .is('responded_at', null)
      .eq('evaded', false)
      .lte('scheduled_for', nowIso)
      .gt('window_expires_at', nowIso)
      .order('scheduled_for', { ascending: false })
      .limit(1)
      .maybeSingle();
    setIntr((data as Intrusion) ?? null);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => { setNow(Date.now()); load(); }, 5000);
    return () => clearInterval(t);
  }, [load]);

  const respondText = async () => {
    if (!intr || !draft.trim()) return;
    setSubmitting(true);
    try {
      await supabase.from('mommy_intrusions').update({
        response_text: draft.trim(), responded_at: new Date().toISOString(),
      }).eq('id', intr.id);
      setDraft('');
      window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'intrusion', id: intr.id } }));
      await load();
    } finally { setSubmitting(false); }
  };

  const respondPhoto = async (file: File | null) => {
    if (!intr || !user?.id || !file) return;
    setSubmitting(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${user.id}/intrusion/${intr.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('verification-photos').upload(path, file, {
        contentType: file.type, upsert: false,
      });
      if (upErr) throw upErr;
      await supabase.from('mommy_intrusions').update({
        response_photo_url: path, responded_at: new Date().toISOString(),
      }).eq('id', intr.id);
      window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'intrusion', id: intr.id } }));
      await load();
    } finally { setSubmitting(false); }
  };

  if (!intr) return null;

  const msLeft = new Date(intr.window_expires_at).getTime() - now;
  const minLeft = Math.max(0, Math.floor(msLeft / 60000));
  const secLeft = Math.max(0, Math.floor((msLeft % 60000) / 1000));

  return (
    <div id="card-mommy-intrusion" style={{
      background: 'linear-gradient(135deg, #3a0f22 0%, #14060d 100%)',
      border: '2px solid #f4a7c4', borderRadius: 10, padding: 14, marginBottom: 16,
      boxShadow: '0 0 24px rgba(244,167,196,0.25)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f4a7c4" strokeWidth="2">
          <circle cx="12" cy="12" r="3" /><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#f4a7c4', fontWeight: 800 }}>
          Mama reached in
        </span>
        <span style={{
          fontSize: 12, color: msLeft < 120000 ? '#f47272' : '#f4a7c4', marginLeft: 'auto', fontWeight: 800, fontVariantNumeric: 'tabular-nums',
        }}>
          {minLeft}:{secLeft.toString().padStart(2, '0')}
        </span>
      </div>

      <p style={{ fontSize: 13.5, lineHeight: 1.5, color: '#f0d7e0', margin: '0 0 12px' }}>
        {intr.question_text}
      </p>

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Answer Mama…"
        rows={2}
        style={{
          width: '100%', boxSizing: 'border-box', resize: 'vertical',
          background: '#140609', border: '1px solid #7a1f3a', borderRadius: 6,
          color: '#f0d7e0', fontSize: 13, padding: '8px 10px', marginBottom: 8,
        }}
      />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={respondText}
          disabled={submitting || !draft.trim()}
          style={{
            fontSize: 12, fontWeight: 700, padding: '8px 14px', borderRadius: 6,
            border: 'none', cursor: 'pointer', background: '#f4a7c4', color: '#2a0a1a',
            opacity: submitting || !draft.trim() ? 0.5 : 1,
          }}
        >
          {submitting ? '…' : 'Answer'}
        </button>
        <label style={{
          fontSize: 12, fontWeight: 700, padding: '8px 14px', borderRadius: 6,
          border: '1px solid #f4a7c4', cursor: 'pointer', color: '#f4a7c4',
        }}>
          Show her
          <input
            type="file" accept="image/*" capture="environment"
            style={{ display: 'none' }}
            onChange={(e) => respondPhoto(e.target.files?.[0] ?? null)}
            disabled={submitting}
          />
        </label>
      </div>
    </div>
  );
}
