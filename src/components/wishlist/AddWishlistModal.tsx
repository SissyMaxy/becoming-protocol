import React, { useState } from 'react';
import { X, Link, FileText, Loader2 } from 'lucide-react';
import { useProtocol } from '../../context/ProtocolContext';
import { CategoryPicker, PriceInput, PrivacyToggle } from '../investments/shared';
import { isCategoryPrivateByDefault } from '../../data/investment-categories';
import { detectRetailer, getRetailerName } from '../../lib/affiliates';
import type { InvestmentCategory, WishlistItemInput } from '../../types/investments';

interface AddWishlistModalProps {
  onClose: () => void;
}

export function AddWishlistModal({ onClose }: AddWishlistModalProps) {
  const { addToWishlist } = useProtocol();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState<InvestmentCategory | null>(null);
  const [estimatedPrice, setEstimatedPrice] = useState<number | undefined>(undefined);
  const [originalUrl, setOriginalUrl] = useState('');
  const [retailer, setRetailer] = useState('');
  const [priority, setPriority] = useState<1 | 2 | 3>(2);
  const [notes, setNotes] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);

  // Update privacy when category changes
  const handleCategoryChange = (newCategory: InvestmentCategory) => {
    setCategory(newCategory);
    setIsPrivate(isCategoryPrivateByDefault(newCategory));
  };

  // Auto-detect retailer from URL
  const handleUrlChange = (url: string) => {
    setOriginalUrl(url);
    if (url) {
      const detected = detectRetailer(url);
      if (detected) {
        setRetailer(getRetailerName(url) || '');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!name.trim()) {
      setError('Please enter a name');
      return;
    }
    if (!category) {
      setError('Please select a category');
      return;
    }

    setIsSubmitting(true);

    try {
      const input: WishlistItemInput = {
        name: name.trim(),
        category,
        estimatedPrice,
        originalUrl: originalUrl.trim() || undefined,
        retailer: retailer.trim() || undefined,
        priority,
        notes: notes.trim() || undefined,
        private: isPrivate,
      };

      await addToWishlist(input);
      onClose();
    } catch (err) {
      console.error('Failed to add to wishlist:', err);
      setError('Failed to add item. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const priorityOptions: { value: 1 | 2 | 3; label: string; stars: string }[] = [
    { value: 1, label: 'High', stars: '\u2B50\u2B50\u2B50' },
    { value: 2, label: 'Medium', stars: '\u2B50\u2B50' },
    { value: 3, label: 'Low', stars: '\u2B50' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-protocol-bg/95 flex items-start justify-center overflow-y-auto">
      <div className="w-full max-w-sm my-4 mx-4">
        <form onSubmit={handleSubmit} className="card">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-protocol-border">
            <h2 className="text-lg font-semibold text-protocol-text">
              Add to Wishlist
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

          {/* Form Content */}
          <div className="p-4 space-y-4">
            {/* Product Link */}
            <div>
              <label className="block text-sm font-medium text-protocol-text mb-2">
                <Link className="w-4 h-4 inline mr-2" />
                Product Link <span className="text-protocol-text-muted">(optional)</span>
              </label>
              <input
                type="url"
                value={originalUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://amazon.com/..."
                className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border
                           text-protocol-text placeholder:text-protocol-text-muted/50
                           focus:outline-none focus:ring-2 focus:ring-protocol-accent"
              />
              {retailer && (
                <p className="text-xs text-protocol-success mt-1">
                  Detected: {retailer}
                </p>
              )}
            </div>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-protocol-text mb-2">
                Name <span className="text-protocol-danger">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Dyson Airwrap"
                className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border
                           text-protocol-text placeholder:text-protocol-text-muted/50
                           focus:outline-none focus:ring-2 focus:ring-protocol-accent"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-protocol-text mb-2">
                Category <span className="text-protocol-danger">*</span>
              </label>
              <CategoryPicker
                value={category}
                onChange={handleCategoryChange}
                compact
              />
            </div>

            {/* Estimated Price */}
            <PriceInput
              value={estimatedPrice}
              onChange={setEstimatedPrice}
              label="Estimated Price"
              placeholder="0.00"
            />

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-protocol-text mb-2">
                Priority
              </label>
              <div className="flex gap-2">
                {priorityOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPriority(option.value)}
                    className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                      priority === option.value
                        ? 'bg-protocol-accent/20 border-protocol-accent text-protocol-text'
                        : 'bg-protocol-surface border-protocol-border text-protocol-text-muted hover:border-protocol-accent/50'
                    }`}
                  >
                    <span className="block text-base mb-0.5">{option.stars}</span>
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Privacy Toggle */}
            <PrivacyToggle
              value={isPrivate}
              onChange={setIsPrivate}
              description="Private items won't appear on shared wishlists"
            />

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-protocol-text mb-2">
                <FileText className="w-4 h-4 inline mr-2" />
                Notes <span className="text-protocol-text-muted">(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., For my birthday..."
                rows={2}
                className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border
                           text-protocol-text placeholder:text-protocol-text-muted/50
                           focus:outline-none focus:ring-2 focus:ring-protocol-accent resize-none"
              />
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
                  Adding...
                </>
              ) : (
                'Add to Wishlist'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
