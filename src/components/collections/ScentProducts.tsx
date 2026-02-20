/**
 * ScentProducts — product list grouped by category with pairings and conditioning strength.
 */

import { useState } from 'react';
import { Plus, Star, AlertTriangle, Trash2, Loader2, X, Link } from 'lucide-react';
import { useScents } from '../../hooks/useCollections';
import {
  SCENT_CATEGORY_LABELS, PAIRING_LABELS,
  getConditioningStrength,
  type ScentCategory, type ScentInput, type PairingActivity,
} from '../../types/collections';

const CATEGORIES = Object.keys(SCENT_CATEGORY_LABELS) as ScentCategory[];
const ACTIVITIES: PairingActivity[] = ['arousal', 'edge', 'morning', 'workout', 'sleep'];

const STRENGTH_COLORS: Record<string, string> = {
  Building: 'text-blue-400',
  Moderate: 'text-yellow-400',
  Strong: 'text-orange-400',
  Automatic: 'text-green-400',
};

export function ScentProducts() {
  const { products, isLoading, add, toggleRestock, pairWith, remove, getPairingsForProduct } = useScents();
  const [showForm, setShowForm] = useState(false);
  const [showPairingFor, setShowPairingFor] = useState<string | null>(null);
  const [formData, setFormData] = useState<ScentInput>({ category: 'perfume', productName: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!formData.productName.trim()) return;
    setIsSubmitting(true);
    await add(formData);
    setFormData({ category: 'perfume', productName: '' });
    setShowForm(false);
    setIsSubmitting(false);
  };

  const handlePair = async (productId: string, activity: PairingActivity) => {
    await pairWith(productId, activity);
    setShowPairingFor(null);
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-white/30 animate-spin" /></div>;
  }

  // Group products by category
  const grouped = CATEGORIES
    .map(cat => ({
      category: cat,
      items: products.filter(p => p.category === cat),
    }))
    .filter(g => g.items.length > 0);

  // Signature products at top
  const signatures = products.filter(p => p.isSignature);

  return (
    <div className="space-y-4">
      {/* Add button */}
      <button
        onClick={() => setShowForm(true)}
        className="w-full py-3 rounded-xl border border-dashed border-white/20 text-white/40 text-sm flex items-center justify-center gap-2 hover:border-pink-500/40 hover:text-pink-400 transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add Scent Product
      </button>

      {/* Add form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center px-4">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-5 max-w-sm w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Add Scent Product</h3>
              <button onClick={() => setShowForm(false)} className="p-1 text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <input
                placeholder="Product name"
                value={formData.productName}
                onChange={e => setFormData(p => ({ ...p, productName: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 outline-none focus:border-pink-500/50"
              />

              <input
                placeholder="Brand"
                value={formData.brand || ''}
                onChange={e => setFormData(p => ({ ...p, brand: e.target.value || undefined }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 outline-none focus:border-pink-500/50"
              />

              <div>
                <p className="text-white/40 text-xs mb-2">Category</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setFormData(p => ({ ...p, category: cat }))}
                      className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        formData.category === cat ? 'bg-pink-500/30 text-pink-300 border border-pink-500/40' : 'bg-white/5 text-white/40 border border-white/10'
                      }`}
                    >
                      {SCENT_CATEGORY_LABELS[cat]}
                    </button>
                  ))}
                </div>
              </div>

              <input
                placeholder="Scent notes (e.g. vanilla, rose)"
                value={formData.scentNotes || ''}
                onChange={e => setFormData(p => ({ ...p, scentNotes: e.target.value || undefined }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 outline-none focus:border-pink-500/50"
              />

              <input
                type="number"
                step="0.01"
                placeholder="Price ($)"
                value={formData.purchasePrice ?? ''}
                onChange={e => setFormData(p => ({ ...p, purchasePrice: e.target.value ? parseFloat(e.target.value) : undefined }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 outline-none focus:border-pink-500/50"
              />

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isSignature || false}
                  onChange={e => setFormData(p => ({ ...p, isSignature: e.target.checked }))}
                  className="accent-pink-500"
                />
                <span className="text-white/60 text-sm">Signature scent</span>
              </label>

              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !formData.productName.trim()}
                className="w-full py-2.5 rounded-xl bg-pink-500 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Product
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Signature scents */}
      {signatures.length > 0 && (
        <div className="bg-gradient-to-r from-pink-500/10 to-purple-500/10 border border-pink-500/20 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
            <span className="text-white/60 text-xs uppercase tracking-wider">Signature</span>
          </div>
          {signatures.map(p => (
            <div key={p.id} className="flex items-center gap-2">
              <span className="text-white text-sm font-medium">{p.productName}</span>
              {p.brand && <span className="text-white/30 text-xs">by {p.brand}</span>}
              {p.scentNotes && <span className="text-pink-400/60 text-xs">({p.scentNotes})</span>}
            </div>
          ))}
        </div>
      )}

      {/* Grouped product list */}
      {products.length === 0 ? (
        <p className="text-white/30 text-sm text-center py-8">No scent products yet. Build her scent world.</p>
      ) : (
        <div className="space-y-4">
          {grouped.map(group => (
            <div key={group.category}>
              <p className="text-white/40 text-xs uppercase tracking-wider mb-2">
                {SCENT_CATEGORY_LABELS[group.category]}
              </p>
              <div className="space-y-2">
                {group.items.map(product => {
                  const productPairings = getPairingsForProduct(product.id);
                  return (
                    <div
                      key={product.id}
                      className={`rounded-xl p-3 border ${
                        product.needsRestock
                          ? 'bg-amber-500/5 border-amber-500/20'
                          : 'bg-white/5 border-white/10'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-white text-sm font-medium truncate">{product.productName}</span>
                          {product.isSignature && <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 flex-shrink-0" />}
                          {product.needsRestock && (
                            <span className="text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full flex-shrink-0 flex items-center gap-1">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              Restock
                            </span>
                          )}
                        </div>
                      </div>

                      {product.brand && <p className="text-white/30 text-xs">{product.brand}</p>}
                      {product.scentNotes && <p className="text-pink-400/50 text-xs mb-2">{product.scentNotes}</p>}

                      {/* Pairings */}
                      {productPairings.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {productPairings.map(pa => {
                            const strength = getConditioningStrength(pa.pairingCount);
                            return (
                              <span
                                key={pa.id}
                                className="text-xs bg-white/5 rounded-full px-2 py-0.5"
                              >
                                <span className="text-white/40">{PAIRING_LABELS[pa.pairedWith]}:</span>{' '}
                                <span className="text-white/60">{pa.pairingCount}x</span>{' '}
                                <span className={STRENGTH_COLORS[strength]}>({strength})</span>
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setShowPairingFor(showPairingFor === product.id ? null : product.id)}
                          className="flex-1 py-1.5 rounded-lg bg-pink-500/20 text-pink-300 text-xs font-medium hover:bg-pink-500/30 transition-colors flex items-center justify-center gap-1"
                        >
                          <Link className="w-3 h-3" />
                          Pair
                        </button>
                        <button
                          onClick={() => toggleRestock(product.id, !product.needsRestock)}
                          className={`px-2 py-1.5 rounded-lg text-xs transition-colors ${
                            product.needsRestock
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-amber-500/10 text-amber-400/60'
                          }`}
                        >
                          {product.needsRestock ? 'Stocked' : 'Restock'}
                        </button>
                        <button
                          onClick={() => remove(product.id)}
                          className="p-1.5 rounded-lg bg-white/5 text-white/30 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Pairing activity selector */}
                      {showPairingFor === product.id && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {ACTIVITIES.map(act => (
                            <button
                              key={act}
                              onClick={() => handlePair(product.id, act)}
                              className="px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-300 text-xs hover:bg-purple-500/30 transition-colors"
                            >
                              {PAIRING_LABELS[act]}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
