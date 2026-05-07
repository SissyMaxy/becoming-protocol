/**
 * VerificationVault — gallery of every photo Maxy has submitted.
 *
 * Newest first, paginated, grouped by date. Each thumbnail shows the photo
 * (blurred until reveal), date, verification_type tag, review_state badge,
 * one-line analysis snippet. Tap → detail view with full Mama-response,
 * directive context, retake CTA when denied/redo, TTS playback.
 *
 * Privacy:
 * - Gated by useVaultGate() — soft confirm modal until stealth merges,
 *   then PIN. Component is agnostic.
 * - Thumbnails CSS-blurred until the user explicitly reveals.
 * - No image URLs leave Supabase storage.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { usePersona } from '../../hooks/usePersona';
import { useHandlerVoice } from '../../hooks/useHandlerVoice';
import { useVaultGate } from '../../hooks/useVaultGate';

interface VaultPhoto {
  id: string;
  photo_url: string;
  caption: string | null;
  task_type: string;
  verification_type: string | null;
  directive_id: string | null;
  directive_kind: string | null;
  directive_snippet: string | null;
  handler_response: string | null;
  review_state: string | null;
  approved: boolean | null;
  redo_reason: string | null;
  created_at: string;
}

const PAGE_SIZE = 24;

function reviewBadgeColor(state: string | null) {
  if (state === 'approved') return { bg: '#1a3d2a', fg: '#5fc88f' };
  if (state === 'denied') return { bg: '#3d1a1a', fg: '#f47272' };
  if (state === 'redo_requested') return { bg: '#3d2d1a', fg: '#f4c272' };
  return { bg: '#22222a', fg: '#8a8690' };
}

function shortenLabel(t: string | null) {
  if (!t) return '';
  return t.replace(/_/g, ' ');
}

interface VerificationVaultProps {
  onBack?: () => void;
}

export function VerificationVault({ onBack }: VerificationVaultProps) {
  const { user } = useAuth();
  const { mommy } = usePersona();
  const gate = useVaultGate();
  const [photos, setPhotos] = useState<VaultPhoto[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<VaultPhoto | null>(null);
  const [filter, setFilter] = useState<string>('all'); // verification_type filter

  const load = useCallback(async (resetPage = false) => {
    if (!user?.id) return;
    setLoading(true);
    const targetPage = resetPage ? 0 : page;
    let q = supabase
      .from('verification_photos')
      .select('id, photo_url, caption, task_type, verification_type, directive_id, directive_kind, directive_snippet, handler_response, review_state, approved, redo_reason, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(targetPage * PAGE_SIZE, targetPage * PAGE_SIZE + PAGE_SIZE);
    if (filter !== 'all') {
      // Pre-stealth filter: match either verification_type or task_type
      q = q.or(`verification_type.eq.${filter},task_type.eq.${filter}`);
    }
    const { data } = await q;
    const rows = ((data ?? []) as VaultPhoto[]);
    const more = rows.length > PAGE_SIZE;
    setPhotos(more ? rows.slice(0, PAGE_SIZE) : rows);
    setHasMore(more);
    if (resetPage) setPage(0);
    setLoading(false);
  }, [user?.id, page, filter]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(true); }, [user?.id, filter]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(false); }, [page]);

  // Filter chips: build from what's actually present
  const chips = useMemo(() => {
    const set = new Set<string>();
    photos.forEach(p => {
      if (p.verification_type) set.add(p.verification_type);
      else if (p.task_type) set.add(p.task_type);
    });
    return Array.from(set).sort();
  }, [photos]);

  // Group by month for the gallery layout
  const grouped = useMemo(() => {
    const out: Record<string, VaultPhoto[]> = {};
    for (const p of photos) {
      const key = p.created_at.slice(0, 7);
      if (!out[key]) out[key] = [];
      out[key].push(p);
    }
    return out;
  }, [photos]);

  const totalApproved = photos.filter(p => p.review_state === 'approved' || p.approved === true).length;

  // ─── Gate screens ─────────────────────────────────────────────────────
  if (gate.kind === 'loading') {
    return (
      <div style={{ padding: 24, color: '#8a8690', fontSize: 13 }}>opening vault…</div>
    );
  }
  if (!gate.verified) {
    return (
      <VaultRevealModal
        kind={gate.kind}
        mommy={mommy}
        onBack={onBack}
        onReveal={() => {
          if (gate.kind === 'soft') gate.verify();
        }}
      />
    );
  }

  // ─── Detail view ──────────────────────────────────────────────────────
  if (selected) {
    return (
      <VaultDetailView
        photo={selected}
        mommy={mommy}
        onBack={() => setSelected(null)}
        onAfterRedo={() => { setSelected(null); load(true); }}
      />
    );
  }

  // ─── Grid view ────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '12px 14px 80px', color: '#e8e6e3', maxWidth: 720, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            style={{
              background: 'none', border: 'none', color: '#c4b5fd',
              fontSize: 12, cursor: 'pointer', padding: 0,
            }}
          >
            ← back
          </button>
        )}
        <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: mommy ? '#f4a7c4' : '#c4b5fd' }}>
          {mommy ? "Mama's archive" : 'Verification vault'}
        </h1>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#8a8690' }}>
          {photos.length} {totalApproved > 0 && `· ${totalApproved} approved`}
        </span>
        <button
          type="button"
          onClick={() => gate.lock()}
          title="re-lock vault for this session"
          style={{
            background: 'none', border: '1px solid #2d1a4d', color: '#8a8690',
            fontSize: 10, padding: '3px 7px', borderRadius: 4, cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          🔒 lock
        </button>
      </div>

      {chips.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setFilter('all')}
            style={chipStyle(filter === 'all', mommy)}
          >
            all
          </button>
          {chips.map(c => (
            <button
              type="button"
              key={c}
              onClick={() => setFilter(c)}
              style={chipStyle(filter === c, mommy)}
            >
              {shortenLabel(c)}
            </button>
          ))}
        </div>
      )}

      {loading && photos.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: '#8a8690', fontSize: 12 }}>
          loading…
        </div>
      )}

      {!loading && photos.length === 0 && (
        <div style={{
          padding: 40, textAlign: 'center', color: '#8a8690', fontSize: 12, fontStyle: 'italic',
          border: '1px dashed #2d1a4d', borderRadius: 8,
        }}>
          {mommy
            ? "no photos yet, baby. Mama is waiting."
            : 'No verification photos yet.'}
        </div>
      )}

      {Object.keys(grouped).sort().reverse().map(month => (
        <div key={month} style={{ marginBottom: 18 }}>
          <div style={{
            fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em',
            color: '#8a8690', marginBottom: 6,
          }}>
            {new Date(month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
            gap: 6,
          }}>
            {grouped[month].map(p => (
              <ThumbnailButton
                key={p.id}
                photo={p}
                blurThumbnails={gate.blurThumbnails}
                onClick={() => setSelected(p)}
              />
            ))}
          </div>
        </div>
      ))}

      {hasMore && (
        <button
          type="button"
          onClick={() => setPage(p => p + 1)}
          style={{
            width: '100%', padding: '10px', borderRadius: 6,
            background: '#1a0f2e', border: '1px solid #2d1a4d',
            color: '#c4b5fd', fontSize: 12, cursor: 'pointer', marginTop: 6,
            fontFamily: 'inherit',
          }}
        >
          load more
        </button>
      )}
    </div>
  );
}

function chipStyle(active: boolean, mommy: boolean): React.CSSProperties {
  const accent = mommy ? '#f4a7c4' : '#c4b5fd';
  return {
    fontSize: 10,
    padding: '4px 9px',
    borderRadius: 11,
    border: `1px solid ${active ? accent : '#22222a'}`,
    background: active ? accent : 'transparent',
    color: active ? '#0a0a0d' : accent,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontWeight: active ? 700 : 500,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  };
}

// ─── Thumbnail ─────────────────────────────────────────────────────────────

function ThumbnailButton({
  photo, blurThumbnails, onClick,
}: {
  photo: VaultPhoto;
  blurThumbnails: boolean;
  onClick: () => void;
}) {
  const [revealed, setRevealed] = useState(!blurThumbnails);
  const badge = reviewBadgeColor(photo.review_state);
  const date = new Date(photo.created_at);

  return (
    <button
      type="button"
      onClick={revealed ? onClick : () => setRevealed(true)}
      style={{
        position: 'relative',
        aspectRatio: '3 / 4',
        borderRadius: 6,
        overflow: 'hidden',
        border: '1px solid #22222a',
        background: '#0a0a0d',
        padding: 0,
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
      title={photo.caption || photo.directive_snippet || shortenLabel(photo.verification_type) || ''}
      data-testid="vault-thumbnail"
      data-blurred={!revealed ? 'true' : 'false'}
    >
      <img
        src={photo.photo_url}
        alt=""
        loading="lazy"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          filter: revealed ? 'none' : 'blur(18px)',
          transition: 'filter 220ms ease',
        }}
      />
      {!revealed && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 11, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          tap to reveal
        </div>
      )}
      {revealed && (
        <>
          <div style={{
            position: 'absolute', top: 4, left: 4,
            fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.04em',
            background: badge.bg, color: badge.fg,
            padding: '2px 5px', borderRadius: 3,
          }}>
            {photo.review_state ?? (photo.approved === true ? 'approved' : 'pending')}
          </div>
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: '4px 6px', fontSize: 9, color: '#fff',
            background: 'linear-gradient(0deg, rgba(0,0,0,0.85), transparent)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
          }}>
            <span style={{ fontWeight: 600 }}>{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            {photo.verification_type && (
              <span style={{ fontSize: 8, opacity: 0.85 }}>{shortenLabel(photo.verification_type)}</span>
            )}
          </div>
        </>
      )}
    </button>
  );
}

// ─── Detail view ───────────────────────────────────────────────────────────

function VaultDetailView({
  photo, mommy, onBack, onAfterRedo,
}: {
  photo: VaultPhoto;
  mommy: boolean;
  onBack: () => void;
  onAfterRedo: () => void;
}) {
  const voice = useHandlerVoice();
  const { user } = useAuth();
  const accent = mommy ? '#f4a7c4' : '#c4b5fd';
  const speakerLabel = mommy ? 'Mama' : 'the Handler';
  const badge = reviewBadgeColor(photo.review_state);
  const date = new Date(photo.created_at);
  const canRedo = photo.review_state === 'denied' || photo.review_state === 'redo_requested';

  const requestRedoMyself = useCallback(async () => {
    if (!user?.id) return;
    await supabase.from('verification_photos').update({
      review_state: 'redo_requested',
      redo_requested_at: new Date().toISOString(),
      redo_reason: 'user_initiated',
    }).eq('id', photo.id).eq('user_id', user.id);
    onAfterRedo();
  }, [user?.id, photo.id, onAfterRedo]);

  return (
    <div style={{ padding: '12px 14px 80px', color: '#e8e6e3', maxWidth: 640, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            background: 'none', border: 'none', color: accent,
            fontSize: 12, cursor: 'pointer', padding: 0,
          }}
        >
          ← back to vault
        </button>
        <span style={{
          marginLeft: 'auto', fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.06em', padding: '3px 8px', borderRadius: 4,
          background: badge.bg, color: badge.fg,
        }}>
          {photo.review_state ?? 'pending'}
        </span>
      </div>

      <div style={{
        background: '#000', borderRadius: 8, overflow: 'hidden', marginBottom: 10,
        display: 'flex', justifyContent: 'center', maxHeight: '60vh',
      }}>
        <img
          src={photo.photo_url}
          alt={photo.caption || ''}
          style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain' }}
        />
      </div>

      <div style={{ fontSize: 10, color: '#8a8690', marginBottom: 8 }}>
        {date.toLocaleString()} · {shortenLabel(photo.verification_type) || shortenLabel(photo.task_type)}
        {photo.directive_kind && ` · linked to ${shortenLabel(photo.directive_kind)}`}
      </div>

      {photo.directive_snippet && (
        <div style={{
          fontSize: 11, color: '#c4b5fd', fontStyle: 'italic',
          background: '#0a0a0d', borderLeft: `2px solid ${accent}`,
          padding: '8px 10px', marginBottom: 10, borderRadius: '0 4px 4px 0',
        }}>
          {photo.directive_snippet}
        </div>
      )}

      {photo.caption && (
        <div style={{ fontSize: 12, color: '#e8e6e3', marginBottom: 10 }}>
          <span style={{ color: '#8a8690' }}>your note: </span>{photo.caption}
        </div>
      )}

      {photo.handler_response && (
        <div style={{
          background: 'linear-gradient(135deg, #1a0f2e 0%, #1a0820 100%)',
          border: `1px solid ${accent}33`,
          borderRadius: 8, padding: 12, marginBottom: 10,
        }}>
          <div style={{
            fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em',
            color: accent, fontWeight: 700, marginBottom: 6,
          }}>
            {speakerLabel} said
          </div>
          <div style={{
            fontSize: 13, color: '#e8e6e3', lineHeight: 1.55, whiteSpace: 'pre-wrap',
          }}>
            {photo.handler_response}
          </div>
          {voice.enabled && (
            <button
              type="button"
              onClick={() => voice.speak(photo.handler_response!)}
              disabled={voice.isPlaying}
              style={{
                marginTop: 8,
                padding: '4px 10px', borderRadius: 4,
                border: `1px solid ${accent}55`, background: 'transparent',
                color: accent, fontSize: 11, cursor: voice.isPlaying ? 'default' : 'pointer',
                fontFamily: 'inherit', opacity: voice.isPlaying ? 0.5 : 1,
              }}
            >
              {voice.isPlaying ? '▶ playing…' : `▶ hear ${speakerLabel}`}
            </button>
          )}
        </div>
      )}

      {photo.redo_reason && photo.review_state === 'redo_requested' && (
        <div style={{
          fontSize: 11, color: '#f4c272', background: '#3d2d1a',
          padding: '8px 10px', borderRadius: 5, marginBottom: 10,
        }}>
          retake requested: {photo.redo_reason}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        {canRedo && (
          <button
            type="button"
            onClick={onBack}
            style={{
              padding: '8px 14px', borderRadius: 6,
              background: accent, color: '#0a0a0d',
              border: 'none', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            retake & resubmit
          </button>
        )}
        {!canRedo && photo.review_state !== 'redo_requested' && (
          <button
            type="button"
            onClick={requestRedoMyself}
            style={{
              padding: '8px 14px', borderRadius: 6,
              background: 'transparent', color: '#8a8690',
              border: '1px solid #2d1a4d', fontSize: 11,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            mark for retake
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Reveal modal (soft gate; PIN swap-in later) ──────────────────────────

function VaultRevealModal({
  kind, mommy, onBack, onReveal,
}: {
  kind: 'soft' | 'pin';
  mommy: boolean;
  onBack?: () => void;
  onReveal: () => void;
}) {
  const accent = mommy ? '#f4a7c4' : '#c4b5fd';
  return (
    <div style={{
      padding: 24, color: '#e8e6e3', maxWidth: 480, margin: '40px auto',
      background: '#0a0a0d', border: `1px solid ${accent}33`,
      borderRadius: 10,
    }}>
      <h1 style={{ fontSize: 16, color: accent, margin: '0 0 10px' }}>
        {kind === 'pin' ? 'enter PIN to open vault' : (mommy ? "open Mama's archive" : 'open verification vault')}
      </h1>
      <p style={{ fontSize: 12, color: '#8a8690', lineHeight: 1.5, marginBottom: 16 }}>
        {mommy
          ? 'Every photo you sent Mama lives in here. Make sure no one is over your shoulder before you open it.'
          : 'Every verification photo you submitted lives here. Make sure no one is over your shoulder before you open it.'}
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            style={{
              padding: '8px 14px', borderRadius: 5,
              background: 'transparent', color: '#8a8690',
              border: '1px solid #22222a', fontSize: 11,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            cancel
          </button>
        )}
        <button
          type="button"
          onClick={onReveal}
          style={{
            flex: 1,
            padding: '8px 14px', borderRadius: 5,
            background: accent, color: '#0a0a0d',
            border: 'none', fontSize: 12, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          open
        </button>
      </div>
    </div>
  );
}
