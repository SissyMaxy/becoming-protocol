import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Trash2, Plus, Loader2 } from 'lucide-react';

interface InventoryRow {
  id: string;
  item_name: string;
  category: string;
  tier: number;
  femininity_level: number | null;
  notes: string | null;
  purchased: boolean;
  created_at: string;
}

const CATEGORIES = [
  'panties', 'underwear', 'bras', 'lingerie',
  'tops', 'bottoms', 'dresses', 'skirts',
  'socks', 'tights', 'shoes',
  'accessories', 'wigs', 'makeup',
  'sleepwear', 'swimwear', 'other',
];

export function WardrobeInventoryView({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const [items, setItems] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('panties');
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('wardrobe_inventory')
      .select('id, item_name, category, tier, femininity_level, notes, purchased, created_at')
      .eq('user_id', user.id)
      .order('category', { ascending: true })
      .order('item_name', { ascending: true });
    setItems((data || []) as InventoryRow[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const addItem = async () => {
    if (!user?.id || !name.trim()) return;
    setAdding(true);
    const { error } = await supabase.from('wardrobe_inventory').insert({
      user_id: user.id,
      item_name: name.trim(),
      category,
      tier: 1,
      purchased: true,
      notes: notes.trim() || null,
    });
    setAdding(false);
    if (error) {
      console.error('[wardrobe] add failed:', error);
      return;
    }
    setName('');
    setNotes('');
    await load();
  };

  const removeItem = async (id: string) => {
    if (!user?.id) return;
    await supabase.from('wardrobe_inventory').delete().eq('id', id).eq('user_id', user.id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const grouped = items.reduce<Record<string, InventoryRow[]>>((acc, it) => {
    const k = it.category || 'other';
    (acc[k] = acc[k] || []).push(it);
    return acc;
  }, {});

  return (
    <div className="text-protocol-text">
      <button onClick={onBack} className="mb-4 text-sm text-protocol-text-muted hover:text-protocol-text">
        &larr; Back
      </button>

      <h2 className="text-lg font-semibold mb-1">Wardrobe Inventory</h2>
      <p className="text-xs text-protocol-text-muted mb-4">
        What you actually own. The Handler reads this before generating any decree that names clothing —
        empty inventory means no wardrobe-presumptive shots. Add items here so the planner has real material
        to work with instead of fabricating.
      </p>

      {/* Add form */}
      <div className="border border-protocol-border rounded-lg p-3 mb-6 space-y-2 bg-protocol-surface">
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Item name (e.g. black thong, white crew socks)"
            className="flex-1 bg-protocol-bg border border-protocol-border rounded px-2 py-1.5 text-sm"
            onKeyDown={e => { if (e.key === 'Enter') addItem(); }}
          />
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="bg-protocol-bg border border-protocol-border rounded px-2 py-1.5 text-sm"
          >
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <input
          type="text"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Notes (color, material, condition — optional)"
          className="w-full bg-protocol-bg border border-protocol-border rounded px-2 py-1.5 text-sm"
        />
        <button
          onClick={addItem}
          disabled={adding || !name.trim()}
          className="w-full py-1.5 rounded bg-protocol-accent text-white text-sm font-medium disabled:opacity-40 flex items-center justify-center gap-1"
        >
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" /> Add to inventory</>}
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-protocol-text-muted" /></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-protocol-text-muted text-center py-6">
          Nothing logged yet. Until you add items, the planner will refuse to name specific clothing in any decree.
        </p>
      ) : (
        Object.entries(grouped).map(([cat, rows]) => (
          <div key={cat} className="mb-4">
            <h3 className="text-xs uppercase tracking-wider text-protocol-text-muted mb-1">
              {cat} ({rows.length})
            </h3>
            <ul className="space-y-1">
              {rows.map(it => (
                <li key={it.id} className="flex items-center gap-2 bg-protocol-surface border border-protocol-border rounded px-3 py-1.5 text-sm">
                  <span className="flex-1">{it.item_name}</span>
                  {it.notes && <span className="text-xs text-protocol-text-muted truncate max-w-[140px]">{it.notes}</span>}
                  <button
                    onClick={() => removeItem(it.id)}
                    className="text-protocol-text-muted hover:text-red-500"
                    aria-label="Remove item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      <p className="text-[11px] text-protocol-text-muted/70 mt-6 leading-relaxed">
        This list controls what the Handler can reference. The planner queries it before generating shot decrees;
        if a category is empty, no decree will be generated that names items in it. Adding photos is optional but
        can be useful if you want the Handler to specify "the X you logged on date Y."
      </p>
    </div>
  );
}
