import React, { useState } from 'react';
import { X, Calendar, Store, Loader2, PartyPopper, ArrowRight } from 'lucide-react';
import { useProtocol } from '../../context/ProtocolContext';
import { PriceInput } from '../investments/shared';
import { INVESTMENT_CATEGORIES, formatCurrency } from '../../data/investment-categories';
import type { WishlistItem } from '../../types/investments';

interface MarkPurchasedModalProps {
  item: WishlistItem;
  onClose: () => void;
}

export function MarkPurchasedModal({ item, onClose }: MarkPurchasedModalProps) {
  const { purchaseWishlistItem } = useProtocol();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [actualPrice, setActualPrice] = useState<number | undefined>(item.estimatedPrice);
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [retailer, setRetailer] = useState(item.retailer || '');

  const categoryInfo = INVESTMENT_CATEGORIES[item.category];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!actualPrice || actualPrice <= 0) {
      setError('Please enter a valid price');
      return;
    }

    setIsSubmitting(true);

    try {
      await purchaseWishlistItem(item.id, {
        actualPrice,
        purchaseDate,
        retailer: retailer.trim() || undefined,
      });
      onClose();
    } catch (err) {
      console.error('Failed to mark as purchased:', err);
      setError('Failed to process. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-protocol-bg/95 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <form onSubmit={handleSubmit} className="card">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-protocol-border">
            <h2 className="text-lg font-semibold text-protocol-text flex items-center gap-2">
              <PartyPopper className="w-5 h-5 text-protocol-accent" />
              You got it!
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-protocol-text-muted hover:text-protocol-text
                         hover:bg-protocol-surface-light transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Item Preview */}
          <div className="p-4 bg-protocol-surface-light">
            <div className="flex items-center gap-3">
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-12 h-12 rounded-lg object-cover"
                />
              ) : (
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center text-xl"
                  style={{ backgroundColor: 'rgba(168, 85, 247, 0.1)' }}
                >
                  {categoryInfo.emoji}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-protocol-text truncate">
                  {item.name}
                </p>
                <p className="text-xs text-protocol-text-muted">
                  {categoryInfo.label}
                </p>
              </div>
              {item.estimatedPrice && (
                <p className="text-sm text-protocol-text-muted">
                  Est. {formatCurrency(item.estimatedPrice)}
                </p>
              )}
            </div>
          </div>

          {/* Form Content */}
          <div className="p-4 space-y-4">
            {/* Actual Price */}
            <PriceInput
              value={actualPrice}
              onChange={setActualPrice}
              label="How much did you pay?"
              required
              placeholder="0.00"
            />

            {/* Purchase Date */}
            <div>
              <label className="block text-sm font-medium text-protocol-text mb-2">
                <Calendar className="w-4 h-4 inline mr-2" />
                Purchase Date
              </label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border
                           text-protocol-text focus:outline-none focus:ring-2 focus:ring-protocol-accent"
              />
            </div>

            {/* Retailer */}
            <div>
              <label className="block text-sm font-medium text-protocol-text mb-2">
                <Store className="w-4 h-4 inline mr-2" />
                Where did you buy it?
              </label>
              <input
                type="text"
                value={retailer}
                onChange={(e) => setRetailer(e.target.value)}
                placeholder={item.retailer || 'Amazon, Sephora, etc.'}
                className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border
                           text-protocol-text placeholder:text-protocol-text-muted/50
                           focus:outline-none focus:ring-2 focus:ring-protocol-accent"
              />
            </div>

            {/* Info Box */}
            <div className="p-3 rounded-lg bg-protocol-surface-light border border-protocol-border">
              <p className="text-xs text-protocol-text-muted">
                This will:
              </p>
              <ul className="text-xs text-protocol-text-muted mt-1 space-y-1">
                <li className="flex items-center gap-2">
                  <ArrowRight className="w-3 h-3 text-protocol-accent" />
                  Remove from wishlist
                </li>
                <li className="flex items-center gap-2">
                  <ArrowRight className="w-3 h-3 text-protocol-accent" />
                  Add to your investments
                </li>
                <li className="flex items-center gap-2">
                  <ArrowRight className="w-3 h-3 text-protocol-accent" />
                  Update your total invested
                </li>
              </ul>
            </div>

            {/* Error Message */}
            {error && (
              <p className="text-sm text-protocol-danger text-center">{error}</p>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-protocol-border">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-lg bg-protocol-accent text-white font-medium
                         hover:bg-protocol-accent-soft transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed
                         flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing...
                </>
              ) : (
                'Add to Investments'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
