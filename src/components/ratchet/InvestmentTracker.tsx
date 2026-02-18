/**
 * InvestmentTracker
 *
 * Implements v2 Part 6: Investment Tracking
 * Displays financial investments in transformation as sunk cost leverage
 */

import { useState, useMemo } from 'react';
import {
  DollarSign,
  Plus,
  ShoppingBag,
  Shirt,
  Sparkles,
  Scissors,
  Heart,
  Package,
  CreditCard,
  TrendingUp,
  X,
  Calendar,
} from 'lucide-react';
import { useInvestments, type Investment } from '../../hooks/useRatchetSystem';

interface InvestmentTrackerProps {
  showAddButton?: boolean;
  maxItems?: number;
  compact?: boolean;
  className?: string;
}

const CATEGORY_CONFIG: Record<string, {
  label: string;
  icon: typeof DollarSign;
  color: string;
}> = {
  clothing: { label: 'Clothing', icon: Shirt, color: 'text-blue-400' },
  lingerie: { label: 'Lingerie', icon: Heart, color: 'text-pink-400' },
  toys: { label: 'Toys', icon: Sparkles, color: 'text-purple-400' },
  chastity: { label: 'Chastity', icon: Package, color: 'text-red-400' },
  makeup: { label: 'Makeup', icon: Sparkles, color: 'text-amber-400' },
  accessories: { label: 'Accessories', icon: ShoppingBag, color: 'text-green-400' },
  services: { label: 'Services', icon: Scissors, color: 'text-cyan-400' },
  subscriptions: { label: 'Subscriptions', icon: CreditCard, color: 'text-indigo-400' },
  other: { label: 'Other', icon: Package, color: 'text-gray-400' },
};

