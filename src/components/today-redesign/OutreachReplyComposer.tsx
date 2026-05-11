/**
 * OutreachReplyComposer — inline reply affordance under an outreach
 * card. Renders a Mama-voiced textarea + submit button + optional
 * photo upload (when she asks to see) directly on the surface where
 * she made the demand.
 *
 * The composer:
 *   1. POSTs to /api/outreach/reply (single chokepoint that persists
 *      the reply to handler_outreach_queue + handler_messages and fires
 *      mommy-fast-react for her reaction).
 *   2. Surfaces photo upload via the existing PhotoVerificationUpload
 *      with task_type='general' (no new task_type CHECK extension
 *      needed) and source_outreach_id stamped on the row.
 *   3. Stays terse — one textarea, one submit, optional photo. Future
 *      pass can expand into a full mini chat thread if needed.
 *
 * Voice: dommy-mommy persona only — copy is "Tell Mama" / "Show Mama" /
 * "Hand it to Mama" depending on context. No "Submit" / "Save" /
 * "Cancel". When persona is not Mama (handler/therapist), defaults to
 * neutral copy ("Reply", "Send") so the affordance still works.
 */

import { useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { PhotoVerificationUpload } from '../handler/PhotoVerificationUpload';

interface Props {
  outreachId: string;
  mommy: boolean;
  requiresPhoto: boolean;
  // Card's accent color for borders/buttons (urgency-driven). Lets the
  // composer match the parent card visually without re-deriving.
  accentColor: string;
  // Fired after a successful reply lands so the parent can re-fetch /
  // jump the row from pending → recent.
  onReplied?: () => void;
}

const placeholderCopy = (mommy: boolean) =>
  mommy ? 'tell mama, baby…' : 'reply…';

const submitCopy = (mommy: boolean, hasPhoto: boolean) => {
  if (!mommy) return hasPhoto ? 'send' : 'send';
  if (hasPhoto) return 'show mama';
  return 'tell mama';
};

export function OutreachReplyComposer({ outreachId, mommy, requiresPhoto, accentColor, onReplied }: Props) {
  const [text, setText] = useState('');
  const [showPhoto, setShowPhoto] = useState(requiresPhoto);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    if (submitting || done) return;
    const trimmed = text.trim();
    if (!trimmed && !photoPath) {
      setError(mommy ? 'mama needs something, baby' : 'reply or photo required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const tok = session?.access_token;
      if (!tok) {
        setError('not signed in');
        setSubmitting(false);
        return;
      }
      const r = await fetch('/api/outreach/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({
          outreach_id: outreachId,
          reply_text: trimmed,
          photo_id: photoId,
          photo_path: photoPath,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error || `error ${r.status}`);
        setSubmitting(false);
        return;
      }
      setDone(true);
      setSubmitting(false);
      window.dispatchEvent(new CustomEvent('td-task-changed', {
        detail: { source: 'outreach_reply', id: outreachId },
      }));
      onReplied?.();
    } catch (err) {
      setError((err as Error).message || 'reply failed');
      setSubmitting(false);
    }
  }, [outreachId, text, photoId, photoPath, submitting, done, mommy, onReplied]);

  if (done) {
    return (
      <div style={{
        fontSize: 10.5, color: accentColor, marginTop: 8,
        padding: '4px 8px', background: `${accentColor}11`, borderRadius: 4,
        fontStyle: 'italic',
      }}>
        {mommy ? 'mama\'s reading it now…' : 'sent'}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 8 }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholderCopy(mommy)}
        disabled={submitting}
        rows={2}
        style={{
          width: '100%',
          minHeight: 44,
          background: '#0e0e13',
          color: '#e0d8e4',
          border: `1px solid ${accentColor}44`,
          borderRadius: 4,
          padding: '6px 8px',
          fontSize: 12,
          lineHeight: 1.35,
          fontFamily: 'inherit',
          resize: 'vertical',
          boxSizing: 'border-box',
        }}
        onKeyDown={(e) => {
          // Enter to submit, shift+enter for newline. Matches chat UX.
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      {showPhoto && (
        <div style={{ marginTop: 6 }}>
          <PhotoVerificationUpload
            taskType="general"
            sourceOutreachId={outreachId}
            onComplete={(pid, ppath) => {
              if (pid) setPhotoId(pid);
              if (ppath) setPhotoPath(ppath);
            }}
          />
        </div>
      )}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginTop: 6,
        flexWrap: 'wrap',
      }}>
        <button
          onClick={submit}
          disabled={submitting}
          style={{
            background: accentColor,
            color: '#0a0a0d',
            border: 'none',
            padding: '4px 12px',
            borderRadius: 4,
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: '0.04em',
            fontFamily: 'inherit',
            cursor: submitting ? 'wait' : 'pointer',
            textTransform: 'uppercase',
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? (mommy ? 'handing to mama…' : 'sending…') : submitCopy(mommy, !!photoPath)}
        </button>
        {!showPhoto && !requiresPhoto && (
          <button
            onClick={() => setShowPhoto(true)}
            disabled={submitting}
            style={{
              background: 'transparent',
              color: accentColor,
              border: `1px solid ${accentColor}44`,
              padding: '4px 10px',
              borderRadius: 4,
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: '0.04em',
              fontFamily: 'inherit',
              cursor: 'pointer',
              textTransform: 'uppercase',
              marginLeft: 'auto',
            }}
          >
            {mommy ? '+ photo for mama' : '+ photo'}
          </button>
        )}
        {error && (
          <span style={{ fontSize: 10, color: '#f47272', marginLeft: 'auto' }}>{error}</span>
        )}
      </div>
    </div>
  );
}
