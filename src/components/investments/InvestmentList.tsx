import { useState } from 'react';
import { Search, Lock, Trash2, Check } from 'lucide-react';
import { useProtocol } from '../../context/ProtocolContext';
import { INVESTMENT_CATEGORIES, formatCurrency } from '../../data/investment-categories';
import { CategoryBadge } from './shared';
import type { Investment, InvestmentCategory } from '../../types/investments';

export function InvestmentList() {
  const { investments, investmentsLoading, deleteInvestment } = useProtocol();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<InvestmentCategory | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (investmentsLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card p-4 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-protocol-surface-light" />
              <div className="flex-1">
                <div className="h-4 bg-protocol-surface-light rounded w-2/3 mb-2" />
                <div className="h-3 bg-protocol-surface-light rounded w-1/2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Filter investments
  const filteredInvestments = investments.filter((inv) => {
    const matchesSearch =
      searchTerm === '' ||
      inv.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.retailer?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory =
      filterCategory === 'all' || inv.category === filterCategory;

    return matchesSearch && matchesCategory;
  });

  const handleDelete = async (id: string) => {
    if (deletingId === id) {
      await deleteInvestment(id);
      setDeletingId(null);
      setExpandedId(null);
    } else {
      setDeletingId(id);
      // Reset after 3 seconds if not confirmed
      setTimeout(() => setDeletingId(null), 3000);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search & Filter */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-protocol-text-muted" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search investments..."
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-protocol-surface border border-protocol-border
                       text-protocol-text placeholder:text-protocol-text-muted/50 text-sm
                       focus:outline-none focus:ring-2 focus:ring-protocol-accent"
          />
        </div>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value as InvestmentCategory | 'all')}
          className="px-3 py-2 rounded-lg bg-protocol-surface border border-protocol-border
                     text-protocol-text text-sm focus:outline-none focus:ring-2 focus:ring-protocol-accent"
        >
          <option value="all">All</option>
          {Object.entries(INVESTMENT_CATEGORIES).map(([key, info]) => (
            <option key={key} value={key}>
              {info.emoji} {info.label}
            </option>
          ))}
        </select>
      </div>

      {/* Investment List */}
      {filteredInvestments.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-protocol-text-muted">
            {searchTerm || filterCategory !== 'all'
              ? 'No investments match your filters.'
              : 'No investments yet. Tap + to add one.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredInvestments.map((investment) => (
            <InvestmentCard
              key={investment.id}
              investment={investment}
              isExpanded={expandedId === investment.id}
              onToggleExpand={() =>
                setExpandedId(expandedId === investment.id ? null : investment.id)
              }
              onDelete={() => handleDelete(investment.id)}
              isDeleting={deletingId === investment.id}
            />
          ))}
        </div>
      )}

      {/* Summary */}
      {filteredInvestments.length > 0 && (
        <div className="text-center text-sm text-protocol-text-muted">
          {filteredInvestments.length} item{filteredInvestments.length !== 1 ? 's' : ''} ·{' '}
          {formatCurrency(filteredInvestments.reduce((sum, inv) => sum + inv.amount, 0))}
        </div>
      )}
    </div>
  );
}

interface InvestmentCardProps {
  investment: Investment;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

function InvestmentCard({
  investment,
  isExpanded,
  onToggleExpand,
  onDelete,
  isDeleting,
}: InvestmentCardProps) {
  const categoryInfo = INVESTMENT_CATEGORIES[investment.category];

  return (
    <div className="card overflow-hidden">
      <button
        onClick={onToggleExpand}
        className="w-full p-4 flex items-center gap-3 text-left hover:bg-protocol-surface-light/50 transition-colors"
      >
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
          style={{ backgroundColor: 'rgba(168, 85, 247, 0.1)' }}
        >
          {categoryInfo.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-protocol-text truncate">
              {investment.name}
            </p>
            {investment.private && (
              <Lock className="w-3 h-3 text-protocol-text-muted flex-shrink-0" />
            )}
          </div>
          <p className="text-xs text-protocol-text-muted">
            {new Date(investment.purchaseDate).toLocaleDateString()} ·{' '}
            {investment.retailer || categoryInfo.label}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-protocol-accent">
            {formatCurrency(investment.amount)}
          </p>
          {investment.timesUsed > 0 && (
            <p className="text-xs text-protocol-text-muted">
              Used {investment.timesUsed}x
            </p>
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-protocol-border">
          {investment.notes && (
            <p className="text-sm text-protocol-text-muted pt-3">{investment.notes}</p>
          )}

          <div className="flex items-center justify-between pt-2">
            <CategoryBadge category={investment.category} size="sm" />

            <div className="flex items-center gap-2">
              <button
                onClick={onDelete}
                className={`p-2 rounded-lg transition-colors ${
                  isDeleting
                    ? 'bg-protocol-danger text-white'
                    : 'text-protocol-text-muted hover:text-protocol-danger hover:bg-protocol-surface-light'
                }`}
              >
                {isDeleting ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {isDeleting && (
            <p className="text-xs text-protocol-danger text-center">
              Click again to confirm deletion
            </p>
          )}
        </div>
      )}
    </div>
  );
}
