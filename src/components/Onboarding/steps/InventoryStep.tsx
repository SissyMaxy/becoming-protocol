/**
 * Inventory Step - Captures existing investments during onboarding
 * Creates immediate sunk cost awareness from Day 1
 */

import { useState } from 'react';
import { StepNav } from '../OnboardingFlow';
import { UserProfile } from '../types';
import {
  InvestmentCategory,
  OnboardingInventoryCategory,
  EstimatedRange,
  RANGE_MIDPOINTS
} from '../../../types/investments';
import { INVESTMENT_CATEGORIES, formatCurrency } from '../../../data/investment-categories';
import { Check, Plus, X, Sparkles, ChevronRight } from 'lucide-react';

interface InventoryStepProps {
  profile: Partial<UserProfile>;
  onUpdate: (updates: Partial<UserProfile>) => void;
  onNext: () => void;
  onBack: () => void;
  onSaveInventory: (inventory: OnboardingInventoryCategory[]) => void;
}

type Screen = 'intro' | 'categories' | 'deepdive' | 'summary';

const CATEGORY_ORDER: InvestmentCategory[] = [
  'clothing',
  'skincare',
  'makeup',
  'body_care',
  'accessories',
  'hair',
  'forms_shapewear',
  'intimates',
  'fragrance',
  'nails',
  'voice',
  'medical_hrt',
  'services',
  'education'
];

const RANGES: { value: EstimatedRange; label: string }[] = [
  { value: '$0-50', label: '<$50' },
  { value: '$50-100', label: '$50-100' },
  { value: '$100-250', label: '$100-250' },
  { value: '$250-500', label: '$250-500' },
  { value: '$500-1000', label: '$500-1K' },
  { value: '$1000+', label: '$1000+' },
];

