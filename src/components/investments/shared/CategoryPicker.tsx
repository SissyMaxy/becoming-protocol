import { INVESTMENT_CATEGORIES, getSortedCategories } from '../../../data/investment-categories';
import type { InvestmentCategory } from '../../../types/investments';

interface CategoryPickerProps {
  value: InvestmentCategory | null;
  onChange: (category: InvestmentCategory) => void;
  showExamples?: boolean;
  compact?: boolean;
}

export function CategoryPicker({
  value,
  onChange,
  showExamples = false,
  compact = false,
}: CategoryPickerProps) {
  const categories = getSortedCategories();

  if (compact) {
    return (
      <div className="grid grid-cols-4 gap-2">
        {categories.map((category) => {
          const info = INVESTMENT_CATEGORIES[category];
          const isSelected = value === category;

          return (
            <button
              key={category}
              type="button"
              onClick={() => onChange(category)}
              className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all ${
                isSelected
                  ? 'bg-protocol-accent/20 border-protocol-accent text-protocol-accent'
                  : 'bg-protocol-surface border-protocol-border text-protocol-text-muted hover:border-protocol-accent/50'
              }`}
            >
              <span className="text-lg">{info.emoji}</span>
              <span className="text-xs mt-1 truncate w-full text-center">
                {info.label.split(' ')[0]}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {categories.map((category) => {
          const info = INVESTMENT_CATEGORIES[category];
          const isSelected = value === category;

          return (
            <button
              key={category}
              type="button"
              onClick={() => onChange(category)}
              className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all ${
                isSelected
                  ? 'bg-protocol-accent/20 border-protocol-accent text-protocol-text'
                  : 'bg-protocol-surface border-protocol-border text-protocol-text-muted hover:border-protocol-accent/50 hover:bg-protocol-surface-light'
              }`}
            >
              <span className="text-xl">{info.emoji}</span>
              <span className="text-xs mt-1 font-medium">{info.label}</span>
              {info.defaultPrivate && (
                <span className="text-[10px] text-protocol-text-muted mt-0.5">Private</span>
              )}
            </button>
          );
        })}
      </div>

      {showExamples && value && (
        <p className="text-xs text-protocol-text-muted px-1">
          {INVESTMENT_CATEGORIES[value].examples}
        </p>
      )}
    </div>
  );
}

// Smaller inline category selector
interface CategorySelectProps {
  value: InvestmentCategory | null;
  onChange: (category: InvestmentCategory) => void;
}

export function CategorySelect({ value, onChange }: CategorySelectProps) {
  const categories = getSortedCategories();

  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value as InvestmentCategory)}
      className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border
                 text-protocol-text focus:outline-none focus:ring-2 focus:ring-protocol-accent"
    >
      <option value="" disabled>
        Select category...
      </option>
      {categories.map((category) => {
        const info = INVESTMENT_CATEGORIES[category];
        return (
          <option key={category} value={category}>
            {info.emoji} {info.label}
          </option>
        );
      })}
    </select>
  );
}
