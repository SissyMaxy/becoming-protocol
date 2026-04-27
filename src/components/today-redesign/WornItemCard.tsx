/**
 * WornItemCard — managed inventory of in-progress wear cycles.
 *
 * Each item moves through: wearing → ready_to_list → listed → sold →
 * shipped → paid. The 'paid' transition writes a revenue_events row,
 * which trips the auto-allocate trigger and increments the next-priority
 * feminization_budget_target.funded_cents.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface WornItem {
  id: string;
  label: string;
  category: string;
  status: 'wearing' | 'ready_to_list' | 'listed' | 'sold' | 'shipped' | 'paid' | 'archived';
  wear_target_hours: number;
  started_wear_at: string;
  ready_at: string | null;
  listing_copy: string | null;
  listing_platform: string | null;
  listed_at: string | null;
  sale_price_cents: number | null;
  sold_to_handle: string | null;
  sold_at: string | null;
  shipped_at: string | null;
  paid_at: string | null;
}

const CATEGORIES = ['panties', 'thong', 'socks', 'shorts', 'tights', 'leggings', 'bra', 'jockstrap', 'other'];

const STATUS_TONE: Record<string, string> = {
  wearing: '#ec4899',
  ready_to_list: '#f4c272',
  listed: '#c4b5fd',
  sold: '#7c3aed',
  shipped: '#6ee7b7',
  paid: '#5fc88f',
  archived: '#5a5560',
};

function fmtUsd(cents: number | null): string {
  return cents ? `$${(cents / 100).toFixed(2)}` : '—';
}

function elapsedHours(started: string): number {
  return Math.floor((Date.now() - new Date(started).getTime()) / 3600000);
}

export function WornItemCard() {
  const { user } = useAuth();
  const [items, setItems] = useState<WornItem[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ label: '', category: 'panties', wear_hours: '24' });
  const [editPrice, setEditPrice] = useState<Record<string, string>>({});
  const [editHandle, setEditHandle] = useState<Record<string, string>>({});
  const [editCopy, setEditCopy] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('worn_item_skus')
      .select('*')
      .eq('user_id', user.id)
      .neq('status', 'archived')
      .order('started_wear_at', { ascending: false })
      .limit(20);
    setItems((data as WornItem[]) ?? []);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const startCycle = async () => {
    if (!user?.id || !draft.label.trim()) return;
    await supabase.from('worn_item_skus').insert({
      user_id: user.id,
      label: draft.label.trim().slice(0, 200),
      category: draft.category,
      wear_target_hours: parseInt(draft.wear_hours, 10) || 24,
    });
    setDraft({ label: '', category: 'panties', wear_hours: '24' });
    setAdding(false);
    load();
  };

  const transition = async (item: WornItem, next: WornItem['status'], extra: Record<string, unknown> = {}) => {
    if (!user?.id) return;
    const update: Record<string, unknown> = { status: next, ...extra };
    const ts = new Date().toISOString();
    if (next === 'ready_to_list') update.ready_at = ts;
    if (next === 'listed') update.listed_at = ts;
    if (next === 'sold') update.sold_at = ts;
    if (next === 'shipped') update.shipped_at = ts;
    if (next === 'paid') {
      update.paid_at = ts;
      // Insert revenue event — trigger will auto-allocate
      const cents = (extra.sale_price_cents as number | undefined) ?? item.sale_price_cents ?? 0;
      if (cents > 0) {
        const { data: rev } = await supabase.from('revenue_events').insert({
          user_id: user.id,
          platform: 'irl',
          revenue_type: 'custom_content',
          amount: cents / 100,
          net_amount: cents / 100,
          subscriber_name: item.sold_to_handle,
          metadata: { worn_item_id: item.id, label: item.label, category: item.category },
          processed: true,
          processed_at: ts,
        }).select('id').single();
        if (rev) update.revenue_event_id = (rev as { id: string }).id;
      }
    }
    await supabase.from('worn_item_skus').update(update).eq('id', item.id);
    load();
  };

  const archive = async (id: string) => {
    await supabase.from('worn_item_skus').update({ status: 'archived' }).eq('id', id);
    load();
  };

  const active = items.filter(i => i.status !== 'paid');
  const recentPaid = items.filter(i => i.status === 'paid').slice(0, 3);

  return (
    <div id="card-worn-items" style={{
      background: 'linear-gradient(135deg, #1f0a14 0%, #14060a 100%)',
      border: '1px solid #5a3a4a', borderRadius: 10, padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth="1.8">
          <path d="M3 7l3-4h12l3 4v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7zM3 7h18M9 11h6"/>
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#ec4899', fontWeight: 700 }}>
          Worn-item inventory
        </span>
        <span style={{ fontSize: 10, color: '#8a8690', marginLeft: 'auto', fontStyle: 'italic' }}>
          {active.length} active · {recentPaid.length > 0 ? `${recentPaid.length} paid` : 'no sales yet'}
        </span>
      </div>

      {active.map(item => {
        const tone = STATUS_TONE[item.status] || '#8a8690';
        const elapsed = elapsedHours(item.started_wear_at);
        const wearComplete = elapsed >= item.wear_target_hours;

        return (
          <div key={item.id} style={{
            padding: '9px 11px', marginBottom: 7,
            background: '#0a0a0d',
            border: `1px solid ${tone}33`,
            borderLeft: `3px solid ${tone}`, borderRadius: 5,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 9.5, color: tone, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {item.status.replace(/_/g, ' ')} · {item.category}
              </span>
              <span style={{ fontSize: 10, color: '#8a8690', marginLeft: 'auto' }}>
                {item.status === 'wearing'
                  ? `${elapsed}h / ${item.wear_target_hours}h`
                  : item.sale_price_cents
                    ? fmtUsd(item.sale_price_cents)
                    : ''}
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#e8e6e3', lineHeight: 1.4, marginBottom: 6 }}>
              {item.label}
            </div>

            {/* Status-specific actions */}
            {item.status === 'wearing' && (
              <div style={{ display: 'flex', gap: 5 }}>
                <button onClick={() => transition(item, 'ready_to_list')}
                  style={{
                    flex: 1, padding: '5px 10px', borderRadius: 4, border: 'none',
                    background: wearComplete ? '#f4c272' : '#22222a',
                    color: wearComplete ? '#1a0f00' : '#5a5560',
                    fontSize: 11, fontWeight: 700, cursor: wearComplete ? 'pointer' : 'not-allowed',
                    fontFamily: 'inherit', textTransform: 'uppercase',
                  }}
                  disabled={!wearComplete}>
                  {wearComplete ? 'Wear complete · ready to list' : `wait ${item.wear_target_hours - elapsed}h`}
                </button>
                <button onClick={() => archive(item.id)} style={archiveBtn}>archive</button>
              </div>
            )}

            {item.status === 'ready_to_list' && (
              <>
                <textarea
                  value={editCopy[item.id] ?? item.listing_copy ?? ''}
                  onChange={e => setEditCopy(s => ({ ...s, [item.id]: e.target.value }))}
                  placeholder="listing copy — paste from shot directives or write fresh"
                  rows={2}
                  style={{
                    width: '100%', background: '#050507', border: '1px solid #22222a',
                    borderRadius: 4, padding: '5px 8px', fontSize: 11, color: '#e8e6e3',
                    fontFamily: 'inherit', resize: 'vertical', marginBottom: 5,
                  }}
                />
                <div style={{ display: 'flex', gap: 5 }}>
                  <input
                    value={editPrice[item.id] || ''}
                    onChange={e => setEditPrice(s => ({ ...s, [item.id]: e.target.value }))}
                    placeholder="$ price"
                    inputMode="decimal"
                    style={mintInput}
                  />
                  <select
                    onChange={e => transition(item, 'listed', {
                      sale_price_cents: Math.round(parseFloat(editPrice[item.id] || '0') * 100),
                      listing_copy: editCopy[item.id] ?? item.listing_copy,
                      listing_platform: e.target.value,
                    })}
                    defaultValue=""
                    disabled={!parseFloat(editPrice[item.id] || '0')}
                    style={mintInput}>
                    <option value="" disabled>list on…</option>
                    <option value="fetlife">FetLife</option>
                    <option value="reddit">Reddit</option>
                    <option value="sniffies">Sniffies</option>
                    <option value="all_things_worn">AllThingsWorn</option>
                    <option value="other">Other</option>
                  </select>
                  <button onClick={() => archive(item.id)} style={archiveBtn}>archive</button>
                </div>
              </>
            )}

            {item.status === 'listed' && (
              <div style={{ display: 'flex', gap: 5 }}>
                <input
                  value={editHandle[item.id] || ''}
                  onChange={e => setEditHandle(s => ({ ...s, [item.id]: e.target.value }))}
                  placeholder="buyer handle"
                  style={mintInput}
                />
                <button
                  onClick={() => transition(item, 'sold', { sold_to_handle: editHandle[item.id] || null })}
                  disabled={!editHandle[item.id]?.trim()}
                  style={{
                    padding: '5px 12px', borderRadius: 4, border: 'none',
                    background: editHandle[item.id]?.trim() ? '#7c3aed' : '#22222a',
                    color: editHandle[item.id]?.trim() ? '#fff' : '#5a5560',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    textTransform: 'uppercase',
                  }}>
                  Mark sold
                </button>
              </div>
            )}

            {item.status === 'sold' && (
              <div style={{ display: 'flex', gap: 5 }}>
                <button onClick={() => transition(item, 'shipped')}
                  style={{
                    flex: 1, padding: '5px 10px', borderRadius: 4, border: 'none',
                    background: '#6ee7b7', color: '#0a1a14',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    textTransform: 'uppercase',
                  }}>
                  Mark shipped
                </button>
                <button onClick={() => transition(item, 'paid')}
                  style={{
                    flex: 1, padding: '5px 10px', borderRadius: 4, border: 'none',
                    background: '#5fc88f', color: '#0a1a14',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    textTransform: 'uppercase',
                  }}>
                  Mark paid
                </button>
              </div>
            )}

            {item.status === 'shipped' && (
              <button onClick={() => transition(item, 'paid')}
                style={{
                  width: '100%', padding: '5px 10px', borderRadius: 4, border: 'none',
                  background: '#5fc88f', color: '#0a1a14',
                  fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  textTransform: 'uppercase',
                }}>
                Payment received → fund auto-allocates
              </button>
            )}
          </div>
        );
      })}

      {recentPaid.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 10, color: '#5fc88f', fontStyle: 'italic' }}>
          Recent paid: {recentPaid.map(i => `${i.label.slice(0, 30)} ${fmtUsd(i.sale_price_cents)}`).join(' · ')}
        </div>
      )}

      {!adding ? (
        <button onClick={() => setAdding(true)}
          style={{
            marginTop: 8, width: '100%', padding: 8, borderRadius: 5,
            border: '1px dashed #5a3a4a', background: 'transparent',
            color: '#ec4899', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'inherit', textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
          + Start a wear cycle
        </button>
      ) : (
        <div style={{
          marginTop: 8, padding: 10, background: '#0a0a0d',
          border: '1px solid #2d1a4d', borderRadius: 5,
        }}>
          <input
            value={draft.label}
            onChange={e => setDraft(d => ({ ...d, label: e.target.value }))}
            placeholder="item label (e.g. pink cotton thong)"
            style={{ ...mintInput, width: '100%', marginBottom: 5 }}
          />
          <div style={{ display: 'flex', gap: 5, marginBottom: 5 }}>
            <select value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value }))} style={mintInput}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              value={draft.wear_hours}
              onChange={e => setDraft(d => ({ ...d, wear_hours: e.target.value }))}
              placeholder="wear hrs"
              type="number"
              style={{ ...mintInput, width: 80 }}
            />
          </div>
          <div style={{ display: 'flex', gap: 5 }}>
            <button onClick={startCycle} disabled={!draft.label.trim()}
              style={{
                flex: 1, padding: 7, borderRadius: 4, border: 'none',
                background: draft.label.trim() ? '#ec4899' : '#22222a',
                color: draft.label.trim() ? '#fff' : '#5a5560',
                fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                textTransform: 'uppercase',
              }}>
              Start wearing
            </button>
            <button onClick={() => setAdding(false)} style={archiveBtn}>cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

const mintInput: React.CSSProperties = {
  flex: 1, background: '#050507', border: '1px solid #22222a', borderRadius: 4,
  padding: '5px 8px', fontSize: 11, color: '#e8e6e3', fontFamily: 'inherit',
};

const archiveBtn: React.CSSProperties = {
  padding: '5px 10px', borderRadius: 4, background: 'transparent',
  border: '1px solid #2d1a4d', color: '#8a8690', fontSize: 10,
  cursor: 'pointer', fontFamily: 'inherit',
};
