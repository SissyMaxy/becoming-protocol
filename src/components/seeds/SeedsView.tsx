/**
 * Seeds View
 *
 * Main dashboard for managing intimate seeds.
 */

import { useState } from 'react';
import { ArrowLeft, Plus, Loader2, Sprout, CheckCircle, Sparkles } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useIntimateSeeds } from '../../hooks/useIntimateSeeds';
import { SeedCard } from './SeedCard';
import { SeedDetail } from './SeedDetail';
import { AddSeedModal } from './AddSeedModal';
import { LogActionModal } from './LogActionModal';
import { AdvancePhaseModal } from './AdvancePhaseModal';
import type { IntimateSeed, SeedInput, SeedActionInput, SeedPhase } from '../../types/arousal';

interface SeedsViewProps {
  onBack: () => void;
}

type Tab = 'active' | 'established' | 'all';

export function SeedsView({ onBack }: SeedsViewProps) {
  const { isBambiMode } = useBambiMode();
  const {
    seeds,
    activeSeeds,
    establishedSeeds,
    isLoading,
    error,
    addSeed,
    advanceSeed,
    deleteSeed,
    logSeedAction,
    getSeedActions,
    refresh,
  } = useIntimateSeeds();

  const [activeTab, setActiveTab] = useState<Tab>('active');
  const [selectedSeed, setSelectedSeed] = useState<IntimateSeed | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showLogActionModal, setShowLogActionModal] = useState(false);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);

  const tabs: { id: Tab; label: string; icon: typeof Sprout; count: number }[] = [
    { id: 'active', label: 'Growing', icon: Sprout, count: activeSeeds.length },
    { id: 'established', label: 'Established', icon: CheckCircle, count: establishedSeeds.length },
    { id: 'all', label: 'All', icon: Sparkles, count: seeds.length },
  ];

  const getDisplayedSeeds = (): IntimateSeed[] => {
    switch (activeTab) {
      case 'active':
        return activeSeeds;
      case 'established':
        return establishedSeeds;
      case 'all':
        return seeds;
    }
  };

  const handleAddSeed = async (input: SeedInput) => {
    await addSeed(input);
    setShowAddModal(false);
  };

  const handleLogAction = async (action: SeedActionInput) => {
    if (!selectedSeed) return;
    await logSeedAction(selectedSeed.id, action);
    setShowLogActionModal(false);
    // Refresh to get updated seed data
    await refresh();
    // Update selected seed from refreshed data
    const updated = seeds.find((s) => s.id === selectedSeed.id);
    if (updated) setSelectedSeed(updated);
  };

  const handleAdvancePhase = async (newPhase: SeedPhase, notes?: string) => {
    if (!selectedSeed) return;
    await advanceSeed(selectedSeed.id, newPhase, notes);
    setShowAdvanceModal(false);
    // Refresh and update selected seed
    await refresh();
    const updated = seeds.find((s) => s.id === selectedSeed.id);
    if (updated) setSelectedSeed(updated);
  };

  const handleDeleteSeed = async () => {
    if (!selectedSeed) return;
    await deleteSeed(selectedSeed.id);
    setSelectedSeed(null);
  };

  // Show seed detail view
  if (selectedSeed) {
    return (
      <>
        <SeedDetail
          seed={selectedSeed}
          onBack={() => setSelectedSeed(null)}
          onLogAction={() => setShowLogActionModal(true)}
          onAdvancePhase={() => setShowAdvanceModal(true)}
          onDelete={handleDeleteSeed}
          getSeedActions={getSeedActions}
        />

        {showLogActionModal && (
          <LogActionModal
            seedTitle={selectedSeed.title}
            currentPhase={selectedSeed.currentPhase}
            onSubmit={handleLogAction}
            onCancel={() => setShowLogActionModal(false)}
          />
        )}

        {showAdvanceModal && (
          <AdvancePhaseModal
            seedTitle={selectedSeed.title}
            currentPhase={selectedSeed.currentPhase}
            onAdvance={handleAdvancePhase}
            onCancel={() => setShowAdvanceModal(false)}
          />
        )}
      </>
    );
  }

  const displayedSeeds = getDisplayedSeeds();

  return (
    <div
      className={`min-h-screen ${
        isBambiMode ? 'bg-gradient-to-b from-pink-50 to-white' : 'bg-protocol-bg'
      }`}
    >
      {/* Header */}
      <div
        className={`sticky top-0 z-10 px-4 py-3 flex items-center gap-3 ${
          isBambiMode
            ? 'bg-pink-50/90 backdrop-blur-sm border-b border-pink-200'
            : 'bg-protocol-bg/90 backdrop-blur-sm border-b border-protocol-border'
        }`}
      >
        <button
          onClick={onBack}
          className={`p-2 rounded-lg transition-colors ${
            isBambiMode ? 'hover:bg-pink-100' : 'hover:bg-protocol-surface'
          }`}
        >
          <ArrowLeft
            className={`w-5 h-5 ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text'
            }`}
          />
        </button>
        <div className="flex-1">
          <h1
            className={`text-lg font-semibold ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            Intimate Seeds
          </h1>
          <p
            className={`text-xs ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}
          >
            Plant desires, nurture growth
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className={`p-2 rounded-lg transition-colors ${
            isBambiMode
              ? 'bg-pink-500 text-white'
              : 'bg-protocol-accent text-white'
          }`}
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Tabs */}
      <div
        className={`px-4 py-3 flex gap-2 border-b ${
          isBambiMode ? 'border-pink-200' : 'border-protocol-border'
        }`}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 px-3 rounded-xl flex items-center justify-center gap-2 transition-colors ${
                isActive
                  ? isBambiMode
                    ? 'bg-pink-500 text-white'
                    : 'bg-protocol-accent text-white'
                  : isBambiMode
                  ? 'bg-pink-100 text-pink-600'
                  : 'bg-protocol-surface text-protocol-text-muted'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-sm font-medium">{tab.label}</span>
              <span
                className={`text-xs px-1.5 py-0.5 rounded-full ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : isBambiMode
                    ? 'bg-pink-200 text-pink-600'
                    : 'bg-protocol-border text-protocol-text-muted'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="p-4 pb-24">
        {/* Error display */}
        {error && (
          <div
            className={`mb-4 p-4 rounded-xl ${
              isBambiMode
                ? 'bg-red-50 text-red-600 border border-red-200'
                : 'bg-red-900/20 text-red-400 border border-red-800'
            }`}
          >
            {error}
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2
              className={`w-8 h-8 animate-spin mb-3 ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
              }`}
            />
            <p
              className={`text-sm ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}
            >
              Loading seeds...
            </p>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && displayedSeeds.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div
              className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-4 ${
                isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'
              }`}
            >
              <Sprout
                className={`w-10 h-10 ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              />
            </div>
            <h3
              className={`text-lg font-semibold mb-2 ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              {activeTab === 'active'
                ? 'No growing seeds'
                : activeTab === 'established'
                ? 'No established seeds yet'
                : 'No seeds planted'}
            </h3>
            <p
              className={`text-sm mb-6 max-w-xs ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}
            >
              {activeTab === 'active'
                ? 'Plant new seeds to track desires you want to explore with your partner.'
                : activeTab === 'established'
                ? 'Seeds become established when they become part of your regular activities.'
                : 'Start by planting your first seed - a desire to nurture.'}
            </p>
            {activeTab !== 'established' && (
              <button
                onClick={() => setShowAddModal(true)}
                className={`px-6 py-3 rounded-xl font-medium flex items-center gap-2 ${
                  isBambiMode
                    ? 'bg-pink-500 text-white'
                    : 'bg-protocol-accent text-white'
                }`}
              >
                <Plus className="w-5 h-5" />
                Plant First Seed
              </button>
            )}
          </div>
        )}

        {/* Seed list */}
        {!isLoading && displayedSeeds.length > 0 && (
          <div className="space-y-3">
            {displayedSeeds.map((seed) => (
              <SeedCard
                key={seed.id}
                seed={seed}
                onSelect={setSelectedSeed}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add Seed Modal */}
      {showAddModal && (
        <AddSeedModal
          onSubmit={handleAddSeed}
          onCancel={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
