import { useState } from 'react';
import { X, Calendar, Link, Store, FileText, Loader2 } from 'lucide-react';
import { useProtocol } from '../../context/ProtocolContext';
import { CategoryPicker, PriceInput, PrivacyToggle } from './shared';
import { isCategoryPrivateByDefault } from '../../data/investment-categories';
import type { InvestmentCategory, InvestmentInput } from '../../types/investments';

interface AddInvestmentModalProps {
  onClose: () => void;
}

export function AddInvestmentModal({ onClose }: AddInvestmentModalProps) {
  const { addInvestment } = useProtocol();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState<InvestmentCategory | null>(null);
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [retailer, setRetailer] = useState('');
  const [originalUrl, setOriginalUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);

  // Update privacy when category changes
  const handleCategoryChange = (newCategory: InvestmentCategory) => {
    setCategory(newCategory);
    setIsPrivate(isCategoryPrivateByDefault(newCategory));
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
    if (!amount || amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setIsSubmitting(true);

    try {
      const input: InvestmentInput = {
        name: name.trim(),
        category,
        amount,
        purchaseDate,
        retailer: retailer.trim() || undefined,
        originalUrl: originalUrl.trim() || undefined,
        notes: notes.trim() || undefined,
        private: isPrivate,
      };

      await addInvestment(input);
      onClose();
    } catch (err) {
      console.error('Failed to add investment:', err);
      setError('Failed to add investment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-protocol-bg/95 flex items-start justify-center overflow-y-auto">
      <div className="w-full max-w-sm my-4 mx-4">
        <form onSubmit={handleSubmit} className="card">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-protocol-border">
            <h2 className="text-lg font-semibold text-protocol-text">
              Add Investment
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
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-protocol-text mb-2">
                What did you get? <span className="text-protocol-danger">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Rose midi dress"
                className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border
                           text-protocol-text placeholder:text-protocol-text-muted/50
                           focus:outline-none focus:ring-2 focus:ring-protocol-accent"
                autoFocus
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
                showExamples
                compact
              />
            </div>

            {/* Amount */}
            <PriceInput
              value={amount}
              onChange={setAmount}
              label="Amount"
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
                Where did you buy it? <span className="text-protocol-text-muted">(optional)</span>
              </label>
              <input
                type="text"
                value={retailer}
                onChange={(e) => setRetailer(e.target.value)}
                placeholder="Amazon, Sephora, etc."
                className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border
                           text-protocol-text placeholder:text-protocol-text-muted/50
                           focus:outline-none focus:ring-2 focus:ring-protocol-accent"
              />
            </div>

            {/* Link */}
            <div>
              <label className="block text-sm font-medium text-protocol-text mb-2">
                <Link className="w-4 h-4 inline mr-2" />
                Link <span className="text-protocol-text-muted">(optional)</span>
              </label>
              <input
                type="url"
                value={originalUrl}
                onChange={(e) => setOriginalUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border
                           text-protocol-text placeholder:text-protocol-text-muted/50
                           focus:outline-none focus:ring-2 focus:ring-protocol-accent"
              />
            </div>

            {/* Privacy Toggle */}
            <PrivacyToggle
              value={isPrivate}
              onChange={setIsPrivate}
              description="Private items won't be visible to your accountability partner"
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
                placeholder="Any additional notes..."
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
                'Add to Ledger'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
