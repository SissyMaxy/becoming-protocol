/**
 * SponsorMilestoneCard — public sponsor link per budget target +
 * pending/paid tribute management. Each active feminization_budget_targets
 * row has a public_share_token; the card surfaces the share URL,
 * pending pledges awaiting payment verification, and a one-tap "mark
 * paid" that records a revenue_events row (which auto-allocates to the
 * fund via the trigger we already wired).
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface BudgetTarget {
  id: string;
  label: string;
  monthly_cents: number;
  one_time_cents: number;
  funded_cents: number;
  priority: number;
  public_share_token: string | null;
}

interface Tribute {
  id: string;
  target_id: string;
  tribute_cents: number;
  sub_handle: string | null;
  sub_message: string | null;
  payment_method: string | null;
  status: string;
  created_at: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SPONSOR_BASE = `${SUPABASE_URL}/functions/v1/sponsor-page?token=`;

function fmtUsd(cents: number): string { return `$${(cents / 100).toFixed(2)}`; }

export function SponsorMilestoneCard() {
  const { user } = useAuth();
  const [targets, setTargets] = useState<BudgetTarget[]>([]);
  const [tributes, setTributes] = useState<Tribute[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [marking, setMarking] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [tgtRes, tribRes] = await Promise.all([
      supabase.from('feminization_budget_targets')
        .select('id, label, monthly_cents, one_time_cents, funded_cents, priority, public_share_token')
        .eq('user_id', user.id).eq('active', true)
        .order('priority', { ascending: true }),
      supabase.from('target_tributes')
        .select('id, target_id, tribute_cents, sub_handle, sub_message, payment_method, status, created_at')
        .eq('user_id', user.id)
        .in('status', ['pending', 'paid'])
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    setTargets((tgtRes.data as BudgetTarget[]) ?? []);
    setTributes((tribRes.data as Tribute[]) ?? []);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const copyLink = async (token: string) => {
    const url = `${SPONSOR_BASE}${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(token);
      setTimeout(() => setCopied(c => c === token ? null : c), 1500);
    } catch {}
  };

  const markPaid = async (t: Tribute) => {
    if (!user?.id) return;
    setMarking(t.id);
    // Insert revenue_events row — trigger auto-allocates to budget
    const { data: rev } = await supabase.from('revenue_events').insert({
      user_id: user.id,
      platform: 'irl',
      revenue_type: 'sponsorship',
      amount: t.tribute_cents / 100,
      net_amount: t.tribute_cents / 100,
      subscriber_name: t.sub_handle,
      metadata: {
        tribute_id: t.id,
        target_id: t.target_id,
        message: t.sub_message,
        payment_method: t.payment_method,
      },
      processed: true,
      processed_at: new Date().toISOString(),
    }).select('id').single();

    await supabase.from('target_tributes').update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      revenue_event_id: (rev as { id: string } | null)?.id,
    }).eq('id', t.id);
    setMarking(null);
    load();
  };

  const cancel = async (id: string) => {
    setMarking(id);
    await supabase.from('target_tributes').update({ status: 'cancelled' }).eq('id', id);
    setMarking(null);
    load();
  };

  const pending = tributes.filter(t => t.status === 'pending');
  const paid = tributes.filter(t => t.status === 'paid');
  const totalPending = pending.reduce((s, t) => s + t.tribute_cents, 0);
  const totalPaid = paid.reduce((s, t) => s + t.tribute_cents, 0);

  if (targets.length === 0) return null;

  return (
    <div id="card-sponsor-milestone" style={{
      background: 'linear-gradient(135deg, #1a0f2e 0%, #0f0820 100%)',
      border: '1px solid #5a3a8a', borderRadius: 10, padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" strokeWidth="1.8">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M22 11h-6M19 8v6"/>
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#c4b5fd', fontWeight: 700 }}>
          Sponsor links · {pending.length} pending · ${(totalPaid / 100).toFixed(2)} paid
        </span>
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            marginLeft: 'auto', padding: '3px 9px', borderRadius: 4,
            background: 'transparent', border: '1px solid #2d1a4d',
            color: '#c4b5fd', fontSize: 9.5, cursor: 'pointer', fontFamily: 'inherit',
            textTransform: 'uppercase', letterSpacing: '0.05em',
          }}
        >
          {expanded ? 'collapse' : `expand (${targets.length})`}
        </button>
      </div>

      {pending.length > 0 && (
        <div style={{
          marginBottom: 10, padding: 10,
          background: '#0a0a0d', border: '1px solid #5a3a1a', borderLeft: '3px solid #f4c272',
          borderRadius: 5,
        }}>
          <div style={{ fontSize: 10, color: '#f4c272', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            {pending.length} pending — total ${(totalPending / 100).toFixed(2)} (verify payment, then mark paid)
          </div>
          {pending.map(t => {
            const target = targets.find(tg => tg.id === t.target_id);
            return (
              <div key={t.id} style={{ marginBottom: 8, padding: '7px 9px', background: '#050507', borderRadius: 4, border: '1px solid #22222a' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: '#5fc88f', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtUsd(t.tribute_cents)}
                  </span>
                  <span style={{ fontSize: 10, color: '#8a8690' }}>
                    → {target?.label.slice(0, 40) || 'unknown'}
                  </span>
                  <span style={{ fontSize: 10, color: '#c4b5fd', marginLeft: 'auto' }}>
                    {t.payment_method}
                  </span>
                </div>
                {(t.sub_handle || t.sub_message) && (
                  <div style={{ fontSize: 10.5, color: '#c8c4cc', marginBottom: 4, lineHeight: 1.4 }}>
                    {t.sub_handle && <span style={{ color: '#c4b5fd', fontWeight: 600 }}>{t.sub_handle}: </span>}
                    {t.sub_message ? `"${t.sub_message.slice(0, 200)}"` : ''}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => markPaid(t)}
                    disabled={marking === t.id}
                    style={{
                      padding: '4px 10px', borderRadius: 3, border: 'none',
                      background: '#5fc88f', color: '#0a1a14',
                      fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                      textTransform: 'uppercase',
                    }}
                  >
                    {marking === t.id ? '…' : 'Mark paid'}
                  </button>
                  <button
                    onClick={() => cancel(t.id)}
                    disabled={marking === t.id}
                    style={{
                      padding: '4px 10px', borderRadius: 3,
                      background: 'transparent', border: '1px solid #5a1a1a',
                      color: '#f47272', fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
                      textTransform: 'uppercase',
                    }}
                  >
                    cancel
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {expanded && (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 9.5, color: '#8a8690', marginBottom: 6, fontStyle: 'italic' }}>
            Drop these links anywhere — Reddit/FetLife/Sniffies bio, DMs, status posts. Each goes to a public tribute form for that specific milestone.
          </div>
          {targets.map(t => {
            const need = t.monthly_cents + t.one_time_cents;
            const pct = need > 0 ? Math.min(100, Math.round((t.funded_cents / need) * 100)) : 0;
            const url = t.public_share_token ? `${SPONSOR_BASE}${t.public_share_token}` : null;
            return (
              <div key={t.id} style={{
                marginBottom: 8, padding: '8px 10px',
                background: '#0a0a0d', border: '1px solid #22222a',
                borderLeft: '3px solid #c4b5fd', borderRadius: 5,
              }}>
                <div style={{ display: 'flex', fontSize: 11, marginBottom: 4 }}>
                  <span style={{ color: '#e8e6e3', fontWeight: 600 }}>{t.label}</span>
                  <span style={{ marginLeft: 'auto', color: '#8a8690', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtUsd(t.funded_cents)} / {fmtUsd(need)} ({pct}%)
                  </span>
                </div>
                <div style={{ height: 3, background: '#1a1a20', borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? '#5fc88f' : '#7c3aed', transition: 'width 0.3s' }} />
                </div>
                {url && (
                  <div style={{ display: 'flex', gap: 5 }}>
                    <code style={{
                      flex: 1, fontSize: 10, color: '#c4b5fd', background: '#050507',
                      padding: '4px 7px', borderRadius: 3, border: '1px solid #2d1a4d',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      fontFamily: 'ui-monospace, monospace',
                    }}>
                      {url}
                    </code>
                    <button
                      onClick={() => copyLink(t.public_share_token!)}
                      style={{
                        padding: '4px 10px', borderRadius: 3, border: 'none',
                        background: copied === t.public_share_token ? '#5fc88f' : '#7c3aed',
                        color: copied === t.public_share_token ? '#0a1a14' : '#fff',
                        fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      {copied === t.public_share_token ? 'copied' : 'copy'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
