/**
 * WigCollection — grid of wig cards with "Add Wig" form and "Wore Today" action.
 */

import { useState } from 'react';
import { Plus, Star, Scissors, Trash2, Loader2, X } from 'lucide-react';
import { useWigs } from '../../hooks/useCollections';
import type { WigInput, WigType, WigLength, LaceType } from '../../types/collections';

const WIG_TYPE_LABELS: Record<WigType, string> = {
  synthetic: 'Synthetic',
  human_hair: 'Human Hair',
  blend: 'Blend',
};

const LENGTH_LABELS: Record<WigLength, string> = {
  pixie: 'Pixie',
  bob: 'Bob',
  medium: 'Medium',
  long: 'Long',
};

export function WigCollection() {
  const { wigs, isLoading, add, woreToday, makePrimary, remove } = useWigs();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<WigInput>({ name: '', type: 'synthetic' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!formData.name.trim()) return;
    setIsSubmitting(true);
    await add(formData);
    setFormData({ name: '', type: 'synthetic' });
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
        className="w-full py-3 rounded-xl border border-dashed border-white/20 text-white/40 text-sm flex items-center justify-center gap-2 hover:border-purple-500/40 hover:text-purple-400 transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add Wig
      </button>

      {/* Add form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center px-4">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-5 max-w-sm w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Add Wig</h3>
              <button onClick={() => setShowForm(false)} className="p-1 text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <input
                placeholder="Wig name"
                value={formData.name}
                onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 outline-none focus:border-purple-500/50"
              />

              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(WIG_TYPE_LABELS) as WigType[]).map(t => (
                  <button
                    key={t}
                    onClick={() => setFormData(p => ({ ...p, type: t }))}
                    className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                      formData.type === t ? 'bg-purple-500/30 text-purple-300 border border-purple-500/40' : 'bg-white/5 text-white/40 border border-white/10'
                    }`}
                  >
                    {WIG_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>

              <input
                placeholder="Color (e.g. Blonde, Auburn)"
                value={formData.color || ''}
                onChange={e => setFormData(p => ({ ...p, color: e.target.value || undefined }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 outline-none focus:border-purple-500/50"
              />

              <div className="grid grid-cols-4 gap-2">
                {(Object.keys(LENGTH_LABELS) as WigLength[]).map(l => (
                  <button
                    key={l}
                    onClick={() => setFormData(p => ({ ...p, length: p.length === l ? undefined : l }))}
                    className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                      formData.length === l ? 'bg-pink-500/30 text-pink-300 border border-pink-500/40' : 'bg-white/5 text-white/40 border border-white/10'
                    }`}
                  >
                    {LENGTH_LABELS[l]}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {(['lace_front', 'full_lace', 'none'] as LaceType[]).map(lt => (
                  <button
                    key={lt}
                    onClick={() => setFormData(p => ({ ...p, laceType: p.laceType === lt ? undefined : lt }))}
                    className={`py-2 rounded-lg text-xs font-medium transition-colors ${
                      formData.laceType === lt ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40' : 'bg-white/5 text-white/40 border border-white/10'
                    }`}
                  >
                    {lt === 'lace_front' ? 'Lace Front' : lt === 'full_lace' ? 'Full Lace' : 'None'}
                  </button>
                ))}
              </div>

              <input
                type="number"
                step="0.01"
                placeholder="Purchase price ($)"
                value={formData.purchasePrice ?? ''}
                onChange={e => setFormData(p => ({ ...p, purchasePrice: e.target.value ? parseFloat(e.target.value) : undefined }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 outline-none focus:border-purple-500/50"
              />

              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !formData.name.trim()}
                className="w-full py-2.5 rounded-xl bg-purple-500 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add to Collection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wig grid */}
      {wigs.length === 0 ? (
        <p className="text-white/30 text-sm text-center py-8">No wigs yet. Start your collection.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {wigs.map(wig => (
            <div
              key={wig.id}
              className={`rounded-xl p-3 border transition-colors ${
                wig.isPrimary
                  ? 'bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/30'
                  : 'bg-white/5 border-white/10'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Scissors className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                  <span className="text-white text-sm font-medium truncate">{wig.name}</span>
                </div>
                {wig.isPrimary && <Star className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 fill-yellow-400" />}
              </div>

              <div className="space-y-1 mb-3">
                {wig.color && <p className="text-white/40 text-xs">{wig.color}</p>}
                <p className="text-white/30 text-xs">
                  {WIG_TYPE_LABELS[wig.type]}
                  {wig.length && ` · ${LENGTH_LABELS[wig.length]}`}
                </p>
                <p className="text-white/30 text-xs">Worn {wig.timesWorn}x</p>
              </div>

              <div className="flex gap-1.5">
                <button
                  onClick={() => woreToday(wig.id)}
                  className="flex-1 py-1.5 rounded-lg bg-purple-500/20 text-purple-300 text-xs font-medium hover:bg-purple-500/30 transition-colors"
                >
                  Wore Today
                </button>
                {!wig.isPrimary && (
                  <button
                    onClick={() => makePrimary(wig.id)}
                    className="p-1.5 rounded-lg bg-white/5 text-white/30 hover:text-yellow-400 transition-colors"
                    title="Set as primary"
                  >
                    <Star className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => remove(wig.id)}
                  className="p-1.5 rounded-lg bg-white/5 text-white/30 hover:text-red-400 transition-colors"
                  title="Remove"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
