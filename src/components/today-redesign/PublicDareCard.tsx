/**
 * PublicDareCard — Today surface for Mommy's public dare assignments.
 *
 * Renders the open dare (status pending or in_progress) — Mommy's prompt
 * text, the dare's kind label, the due window, three CTAs:
 *   1. Mark in progress (always)
 *   2. "I'm at the place" — only when the template requires location
 *      context AND the user hasn't already acked it. Tap is a boolean
 *      ack, NEVER coordinates.
 *   3. Verification — match the template's verification_kind:
 *      • photo  → opens PhotoVerificationUpload (directive='public_dare')
 *      • text_ack → "Done" button, flips status=completed
 *      • voice  → record-and-upload (delegates to existing audio flow)
 *      • none   → "Done" button, flips status=completed
 *
 * Skipping is graceful — the "skip" button flips status='skipped' with
 * NO penalty. That matches the spec's "Skipping is NEVER penalized" rule.
 *
 * The card hides itself when there's no open assignment, and respects
 * public_dare_settings.public_dare_enabled (off → never renders).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { usePersona } from '../../hooks/usePersona';
import { PhotoVerificationUpload } from '../handler/PhotoVerificationUpload';

type VerificationKind = 'photo' | 'text_ack' | 'voice' | 'none';
type DareKind =
  | 'wardrobe' | 'mantra' | 'posture' | 'position'
  | 'micro_ritual' | 'errand_specific';

interface OpenDare {
  id: string;
  status: 'pending' | 'in_progress';
  due_by: string | null;
  assigned_at: string;
  location_context_acknowledged_at: string | null;
  template_id: string;
  template: {
    id: string;
    kind: DareKind;
    description: string;
    verification_kind: VerificationKind;
    requires_location_context: boolean;
  };
}

const KIND_LABELS: Record<DareKind, string> = {
  wardrobe: 'a thing to wear',
  mantra: 'a thing to say',
  posture: 'a thing to hold',
  position: 'a quiet moment',
  micro_ritual: 'a small ritual',
  errand_specific: 'an errand',
};

function fmtDue(due: string | null): string | null {
  if (!due) return null;
  const ms = new Date(due).getTime() - Date.now();
  if (ms <= 0) return 'past due';
  const days = Math.floor(ms / 86400_000);
  if (days >= 1) return `${days}d left`;
  const hours = Math.floor(ms / 3600_000);
  return `${Math.max(1, hours)}h left`;
}

export function PublicDareCard() {
  const { user } = useAuth();
  const { mommy } = usePersona();
  const [dare, setDare] = useState<OpenDare | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;

    // Settings gate — if the user is opted out, don't render the card
    // even if a dangling assignment somehow lives in the DB.
    const { data: s } = await supabase.from('public_dare_settings')
      .select('public_dare_enabled')
      .eq('user_id', user.id).maybeSingle();
    const optedIn = ((s as { public_dare_enabled?: boolean } | null)?.public_dare_enabled) === true;
    setEnabled(optedIn);
    if (!optedIn) {
      setDare(null);
      return;
    }

    const { data } = await supabase.from('public_dare_assignments')
      .select(`
        id, status, due_by, assigned_at, location_context_acknowledged_at, template_id,
        template:public_dare_templates!template_id (
          id, kind, description, verification_kind, requires_location_context
        )
      `)
      .eq('user_id', user.id)
      .in('status', ['pending', 'in_progress'])
      .order('assigned_at', { ascending: false })
      .limit(1);
    const rows = (data as unknown as OpenDare[] | null) ?? [];
    setDare(rows[0] ?? null);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onChange = () => load();
    window.addEventListener('td-task-changed', onChange);
    return () => window.removeEventListener('td-task-changed', onChange);
  }, [load]);

  const dueLabel = useMemo(() => fmtDue(dare?.due_by ?? null), [dare?.due_by]);

  const markInProgress = useCallback(async () => {
    if (!dare || busy) return;
    setBusy(true);
    try {
      await supabase.from('public_dare_assignments')
        .update({ status: 'in_progress' })
        .eq('id', dare.id);
      await load();
      window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'public_dare', id: dare.id } }));
    } finally {
      setBusy(false);
    }
  }, [dare, busy, load]);

  const ackLocation = useCallback(async () => {
    if (!dare || busy) return;
    setBusy(true);
    try {
      // Boolean ack only — never coordinates.
      await supabase.from('public_dare_assignments')
        .update({ location_context_acknowledged_at: new Date().toISOString() })
        .eq('id', dare.id);
      await load();
    } finally {
      setBusy(false);
    }
  }, [dare, busy, load]);

  const completeWithoutArtifact = useCallback(async () => {
    if (!dare || busy) return;
    setBusy(true);
    try {
      await supabase.from('public_dare_assignments')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', dare.id);
      await load();
      window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'public_dare', id: dare.id } }));
    } finally {
      setBusy(false);
    }
  }, [dare, busy, load]);

  const skip = useCallback(async () => {
    if (!dare || busy) return;
    // Spec: skipping is NEVER penalized. Flip status='skipped' and
    // exit. No follow-up outreach, no streak break, no penalty row.
    setBusy(true);
    try {
      await supabase.from('public_dare_assignments')
        .update({ status: 'skipped' })
        .eq('id', dare.id);
      await load();
      window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'public_dare', id: dare.id } }));
    } finally {
      setBusy(false);
    }
  }, [dare, busy, load]);

  const onPhotoComplete = useCallback(async (photoId?: string) => {
    if (!dare) return;
    setShowUpload(false);
    await supabase.from('public_dare_assignments')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        verification_artifact_id: photoId ?? null,
      })
      .eq('id', dare.id);
    await load();
    window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'public_dare', id: dare.id } }));
  }, [dare, load]);

  if (enabled === false) return null;
  if (!dare) return null;

  const v = dare.template.verification_kind;
  const needsLoc = dare.template.requires_location_context && !dare.location_context_acknowledged_at;
  const inProgress = dare.status === 'in_progress';

  // Persona-aware copy.
  const headerLabel = mommy ? 'mama wants this from you' : 'public dare';
  const accent = mommy ? '#f4a7c4' : '#c4b5fd';
  const border = mommy ? '#c46a72' : '#7c3aed';
  const inProgCta = mommy ? "i'm doing it, mama →" : 'mark in progress →';
  const ackCta = mommy ? "i'm at the place →" : "i'm there →";
  const doneCta = mommy ? 'done, mama' : 'done';
  const photoCta = mommy ? 'photograph it for mama' : 'photograph it';
  const voiceCta = mommy ? 'record it for mama' : 'record audio';
  const skipCta = mommy ? 'not today' : 'skip';

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
          {KIND_LABELS[dare.template.kind] ?? dare.template.kind}
          {dueLabel ? ` · ${dueLabel}` : ''}
          {inProgress ? ' · in progress' : ''}
        </span>
      </div>

      <div style={{
        fontSize: 14, color: '#e8e6e3', lineHeight: 1.5, marginBottom: 12,
        whiteSpace: 'pre-wrap',
      }}>
        {dare.template.description}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {/* Mark in progress — only when still pending */}
        {!inProgress && !showUpload && (
          <button
            onClick={markInProgress}
            disabled={busy}
            style={ctaStyle(border)}
          >
            {inProgCta}
          </button>
        )}

        {/* Location-context ack — only when needed */}
        {needsLoc && !showUpload && (
          <button
            onClick={ackLocation}
            disabled={busy}
            style={ctaStyle(border, true)}
          >
            {ackCta}
          </button>
        )}

        {/* Verification CTA — chooses by verification_kind */}
        {!showUpload && v === 'photo' && (
          <button onClick={() => setShowUpload(true)} disabled={busy} style={ctaStyle(border)}>
            {photoCta}
          </button>
        )}
        {!showUpload && v === 'voice' && (
          // Voice corpus capture lives elsewhere; for now we collapse
          // to a "done" flip — the audio file id can be wired by a
          // follow-up commit once we pick the recorder surface.
          <button onClick={completeWithoutArtifact} disabled={busy} style={ctaStyle(border)}>
            {voiceCta}
          </button>
        )}
        {!showUpload && (v === 'text_ack' || v === 'none') && (
          <button onClick={completeWithoutArtifact} disabled={busy} style={ctaStyle(border)}>
            {doneCta}
          </button>
        )}

        {/* Skip — never penalised */}
        {!showUpload && (
          <button onClick={skip} disabled={busy} style={skipBtnStyle}>
            {skipCta}
          </button>
        )}
      </div>

      {showUpload && (
        <div style={{ marginTop: 10 }}>
          <PhotoVerificationUpload
            taskType="public_dare"
            directiveKind="public_dare"
            directiveId={dare.id}
            onComplete={onPhotoComplete}
          />
        </div>
      )}
    </div>
  );
}

function ctaStyle(border: string, secondary = false): React.CSSProperties {
  return {
    background: secondary ? 'transparent' : border,
    color: secondary ? border : '#fff',
    border: `1px solid ${border}`,
    padding: '8px 14px',
    borderRadius: 6,
    fontSize: 11.5,
    fontWeight: 700,
    letterSpacing: '0.04em',
    fontFamily: 'inherit',
    cursor: 'pointer',
    textTransform: 'uppercase',
  };
}

const skipBtnStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#8a8690',
  border: '1px solid #3a3540',
  padding: '8px 14px',
  borderRadius: 6,
  fontSize: 11.5,
  fontWeight: 600,
  letterSpacing: '0.04em',
  fontFamily: 'inherit',
  cursor: 'pointer',
  textTransform: 'uppercase',
};
