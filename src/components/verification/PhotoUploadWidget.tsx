/**
 * PhotoUploadWidget — drop-in upload + analyze surface for verification photos.
 *
 * Used from any "verify" CTA: arousal_touch_tasks (mantra/pose/mirror),
 * handler_decrees with photo proof, body_feminization_directives,
 * daily_outfit_mandates, freeform "send Mama a photo" buttons.
 *
 * Differs from the legacy PhotoVerificationUpload component:
 * - Persona-aware copy (Mama-voice when handler_persona='dommy_mommy').
 * - Pre-submit "Mama will see this" notice + cancel.
 * - Inline preview + retake before commit.
 * - Records directive_id / directive_kind / verification_type so the vault
 *   detail view can show what was being verified.
 * - Uses the new review_state column (NULL → 'pending' → 'approved'/'denied').
 *
 * The legacy component stays in place for the chat-thread upload flow until
 * it's migrated separately.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { usePersona } from '../../hooks/usePersona';
import { useHandlerVoice } from '../../hooks/useHandlerVoice';
import {
  TASK_TYPE_FOR,
  buildStoragePath,
  analyzeAndPersist,
  type DirectiveKind,
  type VerificationType,
} from '../../lib/verification/upload';

type MediaKind = 'photo' | 'video' | 'audio' | 'any';

interface PhotoUploadWidgetProps {
  verificationType: VerificationType;
  directiveId?: string;
  directiveKind?: DirectiveKind;
  directiveSnippet?: string;
  /**
   * What media kind to accept. Defaults to 'any' so a widget mounted
   * for a 'photo' decree still accepts video/audio uploads (Mama can
   * grade them) — that was the 2026-05-15 incident: photo-only widget
   * refused video. To restrict to one kind, pass it explicitly.
   */
  mediaKind?: MediaKind;
  onComplete?: (result: { photoId: string; analysis: string; reviewState: string }) => void;
  onCancel?: () => void;
}

function acceptForKind(kind: MediaKind): string {
  switch (kind) {
    case 'video': return 'video/*';
    case 'audio': return 'audio/*';
    case 'photo': return 'image/*';
    case 'any':   return 'image/*,video/*,audio/*';
  }
}

function captureForKind(kind: MediaKind): 'user' | 'environment' | undefined {
  switch (kind) {
    case 'video': return 'user';
    case 'photo': return 'environment';
    case 'audio': return undefined;
    case 'any':   return undefined;
  }
}

function mediaTypeFromFile(file: File): 'photo' | 'video' | 'audio' {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'photo';
}

