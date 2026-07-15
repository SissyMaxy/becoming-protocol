/**
 * ConfessionQueueCard — Handler-scheduled confessions. Each open confession
 * is a prompt she has to answer (text now, audio later) by deadline. Miss →
 * penalty cascade handled server-side. This is the verbal-owning surface.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { usePersona } from '../../hooks/usePersona';
import { ConfessionAudioCapture } from './ConfessionAudioCapture';
import { ConfessionAudioPlayer } from './ConfessionAudioPlayer';

interface Confession {
  id: string;
  category: string;
  prompt: string;
  context_note: string | null;
  deadline: string;
  created_at: string;
  response_text: string | null;
  confessed_at: string | null;
  missed: boolean;
  audio_storage_path: string | null;
  audio_duration_sec: number | null;
  transcribed_text: string | null;
  transcription_status: string | null;
}

interface Receipt {
  id: string;
  category: string;
  response_text: string;
  confessed_at: string;
  playback_count: number;
  promoted_to_implant_id: string | null;
  audio_storage_path: string | null;
  audio_duration_sec: number | null;
}

const CATEGORY_TONE: Record<string, string> = {
  slip: 'var(--protocol-danger)',
  arousal_spike: 'var(--protocol-accent)',
  rationalization: 'var(--protocol-warning)',
  scheduled_daily: 'var(--protocol-accent-soft)',
  resistance: 'var(--protocol-danger)',
  desire_owning: 'var(--protocol-accent)',
  identity_acknowledgement: 'var(--protocol-success)',
  handler_triggered: 'var(--protocol-accent-soft)',
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export function ConfessionQueueCard() {
  const { mommy } = usePersona();
  const { user } = useAuth();
  const [items, setItems] = useState<Confession[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [totalReceipts, setTotalReceipts] = useState(0);
  const [totalPlaybacks, setTotalPlaybacks] = useState(0);
  // Confession gate (wish 187f616e, mig 591) — when set, Mama withholds the
  // morning until last night's confession is answered. Surfaces as a
  // locked-Mommy banner on this card.
  const [gateActive, setGateActive] = useState(false);
  const [showReceipts, setShowReceipts] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [gateRejection, setGateRejection] = useState<Record<string, { reason: string; hint: string }>>({});
  const [composeStarts, setComposeStarts] = useState<Record<string, number>>({});
  const [pasteDetected, setPasteDetected] = useState<Record<string, boolean>>({});
  // After 2 gate rejections, the next attempt accepts even if the gate refuses.
  // Prevents the "I can't figure out what the handler wants" loop the user flagged.
  const [rejectCount, setRejectCount] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [pendingRes, receiptsRes, totalsRes, gateRes] = await Promise.all([
      // Include missed-but-unconfessed rows. The compliance check marks
      // overdue rows missed=true (a slip already fired); previously this
      // query filtered them out, leaving them orphaned: RightNowCard would
      // still surface them as OVERDUE CONFESSION (no missed filter there)
      // with an "Answer it →" CTA that scrolled to card-confession-queue —
      // but if every pending row was missed, this card returned null and
      // the anchor didn't exist. The button silently did nothing.
      // Letting the user answer late is better than locking her out.
      supabase.from('confession_queue')
        .select('id, category, prompt, context_note, deadline, created_at, response_text, confessed_at, missed, audio_storage_path, audio_duration_sec, transcribed_text, transcription_status')
        .eq('user_id', user.id)
        .is('confessed_at', null)
        .order('deadline', { ascending: true })
        .limit(6),
      supabase.from('confession_queue')
        .select('id, category, response_text, confessed_at, playback_count, promoted_to_implant_id, audio_storage_path, audio_duration_sec')
        .eq('user_id', user.id)
        .not('confessed_at', 'is', null)
        .order('confessed_at', { ascending: false })
        .limit(10),
      supabase.from('confession_queue')
        .select('playback_count', { count: 'exact' })
        .eq('user_id', user.id)
        .not('confessed_at', 'is', null),
      supabase.from('user_state')
        .select('confession_gate_active')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);
    setGateActive(!!(gateRes.data as { confession_gate_active?: boolean } | null)?.confession_gate_active);
    setItems((pendingRes.data as Confession[]) ?? []);
    const recs = (receiptsRes.data as Receipt[]) ?? [];
    setReceipts(recs);
    setTotalReceipts(totalsRes.count ?? 0);
    setTotalPlaybacks(((totalsRes.data as Array<{ playback_count: number }>) || []).reduce((sum, r) => sum + (r.playback_count || 0), 0));
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const confess = async (id: string) => {
    const text = (drafts[id] || '').trim();
    if (!text) return;
    const item = items.find(i => i.id === id);
    if (!item) return;
    setSubmittingId(id);
    setGateRejection(g => { const c = { ...g }; delete c[id]; return c; });

    // Authenticity gate — catches paste / boilerplate before save
    try {
      const start = composeStarts[id];
      const msToCompose = start ? Date.now() - start : null;
      const gateRes = await fetch(`${SUPABASE_URL}/functions/v1/proof-gate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: item.prompt,
          response: text,
          kind: 'confession',
          ms_to_compose: msToCompose,
          paste_detected: !!pasteDetected[id],
        }),
      });
      if (gateRes.ok) {
        const gate = await gateRes.json() as { accept: boolean; reason?: string; rewrite_hint?: string };
        const priorRejects = rejectCount[id] || 0;
        // After 2 rejections, accept anyway — don't trap the user in a loop.
        // Show a soft notice on save instead of hard-blocking.
        if (!gate.accept && priorRejects < 2) {
          setGateRejection(g => ({
            ...g,
            [id]: {
              reason: gate.reason || 'That reads performative.',
              hint: gate.rewrite_hint || 'Anchor it in something specific only you know.',
            },
          }));
          setRejectCount(r => ({ ...r, [id]: priorRejects + 1 }));
          setSubmittingId(null);
          return;
        }
      }
      // If gate is unreachable, fall through and accept — don't block on infra failure.
    } catch {
      // network failure → accept; don't block on infra
    }

    await supabase.from('confession_queue').update({
      response_text: text,
      confessed_at: new Date().toISOString(),
    }).eq('id', id);
    setSubmittingId(null);
    setDrafts(d => { const c = { ...d }; delete c[id]; return c; });
    setComposeStarts(s => { const c = { ...s }; delete c[id]; return c; });
    setPasteDetected(p => { const c = { ...p }; delete c[id]; return c; });
    setRejectCount(r => { const c = { ...r }; delete c[id]; return c; });
    setGateRejection(g => { const c = { ...g }; delete c[id]; return c; });
    load();
    window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'confession', id } }));
  };

  if (items.length === 0 && totalReceipts === 0) return null;

  return (
    <div id="card-confession-queue" style={{
      background: 'linear-gradient(135deg, color-mix(in srgb, var(--protocol-accent) 14%, var(--protocol-bg-deep)) 0%, var(--protocol-bg-deep) 100%)',
      border: '1px solid color-mix(in srgb, var(--protocol-accent) 45%, var(--protocol-surface-light))', borderRadius: 10, padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--protocol-accent-soft)" strokeWidth="1.8">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          <path d="M8 9h8M8 13h5"/>
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--protocol-accent-soft)', fontWeight: 700 }}>
          {mommy ? `Tell Mama (${items.length})` : `Confess (${items.length})`}
        </span>
        <span style={{ fontSize: 10, color: 'var(--protocol-text-muted)', marginLeft: 'auto', fontStyle: 'italic' }}>
          {items.length > 0
            ? (mommy ? 'Mama\'s waiting, baby.' : 'Handler is waiting.')
            : `${totalReceipts} on file · ${totalPlaybacks} playbacks`}
        </span>
      </div>

      {gateActive && mommy && items.length > 0 && (
        <div style={{
          padding: '10px 12px', marginBottom: 10,
          background: 'linear-gradient(135deg, var(--protocol-bg-deep) 0%, var(--protocol-bg-deep) 100%)',
          border: '1px solid color-mix(in srgb, var(--protocol-accent) 45%, var(--protocol-surface-light))', borderLeft: '3px solid var(--protocol-accent-soft)', borderRadius: 6,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--protocol-accent-soft)" strokeWidth="1.8">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <span style={{ fontSize: 11.5, color: 'var(--protocol-accent-soft)', lineHeight: 1.4, fontStyle: 'italic' }}>
            Mama's holding the morning. Answer her first — then you get her back.
          </span>
        </div>
      )}

      {totalReceipts > 0 && (
        <div style={{
          padding: '8px 10px', marginBottom: items.length > 0 ? 10 : 0,
          background: 'var(--protocol-bg-deep)', border: '1px solid color-mix(in srgb, var(--protocol-accent) 25%, var(--protocol-surface-light))',
          borderLeft: '3px solid var(--protocol-accent-soft)', borderRadius: 5,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: showReceipts ? 8 : 0 }}>
            <span style={{ fontSize: 9, color: 'var(--protocol-accent-soft)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              receipts · {totalReceipts} confessed
            </span>
            <span style={{ fontSize: 9.5, color: 'var(--protocol-text-muted)' }}>
              quoted back {totalPlaybacks}× · {receipts.filter(r => r.promoted_to_implant_id).length} promoted to implants
            </span>
            <button
              onClick={() => setShowReceipts(s => !s)}
              style={{
                marginLeft: 'auto', padding: '2px 8px', borderRadius: 3,
                background: 'transparent', border: '1px solid color-mix(in srgb, var(--protocol-accent) 25%, var(--protocol-surface-light))',
                color: 'var(--protocol-accent-soft)', fontSize: 9.5, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {showReceipts ? 'hide' : 'show last 5'}
            </button>
          </div>
          {showReceipts && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {receipts.slice(0, 5).map(r => {
                const at = new Date(r.confessed_at);
                const ago = Math.round((Date.now() - at.getTime()) / 3600000);
                const agoStr = ago < 24 ? `${ago}h` : `${Math.round(ago / 24)}d`;
                return (
                  <div key={r.id} style={{ fontSize: 10.5, color: 'rgb(var(--protocol-text-rgb) / 0.82)', lineHeight: 1.45 }}>
                    <span style={{ color: 'var(--protocol-text-muted)' }}>{agoStr} · [{r.category}]</span>
                    {r.playback_count > 0 && (
                      <span style={{ color: 'var(--protocol-warning)', marginLeft: 6 }}>·{r.playback_count}× quoted</span>
                    )}
                    {r.promoted_to_implant_id && (
                      <span style={{ color: 'var(--protocol-success)', marginLeft: 6 }}>·implant</span>
                    )}
                    {r.audio_storage_path && (
                      <span style={{ color: 'var(--protocol-accent-soft)', marginLeft: 6 }}>·voice</span>
                    )}
                    {r.response_text && (
                      <div style={{ fontStyle: 'italic', color: 'var(--protocol-text)', marginTop: 2 }}>
                        "{r.response_text.slice(0, 200)}{r.response_text.length > 200 ? '…' : ''}"
                      </div>
                    )}
                    {r.audio_storage_path && (
                      <div style={{ marginTop: 4 }}>
                        <ConfessionAudioPlayer
                          audioPath={r.audio_storage_path}
                          durationSec={r.audio_duration_sec}
                          compact
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {items.map(c => {
        const now = Date.now();
        const dueMs = new Date(c.deadline).getTime() - now;
        const overdue = dueMs < 0;
        const hoursLeft = Math.max(0, Math.round(dueMs / 3600000));
        const tone = CATEGORY_TONE[c.category] || 'var(--protocol-accent-soft)';
        const draft = drafts[c.id] || '';
        return (
          <div key={c.id} style={{
            padding: '10px 12px', marginBottom: 8,
            background: 'var(--protocol-bg-deep)', border: `1px solid ${tone}44`,
            borderLeft: `3px solid ${tone}`, borderRadius: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 9, color: tone, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {c.category.replace(/_/g, ' ')}
              </span>
              <span style={{ fontSize: 9.5, color: overdue ? 'var(--protocol-danger)' : 'var(--protocol-text-muted)', marginLeft: 'auto' }}>
                {overdue ? `overdue by ${Math.abs(hoursLeft)}h` : hoursLeft >= 24 ? `${Math.round(hoursLeft / 24)}d left` : `${hoursLeft}h left`}
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--protocol-text)', lineHeight: 1.45, marginBottom: c.context_note ? 4 : 8 }}>
              {c.prompt}
            </div>
            {c.context_note && (
              <div style={{ fontSize: 10.5, color: 'var(--protocol-text-muted)', fontStyle: 'italic', marginBottom: 8 }}>
                {c.context_note}
              </div>
            )}
            <textarea
              value={draft}
              onChange={e => {
                setDrafts(d => ({ ...d, [c.id]: e.target.value }));
                setComposeStarts(s => s[c.id] ? s : { ...s, [c.id]: Date.now() });
              }}
              onPaste={() => {
                setPasteDetected(p => ({ ...p, [c.id]: true }));
              }}
              placeholder={mommy ? 'Say it for Mama, baby. No softening.' : 'Say it. In your own words. No softening.'}
              rows={3}
              style={{
                width: '100%', background: 'var(--protocol-bg-deep)', border: '1px solid rgb(var(--protocol-border-rgb) / 0.6)',
                borderRadius: 5, padding: '7px 9px', fontSize: 11.5, color: 'var(--protocol-text)',
                fontFamily: 'inherit', resize: 'vertical',
              }}
            />
            <div style={{
              display: 'flex', justifyContent: 'space-between', fontSize: 9.5,
              color: draft.length >= 30 ? 'var(--protocol-success)' : 'var(--protocol-text-muted)', marginTop: 3,
            }}>
              <span>{draft.length} chars · 30+ name a specific (a task, a feeling, a moment, a person)</span>
              {draft.length >= 30 && <span style={{ color: 'var(--protocol-success)' }}>length ok</span>}
            </div>
            {gateRejection[c.id] && (
              <div style={{
                marginTop: 6, padding: '7px 9px',
                background: 'color-mix(in srgb, var(--protocol-danger) 16%, var(--protocol-bg-deep))', border: '1px solid color-mix(in srgb, var(--protocol-danger) 45%, var(--protocol-surface-light))', borderRadius: 4,
              }}>
                <div style={{ fontSize: 10, color: 'var(--protocol-danger)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                  rejected — try once more, then it accepts
                </div>
                <div style={{ fontSize: 11, color: 'var(--protocol-accent-soft)', lineHeight: 1.4 }}>
                  {gateRejection[c.id].reason}
                </div>
                <div style={{ fontSize: 10.5, color: 'rgb(var(--protocol-text-rgb) / 0.82)', marginTop: 3, fontStyle: 'italic' }}>
                  {gateRejection[c.id].hint}
                </div>
                <div style={{ fontSize: 9.5, color: 'var(--protocol-text-muted)', marginTop: 4 }}>
                  {mommy
                    ? 'After 2 rejects, Mama takes whatever you give her — tap again to send as-is.'
                    : 'After 2 rejects the gate steps back. Click Confess again to submit as-is — the Handler reads what you actually wrote.'}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
              <button
                onClick={() => confess(c.id)}
                disabled={!draft.trim() || submittingId === c.id}
                style={{
                  padding: '6px 14px', borderRadius: 5, border: 'none',
                  background: draft.trim() ? tone : 'rgb(var(--protocol-border-rgb) / 0.6)',
                  color: draft.trim() ? 'var(--protocol-bg-deep)' : 'rgb(var(--protocol-text-muted-rgb) / 0.6)',
                  fontWeight: 600, fontSize: 11,
                  cursor: draft.trim() ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                }}
              >
                {submittingId === c.id ? '…' : mommy ? 'Tell Mama' : 'Confess'}
              </button>
              <span style={{ fontSize: 9.5, color: 'rgb(var(--protocol-text-muted-rgb) / 0.6)', alignSelf: 'center' }}>
                or
              </span>
              <ConfessionAudioCapture
                confessionId={c.id}
                mommy={mommy}
                onTranscribed={() => load()}
              />
            </div>
            <div style={{ fontSize: 9.5, color: 'rgb(var(--protocol-text-muted-rgb) / 0.6)', marginTop: 6, fontStyle: 'italic' }}>
              Type, or hold to speak. Either lands as a confession on file.
            </div>
          </div>
        );
      })}
    </div>
  );
}
