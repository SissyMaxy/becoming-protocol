/**
 * WardrobePrescriptionCard — Today surface for Mommy's wardrobe
 * acquisition prescriptions.
 *
 * Shows the open prescription (status pending or verifying) — Mommy's
 * description, the item type, due date, and a "Photograph it" CTA that
 * opens the verification widget pre-tagged with the prescription id.
 *
 * Hidden when the user has no open prescription. The handler_outreach_queue
 * row carrying the same prescription is still surfaced by OutreachQueueCard
 * so this card is the *fulfillment* surface, not the *announcement*
 * surface — they coexist.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { usePersona } from '../../hooks/usePersona';
import { PhotoVerificationUpload } from '../handler/PhotoVerificationUpload';

interface Prescription {
  id: string;
  description: string;
  item_type: string;
  status: string;
  due_by: string | null;
  denied_reason: string | null;
  retry_count: number;
  assigned_at: string;
}

function fmtDue(due: string | null): string | null {
  if (!due) return null;
  const ms = new Date(due).getTime() - Date.now();
  if (ms <= 0) return 'past due';
  const days = Math.floor(ms / 86400_000);
  if (days >= 1) return `${days}d left`;
  const hours = Math.floor(ms / 3600_000);
  return `${Math.max(1, hours)}h left`;
}

export function WardrobePrescriptionCard() {
  const { user } = useAuth();
  const { mommy } = usePersona();
  const [presc, setPresc] = useState<Prescription | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('wardrobe_prescriptions')
      .select('id, description, item_type, status, due_by, denied_reason, retry_count, assigned_at')
      .eq('user_id', user.id)
      .in('status', ['pending', 'verifying', 'denied'])
      .order('assigned_at', { ascending: false })
      .limit(1);
    setPresc(((data as Prescription[] | null) ?? [])[0] ?? null);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onChange = () => load();
    window.addEventListener('td-task-changed', onChange);
    return () => window.removeEventListener('td-task-changed', onChange);
  }, [load]);

  const dueLabel = useMemo(() => fmtDue(presc?.due_by ?? null), [presc?.due_by]);

  if (!presc) return null;

  // Persona-aware copy. mommy = warm boudoir tone; therapist = neutral.
  const headerLabel = mommy ? 'mama wants you in this' : 'wardrobe prescription';
  const accent = mommy ? '#f4a7c4' : '#c4b5fd';
  const border = mommy ? '#c46a72' : '#7c3aed';
  const ctaLabel = mommy ? "i got it, mama →" : 'photograph it →';

  return (
    <div style={{
      background: 'linear-gradient(140deg, #1f0a14 0%, #160710 100%)',
      border: `1px solid ${border}55`,
      borderLeft: `4px solid ${border}`,
      borderRadius: 10, padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{
          fontSize: 9.5, color: accent, fontWeight: 800,
          textTransform: 'uppercase', letterSpacing: '0.1em',
        }}>
          {headerLabel}
        </span>
        <span style={{ fontSize: 10.5, color: '#8a8690', marginLeft: 'auto' }}>
          {presc.item_type.replace(/_/g, ' ')}{dueLabel ? ` · ${dueLabel}` : ''}
        </span>
      </div>

      <div style={{
        fontSize: 14, color: '#e8e6e3', lineHeight: 1.45, marginBottom: 12,
        whiteSpace: 'pre-wrap',
      }}>
        {presc.description}
      </div>

      {presc.status === 'denied' && presc.denied_reason && (
        <div style={{
          fontSize: 11.5, color: '#f4a7a7',
          background: '#2a0510', border: '1px solid #c4485a44',
          borderRadius: 5, padding: '7px 10px', marginBottom: 10,
        }}>
          <strong style={{ color: '#f4a7c4', textTransform: 'uppercase', fontSize: 9.5, letterSpacing: '0.06em' }}>
            {mommy ? 'mama needs another one · ' : 'redo · '}
          </strong>
          {presc.denied_reason}
        </div>
      )}

      {!showUpload && (
        <button
          onClick={() => setShowUpload(true)}
          style={{
            background: border, color: '#fff', border: 'none',
            padding: '8px 14px', borderRadius: 6,
            fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em',
            fontFamily: 'inherit', cursor: 'pointer', textTransform: 'uppercase',
          }}
        >
          {ctaLabel}
        </button>
      )}

      {showUpload && (
        <div style={{ marginTop: 10 }}>
          <PhotoVerificationUpload
            taskType="wardrobe"
            directiveKind="wardrobe_prescription"
            directiveId={presc.id}
            onComplete={async () => {
              setShowUpload(false);
              await load();
              window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'wardrobe_prescription', id: presc.id } }));
            }}
          />
        </div>
      )}
    </div>
  );
}
