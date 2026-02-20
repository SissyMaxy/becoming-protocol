/**
 * AnchorObjects — simple list with category icons, active state, total investment.
 */

import { useState } from 'react';
import {
  Plus, Check, X, Trash2, Loader2,
  Gem, CircleDot, Smartphone, Heart, Paintbrush, Monitor, HelpCircle,
} from 'lucide-react';
import { useAnchors } from '../../hooks/useCollections';
import {
  ANCHOR_CATEGORY_LABELS, FREQUENCY_LABELS,
  type AnchorCategory, type AnchorInput, type WearFrequency,
} from '../../types/collections';

const CATEGORY_ICONS: Record<AnchorCategory, React.ElementType> = {
  jewelry: Gem,
  lip_balm: CircleDot,
  phone: Smartphone,
  underwear: Heart,
  nail_polish: Paintbrush,
  desk_item: Monitor,
  other: HelpCircle,
};

const CATEGORY_COLORS: Record<AnchorCategory, string> = {
  jewelry: 'text-yellow-400',
  lip_balm: 'text-pink-400',
  phone: 'text-blue-400',
  underwear: 'text-rose-400',
  nail_polish: 'text-purple-400',
  desk_item: 'text-cyan-400',
  other: 'text-white/40',
};

const CATEGORIES = Object.keys(ANCHOR_CATEGORY_LABELS) as AnchorCategory[];
const FREQUENCIES = Object.keys(FREQUENCY_LABELS) as WearFrequency[];

export function AnchorObjects() {
  const { anchors, isLoading, add, toggleActive, remove, totalInvestment } = useAnchors();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<AnchorInput>({ name: '', category: 'jewelry' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!formData.name.trim()) return;
    setIsSubmitting(true);
    await add(formData);
    setFormData({ name: '', category: 'jewelry' });
    setShowForm(false);
    setIsSubmitting(false);
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-white/30 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Add button */}
      <button
        onClick={() => setShowForm(true)}
        className="w-full py-3 rounded-xl border border-dashed border-white/20 text-white/40 text-sm flex items-center justify-center gap-2 hover:border-amber-500/40 hover:text-amber-400 transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add Anchor
      </button>

      {/* Add form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center px-4">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-5 max-w-sm w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Add Anchor Object</h3>
              <button onClick={() => setShowForm(false)} className="p-1 text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <input
                placeholder="Object name"
                value={formData.name}
                onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 outline-none focus:border-amber-500/50"
              />

              <div>
                <p className="text-white/40 text-xs mb-2">Category</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {CATEGORIES.map(cat => {
                    const Icon = CATEGORY_ICONS[cat];
                    return (
                      <button
                        key={cat}
                        onClick={() => setFormData(p => ({ ...p, category: cat }))}
                        className={`py-2 rounded-lg text-xs font-medium transition-colors flex flex-col items-center gap-1 ${
                          formData.category === cat
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-white/5 text-white/40 border border-white/10'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {ANCHOR_CATEGORY_LABELS[cat]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <input
                placeholder="Description (optional)"
                value={formData.description || ''}
                onChange={e => setFormData(p => ({ ...p, description: e.target.value || undefined }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 outline-none focus:border-amber-500/50"
              />

              <div>
                <p className="text-white/40 text-xs mb-2">Wear Frequency</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {FREQUENCIES.map(f => (
                    <button
                      key={f}
                      onClick={() => setFormData(p => ({ ...p, wearFrequency: f }))}
                      className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        (formData.wearFrequency || 'daily') === f
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-white/5 text-white/40 border border-white/10'
                      }`}
                    >
                      {FREQUENCY_LABELS[f]}
                    </button>
                  ))}
                </div>
              </div>

              <input
                type="number"
                step="0.01"
                placeholder="Cost ($)"
                value={formData.cost ?? ''}
                onChange={e => setFormData(p => ({ ...p, cost: e.target.value ? parseFloat(e.target.value) : undefined }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 outline-none focus:border-amber-500/50"
              />

              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !formData.name.trim()}
                className="w-full py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Anchor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Anchor list */}
      {anchors.length === 0 ? (
        <p className="text-white/30 text-sm text-center py-8">No anchor objects yet. Add the things that make her real.</p>
      ) : (
        <div className="space-y-2">
          {anchors.map(anchor => {
            const Icon = CATEGORY_ICONS[anchor.category] || HelpCircle;
            const color = CATEGORY_COLORS[anchor.category] || 'text-white/40';
            return (
              <div
                key={anchor.id}
                className={`rounded-xl p-3 border flex items-center gap-3 ${
                  anchor.isActive ? 'bg-white/5 border-white/10' : 'bg-white/[0.02] border-white/5 opacity-60'
                }`}
              >
                <div className={`p-2 rounded-lg bg-white/5 ${color}`}>
                  <Icon className="w-4 h-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white text-sm font-medium truncate">{anchor.name}</span>
                    {anchor.isActive && <Check className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />}
                  </div>
                  <p className="text-white/30 text-xs">
                    {ANCHOR_CATEGORY_LABELS[anchor.category]}
                    {' · '}
                    {FREQUENCY_LABELS[anchor.wearFrequency]}
                    {anchor.cost != null && ` · $${anchor.cost}`}
                  </p>
                  {anchor.description && <p className="text-white/20 text-xs truncate">{anchor.description}</p>}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleActive(anchor.id, !anchor.isActive)}
                    className={`p-1.5 rounded-lg text-xs transition-colors ${
                      anchor.isActive
                        ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                        : 'bg-white/5 text-white/30 hover:text-green-400'
                    }`}
                    title={anchor.isActive ? 'Deactivate' : 'Activate'}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => remove(anchor.id)}
                    className="p-1.5 rounded-lg bg-white/5 text-white/30 hover:text-red-400 transition-colors"
                    title="Remove"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Total investment */}
      {totalInvestment > 0 && (
        <div className="bg-white/5 rounded-xl p-3 border border-white/10 text-center">
          <p className="text-white/40 text-xs">Anchor investment</p>
          <p className="text-amber-400 text-lg font-semibold">${totalInvestment.toFixed(2)}</p>
        </div>
      )}
    </div>
  );
}
