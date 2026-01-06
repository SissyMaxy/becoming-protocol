import { useState } from 'react';
import {
  Plus,
  ChevronRight,
  Sparkles,
  X,
  Check,
  MoreVertical,
  Trash2,
  Pause,
  Play,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type {
  IntimateSeed,
  SeedCategory,
  SeedPhase,
  SeedInput,
  SeedActionInput,
} from '../../types/arousal';
import { SEED_CATEGORY_CONFIG, SEED_PHASE_CONFIG } from '../../types/arousal';

interface SeedTrackerProps {
  seeds: IntimateSeed[];
  activeSeeds: IntimateSeed[];
  establishedSeeds: IntimateSeed[];
  onAddSeed: (seed: SeedInput) => Promise<IntimateSeed>;
  onAdvanceSeed: (seedId: string, phase: SeedPhase, notes?: string) => Promise<void>;
  onDeleteSeed: (seedId: string) => Promise<void>;
  onLogAction: (seedId: string, action: SeedActionInput) => Promise<void>;
  isLoading?: boolean;
  className?: string;
}

export function SeedTracker({
  seeds: _seeds,
  activeSeeds,
  establishedSeeds,
  onAddSeed,
  onAdvanceSeed,
  onDeleteSeed,
  onLogAction: _onLogAction,
  isLoading = false,
  className = '',
}: SeedTrackerProps) {
  // Note: seeds is available for future use (e.g., search/filter across all seeds)
  void _seeds;
  const { isBambiMode } = useBambiMode();
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedSeed, setSelectedSeed] = useState<IntimateSeed | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'established'>('active');

  const displayedSeeds = activeTab === 'active' ? activeSeeds : establishedSeeds;

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3
          className={`text-lg font-semibold ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}
        >
          Intimate Seeds
        </h3>
        <button
          onClick={() => setShowAddModal(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${
            isBambiMode
              ? 'bg-pink-500 text-white hover:bg-pink-600'
              : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
          }`}
        >
          <Plus className="w-4 h-4" />
          Add Seed
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('active')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'active'
              ? isBambiMode
                ? 'bg-pink-500 text-white'
                : 'bg-protocol-accent text-white'
              : isBambiMode
                ? 'bg-pink-100 text-pink-600'
                : 'bg-protocol-surface text-protocol-text'
          }`}
        >
          Active ({activeSeeds.length})
        </button>
        <button
          onClick={() => setActiveTab('established')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'established'
              ? isBambiMode
                ? 'bg-purple-500 text-white'
                : 'bg-purple-600 text-white'
              : isBambiMode
                ? 'bg-purple-100 text-purple-600'
                : 'bg-protocol-surface text-protocol-text'
          }`}
        >
          Established ({establishedSeeds.length})
        </button>
      </div>

      {/* Seeds List */}
      {isLoading ? (
        <div
          className={`text-center py-8 ${
            isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
          }`}
        >
          Loading seeds...
        </div>
      ) : displayedSeeds.length === 0 ? (
        <div
          className={`text-center py-8 rounded-xl ${
            isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
          }`}
        >
          <Sparkles
            className={`w-8 h-8 mx-auto mb-2 ${
              isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'
            }`}
          />
          <p
            className={isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}
          >
            {activeTab === 'active'
              ? 'No active seeds. Plant your first one!'
              : 'No established seeds yet. Keep nurturing!'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayedSeeds.map((seed) => (
            <SeedCard
              key={seed.id}
              seed={seed}
              onSelect={() => setSelectedSeed(seed)}
            />
          ))}
        </div>
      )}

      {/* Add Seed Modal */}
      {showAddModal && (
        <AddSeedModal
          onClose={() => setShowAddModal(false)}
          onSubmit={async (input) => {
            await onAddSeed(input);
            setShowAddModal(false);
          }}
        />
      )}

      {/* Seed Detail Modal */}
      {selectedSeed && (
        <SeedDetailModal
          seed={selectedSeed}
          onClose={() => setSelectedSeed(null)}
          onAdvance={onAdvanceSeed}
          onDelete={onDeleteSeed}
          onLogAction={_onLogAction}
        />
      )}
    </div>
  );
}

