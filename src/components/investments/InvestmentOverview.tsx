import { TrendingUp, Package, Clock } from 'lucide-react';
import { useProtocol } from '../../context/ProtocolContext';
import { INVESTMENT_CATEGORIES, formatCurrency } from '../../data/investment-categories';
import { CategoryProgress, CategoryBadge } from './shared';
import type { InvestmentCategory } from '../../types/investments';

export function InvestmentOverview() {
  const { investmentSummary, investmentsLoading } = useProtocol();

  if (investmentsLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card p-4 animate-pulse">
            <div className="h-4 bg-protocol-surface-light rounded w-1/3 mb-2" />
            <div className="h-6 bg-protocol-surface-light rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (!investmentSummary || investmentSummary.itemCount === 0) {
    return (
      <div className="card p-8 text-center">
        <Package className="w-12 h-12 text-protocol-text-muted mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-protocol-text mb-2">
          No investments yet
        </h3>
        <p className="text-sm text-protocol-text-muted mb-4">
          Track your feminization purchases to see your commitment grow.
        </p>
        <p className="text-xs text-protocol-text-muted">
          Tap the + button to add your first investment.
        </p>
      </div>
    );
  }

  // Get categories with amounts, sorted by amount
  const categoriesWithAmounts = (
    Object.entries(investmentSummary.byCategory) as [InvestmentCategory, number][]
  )
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-protocol-text">
            {investmentSummary.itemCount}
          </p>
          <p className="text-xs text-protocol-text-muted">Items</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-protocol-text">
            {investmentSummary.categoryCount}
          </p>
          <p className="text-xs text-protocol-text-muted">Categories</p>
        </div>
        <div className="card p-3 text-center">
          <p className="text-2xl font-bold text-protocol-text">
            {formatCurrency(
              investmentSummary.totalInvested / Math.max(1, investmentSummary.itemCount)
            )}
          </p>
          <p className="text-xs text-protocol-text-muted">Avg Item</p>
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="card p-4 space-y-4">
        <h3 className="text-sm font-semibold text-protocol-text flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-protocol-accent" />
          By Category
        </h3>
        <div className="space-y-3">
          {categoriesWithAmounts.slice(0, 5).map(([category, amount]) => (
            <CategoryProgress
              key={category}
              category={category}
              amount={amount}
              total={investmentSummary.totalInvested}
            />
          ))}
        </div>
        {categoriesWithAmounts.length > 5 && (
          <p className="text-xs text-protocol-text-muted text-center">
            +{categoriesWithAmounts.length - 5} more categories
          </p>
        )}
      </div>

      {/* Recent Purchases */}
      {investmentSummary.recentPurchases.length > 0 && (
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-protocol-text flex items-center gap-2">
            <Clock className="w-4 h-4 text-protocol-accent" />
            Recent Purchases
          </h3>
          <div className="space-y-2">
            {investmentSummary.recentPurchases.slice(0, 3).map((investment) => (
              <div
                key={investment.id}
                className="flex items-center justify-between p-2 rounded-lg bg-protocol-surface-light"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">
                    {INVESTMENT_CATEGORIES[investment.category].emoji}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-protocol-text">
                      {investment.name}
                    </p>
                    <p className="text-xs text-protocol-text-muted">
                      {new Date(investment.purchaseDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <p className="text-sm font-semibold text-protocol-accent">
                  {formatCurrency(investment.amount)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unused Items Alert */}
      {investmentSummary.unusedItems.length > 0 && (
        <div className="card p-4 border-l-4 border-l-protocol-warning">
          <h3 className="text-sm font-semibold text-protocol-text mb-2">
            Items to Use
          </h3>
          <p className="text-xs text-protocol-text-muted mb-3">
            You have {investmentSummary.unusedItems.length} item
            {investmentSummary.unusedItems.length > 1 ? 's' : ''} that haven't been used recently.
          </p>
          <div className="flex flex-wrap gap-2">
            {investmentSummary.unusedItems.slice(0, 3).map((item) => (
              <CategoryBadge
                key={item.id}
                category={item.category}
                size="sm"
                showLabel={false}
              />
            ))}
            {investmentSummary.unusedItems.length > 3 && (
              <span className="text-xs text-protocol-text-muted self-center">
                +{investmentSummary.unusedItems.length - 3} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