export function InvestmentTracker({
  showAddButton = true,
  maxItems,
  compact = false,
  className = '',
}: InvestmentTrackerProps) {
  const { investments, isLoading, totalInvestment, investmentsByCategory, addInvestment } = useInvestments();
  const [showAddModal, setShowAddModal] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | 'all'>('all');

  const displayInvestments = useMemo(() => {
    let result = investments;
    if (categoryFilter !== 'all') {
      result = result.filter(inv => inv.category === categoryFilter);
    }
    if (maxItems) {
      result = result.slice(0, maxItems);
    }
    return result;
  }, [investments, categoryFilter, maxItems]);

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-24 bg-protocol-surface rounded-xl mb-4" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-16 bg-protocol-surface rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className={className}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-protocol-text-muted text-xs">Total Invested</p>
              <p className="text-protocol-text text-xl font-bold">{formatCurrency(totalInvestment)}</p>
            </div>
          </div>
          {showAddButton && (
            <button
              onClick={() => setShowAddModal(true)}
              className="p-2 rounded-lg bg-protocol-surface hover:bg-protocol-border transition-colors"
            >
              <Plus className="w-5 h-5 text-protocol-text-muted" />
            </button>
          )}
        </div>
        {showAddModal && (
          <AddInvestmentModal
            onAdd={addInvestment}
            onClose={() => setShowAddModal(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Header with total */}
      <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 rounded-xl p-6 mb-4 border border-green-500/20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-green-400/80 text-sm font-medium mb-1">Total Invested in Her</p>
            <p className="text-white text-3xl font-bold">{formatCurrency(totalInvestment)}</p>
            <p className="text-green-400/60 text-xs mt-1">
              {investments.length} purchases across {Object.keys(investmentsByCategory).length} categories
            </p>
          </div>
          <div className="text-right">
            <TrendingUp className="w-10 h-10 text-green-400/50" />
          </div>
        </div>

        {/* Category breakdown */}
        {Object.keys(investmentsByCategory).length > 0 && (
          <div className="mt-4 pt-4 border-t border-green-500/20">
            <div className="flex flex-wrap gap-2">
              {Object.entries(investmentsByCategory)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 4)
                .map(([category, amount]) => {
                  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.other;
                  return (
                    <div
                      key={category}
                      className="px-3 py-1.5 bg-white/5 rounded-lg flex items-center gap-2"
                    >
                      <config.icon className={`w-3 h-3 ${config.color}`} />
                      <span className="text-white/80 text-xs">{formatCurrency(amount)}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* Filter and Add */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          <FilterButton
            active={categoryFilter === 'all'}
            onClick={() => setCategoryFilter('all')}
          >
            All
          </FilterButton>
          {Object.entries(CATEGORY_CONFIG).slice(0, 5).map(([key, config]) => (
            <FilterButton
              key={key}
              active={categoryFilter === key}
              onClick={() => setCategoryFilter(key)}
            >
              <config.icon className={`w-3 h-3 ${config.color}`} />
              {config.label}
            </FilterButton>
          ))}
        </div>
        {showAddButton && (
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 bg-protocol-accent text-white rounded-lg text-sm font-medium
                     flex items-center gap-1 hover:bg-protocol-accent/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        )}
      </div>

      {/* Investment list */}
      {displayInvestments.length === 0 ? (
        <div className="text-center py-8">
          <ShoppingBag className="w-12 h-12 text-protocol-text-muted mx-auto mb-3" />
          <p className="text-protocol-text-muted">No investments logged yet</p>
          {showAddButton && (
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 px-4 py-2 bg-protocol-accent text-white rounded-lg text-sm"
            >
              Log Your First Investment
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {displayInvestments.map((investment) => (
            <InvestmentCard key={investment.id} investment={investment} />
          ))}
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <AddInvestmentModal
          onAdd={addInvestment}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}

// Filter button component
function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
        active
          ? 'bg-protocol-accent text-white'
          : 'bg-protocol-surface text-protocol-text-muted hover:text-protocol-text'
      }`}
    >
      {children}
    </button>
  );
}

// Investment card component
function InvestmentCard({ investment }: { investment: Investment }) {
  const config = CATEGORY_CONFIG[investment.category] || CATEGORY_CONFIG.other;
  const Icon = config.icon;

  return (
    <div className="p-4 bg-protocol-surface border border-protocol-border rounded-xl
                    flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg bg-protocol-bg flex items-center justify-center ${config.color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-protocol-text font-medium truncate">{investment.name}</h4>
        <div className="flex items-center gap-2 text-xs text-protocol-text-muted">
          <span>{config.label}</span>
          <span>•</span>
          <span>{new Date(investment.date).toLocaleDateString()}</span>
        </div>
      </div>
      <div className="text-right">
        <p className="text-protocol-text font-semibold">
          ${investment.amount.toFixed(2)}
        </p>
        {investment.timesUsed > 0 && (
          <p className="text-xs text-protocol-text-muted">
            Used {investment.timesUsed}x
          </p>
        )}
      </div>
    </div>
  );
}

// Add investment modal
function AddInvestmentModal({
  onAdd,
  onClose,
}: {
  onAdd: (name: string, category: string, amount: number, options?: { date?: string; notes?: string }) => Promise<Investment | null>;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('clothing');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !amount) return;

    setIsSubmitting(true);
    try {
      await onAdd(name, category, parseFloat(amount), { date, notes: notes || undefined });
      onClose();
    } catch (err) {
      console.error('Failed to add investment:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-md bg-protocol-surface border border-protocol-border rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-protocol-border flex items-center justify-between">
          <h3 className="text-protocol-text font-semibold">Log Investment</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-protocol-bg">
            <X className="w-5 h-5 text-protocol-text-muted" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-protocol-text mb-1">
              Item Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Pink silk blouse"
              className="w-full px-3 py-2 bg-protocol-bg border border-protocol-border rounded-lg
                       text-protocol-text placeholder-protocol-text-muted"
              required
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-protocol-text mb-1">
              Category
            </label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(CATEGORY_CONFIG).slice(0, 6).map(([key, config]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(key)}
                  className={`p-2 rounded-lg text-xs font-medium flex flex-col items-center gap-1 transition-colors ${
                    category === key
                      ? 'bg-protocol-accent text-white'
                      : 'bg-protocol-bg text-protocol-text-muted hover:text-protocol-text'
                  }`}
                >
                  <config.icon className={`w-4 h-4 ${category === key ? 'text-white' : config.color}`} />
                  {config.label}
                </button>
              ))}
            </div>
          </div>

          {/* Amount and Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-protocol-text mb-1">
                Amount ($)
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-protocol-text-muted" />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-9 pr-3 py-2 bg-protocol-bg border border-protocol-border rounded-lg
                           text-protocol-text placeholder-protocol-text-muted"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-protocol-text mb-1">
                Date
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-protocol-text-muted" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-protocol-bg border border-protocol-border rounded-lg
                           text-protocol-text"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-protocol-text mb-1">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about this purchase..."
              rows={2}
              className="w-full px-3 py-2 bg-protocol-bg border border-protocol-border rounded-lg
                       text-protocol-text placeholder-protocol-text-muted resize-none"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting || !name || !amount}
            className="w-full py-3 bg-protocol-accent text-white rounded-xl font-medium
                     hover:bg-protocol-accent/90 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Adding...' : 'Add Investment'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default InvestmentTracker;