export function InventoryStep({
  profile: _profile,
  onUpdate,
  onNext,
  onBack,
  onSaveInventory
}: InventoryStepProps) {
  const [screen, setScreen] = useState<Screen>('intro');
  const [selectedCategories, setSelectedCategories] = useState<Set<InvestmentCategory>>(new Set());
  const [categoryData, setCategoryData] = useState<Map<InvestmentCategory, OnboardingInventoryCategory>>(new Map());
  const [currentCategoryIndex, setCurrentCategoryIndex] = useState(0);

  // Quick add modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemAmount, setNewItemAmount] = useState('');
  const [newItemPrivate, setNewItemPrivate] = useState(false);

  // Get the categories that were selected, in order
  const selectedCategoryList = CATEGORY_ORDER.filter(cat => selectedCategories.has(cat));
  const currentCategory = selectedCategoryList[currentCategoryIndex];

  // Calculate total
  const calculateTotal = (): number => {
    let total = 0;
    categoryData.forEach((data) => {
      // Add estimated range midpoint
      if (data.estimatedRange) {
        total += RANGE_MIDPOINTS[data.estimatedRange];
      }
      // Add specific items
      data.specificItems.forEach(item => {
        total += item.amount;
      });
    });
    return total;
  };

  // Handle skip
  const handleSkip = () => {
    onUpdate({ inventorySkipped: true, inventoryTotalEstimated: 0 });
    onNext();
  };

  // Handle category selection toggle
  const toggleCategory = (category: InvestmentCategory) => {
    const newSelected = new Set(selectedCategories);
    if (newSelected.has(category)) {
      newSelected.delete(category);
      // Also remove data for this category
      const newData = new Map(categoryData);
      newData.delete(category);
      setCategoryData(newData);
    } else {
      newSelected.add(category);
      // Initialize data for this category
      const newData = new Map(categoryData);
      newData.set(category, {
        category,
        specificItems: []
      });
      setCategoryData(newData);
    }
    setSelectedCategories(newSelected);
  };

  // Handle range selection for current category
  const selectRange = (range: EstimatedRange) => {
    if (!currentCategory) return;
    const newData = new Map(categoryData);
    const existing = newData.get(currentCategory) || { category: currentCategory, specificItems: [] };
    newData.set(currentCategory, { ...existing, estimatedRange: range });
    setCategoryData(newData);
  };

  // Handle adding specific item
  const handleAddItem = () => {
    if (!currentCategory || !newItemName.trim() || !newItemAmount) return;

    const amount = parseFloat(newItemAmount);
    if (isNaN(amount) || amount <= 0) return;

    const newData = new Map(categoryData);
    const existing = newData.get(currentCategory) || { category: currentCategory, specificItems: [] };
    newData.set(currentCategory, {
      ...existing,
      specificItems: [
        ...existing.specificItems,
        {
          name: newItemName.trim(),
          amount,
          private: newItemPrivate || INVESTMENT_CATEGORIES[currentCategory].defaultPrivate
        }
      ]
    });
    setCategoryData(newData);

    // Reset modal
    setNewItemName('');
    setNewItemAmount('');
    setNewItemPrivate(false);
    setShowAddModal(false);
  };

  // Handle removing specific item
  const handleRemoveItem = (index: number) => {
    if (!currentCategory) return;
    const newData = new Map(categoryData);
    const existing = newData.get(currentCategory);
    if (!existing) return;

    newData.set(currentCategory, {
      ...existing,
      specificItems: existing.specificItems.filter((_, i) => i !== index)
    });
    setCategoryData(newData);
  };

  // Handle next category in deep dive
  const handleNextCategory = () => {
    if (currentCategoryIndex < selectedCategoryList.length - 1) {
      setCurrentCategoryIndex(currentCategoryIndex + 1);
    } else {
      // Move to summary
      setScreen('summary');
    }
  };

  // Handle completing inventory
  const handleComplete = () => {
    const total = calculateTotal();
    onUpdate({
      inventorySkipped: false,
      inventoryTotalEstimated: total
    });
    onSaveInventory(Array.from(categoryData.values()));
    onNext();
  };

  // Render intro screen
  if (screen === 'intro') {
    return (
      <div className="flex-1 flex flex-col px-4 py-8 max-w-md mx-auto w-full">
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-protocol-accent/20 flex items-center justify-center">
            <Sparkles className="w-10 h-10 text-protocol-accent" />
          </div>

          <h1 className="text-2xl font-bold text-protocol-text">
            What have you already<br />invested in her?
          </h1>

          <p className="text-protocol-text-muted">
            Most people have already bought things before starting a system like this.
          </p>

          <p className="text-protocol-text-muted">
            Let's capture what you've already committed to. This helps me understand where you are and what you have to work with.
          </p>

          <div className="w-full space-y-3 pt-4">
            <button
              onClick={() => setScreen('categories')}
              className="w-full py-4 rounded-xl bg-protocol-accent text-white font-medium
                         hover:bg-protocol-accent/90 transition-colors flex items-center justify-center gap-2"
            >
              Let's do an inventory
              <ChevronRight className="w-5 h-5" />
            </button>

            <button
              onClick={handleSkip}
              className="text-sm text-protocol-text-muted hover:text-protocol-text transition-colors"
            >
              Skip for now
              <span className="block text-xs opacity-70">(You can add these later)</span>
            </button>
          </div>
        </div>

        <StepNav onBack={onBack} showBack={true} />
      </div>
    );
  }

  // Render category selection screen
  if (screen === 'categories') {
    return (
      <div className="flex-1 flex flex-col px-4 py-8 max-w-md mx-auto w-full">
        <div className="space-y-4 pb-24">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-protocol-text">
              What have you bought?
            </h2>
            <p className="text-sm text-protocol-text-muted mt-1">
              Check all that apply
            </p>
          </div>

          <div className="space-y-2">
            {CATEGORY_ORDER.map(category => {
              const info = INVESTMENT_CATEGORIES[category];
              const isSelected = selectedCategories.has(category);

              return (
                <button
                  key={category}
                  onClick={() => toggleCategory(category)}
                  className={`w-full p-4 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'bg-protocol-accent/10 border-protocol-accent'
                      : 'bg-protocol-surface border-protocol-border hover:border-protocol-accent/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{info.emoji}</span>
                      <div>
                        <p className="font-medium text-protocol-text">{info.label}</p>
                        <p className="text-xs text-protocol-text-muted">{info.examples}</p>
                      </div>
                    </div>
                    <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${
                      isSelected
                        ? 'bg-protocol-accent border-protocol-accent'
                        : 'border-protocol-border'
                    }`}>
                      {isSelected && <Check className="w-4 h-4 text-white" />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <StepNav
          onBack={() => setScreen('intro')}
          onNext={() => {
            if (selectedCategories.size > 0) {
              setCurrentCategoryIndex(0);
              setScreen('deepdive');
            } else {
              handleSkip();
            }
          }}
          nextLabel={selectedCategories.size > 0 ? 'Continue' : 'Skip'}
          showBack={true}
        />
      </div>
    );
  }

  // Render deep dive screen for each category
  if (screen === 'deepdive' && currentCategory) {
    const info = INVESTMENT_CATEGORIES[currentCategory];
    const data = categoryData.get(currentCategory) || { category: currentCategory, specificItems: [] };

    return (
      <div className="flex-1 flex flex-col px-4 py-8 max-w-md mx-auto w-full">
        <div className="space-y-6 pb-24">
          {/* Category header */}
          <div className="text-center">
            <span className="text-4xl mb-2 block">{info.emoji}</span>
            <h2 className="text-xl font-bold text-protocol-text">{info.label}</h2>
            <p className="text-sm text-protocol-text-muted mt-1">
              {currentCategoryIndex + 1} of {selectedCategoryList.length}
            </p>
          </div>

          {/* Range selection */}
          <div className="space-y-3">
            <p className="text-sm text-protocol-text-muted text-center">
              Roughly how much have you spent?
            </p>
            <div className="grid grid-cols-3 gap-2">
              {RANGES.map(range => (
                <button
                  key={range.value}
                  onClick={() => selectRange(range.value)}
                  className={`py-3 px-2 rounded-lg border text-sm font-medium transition-all ${
                    data.estimatedRange === range.value
                      ? 'bg-protocol-accent/20 border-protocol-accent text-protocol-text'
                      : 'bg-protocol-surface border-protocol-border text-protocol-text-muted hover:border-protocol-accent/50'
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>

          {/* Specific items section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-protocol-text-muted">
                Want to list specific items?
              </p>
              <span className="text-xs text-protocol-text-muted">(Optional)</span>
            </div>

            <button
              onClick={() => {
                setNewItemPrivate(info.defaultPrivate);
                setShowAddModal(true);
              }}
              className="w-full py-3 px-4 rounded-lg border border-dashed border-protocol-border
                         text-protocol-text-muted hover:border-protocol-accent hover:text-protocol-accent
                         transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add specific item
            </button>

            {/* Listed items */}
            {data.specificItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-protocol-text-muted">Items added:</p>
                {data.specificItems.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg bg-protocol-surface-light"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-protocol-text">{item.name}</span>
                      {item.private && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-protocol-surface text-protocol-text-muted">
                          Private
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-protocol-accent">
                        {formatCurrency(item.amount)}
                      </span>
                      <button
                        onClick={() => handleRemoveItem(index)}
                        className="p-1 text-protocol-text-muted hover:text-protocol-danger transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Running total */}
          <div className="text-center pt-4 border-t border-protocol-border">
            <p className="text-sm text-protocol-text-muted">Running total</p>
            <p className="text-2xl font-bold text-protocol-accent">
              {formatCurrency(calculateTotal())}
            </p>
          </div>
        </div>

        {/* Add item modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 bg-protocol-bg/95 flex items-center justify-center p-4">
            <div className="w-full max-w-sm card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-protocol-text">Add Item</h3>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="p-1 text-protocol-text-muted hover:text-protocol-text transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-protocol-text-muted mb-2">
                    What is it?
                  </label>
                  <input
                    type="text"
                    value={newItemName}
                    onChange={e => setNewItemName(e.target.value)}
                    placeholder="e.g., Clinique moisturizer"
                    autoFocus
                    className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border
                               text-protocol-text placeholder:text-protocol-text-muted/50
                               focus:outline-none focus:ring-2 focus:ring-protocol-accent"
                  />
                </div>

                <div>
                  <label className="block text-sm text-protocol-text-muted mb-2">
                    How much?
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-protocol-text-muted">$</span>
                    <input
                      type="number"
                      value={newItemAmount}
                      onChange={e => setNewItemAmount(e.target.value)}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="w-full pl-8 pr-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border
                                 text-protocol-text placeholder:text-protocol-text-muted/50
                                 focus:outline-none focus:ring-2 focus:ring-protocol-accent"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newItemPrivate}
                    onChange={e => setNewItemPrivate(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                    newItemPrivate
                      ? 'bg-protocol-accent border-protocol-accent'
                      : 'bg-protocol-surface border-protocol-border'
                  }`}>
                    {newItemPrivate && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className="text-sm text-protocol-text">Private</span>
                </label>
              </div>

              <button
                onClick={handleAddItem}
                disabled={!newItemName.trim() || !newItemAmount}
                className={`w-full py-3 rounded-lg font-medium transition-colors ${
                  newItemName.trim() && newItemAmount
                    ? 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
                    : 'bg-protocol-surface text-protocol-text-muted cursor-not-allowed'
                }`}
              >
                Add item
              </button>
            </div>
          </div>
        )}

        <StepNav
          onBack={() => {
            if (currentCategoryIndex > 0) {
              setCurrentCategoryIndex(currentCategoryIndex - 1);
            } else {
              setScreen('categories');
            }
          }}
          onNext={handleNextCategory}
          nextLabel={currentCategoryIndex < selectedCategoryList.length - 1 ? 'Next category' : 'See total'}
          showBack={true}
        />
      </div>
    );
  }

  // Render summary screen
  if (screen === 'summary') {
    const total = calculateTotal();

    // Build category breakdown
    const breakdown: { category: InvestmentCategory; amount: number }[] = [];
    categoryData.forEach((data, category) => {
      let categoryTotal = 0;
      if (data.estimatedRange) {
        categoryTotal += RANGE_MIDPOINTS[data.estimatedRange];
      }
      data.specificItems.forEach(item => {
        categoryTotal += item.amount;
      });
      if (categoryTotal > 0) {
        breakdown.push({ category, amount: categoryTotal });
      }
    });
    breakdown.sort((a, b) => b.amount - a.amount);

    return (
      <div className="flex-1 flex flex-col px-4 py-8 max-w-md mx-auto w-full">
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 pb-24">
          <div className="w-16 h-16 rounded-full bg-protocol-accent/20 flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-protocol-accent" />
          </div>

          <div>
            <p className="text-protocol-text-muted mb-2">You've already invested</p>
            <p className="text-5xl font-bold text-gradient">
              {formatCurrency(total)}
            </p>
            <p className="text-protocol-text-muted mt-2">in becoming her.</p>
          </div>

          {/* Category breakdown */}
          {breakdown.length > 0 && (
            <div className="w-full card p-4 space-y-2">
              {breakdown.map(({ category, amount }) => {
                const info = INVESTMENT_CATEGORIES[category];
                return (
                  <div key={category} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>{info.emoji}</span>
                      <span className="text-sm text-protocol-text">{info.label}</span>
                    </div>
                    <span className="text-sm font-medium text-protocol-accent">
                      {formatCurrency(amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <p className="text-protocol-text-muted text-sm">
            This is real. You've already started.<br />
            Now let's build on it.
          </p>
        </div>

        <StepNav
          onBack={() => {
            setScreen('deepdive');
            setCurrentCategoryIndex(selectedCategoryList.length - 1);
          }}
          onNext={handleComplete}
          nextLabel="Continue"
          showBack={true}
        />
      </div>
    );
  }

  return null;
}
