/**
 * LivePhotoPingResponder — answer Mama's "show me right now" push.
 *
 * Self-gating: mounts unconditionally from App.tsx, returns null when there's
 * no pending live_photo_ping for the user. When a row exists with status='pending'
 * and expires_at > now, renders a full-screen overlay showing the prompt and
 * a countdown. Camera-only capture (uses input[type=file][capture=user]) — no
 * gallery upload allowed.
 *
 * Ships mommy_code_wishes "Live photo verification — Mama pings, you show"
 * (panel_intensity_2026_05_14). v1 records the submission; vision-model
 * verification of feminine presentation is deferred to v2.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface PendingPing {
  id: string;
  prompt_kind: string;
  prompt_text: string;
  pinged_at: string;
  expires_at: string;
  outreach_id: string | null;
}

export function LivePhotoPingResponder() {
  const { user } = useAuth();
  const [ping, setPing] = useState<PendingPing | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Tick a clock so the countdown re-renders. Also re-checks at the second
  // mark whether the ping expired client-side (the server sweeper is the
  // authority, but the UI should self-dismiss on expiry).
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadPending = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('live_photo_pings')
      .select('id, prompt_kind, prompt_text, pinged_at, expires_at, outreach_id')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .gte('expires_at', new Date().toISOString())
      .order('pinged_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setPing((data as PendingPing | null) ?? null);
  }, [user?.id]);

  // Initial load + poll every 30s for new pings. The 380 push bridge means
  // she'll usually get a notification but the in-app surface needs to
  // detect new pings on its own when the app is already foregrounded.
  useEffect(() => {
    void loadPending();
    const t = setInterval(() => void loadPending(), 30_000);
    return () => clearInterval(t);
  }, [loadPending]);

  // Self-dismiss when the current ping expires client-side
  useEffect(() => {
    if (!ping) return;
    if (new Date(ping.expires_at).getTime() <= now) {
      setPing(null);
    }
  }, [ping, now]);

  const onFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user?.id || !ping) return;
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      // Upload to evidence bucket — RLS requires first path segment = auth.uid()
      const ext = file.type.includes('jpeg') || file.type.includes('jpg') ? 'jpg' : 'png';
      const path = `${user.id}/live-photo-ping/${ping.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('evidence')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) { setError('Upload failed: ' + upErr.message); setUploading(false); return; }

      const pingedAt = new Date(ping.pinged_at).getTime();
      const respondedAt = new Date();
      const responseSeconds = Math.round((respondedAt.getTime() - pingedAt) / 1000);

      const { error: updErr } = await supabase
        .from('live_photo_pings')
        .update({
          status: 'responded',
          responded_at: respondedAt.toISOString(),
          response_photo_path: path,
          response_seconds: responseSeconds,
        })
        .eq('id', ping.id);
      if (updErr) { setError('Save failed: ' + updErr.message); setUploading(false); return; }

      // Mark the linked outreach row delivered so Today doesn't keep nagging.
      if (ping.outreach_id) {
        await supabase.from('handler_outreach_queue')
          .update({ status: 'delivered', delivered_at: respondedAt.toISOString() })
          .eq('id', ping.outreach_id);
      }

      setDone(true);
      setUploading(false);

      // Dismiss after a beat.
      setTimeout(() => {
        setPing(null);
        setDone(false);
      }, 2500);
    } catch (err) {
      setError(String(err));
      setUploading(false);
    }
  }, [user?.id, ping]);

  const panicSkip = useCallback(async () => {
    if (!user?.id || !ping) return;

    // Decrement panic budget atomically (best-effort).
    const { data: settings } = await supabase
      .from('live_photo_settings')
      .select('panic_skips_per_week, panic_skips_used_this_week, panic_week_started_at')
      .eq('user_id', user.id)
      .maybeSingle();
    const s = settings as {
      panic_skips_per_week: number;
      panic_skips_used_this_week: number;
      panic_week_started_at: string;
    } | null;
    if (!s) { setError('Settings missing.'); return; }

    // Reset weekly counter if a week has elapsed
    const weekStarted = s.panic_week_started_at ? new Date(s.panic_week_started_at).getTime() : 0;
    const weekElapsed = Date.now() - weekStarted > 7 * 86400_000;
    const used = weekElapsed ? 0 : (s.panic_skips_used_this_week ?? 0);

    if (used >= s.panic_skips_per_week) {
      setError('No panic skips left this week. Take the photo or accept the miss.');
      return;
    }

    setUploading(true);
    await supabase.from('live_photo_pings')
      .update({ status: 'panic_skipped', panic_skip: true, responded_at: new Date().toISOString() })
      .eq('id', ping.id);

    await supabase.from('live_photo_settings')
      .update({
        panic_skips_used_this_week: used + 1,
        panic_week_started_at: weekElapsed ? new Date().toISOString() : s.panic_week_started_at,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    if (ping.outreach_id) {
      await supabase.from('handler_outreach_queue')
        .update({ status: 'delivered', delivered_at: new Date().toISOString() })
        .eq('id', ping.outreach_id);
    }

    setUploading(false);
    setPing(null);
  }, [user?.id, ping]);

  if (!ping) return null;

  const expiresMs = new Date(ping.expires_at).getTime();
  const remainingMs = Math.max(0, expiresMs - now);
  const remainingSec = Math.floor(remainingMs / 1000);
  const remainingMin = Math.floor(remainingSec / 60);
  const remainingSecRem = remainingSec % 60;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(5,3,10,0.98)', zIndex: 950,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{ maxWidth: 540, width: '100%', background: '#111116', border: '2px solid #f47272', borderRadius: 14, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 10, color: '#f47272', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            ● live ping from Mama
          </span>
          <span style={{
            fontSize: 12, color: remainingSec < 60 ? '#f47272' : '#f4c272',
            marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', fontWeight: 700,
          }}>
            {remainingMin}:{remainingSecRem.toString().padStart(2, '0')}
          </span>
        </div>

        {done ? (
          <div style={{
            background: '#0a2a18', border: '1px solid #5fc88f', borderRadius: 8,
            padding: 16, fontSize: 14, color: '#5fc88f', fontWeight: 600,
          }}>
            ✓ Mama got it.
          </div>
        ) : (
          <>
            <div style={{
              fontSize: 17, color: '#e8e6e3', lineHeight: 1.5, marginTop: 8, marginBottom: 16,
            }}>
              {ping.prompt_text}
            </div>

            <div style={{ fontSize: 11, color: '#8a8690', marginBottom: 14, lineHeight: 1.5 }}>
              Camera only — no gallery upload. {remainingMin > 0 ? `~${remainingMin} min` : `${remainingSec}s`} until Mama logs a miss.
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              onChange={onFileChange}
              disabled={uploading}
              style={{ display: 'none' }}
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                width: '100%', padding: '14px 14px', borderRadius: 7, border: 'none',
                background: '#7c3aed', color: '#fff',
                fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                marginBottom: 10,
              }}
            >
              {uploading ? 'sending…' : '📷 open camera + send to Mama'}
            </button>

            {error && (
              <div style={{
                fontSize: 11, color: '#f47272', background: '#2a0a14',
                border: '1px solid #7a1f22', borderRadius: 6, padding: 10, marginBottom: 10,
              }}>
                {error}
              </div>
            )}

            <button
              onClick={panicSkip}
              disabled={uploading}
              style={{
                width: '100%', padding: '8px 14px', borderRadius: 6,
                border: '1px solid #2d1a4d',
                background: 'transparent', color: '#8a8690',
                fontWeight: 500, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              panic skip (counts against your weekly budget)
            </button>
          </>
        )}
      </div>
    </div>
  );
}
