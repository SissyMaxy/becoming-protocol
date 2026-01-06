/**
 * Unused Investments Preview
 * Shows investments not used in tasks on Today screen
 */

import { Sparkles, ChevronRight } from 'lucide-react';
import { Investment } from '../types/investments';
import { INVESTMENT_CATEGORIES } from '../data/investment-categories';

interface UnusedInvestmentsPreviewProps {
  investments: Investment[];
  onViewAll: () => void;
}

export function UnusedInvestmentsPreview({
  investments,
  onViewAll,
}: UnusedInvestmentsPreviewProps) {
  // Filter to unused items (7+ days since purchase, never used in tasks)
  const today = new Date();
  const unusedItems = investments
    .filter((inv) => {
      const daysSincePurchase = Math.floor(
        (today.getTime() - inv.purchaseDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      return daysSincePurchase >= 7 && inv.timesUsed === 0;
    })
    .slice(0, 3); // Max 3 items

  if (unusedItems.length === 0) {
    return null;
  }

  return (
    <div className="card overflow-hidden">
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-protocol-accent" />
            <h3 className="text-sm font-medium text-protocol-text">
              Waiting to be used
            </h3>
          </div>
          <button
            onClick={onViewAll}
            className="text-xs text-protocol-accent hover:text-protocol-accent-soft transition-colors
                       flex items-center gap-1"
          >
            View all
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>

        <div className="space-y-2">
          {unusedItems.map((item) => {
            const category = INVESTMENT_CATEGORIES[item.category];
            const daysSincePurchase = Math.floor(
              (today.getTime() - item.purchaseDate.getTime()) / (1000 * 60 * 60 * 24)
            );

            return (
              <div
                key={item.id}
                className="flex items-center gap-3 p-2 rounded-lg bg-protocol-surface-light/50"
              >
                <span className="text-lg">{category.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-protocol-text truncate">
                    {item.name}
                  </p>
                </div>
                <span className="text-xs text-protocol-text-muted whitespace-nowrap">
                  {daysSincePurchase}d ago
                </span>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-protocol-text-muted text-center mt-3">
          Incorporate these into today's practice
        </p>
      </div>
    </div>
  );
}
