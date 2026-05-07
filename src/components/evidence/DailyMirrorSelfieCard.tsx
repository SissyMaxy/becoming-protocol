/**
 * DailyMirrorSelfieCard — one-click "today's selfie" capture.
 *
 * Single full-body mirror selfie per day, archived to verification_photos
 * tagged 'daily_mirror_selfie' and feeds body_evidence_snapshots over time.
 * Builds a continuous visual trajectory the Handler can reference.
 *
 * Per memory feedback_no_copy_paste_rituals: this is embodiment evidence,
 * not busywork. Uploading IS the ritual.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { getSignedAssetUrls } from '../../lib/storage/signed-url';

interface RecentSelfie {
  id: string;
  photo_url: string;          // object path (or legacy URL)
  signed_url: string | null;  // resolved at load time for <img src>
  caption: string | null;
  created_at: string;
}

export function DailyMirrorSelfieCard() {
  const { user } = useAuth();
  const [doneToday, setDoneToday] = useState<boolean | null>(null);
  const [recent, setRecent] = useState<RecentSelfie[]>([]);
  const [streakDays, setStreakDays] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('verification_photos')
      .select('id, photo_url, caption, created_at')
      .eq('user_id', user.id)
      .eq('task_type', 'daily_mirror_selfie')
      .order('created_at', { ascending: false })
      .limit(14);
    const raw = (data as Array<Omit<RecentSelfie, 'signed_url'>>) ?? [];
    // Selfies upload to the `evidence` bucket; sign each path so the
    // gallery <img src> works after migration 260 flipped it private.
    const signed = await getSignedAssetUrls('evidence', raw.map(r => r.photo_url));
    const rows: RecentSelfie[] = raw.map((r, i) => ({ ...r, signed_url: signed[i] }));
    setRecent(rows);
    const today = new Date().toISOString().slice(0, 10);
    const todayRow = rows.find(r => r.created_at.slice(0, 10) === today);
    setDoneToday(!!todayRow);

    // Streak: consecutive days going back from today (or yesterday if today not yet done)
    let streak = 0;
    const days = new Set(rows.map(r => r.created_at.slice(0, 10)));
    const start = todayRow ? 0 : 1;
    for (let i = start; i < 60; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      if (days.has(ds)) streak++;
      else break;
    }
    setStreakDays(streak);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  const submit = async () => {
    if (!user?.id || !file) return;
    setSubmitting(true);
    setError(null);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      // RLS on storage.objects requires (storage.foldername(name))[1] = auth.uid().
      // Path MUST start with user.id, not a topical folder.
      const path = `${user.id}/daily-selfies/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('evidence').upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (upErr) throw upErr;

      // photo_url stores the storage path; the gallery signs on render.
      // Bucket is private (migration 260).
      const { error: insErr } = await supabase.from('verification_photos').insert({
        user_id: user.id,
        task_type: 'daily_mirror_selfie',
        photo_url: path,
        caption: caption.trim() || null,
        approved: true,  // self-archive — user-submitted evidence, not handler-judged
      });
      if (insErr) throw insErr;

      setFile(null);
      setCaption('');
      setShowUpload(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (doneToday === null) return null;

  return (
    <div id="card-daily-selfie" style={{
      background: 'linear-gradient(135deg, #1a0f2e 0%, #0f0820 100%)',
      border: '1px solid ' + (doneToday ? '#5fc88f' : '#2d1a4d'),
      borderRadius: 10, padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em',
          color: doneToday ? '#5fc88f' : '#c4b5fd', fontWeight: 700 }}>
          Daily mirror selfie {doneToday ? '· done ✓' : '· today'}
        </span>
        {streakDays > 0 && (
          <span style={{
            fontSize: 10, color: '#fff',
            background: streakDays >= 7 ? '#5fc88f' : '#7c3aed',
            padding: '2px 7px', borderRadius: 8, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>
            {streakDays}d streak
          </span>
        )}
        <span style={{ fontSize: 10, color: '#8a8690', marginLeft: 'auto', fontStyle: 'italic' }}>
          The body on file is the body the recordings know
        </span>
      </div>

      {!doneToday && !showUpload && (
        <button
          onClick={() => setShowUpload(true)}
          style={{
            width: '100%', padding: '12px 14px', borderRadius: 7, border: 'none',
            background: '#7c3aed', color: '#fff',
            fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            marginBottom: 10,
          }}
        >
          📸 take today&apos;s mirror selfie
        </button>
      )}

      {showUpload && (
        <div style={{
          background: '#050507', border: '1px solid #2d1a4d', borderRadius: 8, padding: 12, marginBottom: 12,
        }}>
          <div style={{ fontSize: 11, color: '#c4b5fd', marginBottom: 8, lineHeight: 1.4 }}>
            Full-body mirror selfie. Whatever you&apos;re wearing, however you look right now. The trajectory only exists
            if every day is on file.
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            style={{ marginBottom: 10, color: '#c4b5fd', fontSize: 12, width: '100%' }}
          />
          <input
            type="text"
            placeholder="Optional caption (what you notice today)"
            value={caption}
            onChange={e => setCaption(e.target.value)}
            style={{
              width: '100%', background: '#111116', border: '1px solid #22222a',
              borderRadius: 5, padding: 8, color: '#e8e6e3', fontSize: 12, marginBottom: 8, fontFamily: 'inherit',
            }}
          />
          {error && <div style={{ fontSize: 11, color: '#f47272', marginBottom: 8 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => { setShowUpload(false); setFile(null); setCaption(''); }}
              style={{
                padding: '7px 12px', borderRadius: 5, border: '1px solid #22222a',
                background: 'transparent', color: '#8a8690',
                fontWeight: 500, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              cancel
            </button>
            <button
              onClick={submit}
              disabled={!file || submitting}
              style={{
                flex: 1, padding: '7px 12px', borderRadius: 5, border: 'none',
                background: file && !submitting ? '#7c3aed' : '#22222a',
                color: file && !submitting ? '#fff' : '#6a656e',
                fontWeight: 700, fontSize: 11,
                cursor: file && !submitting ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
              }}
            >
              {submitting ? 'uploading…' : 'archive today'}
            </button>
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div style={{ display: 'flex', gap: 5, overflowX: 'auto', padding: '2px 0' }}>
          {recent.slice(0, 14).map(s => {
            const date = new Date(s.created_at);
            const isToday = s.created_at.slice(0, 10) === new Date().toISOString().slice(0, 10);
            return (
              <div key={s.id} style={{
                flexShrink: 0,
                width: 56, height: 72,
                borderRadius: 5,
                border: '1px solid ' + (isToday ? '#5fc88f' : '#2d1a4d'),
                background: '#050507',
                overflow: 'hidden',
                position: 'relative',
              }} title={s.caption || date.toLocaleDateString()}>
                {s.signed_url && (
                  <img
                    src={s.signed_url}
                    alt={`selfie ${date.toLocaleDateString()}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  padding: '2px 4px', fontSize: 8.5, color: '#fff',
                  background: 'linear-gradient(0deg, rgba(0,0,0,0.85), transparent)',
                  textAlign: 'center', fontWeight: 600,
                }}>
                  {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {recent.length === 0 && (
        <div style={{ fontSize: 11, color: '#8a8690', fontStyle: 'italic', textAlign: 'center', padding: 14 }}>
          No selfies yet. The trajectory archive starts with the first photo.
        </div>
      )}
    </div>
  );
}
