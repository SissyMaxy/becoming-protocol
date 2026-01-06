import { useState } from 'react';
import {
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  Star,
  Trash2,
  Check,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { UserAnchor, AnchorType, AnchorInput } from '../../types/rewards';
import { ANCHOR_TYPE_INFO } from '../../types/rewards';

interface AnchorManagerProps {
  anchors: UserAnchor[];
  onAddAnchor: (input: AnchorInput) => Promise<UserAnchor>;
  onToggleAnchor: (anchorId: string, isActive: boolean) => Promise<void>;
  onUpdateEffectiveness: (anchorId: string, rating: number) => Promise<void>;
  onDeleteAnchor: (anchorId: string) => Promise<void>;
  className?: string;
}

export function AnchorManager({
  anchors,
  onAddAnchor,
  onToggleAnchor,
  onUpdateEffectiveness,
  onDeleteAnchor,
  className = '',
}: AnchorManagerProps) {
  const { isBambiMode } = useBambiMode();
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedType, setExpandedType] = useState<AnchorType | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Group anchors by type
  const anchorsByType = anchors.reduce((acc, anchor) => {
    if (!acc[anchor.anchorType]) {
      acc[anchor.anchorType] = [];
    }
    acc[anchor.anchorType].push(anchor);
    return acc;
  }, {} as Record<AnchorType, UserAnchor[]>);

  const anchorTypes = Object.keys(ANCHOR_TYPE_INFO) as AnchorType[];
  const activeCount = anchors.filter(a => a.isActive).length;

  const handleToggle = async (anchor: UserAnchor) => {
    setIsLoading(true);
    try {
      await onToggleAnchor(anchor.id, !anchor.isActive);
    } catch (error) {
      console.error('Failed to toggle anchor:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (anchorId: string) => {
    if (!confirm('Are you sure you want to delete this anchor?')) return;
    setIsLoading(true);
    try {
      await onDeleteAnchor(anchorId);
    } catch (error) {
      console.error('Failed to delete anchor:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRateEffectiveness = async (anchor: UserAnchor, rating: number) => {
    setIsLoading(true);
    try {
      await onUpdateEffectiveness(anchor.id, rating);
    } catch (error) {
      console.error('Failed to rate anchor:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2
            className={`text-xl font-bold ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            Sensory Anchors
          </h2>
          <p
            className={`text-sm mt-1 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}
          >
            {activeCount} active anchor{activeCount !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-colors ${
            isBambiMode
              ? 'bg-pink-500 text-white hover:bg-pink-600'
              : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
          }`}
        >
          <Plus className="w-4 h-4" />
          <span>Add Anchor</span>
        </button>
      </div>

      {/* Anchor Type Groups */}
      <div className="space-y-3">
        {anchorTypes.map((type) => {
          const typeInfo = ANCHOR_TYPE_INFO[type];
          const typeAnchors = anchorsByType[type] || [];
          const isExpanded = expandedType === type;
          const hasAnchors = typeAnchors.length > 0;

          return (
            <div
              key={type}
              className={`rounded-xl overflow-hidden ${
                isBambiMode
                  ? 'bg-white border-2 border-pink-200'
                  : 'bg-protocol-surface border border-protocol-border'
              }`}
            >
              {/* Type Header */}
              <button
                onClick={() => setExpandedType(isExpanded ? null : type)}
                className={`w-full flex items-center justify-between p-4 transition-colors ${
                  hasAnchors
                    ? isBambiMode
                      ? 'hover:bg-pink-50'
                      : 'hover:bg-protocol-surface-light'
                    : 'opacity-60'
                }`}
                disabled={!hasAnchors}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{typeInfo.emoji}</span>
                  <div className="text-left">
                    <p
                      className={`font-medium ${
                        isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                      }`}
                    >
                      {typeInfo.label}
                    </p>
                    {hasAnchors && (
                      <p
                        className={`text-sm ${
                          isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                        }`}
                      >
                        {typeAnchors.filter(a => a.isActive).length}/{typeAnchors.length} active
                      </p>
                    )}
                  </div>
                </div>
                {hasAnchors && (
                  isExpanded ? (
                    <ChevronUp
                      className={`w-5 h-5 ${
                        isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                      }`}
                    />
                  ) : (
                    <ChevronDown
                      className={`w-5 h-5 ${
                        isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                      }`}
                    />
                  )
                )}
              </button>

              {/* Expanded Anchors */}
              {isExpanded && hasAnchors && (
                <div
                  className={`border-t px-4 pb-4 ${
                    isBambiMode ? 'border-pink-200' : 'border-protocol-border'
                  }`}
                >
                  {typeAnchors.map((anchor) => (
                    <AnchorItem
                      key={anchor.id}
                      anchor={anchor}
                      isBambiMode={isBambiMode}
                      isLoading={isLoading}
                      onToggle={() => handleToggle(anchor)}
                      onDelete={() => handleDelete(anchor.id)}
                      onRate={(rating) => handleRateEffectiveness(anchor, rating)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {anchors.length === 0 && (
        <div
          className={`text-center py-12 rounded-xl ${
            isBambiMode
              ? 'bg-pink-50 border-2 border-dashed border-pink-200'
              : 'bg-protocol-surface-light border-2 border-dashed border-protocol-border'
          }`}
        >
          <p
            className={`text-lg mb-2 ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text'
            }`}
          >
            No anchors yet
          </p>
          <p
            className={`text-sm mb-4 ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}
          >
            Sensory anchors help create associations during sessions
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className={`px-6 py-2 rounded-xl font-medium ${
              isBambiMode
                ? 'bg-pink-500 text-white hover:bg-pink-600'
                : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
            }`}
          >
            Add Your First Anchor
          </button>
        </div>
      )}

      {/* Add Anchor Modal */}
      {showAddModal && (
        <AddAnchorModal
          isBambiMode={isBambiMode}
          onClose={() => setShowAddModal(false)}
          onAdd={async (input) => {
            await onAddAnchor(input);
            setShowAddModal(false);
          }}
        />
      )}
    </div>
  );
}

// Individual anchor item component
function AnchorItem({
  anchor,
  isBambiMode,
  isLoading,
  onToggle,
  onDelete,
  onRate,
}: {
  anchor: UserAnchor;
  isBambiMode: boolean;
  isLoading: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onRate: (rating: number) => void;
}) {
  return (
    <div
      className={`mt-4 p-3 rounded-lg ${
        anchor.isActive
          ? isBambiMode
            ? 'bg-pink-50 border border-pink-300'
            : 'bg-protocol-accent/10 border border-protocol-accent/30'
          : isBambiMode
            ? 'bg-gray-50 border border-gray-200'
            : 'bg-protocol-surface-light border border-protocol-border'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p
            className={`font-medium ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            {anchor.name}
          </p>
          {anchor.notes && (
            <p
              className={`text-sm mt-1 ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            >
              {anchor.notes}
            </p>
          )}
          <div
            className={`flex items-center gap-4 mt-2 text-xs ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}
          >
            <span>Used {anchor.timesUsed}x</span>
            {anchor.lastUsedAt && (
              <span>
                Last: {new Date(anchor.lastUsedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onToggle}
            disabled={isLoading}
            className={`p-1 rounded transition-colors ${
              anchor.isActive
                ? isBambiMode
                  ? 'text-pink-500 hover:text-pink-600'
                  : 'text-protocol-success hover:text-protocol-accent'
                : isBambiMode
                  ? 'text-gray-400 hover:text-pink-500'
                  : 'text-protocol-text-muted hover:text-protocol-text'
            }`}
          >
            {anchor.isActive ? (
              <ToggleRight className="w-6 h-6" />
            ) : (
              <ToggleLeft className="w-6 h-6" />
            )}
          </button>
          <button
            onClick={onDelete}
            disabled={isLoading}
            className={`p-1 rounded transition-colors ${
              isBambiMode
                ? 'text-pink-300 hover:text-red-500'
                : 'text-protocol-text-muted hover:text-red-500'
            }`}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Effectiveness Rating */}
      <div className="mt-3 pt-3 border-t border-opacity-50">
        <div className="flex items-center justify-between">
          <span
            className={`text-xs ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}
          >
            Effectiveness
          </span>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                key={rating}
                onClick={() => onRate(rating)}
                disabled={isLoading}
                className={`p-0.5 transition-colors ${
                  (anchor.effectivenessRating || 0) >= rating
                    ? isBambiMode
                      ? 'text-pink-500'
                      : 'text-protocol-accent'
                    : isBambiMode
                      ? 'text-pink-200'
                      : 'text-protocol-surface-light'
                }`}
              >
                <Star className="w-4 h-4 fill-current" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Add Anchor Modal
function AddAnchorModal({
  isBambiMode,
  onClose,
  onAdd,
}: {
  isBambiMode: boolean;
  onClose: () => void;
  onAdd: (input: AnchorInput) => Promise<void>;
}) {
  const [selectedType, setSelectedType] = useState<AnchorType | null>(null);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType || !name.trim()) return;

    setIsLoading(true);
    try {
      await onAdd({
        anchorType: selectedType,
        name: name.trim(),
        notes: notes.trim() || undefined,
      });
    } catch (error) {
      console.error('Failed to add anchor:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const anchorTypes = Object.keys(ANCHOR_TYPE_INFO) as AnchorType[];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div
        className={`w-full max-w-md rounded-2xl p-6 ${
          isBambiMode ? 'bg-white' : 'bg-protocol-bg'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3
            className={`text-lg font-semibold ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            Add Sensory Anchor
          </h3>
          <button
            onClick={onClose}
            className={`p-1 rounded-full ${
              isBambiMode
                ? 'hover:bg-pink-100 text-pink-400'
                : 'hover:bg-protocol-surface text-protocol-text-muted'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Type Selection */}
          <div className="mb-4">
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}
            >
              Anchor Type
            </label>
            <div className="grid grid-cols-4 gap-2">
              {anchorTypes.map((type) => {
                const info = ANCHOR_TYPE_INFO[type];
                const isSelected = selectedType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSelectedType(type)}
                    className={`p-3 rounded-xl text-center transition-all ${
                      isSelected
                        ? isBambiMode
                          ? 'bg-pink-500 text-white'
                          : 'bg-protocol-accent text-white'
                        : isBambiMode
                          ? 'bg-pink-50 hover:bg-pink-100 border border-pink-200'
                          : 'bg-protocol-surface hover:bg-protocol-surface-light border border-protocol-border'
                    }`}
                  >
                    <span className="text-xl block mb-1">{info.emoji}</span>
                    <span className="text-xs">{info.label}</span>
                  </button>
                );
              })}
            </div>
            {selectedType && (
              <p
                className={`text-xs mt-2 ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                e.g., {ANCHOR_TYPE_INFO[selectedType].examples}
              </p>
            )}
          </div>

          {/* Name Input */}
          <div className="mb-4">
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}
            >
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What is this anchor?"
              className={`w-full px-4 py-3 rounded-xl ${
                isBambiMode
                  ? 'bg-pink-50 border-2 border-pink-200 focus:border-pink-400 text-pink-700 placeholder-pink-300'
                  : 'bg-protocol-surface border border-protocol-border focus:border-protocol-accent text-protocol-text placeholder-protocol-text-muted'
              } outline-none transition-colors`}
            />
          </div>

          {/* Notes Input */}
          <div className="mb-6">
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}
            >
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any personal significance or notes..."
              rows={2}
              className={`w-full px-4 py-3 rounded-xl resize-none ${
                isBambiMode
                  ? 'bg-pink-50 border-2 border-pink-200 focus:border-pink-400 text-pink-700 placeholder-pink-300'
                  : 'bg-protocol-surface border border-protocol-border focus:border-protocol-accent text-protocol-text placeholder-protocol-text-muted'
              } outline-none transition-colors`}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 py-3 rounded-xl font-medium transition-colors ${
                isBambiMode
                  ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
                  : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface-light'
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedType || !name.trim() || isLoading}
              className={`flex-1 py-3 rounded-xl font-medium transition-all ${
                selectedType && name.trim() && !isLoading
                  ? isBambiMode
                    ? 'bg-pink-500 text-white hover:bg-pink-600'
                    : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
                  : isBambiMode
                    ? 'bg-pink-200 text-pink-400 cursor-not-allowed'
                    : 'bg-protocol-surface-light text-protocol-text-muted cursor-not-allowed'
              }`}
            >
              {isLoading ? 'Adding...' : 'Add Anchor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Compact anchor badge for session display
export function AnchorBadge({
  anchor,
  isSelected,
  onToggle,
  className = '',
}: {
  anchor: UserAnchor;
  isSelected: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const { isBambiMode } = useBambiMode();
  const typeInfo = ANCHOR_TYPE_INFO[anchor.anchorType];

  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${
        isSelected
          ? isBambiMode
            ? 'bg-pink-500 text-white'
            : 'bg-protocol-accent text-white'
          : isBambiMode
            ? 'bg-pink-50 text-pink-600 border border-pink-200 hover:bg-pink-100'
            : 'bg-protocol-surface text-protocol-text border border-protocol-border hover:bg-protocol-surface-light'
      } ${className}`}
    >
      <span>{typeInfo.emoji}</span>
      <span className="text-sm">{anchor.name}</span>
      {isSelected && <Check className="w-4 h-4" />}
    </button>
  );
}
