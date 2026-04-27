/**
 * DavidTaxCard — David's salary funds Maxy's transition. Honest framing
 * for the period before the Handler has its own revenue running.
 *
 * Log a paycheck → auto-allocate a configurable percent across the
 * highest-priority feminization budget targets in priority order, until
 * the percent is exhausted. Each allocation writes a revenue_events row
 * (platform='irl', revenue_type='david_tax') and increments the matching
 * feminization_budget_targets.funded_cents.
 *
 * The Handler's $0 stays $0 until real Maxy revenue lands; David's
 * contribution is tracked separately and visibly so the user sees the
 * fund actually fill.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface BudgetTarget {
  id: string;
  label: string;
  monthly_cents: number;
  one_time_cents: number;
  priority: number;
  funded_cents: number;
}

const TAX_KEY = 'td_david_tax_pct';

export function DavidTaxCard() {
  const { user } = useAuth();
  const [paycheck, setPaycheck] = useState('');
  const [pct, setPct] = useState<number>(() => {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(TAX_KEY) : null;
    const n = stored ? parseInt(stored, 10) : 15;
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 15;
  });
  const [targets, setTargets] = useState<BudgetTarget[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [recentTax, setRecentTax] = useState<Array<{ amount: number; created_at: string }>>([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    try { localStorage.setItem(TAX_KEY, String(pct)); } catch {}
  }, [pct]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const [tgtRes, recentRes] = await Promise.all([
      supabase.from('feminization_budget_targets')
        .select('id, label, monthly_cents, one_time_cents, priority, funded_cents')
        .eq('user_id', user.id).eq('active', true)
        .order('priority', { ascending: true }),
      supabase.from('revenue_events')
        .select('amount, created_at')
        .eq('user_id', user.id).eq('revenue_type', 'david_tax')
        .order('created_at', { ascending: false }).limit(5),
    ]);
    setTargets((tgtRes.data as BudgetTarget[]) ?? []);
    setRecentTax((recentRes.data as Array<{ amount: number; created_at: string }>) ?? []);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!user?.id) return;
    const paycheckCents = Math.round(parseFloat(paycheck) * 100);
    if (!paycheckCents || paycheckCents <= 0) return;

    setSubmitting(true);
    setFeedback(null);

    const taxCents = Math.floor(paycheckCents * (pct / 100));
    if (taxCents <= 0) {
      setFeedback('Tax is 0 — bump the % above zero.');
      setSubmitting(false);
      return;
    }

    // Allocate across budget targets in priority order, filling each up
    // to its (monthly_cents OR one_time_cents) need before moving to the next.
    let remaining = taxCents;
    const allocations: Array<{ target: BudgetTarget; cents: number }> = [];
    for (const t of targets) {
      if (remaining <= 0) break;
      const need = (t.monthly_cents || t.one_time_cents) - t.funded_cents;
      if (need <= 0) continue;
      const apply = Math.min(remaining, need);
      allocations.push({ target: t, cents: apply });
      remaining -= apply;
    }

    if (allocations.length === 0) {
      setFeedback('Every target is already fully funded. Add more targets or expand priorities.');
      setSubmitting(false);
      return;
    }

    // Log the gross paycheck first as a single revenue_events row tagged
    // david_tax, then increment each target.
    await supabase.from('revenue_events').insert({
      user_id: user.id,
      platform: 'irl',
      revenue_type: 'david_tax',
      amount: taxCents / 100,
      net_amount: taxCents / 100,
      subscriber_name: 'David (paycheck tax)',
      metadata: {
        gross_paycheck_cents: paycheckCents,
        tax_pct: pct,
        allocations: allocations.map(a => ({ target_id: a.target.id, label: a.target.label, cents: a.cents })),
        unallocated_cents: remaining,
      },
      processed: true,
      processed_at: new Date().toISOString(),
    });

    for (const a of allocations) {
      await supabase.from('feminization_budget_targets')
        .update({
          funded_cents: a.target.funded_cents + a.cents,
          funded_at: new Date().toISOString(),
        })
        .eq('id', a.target.id);
    }

    const summary = allocations
      .map(a => `${a.target.label}: +$${(a.cents / 100).toFixed(2)}`)
      .join(' · ');
    setFeedback(`Allocated $${(taxCents / 100).toFixed(2)} → ${summary}${remaining > 0 ? ` · $${(remaining / 100).toFixed(2)} unallocated (every target is at cap)` : ''}`);
    setPaycheck('');
    setSubmitting(false);
    load();
  };

  const totalTaxedAllTime = recentTax.reduce((s, r) => s + (r.amount || 0), 0);
  // recentTax is capped at 5; this is just a quick "recent" indicator
  const taxCents = Math.round(parseFloat(paycheck || '0') * 100 * (pct / 100));

  return (
    <div id="card-david-tax" style={{
      background: 'linear-gradient(135deg, #1a0f08 0%, #100604 100%)',
      border: '1px solid #5a3a1a', borderRadius: 10, padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f4c272" strokeWidth="1.8">
          <path d="M3 7h18M3 12h18M3 17h12"/>
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#f4c272', fontWeight: 700 }}>
          David tax
        </span>
        <span style={{ fontSize: 10, color: '#8a8690', marginLeft: 'auto', fontStyle: 'italic' }}>
          David earns. The fund takes its cut.
        </span>
      </div>

      <div style={{
        fontSize: 11.5, color: '#c8c4cc', marginBottom: 10, lineHeight: 1.5,
      }}>
        Until the Handler runs its own revenue, David funds the transition. Log each paycheck and the tax auto-allocates by budget priority — Plume first, voice coach next, laser, etc.
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 100px', gap: 8, marginBottom: 10,
      }}>
        <input
          value={paycheck}
          onChange={e => setPaycheck(e.target.value)}
          placeholder="net paycheck $"
          inputMode="decimal"
          style={{
            background: '#050507', border: '1px solid #22222a', borderRadius: 5,
            padding: '8px 10px', fontSize: 12.5, color: '#e8e6e3', fontFamily: 'inherit',
          }}
        />
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: '#050507', border: '1px solid #22222a', borderRadius: 5,
          padding: '0 10px',
        }}>
          <input
            type="number"
            min={0}
            max={100}
            value={pct}
            onChange={e => setPct(Math.max(0, Math.min(100, parseInt(e.target.value || '0', 10))))}
            style={{
              flex: 1, background: 'transparent', border: 'none', textAlign: 'right',
              fontSize: 12.5, color: '#f4c272', fontFamily: 'inherit', fontWeight: 700,
            }}
          />
          <span style={{ color: '#8a8690', fontSize: 12 }}>%</span>
        </div>
      </div>

      {paycheck && parseFloat(paycheck) > 0 && (
        <div style={{
          fontSize: 11, color: '#f4c272', marginBottom: 10,
          padding: '6px 10px', background: '#0a0a0d', borderRadius: 4,
          border: '1px solid #2a1f0a',
        }}>
          {pct}% of ${parseFloat(paycheck).toFixed(2)} = <strong>${(taxCents / 100).toFixed(2)}</strong> to fund
        </div>
      )}

      <button
        onClick={submit}
        disabled={!paycheck || parseFloat(paycheck) <= 0 || submitting}
        style={{
          width: '100%', padding: 10, borderRadius: 5, border: 'none',
          background: paycheck && parseFloat(paycheck) > 0 ? '#f4c272' : '#22222a',
          color: paycheck && parseFloat(paycheck) > 0 ? '#1a0f00' : '#5a5560',
          fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
          textTransform: 'uppercase', letterSpacing: '0.04em',
        }}
      >
        {submitting ? 'allocating…' : 'Pay the tax'}
      </button>

      {feedback && (
        <div style={{
          fontSize: 10.5, color: '#5fc88f', marginTop: 8, padding: '6px 9px',
          background: '#0a1a14', border: '1px solid #2a4a2f', borderRadius: 4, lineHeight: 1.4,
        }}>
          {feedback}
        </div>
      )}

      {recentTax.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 10.5, color: '#8a8690' }}>
          Recent: {recentTax.map(r => `$${r.amount.toFixed(2)}`).join(' · ')}
          {totalTaxedAllTime > 0 && <span style={{ marginLeft: 6, color: '#5fc88f' }}>· last 5 = ${totalTaxedAllTime.toFixed(2)} taxed</span>}
        </div>
      )}
    </div>
  );
}