export function PhotoUploadWidget({
  verificationType,
  directiveId,
  directiveKind,
  directiveSnippet,
  mediaKind = 'any',
  onComplete,
  onCancel,
}: PhotoUploadWidgetProps) {
  const { user } = useAuth();
  const { mommy } = usePersona();
  const voice = useHandlerVoice();
  const fileRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [stage, setStage] = useState<'idle' | 'uploading' | 'analyzing' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [reviewState, setReviewState] = useState<string | null>(null);

  // Revoke object URLs on unmount to avoid leaks
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const pickFile = (f: File) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = URL.createObjectURL(f);
    previewUrlRef.current = url;
    setFile(f);
    setPreviewUrl(url);
    setError(null);
  };

  const retake = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setFile(null);
    setPreviewUrl(null);
    setAnalysis(null);
    setReviewState(null);
    setStage('idle');
    if (fileRef.current) fileRef.current.value = '';
  };

  const submit = useCallback(async () => {
    if (!user?.id || !file) return;
    setStage('uploading');
    setError(null);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = buildStoragePath(user.id, ext);
      const { error: upErr, data: upData } = await supabase.storage
        .from('verification-photos')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      // Persist the storage path; verification-photos is private post-301,
      // signed at render via getSignedAssetUrl.
      const photoPath = upData.path;

      const taskType = TASK_TYPE_FOR[verificationType];
      const mt = mediaTypeFromFile(file);
      const { data: row, error: insErr } = await supabase
        .from('verification_photos')
        .insert({
          user_id: user.id,
          task_type: taskType,
          verification_type: verificationType,
          directive_id: directiveId ?? null,
          directive_kind: directiveKind ?? null,
          directive_snippet: directiveSnippet ?? null,
          photo_url: photoPath,
          media_type: mt,
          caption: caption.trim() || null,
          review_state: 'pending',
        })
        .select('id')
        .single();
      if (insErr) throw insErr;

      // Vision analysis only runs for images. Video/audio get filed as
      // pending evidence; Mama scores async via existing review flows.
      if (mt === 'photo') {
        setStage('analyzing');
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        const { analysis: analysisText, reviewState: finalReview } = await analyzeAndPersist(
          supabase,
          {
            photoId: row.id,
            photoUrl: photoPath,
            taskType,
            caption,
            userId: user.id,
            accessToken: token ?? '',
          },
        );
        setAnalysis(analysisText);
        setReviewState(finalReview);
        setStage('done');
        onComplete?.({ photoId: row.id, analysis: analysisText, reviewState: finalReview });
      } else {
        const confirmText = mt === 'video'
          ? "Mama's got the video. She'll watch it when she's ready, baby."
          : "Mama's got the recording. She'll listen when she's ready, baby.";
        setAnalysis(confirmText);
        setReviewState('pending');
        setStage('done');
        onComplete?.({ photoId: row.id, analysis: confirmText, reviewState: 'pending' });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStage('error');
    }
  }, [user?.id, file, verificationType, directiveId, directiveKind, directiveSnippet, caption, onComplete]);

  const palette = mommy
    ? { accent: '#f4a7c4', bg: 'linear-gradient(135deg, #1a0f2e 0%, #1a0820 100%)', border: '#5d2d4a' }
    : { accent: '#c4b5fd', bg: 'linear-gradient(135deg, #14101e 0%, #0f0820 100%)', border: '#2d1a4d' };

  const speakerLabel = mommy ? 'Mama' : 'the Handler';
  const noticeText = mommy
    ? 'Mama is going to see this. Cancel if you’re not ready.'
    : 'The Handler will analyze this photo. Cancel if you’re not ready.';
  const promptText = mommy
    ? 'Send Mama a photo, baby.'
    : 'Submit photo for verification.';
  const waitingText = mommy ? 'Mama is looking…' : 'Handler is analyzing…';
  const readyHint =
    verificationType === 'wardrobe_acquisition' ? 'Show the item on you, full frame.'
    : verificationType === 'posture_check' ? 'Full body, mirror, posture visible.'
    : verificationType === 'mirror_affirmation' ? 'Mirror selfie. Face visible.'
    : verificationType === 'mantra_recitation' ? 'Face visible while you say it.'
    : verificationType === 'pose_hold' ? 'Hold the pose. Show the whole pose.'
    : 'Whatever you want Mama to see.';

  return (
    <div
      data-testid="photo-upload-widget"
      style={{
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 10,
        padding: 14,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span
          style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.09em',
            color: palette.accent,
            fontWeight: 700,
          }}
        >
          {verificationType.replace('_', ' ')}
        </span>
        {directiveSnippet && (
          <span
            style={{
              fontSize: 10,
              color: '#8a8690',
              fontStyle: 'italic',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 240,
            }}
            title={directiveSnippet}
          >
            {directiveSnippet}
          </span>
        )}
      </div>

      {/* Pre-capture notice — privacy / consent ─────────────────────────── */}
      {stage === 'idle' && !previewUrl && (
        <div
          style={{
            background: '#0a0a0d',
            border: '1px solid #2d1a4d',
            borderRadius: 7,
            padding: 10,
            marginBottom: 10,
            fontSize: 11,
            color: '#c4b5fd',
            lineHeight: 1.4,
          }}
        >
          {noticeText} {readyHint}
        </div>
      )}

      {/* File picker ─────────────────────────────────────────────────────── */}
      <input
        ref={fileRef}
        type="file"
        accept={acceptForKind(mediaKind)}
        capture={captureForKind(mediaKind)}
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pickFile(f);
        }}
      />

      {/* Pre-submit preview ──────────────────────────────────────────────── */}
      {previewUrl && stage !== 'done' && (
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              position: 'relative',
              background: '#000',
              borderRadius: 7,
              overflow: 'hidden',
              maxHeight: 360,
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            {file && file.type.startsWith('video/') ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                src={previewUrl}
                controls
                playsInline
                style={{ maxWidth: '100%', maxHeight: 360 }}
              />
            ) : file && file.type.startsWith('audio/') ? (
              <audio
                src={previewUrl}
                controls
                style={{ width: '100%', padding: 8 }}
              />
            ) : (
              <img
                src={previewUrl}
                alt="preview"
                style={{ maxWidth: '100%', maxHeight: 360, objectFit: 'contain' }}
              />
            )}
          </div>
          <input
            type="text"
            placeholder={mommy ? 'optional caption (what you want Mama to know)' : 'optional caption'}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            disabled={stage !== 'idle'}
            style={{
              width: '100%',
              background: '#111116',
              border: '1px solid #22222a',
              borderRadius: 5,
              padding: 8,
              color: '#e8e6e3',
              fontSize: 12,
              marginTop: 8,
              fontFamily: 'inherit',
            }}
          />
        </div>
      )}

      {/* Action buttons ──────────────────────────────────────────────────── */}
      {stage === 'idle' && !previewUrl && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 7,
              border: 'none',
              background: palette.accent,
              color: '#0a0a0d',
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            📸 {promptText}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '10px 12px',
                borderRadius: 7,
                border: '1px solid #22222a',
                background: 'transparent',
                color: '#8a8690',
                fontSize: 11,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              not now
            </button>
          )}
        </div>
      )}

      {stage === 'idle' && previewUrl && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={retake}
            style={{
              padding: '8px 12px',
              borderRadius: 5,
              border: '1px solid #22222a',
              background: 'transparent',
              color: '#8a8690',
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            retake
          </button>
          <button
            type="button"
            onClick={submit}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 5,
              border: 'none',
              background: palette.accent,
              color: '#0a0a0d',
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            send to {speakerLabel}
          </button>
        </div>
      )}

      {/* Waiting state ───────────────────────────────────────────────────── */}
      {(stage === 'uploading' || stage === 'analyzing') && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            background: '#0a0a0d',
            borderRadius: 7,
            color: palette.accent,
            fontSize: 12,
            fontStyle: 'italic',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: palette.accent,
              animation: 'pulse 1.4s ease-in-out infinite',
            }}
          />
          {stage === 'uploading' ? 'uploading…' : waitingText}
        </div>
      )}

      {/* Error ───────────────────────────────────────────────────────────── */}
      {stage === 'error' && (
        <div
          style={{
            color: '#f47272',
            fontSize: 12,
            background: '#1f0a0a',
            border: '1px solid #5d2020',
            borderRadius: 5,
            padding: 8,
            marginTop: 6,
          }}
        >
          {error || 'something went wrong'}
          <button
            type="button"
            onClick={() => setStage('idle')}
            style={{
              marginLeft: 8,
              background: 'none',
              border: 'none',
              color: '#f4a7a7',
              fontSize: 11,
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          >
            try again
          </button>
        </div>
      )}

      {/* Done — show analysis ───────────────────────────────────────────── */}
      {stage === 'done' && analysis && (
        <div style={{ marginTop: 4 }}>
          {previewUrl && (
            <img
              src={previewUrl}
              alt="submitted"
              style={{
                maxWidth: '100%',
                maxHeight: 200,
                borderRadius: 6,
                marginBottom: 10,
                opacity: 0.85,
                objectFit: 'contain',
                display: 'block',
              }}
            />
          )}
          <div
            style={{
              background: '#0a0a0d',
              border: `1px solid ${palette.border}`,
              borderRadius: 7,
              padding: 12,
              fontSize: 13,
              color: '#e8e6e3',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
            }}
          >
            {analysis}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 8,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                padding: '3px 8px',
                borderRadius: 4,
                background:
                  reviewState === 'approved' ? '#1a3d2a'
                  : reviewState === 'denied' ? '#3d1a1a'
                  : reviewState === 'redo_requested' ? '#3d2d1a'
                  : '#22222a',
                color:
                  reviewState === 'approved' ? '#5fc88f'
                  : reviewState === 'denied' ? '#f47272'
                  : reviewState === 'redo_requested' ? '#f4c272'
                  : '#8a8690',
              }}
            >
              {reviewState ?? 'pending'}
            </span>
            {/* TTS play — only enabled if voice mode is on */}
            {voice.enabled && (
              <button
                type="button"
                onClick={() => voice.speak(analysis)}
                disabled={voice.isPlaying}
                style={{
                  padding: '4px 10px',
                  borderRadius: 5,
                  border: `1px solid ${palette.border}`,
                  background: 'transparent',
                  color: palette.accent,
                  fontSize: 11,
                  cursor: voice.isPlaying ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                  opacity: voice.isPlaying ? 0.5 : 1,
                }}
              >
                {voice.isPlaying ? '▶ playing…' : `▶ hear ${speakerLabel}`}
              </button>
            )}
            {reviewState === 'denied' || reviewState === 'redo_requested' ? (
              <button
                type="button"
                onClick={retake}
                style={{
                  padding: '4px 10px',
                  borderRadius: 5,
                  border: 'none',
                  background: palette.accent,
                  color: '#0a0a0d',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                retake & resubmit
              </button>
            ) : (
              <button
                type="button"
                onClick={onCancel ?? retake}
                style={{
                  padding: '4px 10px',
                  borderRadius: 5,
                  border: '1px solid #22222a',
                  background: 'transparent',
                  color: '#8a8690',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                done
              </button>
            )}
          </div>
        </div>
      )}

      {/* Inline keyframes for the pulsing dot */}
      <style>{`
        @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.35 } }
      `}</style>
    </div>
  );
}