// Seed Card Component
function SeedCard({
  seed,
  onSelect,
}: {
  seed: IntimateSeed;
  onSelect: () => void;
}) {
  const { isBambiMode } = useBambiMode();
  const categoryConfig = SEED_CATEGORY_CONFIG[seed.category];
  const phaseConfig = SEED_PHASE_CONFIG[seed.currentPhase];

  const getReceptionColor = () => {
    switch (seed.lastReception) {
      case 'positive':
        return 'text-green-500';
      case 'hesitant':
        return 'text-yellow-500';
      case 'negative':
        return 'text-red-500';
      default:
        return isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted';
    }
  };

  return (
    <button
      onClick={onSelect}
      className={`w-full p-4 rounded-xl text-left transition-all ${
        isBambiMode
          ? 'bg-white border border-pink-200 hover:border-pink-400'
          : 'bg-protocol-surface border border-protocol-border hover:border-protocol-accent'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl ${
            isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface-light'
          }`}
        >
          {categoryConfig.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4
              className={`font-medium truncate ${
                isBambiMode ? 'text-gray-900' : 'text-protocol-text'
              }`}
            >
              {seed.title}
            </h4>
            {seed.lastReception && (
              <span className={`text-sm ${getReceptionColor()}`}>
                {seed.lastReception === 'positive' && '💚'}
                {seed.lastReception === 'hesitant' && '💛'}
                {seed.lastReception === 'negative' && '❤️‍🩹'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                isBambiMode
                  ? 'bg-purple-100 text-purple-600'
                  : 'bg-purple-900/30 text-purple-400'
              }`}
            >
              {phaseConfig.label}
            </span>
            <span
              className={`text-xs ${
                isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'
              }`}
            >
              Level {seed.intensityLevel}
            </span>
          </div>
        </div>
        <ChevronRight
          className={`w-5 h-5 ${
            isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'
          }`}
        />
      </div>
    </button>
  );
}

// Add Seed Modal
function AddSeedModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (seed: SeedInput) => Promise<void>;
}) {
  const { isBambiMode } = useBambiMode();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<SeedCategory>('other');
  const [intensityLevel, setIntensityLevel] = useState(3);
  const [isLoading, setIsLoading] = useState(false);

  const categories = Object.keys(SEED_CATEGORY_CONFIG) as SeedCategory[];

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setIsLoading(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        intensityLevel,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div
        className={`w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl ${
          isBambiMode ? 'bg-white' : 'bg-protocol-bg'
        }`}
      >
        {/* Header */}
        <div
          className={`sticky top-0 z-10 flex items-center justify-between p-4 border-b ${
            isBambiMode
              ? 'bg-white border-pink-200'
              : 'bg-protocol-bg border-protocol-border'
          }`}
        >
          <h2
            className={`text-lg font-semibold ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            Plant a Seed
          </h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-full ${
              isBambiMode
                ? 'hover:bg-pink-100 text-pink-400'
                : 'hover:bg-protocol-surface text-protocol-text-muted'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Title */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}
            >
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What do you want to explore?"
              className={`w-full px-4 py-3 rounded-xl ${
                isBambiMode
                  ? 'bg-pink-50 border-2 border-pink-200 focus:border-pink-400 text-pink-700 placeholder-pink-300'
                  : 'bg-protocol-surface border border-protocol-border focus:border-protocol-accent text-protocol-text placeholder-protocol-text-muted'
              } outline-none transition-colors`}
            />
          </div>

          {/* Description */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}
            >
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="More details about this desire..."
              rows={2}
              className={`w-full px-4 py-3 rounded-xl resize-none ${
                isBambiMode
                  ? 'bg-pink-50 border-2 border-pink-200 focus:border-pink-400 text-pink-700 placeholder-pink-300'
                  : 'bg-protocol-surface border border-protocol-border focus:border-protocol-accent text-protocol-text placeholder-protocol-text-muted'
              } outline-none transition-colors`}
            />
          </div>

          {/* Category */}
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}
            >
              Category
            </label>
            <div className="grid grid-cols-2 gap-2">
              {categories.map((cat) => {
                const config = SEED_CATEGORY_CONFIG[cat];
                const isSelected = category === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`p-3 rounded-xl text-left text-sm transition-all ${
                      isSelected
                        ? isBambiMode
                          ? 'bg-pink-500 text-white'
                          : 'bg-protocol-accent text-white'
                        : isBambiMode
                          ? 'bg-pink-50 text-pink-600 border border-pink-200'
                          : 'bg-protocol-surface text-protocol-text border border-protocol-border'
                    }`}
                  >
                    <span className="mr-2">{config.emoji}</span>
                    {config.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Intensity Level */}
          <div>
            <label
              className={`block text-sm font-medium mb-3 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}
            >
              Intensity Level
            </label>
            <div className="flex justify-between gap-1">
              {[1, 2, 3, 4, 5].map((level) => (
                <button
                  key={level}
                  onClick={() => setIntensityLevel(level)}
                  className={`flex-1 py-3 rounded-lg font-medium transition-all ${
                    intensityLevel === level
                      ? isBambiMode
                        ? 'bg-purple-500 text-white'
                        : 'bg-purple-600 text-white'
                      : isBambiMode
                        ? 'bg-purple-100 text-purple-600'
                        : 'bg-protocol-surface text-protocol-text'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
            <div
              className={`flex justify-between text-xs mt-1 ${
                isBambiMode ? 'text-gray-400' : 'text-protocol-text-muted'
              }`}
            >
              <span>Gentle</span>
              <span>Intense</span>
            </div>
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || isLoading}
            className={`w-full py-3 rounded-xl font-medium transition-all ${
              !title.trim() || isLoading
                ? isBambiMode
                  ? 'bg-pink-200 text-pink-400 cursor-not-allowed'
                  : 'bg-protocol-surface-light text-protocol-text-muted cursor-not-allowed'
                : isBambiMode
                  ? 'bg-pink-500 text-white hover:bg-pink-600'
                  : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
            }`}
          >
            {isLoading ? 'Planting...' : 'Plant Seed'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Seed Detail Modal
function SeedDetailModal({
  seed,
  onClose,
  onAdvance,
  onDelete,
  onLogAction: _onLogAction,
}: {
  seed: IntimateSeed;
  onClose: () => void;
  onAdvance: (seedId: string, phase: SeedPhase, notes?: string) => Promise<void>;
  onDelete: (seedId: string) => Promise<void>;
  onLogAction: (seedId: string, action: SeedActionInput) => Promise<void>;
}) {
  // Note: onLogAction is available for future use when logging seed actions
  void _onLogAction;
  const { isBambiMode } = useBambiMode();
  const [showMenu, setShowMenu] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const categoryConfig = SEED_CATEGORY_CONFIG[seed.category];
  const phaseConfig = SEED_PHASE_CONFIG[seed.currentPhase];

  const allPhases: SeedPhase[] = [
    'identified',
    'distant_mention',
    'positive_assoc',
    'adjacent_exp',
    'soft_offer',
    'first_attempt',
    'establishing',
    'established',
  ];

  const currentPhaseIndex = allPhases.indexOf(seed.currentPhase);
  const nextPhase =
    currentPhaseIndex < allPhases.length - 1
      ? allPhases[currentPhaseIndex + 1]
      : null;

  const handleAdvance = async () => {
    if (!nextPhase) return;
    setIsLoading(true);
    try {
      await onAdvance(seed.id, nextPhase);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    setIsLoading(true);
    try {
      await onDelete(seed.id);
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const handlePause = async () => {
    setIsLoading(true);
    try {
      await onAdvance(seed.id, seed.currentPhase === 'paused' ? 'identified' : 'paused');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div
        className={`w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl ${
          isBambiMode ? 'bg-white' : 'bg-protocol-bg'
        }`}
      >
        {/* Header */}
        <div
          className={`sticky top-0 z-10 flex items-center justify-between p-4 border-b ${
            isBambiMode
              ? 'bg-white border-pink-200'
              : 'bg-protocol-bg border-protocol-border'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">{categoryConfig.emoji}</span>
            <h2
              className={`text-lg font-semibold ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              {seed.title}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className={`p-2 rounded-full ${
                  isBambiMode
                    ? 'hover:bg-pink-100 text-pink-400'
                    : 'hover:bg-protocol-surface text-protocol-text-muted'
                }`}
              >
                <MoreVertical className="w-5 h-5" />
              </button>
              {showMenu && (
                <div
                  className={`absolute right-0 mt-1 w-40 rounded-lg shadow-lg overflow-hidden ${
                    isBambiMode
                      ? 'bg-white border border-pink-200'
                      : 'bg-protocol-surface border border-protocol-border'
                  }`}
                >
                  <button
                    onClick={handlePause}
                    className={`w-full flex items-center gap-2 px-4 py-2 text-sm ${
                      isBambiMode
                        ? 'hover:bg-pink-50 text-pink-700'
                        : 'hover:bg-protocol-surface-light text-protocol-text'
                    }`}
                  >
                    {seed.currentPhase === 'paused' ? (
                      <>
                        <Play className="w-4 h-4" /> Resume
                      </>
                    ) : (
                      <>
                        <Pause className="w-4 h-4" /> Pause
                      </>
                    )}
                  </button>
                  <button
                    onClick={handleDelete}
                    className={`w-full flex items-center gap-2 px-4 py-2 text-sm text-red-500 ${
                      isBambiMode ? 'hover:bg-red-50' : 'hover:bg-red-900/20'
                    }`}
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className={`p-2 rounded-full ${
                isBambiMode
                  ? 'hover:bg-pink-100 text-pink-400'
                  : 'hover:bg-protocol-surface text-protocol-text-muted'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-5">
          {/* Current Phase */}
          <div
            className={`p-4 rounded-xl ${
              isBambiMode ? 'bg-purple-50' : 'bg-purple-900/20'
            }`}
          >
            <div
              className={`text-sm font-medium mb-1 ${
                isBambiMode ? 'text-purple-600' : 'text-purple-400'
              }`}
            >
              Current Phase
            </div>
            <div
              className={`text-xl font-bold ${
                isBambiMode ? 'text-purple-800' : 'text-purple-300'
              }`}
            >
              {phaseConfig.label}
            </div>
            <div
              className={`text-sm mt-1 ${
                isBambiMode ? 'text-purple-600' : 'text-purple-400'
              }`}
            >
              {phaseConfig.description}
            </div>
          </div>

          {/* Phase Progress */}
          <div>
            <div
              className={`text-sm font-medium mb-3 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}
            >
              Progress
            </div>
            <div className="flex items-center gap-1">
              {allPhases.map((phase, index) => {
                const isPast = index < currentPhaseIndex;
                const isCurrent = index === currentPhaseIndex;
                return (
                  <div
                    key={phase}
                    className={`flex-1 h-2 rounded-full ${
                      isPast || isCurrent
                        ? isBambiMode
                          ? 'bg-pink-500'
                          : 'bg-protocol-accent'
                        : isBambiMode
                          ? 'bg-pink-200'
                          : 'bg-protocol-surface-light'
                    }`}
                  />
                );
              })}
            </div>
            <div
              className={`text-xs mt-1 text-center ${
                isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'
              }`}
            >
              {currentPhaseIndex + 1} of {allPhases.length}
            </div>
          </div>

          {/* Description */}
          {seed.description && (
            <div>
              <div
                className={`text-sm font-medium mb-2 ${
                  isBambiMode ? 'text-pink-600' : 'text-protocol-text'
                }`}
              >
                Description
              </div>
              <p
                className={`text-sm ${
                  isBambiMode ? 'text-gray-600' : 'text-protocol-text-muted'
                }`}
              >
                {seed.description}
              </p>
            </div>
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div
              className={`p-3 rounded-lg ${
                isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
              }`}
            >
              <div
                className={`text-xs ${
                  isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'
                }`}
              >
                Category
              </div>
              <div
                className={`font-medium ${
                  isBambiMode ? 'text-gray-900' : 'text-protocol-text'
                }`}
              >
                {categoryConfig.emoji} {categoryConfig.label}
              </div>
            </div>
            <div
              className={`p-3 rounded-lg ${
                isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
              }`}
            >
              <div
                className={`text-xs ${
                  isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'
                }`}
              >
                Intensity
              </div>
              <div
                className={`font-medium ${
                  isBambiMode ? 'text-gray-900' : 'text-protocol-text'
                }`}
              >
                Level {seed.intensityLevel}
              </div>
            </div>
          </div>

          {/* Last Reception */}
          {seed.lastReception && (
            <div
              className={`p-3 rounded-lg ${
                isBambiMode ? 'bg-gray-50' : 'bg-protocol-surface'
              }`}
            >
              <div
                className={`text-xs mb-1 ${
                  isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'
                }`}
              >
                Last Reception
              </div>
              <div className="flex items-center gap-2">
                <span>
                  {seed.lastReception === 'positive' && '💚 Positive'}
                  {seed.lastReception === 'hesitant' && '💛 Hesitant'}
                  {seed.lastReception === 'negative' && '❤️‍🩹 Needs Time'}
                  {seed.lastReception === 'neutral' && '⚪ Neutral'}
                  {seed.lastReception === 'unknown' && '❓ Unknown'}
                </span>
              </div>
              {seed.receptionNotes && (
                <p
                  className={`text-sm mt-1 ${
                    isBambiMode ? 'text-gray-600' : 'text-protocol-text-muted'
                  }`}
                >
                  {seed.receptionNotes}
                </p>
              )}
            </div>
          )}

          {/* Advance Button */}
          {nextPhase && seed.currentPhase !== 'paused' && (
            <button
              onClick={handleAdvance}
              disabled={isLoading}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all ${
                isLoading
                  ? isBambiMode
                    ? 'bg-purple-200 text-purple-400 cursor-not-allowed'
                    : 'bg-protocol-surface-light text-protocol-text-muted cursor-not-allowed'
                  : isBambiMode
                    ? 'bg-purple-500 text-white hover:bg-purple-600'
                    : 'bg-purple-600 text-white hover:bg-purple-700'
              }`}
            >
              <Check className="w-5 h-5" />
              {isLoading
                ? 'Advancing...'
                : `Advance to ${SEED_PHASE_CONFIG[nextPhase].label}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
