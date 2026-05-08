/**
 * OutreachQueueCard — shows the Handler's queued + recently-delivered
 * outreach. Makes visible what's coming so she can't claim surprise when
 * it hits.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { usePersona } from '../../hooks/usePersona';
import { useOnboardingComplete } from '../../hooks/useOnboardingComplete';
import { applyPersonaGate } from '../../lib/onboarding/persona-gate';
import { useSurfaceRenderTracking } from '../../lib/surface-render-hooks';
import { useOutreachAudio } from '../../hooks/useOutreachAudio';

interface Outreach {
  id: string;
  message: string;
  urgency: string;
  trigger_reason: string;
  scheduled_for: string;
  delivered_at: string | null;
  expires_at: string;
  source: string;
  audio_url: string | null;
  kind: string | null;
}

export function OutreachQueueCard() {
  const { mommy } = usePersona();
  const { complete: onboardingComplete } = useOnboardingComplete();
  const { user } = useAuth();
  const [pending, setPending] = useState<Outreach[]>([]);
  const [recent, setRecent] = useState<Outreach[]>([]);
  const { play, playingId } = useOutreachAudio();
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const ack = useCallback(async (id: string) => {
    if (!user?.id) return;
    // Mantra outreach has a paired mantra_delivery_log row that needs
    // status=spoken when the user acks. Look it up before updating the
    // queue row so we still know its source.
    const target = pending.find(o => o.id === id);
    await supabase.from('handler_outreach_queue')
      .update({ delivered_at: new Date().toISOString(), status: 'delivered' })
      .eq('id', id);
    if (target?.source === 'mommy_mantra') {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const tok = session?.access_token;
        if (tok) {
          await fetch('/api/mantra/acknowledge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
            body: JSON.stringify({ outreach_id: id, status: 'spoken' }),
          });
        }
      } catch { /* best-effort; queue ack already succeeded */ }
    }
    // Refresh the lists so the row jumps from pending → recent
    setPending(p => p.filter(o => o.id !== id));
    window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'outreach_ack', id } }));
  }, [user?.id, pending]);

  // Manual archive — pins a non-archived outreach into the letters museum.
  // Letters are read-only-for-the-user except for the two flag columns; this
  // sets both. Surfaced on recent-delivered cards since pending cards already
  // have an obvious primary action.
  const saveToLetters = useCallback(async (id: string) => {
    if (!user?.id) return;
    await supabase.from('handler_outreach_queue')
      .update({ is_archived_to_letters: true, letters_pinned_at: new Date().toISOString() })
      .eq('id', id);
    setSavedIds(s => new Set(s).add(id));
    window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'letters_pin', id } }));
  }, [user?.id]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    // 2026-05-06: capped pending at 3 (was 8) and de-duped by trigger_reason.
    // Repeated cron firings of "X hours silent" were stacking up, making the
    // feed read like card spam. Today shows the most-recent-per-trigger and
    // collapses the rest behind a "more" toggle.
    // dossier_question outreach is rendered by DossierDripCard with the
    // inline answer UI; exclude it here so the same row isn't shown twice.
    // Skip kind='weekly_recap' — those render via the dedicated WeeklyRecapCard
    // so the recap doesn't appear twice on Today.
    const [pRes, rRes] = await Promise.all([
      supabase.from('handler_outreach_queue')
        .select('id, message, urgency, trigger_reason, scheduled_for, delivered_at, expires_at, source, audio_url, kind')
        .eq('user_id', user.id)
        .is('delivered_at', null)
        .neq('source', 'dossier_question')
        .gte('expires_at', new Date().toISOString())
        .order('scheduled_for', { ascending: true })
        .limit(8),
      supabase.from('handler_outreach_queue')
        .select('id, message, urgency, trigger_reason, scheduled_for, delivered_at, expires_at, source, audio_url, kind')
        .eq('user_id', user.id)
        .not('delivered_at', 'is', null)
        .neq('source', 'dossier_question')
        .order('delivered_at', { ascending: false })
        .limit(3),
    ]);
    // Persona gate: if onboarding isn't complete, drop mommy-* rows
    // before any further filtering. The wizard at /welcome must run
    // first so the user has consented to the persona content.
    const gatedPending = applyPersonaGate((pRes.data || []) as Outreach[], { onboardingComplete });
    const gatedRecent = applyPersonaGate((rRes.data || []) as Outreach[], { onboardingComplete });
    // De-dupe pending by trigger_reason — keep most recent per reason.
    // Same nudge re-fired hourly (slip-warning, silence-check) shouldn't
    // visibly pile up.
    const seenReason = new Set<string>();
    const dedupedPending = gatedPending
      .filter(o => o.kind !== 'weekly_recap')
      .filter(o => {
        const key = o.trigger_reason || o.source;
        if (seenReason.has(key)) return false;
        seenReason.add(key);
        return true;
      }).slice(0, 3);
    setPending(dedupedPending);
    setRecent(gatedRecent.filter(o => o.kind !== 'weekly_recap'));
  }, [user?.id, onboardingComplete]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  // visible-before-penalized invariant: stamp surfaced_at when each row first appears
  useSurfaceRenderTracking('handler_outreach_queue', [...pending.map(o => o.id), ...recent.map(o => o.id)]);

  if (pending.length === 0 && recent.length === 0) return null;

  const urgencyColor = (u: string) =>
    u === 'critical' ? '#f47272' : u === 'high' ? '#f4c272' : u === 'normal' ? '#c4b5fd' : '#8a8690';

  return (
    <div style={{ background: '#111116', border: '1px solid #2d1a4d', borderRadius: 10, padding: 14, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="1.8">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#c4b5fd', fontWeight: 700 }}>
          {mommy ? 'From Mama' : 'Handler queue'}
        </span>
        <span style={{ fontSize: 10.5, color: '#8a8690', marginLeft: 'auto' }}>
          {pending.length} pending · {recent.length} recent
        </span>
      </div>

      {pending.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 9.5, color: '#6a656e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
            {mommy ? 'mama\'s about to send' : 'queued — will deliver'}
          </div>
          {pending.map(o => {
            const fires = new Date(o.scheduled_for).getTime();
            const mins = Math.round((fires - Date.now()) / 60000);
            return (
              <div key={o.id} style={{
                background: '#0a0a0d', border: `1px solid ${urgencyColor(o.urgency)}33`,
                borderLeft: `3px solid ${urgencyColor(o.urgency)}`,
                borderRadius: 5, padding: '7px 9px', marginBottom: 5,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: urgencyColor(o.urgency), textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {o.urgency}
                  </span>
                  <span style={{ fontSize: 9.5, color: '#8a8690' }}>{o.source.replace(/_/g, ' ')}</span>
                  <span style={{ fontSize: 9.5, color: '#8a8690', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
                    {mins <= 0 ? 'now' : mins < 60 ? `in ${mins}m` : `in ${Math.floor(mins / 60)}h`}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#c8c4cc', lineHeight: 1.4, marginBottom: 6, whiteSpace: 'pre-wrap' }}>
                  {(() => {
                    if (o.message.length <= 600) return o.message;
                    // Truncate at word boundary, not mid-word
                    const cut = o.message.slice(0, 600);
                    const lastSpace = cut.lastIndexOf(' ');
                    return (lastSpace > 400 ? cut.slice(0, lastSpace) : cut) + '…';
                  })()}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    onClick={() => ack(o.id)}
                    style={{
                      background: 'transparent', color: urgencyColor(o.urgency),
                      border: `1px solid ${urgencyColor(o.urgency)}55`,
                      padding: '3px 9px', borderRadius: 4,
                      fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
                      fontFamily: 'inherit', cursor: 'pointer', textTransform: 'uppercase',
                    }}
                  >
                    {mommy ? 'heard you, mama →' : 'got it →'}
                  </button>
                  {o.audio_url && (
                    <button
                      onClick={() => play(o.id, o.audio_url!)}
                      aria-label={playingId === o.id ? 'Stop Mama' : 'Play Mama'}
                      style={{
                        background: playingId === o.id ? `${urgencyColor(o.urgency)}33` : 'transparent',
                        color: urgencyColor(o.urgency),
                        border: `1px solid ${urgencyColor(o.urgency)}55`,
                        padding: '3px 8px', borderRadius: 4,
                        fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
                        fontFamily: 'inherit', cursor: 'pointer', textTransform: 'uppercase',
                      }}
                    >
                      {playingId === o.id ? '◼ stop' : '▶ play'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {recent.length > 0 && (
        <div>
          <div style={{ fontSize: 9.5, color: '#6a656e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
            {mommy ? 'what mama just sent' : 'recently delivered'}
          </div>
          {recent.map(o => {
            const sent = new Date(o.delivered_at!).getTime();
            const ago = Math.round((Date.now() - sent) / 60000);
            const saved = savedIds.has(o.id);
            return (
              <div key={o.id} style={{
                background: '#0a0a0d', border: '1px solid #22222a', borderRadius: 5,
                padding: '6px 9px', marginBottom: 4, opacity: 0.75,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 9.5, color: '#8a8690' }}>{o.source.replace(/_/g, ' ')}</span>
                  <span style={{ fontSize: 9, color: '#6a656e', marginLeft: 'auto' }}>
                    {ago < 60 ? `${ago}m ago` : `${Math.floor(ago / 60)}h ago`}
                  </span>
                </div>
                <div style={{ fontSize: 10.5, color: '#8a8690', lineHeight: 1.35, marginBottom: 4 }}>
                  {o.message.slice(0, 180)}{o.message.length > 180 ? '…' : ''}
                </div>
                {mommy && (
                  <button
                    onClick={() => !saved && saveToLetters(o.id)}
                    disabled={saved}
                    style={{
                      background: 'transparent',
                      color: saved ? '#6a5e62' : '#c4956a',
                      border: '1px solid ' + (saved ? '#3a2a30' : '#5c0a1e'),
                      padding: '2px 7px', borderRadius: 3,
                      fontSize: 9, fontWeight: 600, letterSpacing: '0.04em',
                      fontFamily: 'inherit', cursor: saved ? 'default' : 'pointer',
                      textTransform: 'uppercase',
                    }}
                  >
                    {saved ? 'in letters' : 'save to letters'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
