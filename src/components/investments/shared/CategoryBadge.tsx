import { INVESTMENT_CATEGORIES } from '../../../data/investment-categories';
import type { InvestmentCategory } from '../../../types/investments';
import { Lock } from 'lucide-react';

interface CategoryBadgeProps {
  category: InvestmentCategory;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  showPrivate?: boolean;
  isPrivate?: boolean;
}

export function CategoryBadge({
  category,
  size = 'md',
  showLabel = true,
  showPrivate = false,
  isPrivate = false,
}: CategoryBadgeProps) {
  const info = INVESTMENT_CATEGORIES[category];

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  const emojiSizes = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-protocol-surface-light border border-protocol-border ${sizeClasses[size]}`}
    >
      <span className={emojiSizes[size]}>{info.emoji}</span>
      {showLabel && (
        <span className="text-protocol-text font-medium">{info.label}</span>
      )}
      {showPrivate && isPrivate && (
        <Lock className="w-3 h-3 text-protocol-text-muted" />
      )}
    </span>
  );
}

// Grid of category badges (for displaying invested categories)
interface CategoryBadgeGridProps {
  categories: InvestmentCategory[];
  size?: 'sm' | 'md';
}

export function CategoryBadgeGrid({ categories, size = 'sm' }: CategoryBadgeGridProps) {
  if (categories.length === 0) {
    return (
      <span className="text-sm text-protocol-text-muted">No categories yet</span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {categories.map((category) => (
        <CategoryBadge key={category} category={category} size={size} showLabel={false} />
      ))}
    </div>
  );
}

// Category progress indicator
interface CategoryProgressProps {
  category: InvestmentCategory;
  amount: number;
  total: number;
}

export function CategoryProgress({ category, amount, total }: CategoryProgressProps) {
  const info = INVESTMENT_CATEGORIES[category];
  const percentage = total > 0 ? (amount / total) * 100 : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm">
          <span>{info.emoji}</span>
          <span className="text-protocol-text">{info.label}</span>
        </span>
        <span className="text-sm text-protocol-text-muted">
          ${amount.toFixed(0)} ({percentage.toFixed(0)}%)
        </span>
      </div>
      <div className="h-2 bg-protocol-surface-light rounded-full overflow-hidden">
        <div
          className="h-full bg-protocol-accent rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
