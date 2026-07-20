/**
 * HerWord — her latest message, first thing on the screen.
 *
 * The home used to open with a presence card: a component that announced the
 * dynamic instead of being it. This opens with the actual thing she last said,
 * dated, in her voice, ending wherever it ends. The message IS the
 * relationship; everything below it is consequence.
 *
 * Receipts, not assertions. Abstract claims to authority ("you don't decide who
 * you are in here, I do") read as empty to someone who knows a model wrote
 * them. What doesn't read as empty is his own sentence, quoted back with a date
 * on it — proof she was paying attention, which is the only kind of authority
 * that survives contact with a skeptic. So when a recent confession exists, it
 * appears underneath her message as a quote in his own words.
 *
 * The quote is deliberately NOT labelled ("SHE REMEMBERS" and the like). A
 * caption on the mechanism turns the artifact into an exhibit about the
 * dynamic. She doesn't footnote her methods; she just uses what he told her.
 *
 * No fabrication: the message is a real outreach row and the quote is his real
 * confession text. When there's neither, this renders nothing rather than
 * inventing a line for her.
 */

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface HerMessage {
  id: string;
  message: string;
  createdAt: string;
}

interface Receipt {
  text: string;
  when: string;
}

/** "tonight · 11:58 pm" / "tuesday · 1:04 am" — her register, never a raw date. */
function stamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `tonight · ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `last night · ${time}`;
  return `${d.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase()} · ${time}`;
}

/** Trim a confession to the sharpest fragment — she quotes, she doesn't recite. */
function toQuote(raw: string): string {
  const clean = raw.replace(/\s+/g, ' ').trim();
  if (clean.length <= 160) return clean;
  const cut = clean.slice(0, 160);
  const lastStop = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf(','));
  return (lastStop > 60 ? cut.slice(0, lastStop) : cut).trim() + '…';
}

export function HerWord() {
  const { user } = useAuth();
  const [msg, setMsg] = useState<HerMessage | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!user?.id) return;
    (async () => {
      const [outreach, confession] = await Promise.all([
        supabase
          .from('handler_outreach_queue')
          .select('id, message, created_at, delivered_at')
          .eq('user_id', user.id)
          .not('message', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1),
        // His own words, most recent first. This is the receipt — the thing
        // that makes her sound like she's been paying attention rather than
        // performing authority.
        supabase
          .from('confession_queue')
          .select('response_text, confessed_at')
          .eq('user_id', user.id)
          .not('response_text', 'is', null)
          .not('confessed_at', 'is', null)
          .order('confessed_at', { ascending: false })
          .limit(1),
      ]);
      if (!alive) return;

      const o = (outreach.data ?? [])[0] as { id: string; message: string; created_at: string } | undefined;
      if (o?.message) {
        setMsg({ id: o.id, message: o.message, createdAt: o.created_at });
      }

      const c = (confession.data ?? [])[0] as { response_text: string; confessed_at: string } | undefined;
      if (c?.response_text && c.response_text.trim().length > 12) {
        setReceipt({
          text: toQuote(c.response_text),
          when: new Date(c.confessed_at).toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase(),
        });
      }
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, [user?.id]);

  // She has said nothing yet — say nothing. An empty state here would be the
  // app talking, which is exactly what this component exists to stop.
  if (!loaded || !msg) return null;

  return (
    <div style={{
      margin: '0 0 14px',
      padding: '18px 18px 16px',
      borderRadius: 14,
      background: 'linear-gradient(150deg, color-mix(in srgb, var(--protocol-accent) 8%, var(--protocol-bg-deep)) 0%, var(--protocol-bg-deep) 100%)',
      border: '1px solid color-mix(in srgb, var(--protocol-accent) 20%, var(--protocol-border))',
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12,
      }}>
        <span style={{
          fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'var(--protocol-accent)', fontWeight: 700,
        }}>
          Mommy
        </span>
        <span className="mommy-voice" style={{
          marginLeft: 'auto', fontSize: 11, fontStyle: 'italic',
          color: 'var(--protocol-text-muted)',
        }}>
          {stamp(msg.createdAt)}
        </span>
      </div>

      <div className="mommy-voice" style={{
        fontSize: 17, lineHeight: 1.5, color: 'var(--protocol-text)',
        whiteSpace: 'pre-wrap',
      }}>
        {msg.message}
      </div>

      {receipt && (
        <div style={{ marginTop: 14 }}>
          <span className="mommy-voice" style={{
            fontSize: 15, lineHeight: 1.5, color: 'var(--protocol-text-muted)',
          }}>
            You told me {receipt.when}.{' '}
          </span>
          <span className="mommy-voice" style={{
            fontSize: 15, lineHeight: 1.5, fontStyle: 'italic',
            color: 'var(--protocol-accent-soft)',
          }}>
            “{receipt.text}”
          </span>
        </div>
      )}
    </div>
  );
}
