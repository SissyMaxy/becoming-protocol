/**
 * Domain Escalation View
 *
 * Main view displaying all 8 escalation domains with progress tracking.
 */

import { useState, useEffect } from 'react';
import { ArrowLeft, Layers, Plus, TrendingUp, Target, Zap } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useEscalationState } from '../../hooks/useEscalationState';
import { useProtocol } from '../../context/ProtocolContext';
import {
  EscalationDomain,
  ESCALATION_DOMAINS,
} from '../../types/escalation';
import { getDomainStats, DomainStats } from '../../lib/domainEscalation';
import { useAuth } from '../../context/AuthContext';
import { DomainCard } from './DomainCard';
import { LogEscalationModal } from './LogEscalationModal';
import { DomainDetailModal } from './DomainDetailModal';
import { BoundaryDissolutionTracker } from './BoundaryDissolutionTracker';
import { ContentExposureTracker } from './ContentExposureTracker';

interface DomainEscalationViewProps {
  onBack: () => void;
}

type ViewTab = 'domains' | 'boundaries' | 'content';

export function DomainEscalationView({ onBack }: DomainEscalationViewProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();
  const { progress } = useProtocol();
  const {
    escalationStates,
    recentEvents,
    isLoading,
    getLevel,
    recordEscalation,
    loadEscalationState,
    initializeEscalation,
  } = useEscalationState();

  const [activeTab, setActiveTab] = useState<ViewTab>('domains');
  const [stats, setStats] = useState<DomainStats | null>(null);
  const [showLogModal, setShowLogModal] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<EscalationDomain | null>(null);
  const [logDomain, setLogDomain] = useState<EscalationDomain | undefined>(undefined);

  // Load stats
  useEffect(() => {
    async function loadStats() {
      if (!user) return;
      const domainStats = await getDomainStats(user.id);
      setStats(domainStats);
    }
    loadStats();
  }, [user, escalationStates]);

  // Initialize if no data
  useEffect(() => {
    const hasData = Object.values(escalationStates).some(s => s !== null);
    if (!isLoading && !hasData && user) {
      initializeEscalation();
    }
  }, [isLoading, escalationStates, user, initializeEscalation]);

  // Get current levels for all domains
  const currentLevels: Record<EscalationDomain, number> = {} as Record<EscalationDomain, number>;
  ESCALATION_DOMAINS.forEach(domain => {
    currentLevels[domain] = getLevel(domain);
  });

  const handleLogEscalation = async (data: {
    domain: EscalationDomain;
    toLevel: number;
    description: string;
    triggerMethod: 'arousal_commitment' | 'handler_push' | 'gina_directed' | 'organic';
    arousalLevel?: number;
    resistanceEncountered: boolean;
    resistanceBypassed?: boolean;
  }) => {
    await recordEscalation(
      data.domain,
      data.toLevel,
      data.description,
      data.triggerMethod,
      data.arousalLevel,
      data.resistanceEncountered
    );
    await loadEscalationState();
    if (user) {
      const newStats = await getDomainStats(user.id);
      setStats(newStats);
    }
  };

  const handleOpenLogModal = (domain?: EscalationDomain) => {
    setLogDomain(domain);
    setShowLogModal(true);
  };

  const tabs: { id: ViewTab; label: string; icon: React.ReactNode }[] = [
    { id: 'domains', label: 'Domains', icon: <Layers className="w-4 h-4" /> },
    { id: 'boundaries', label: 'Boundaries', icon: <Target className="w-4 h-4" /> },
    { id: 'content', label: 'Content', icon: <Zap className="w-4 h-4" /> },
  ];

  return (
    <div
      className={`min-h-screen ${
        isBambiMode
          ? 'bg-gradient-to-b from-pink-50 to-white'
          : 'bg-protocol-bg'
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
            Domain Escalation
          </h1>
          <p
            className={`text-xs ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}
          >
            Track your progression
          </p>
        </div>
        <TrendingUp
          className={`w-6 h-6 ${isBambiMode ? 'text-pink-400' : 'text-purple-400'}`}
        />
      </div>

      {/* Stats Summary */}
      {stats && (
        <div className="px-4 py-3">
          <div
            className={`grid grid-cols-4 gap-2 p-3 rounded-xl ${
              isBambiMode
                ? 'bg-white border border-pink-200'
                : 'bg-protocol-surface'
            }`}
          >
            <div className="text-center">
              <div
                className={`text-lg font-bold ${
                  isBambiMode ? 'text-pink-600' : 'text-purple-400'
                }`}
              >
                {stats.totalEscalations}
              </div>
              <div
                className={`text-[10px] ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                Escalations
              </div>
            </div>
            <div className="text-center">
              <div
                className={`text-lg font-bold ${
                  isBambiMode ? 'text-pink-600' : 'text-green-400'
                }`}
              >
                {stats.totalBoundariesDissolved}
              </div>
              <div
                className={`text-[10px] ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                Dissolved
              </div>
            </div>
            <div className="text-center">
              <div
                className={`text-lg font-bold ${
                  isBambiMode ? 'text-pink-600' : 'text-amber-400'
                }`}
              >
                {stats.averageLevel.toFixed(1)}
              </div>
              <div
                className={`text-[10px] ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                Avg Level
              </div>
            </div>
            <div className="text-center">
              <div
                className={`text-lg font-bold ${
                  isBambiMode ? 'text-pink-600' : 'text-protocol-text'
                }`}
              >
                {progress?.totalDays || 0}
              </div>
              <div
                className={`text-[10px] ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                Day
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="px-4 pb-2">
        <div
          className={`flex gap-1 p-1 rounded-lg ${
            isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'
          }`}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? isBambiMode
                    ? 'bg-white text-pink-600 shadow-sm'
                    : 'bg-protocol-bg text-protocol-text shadow-sm'
                  : isBambiMode
                  ? 'text-pink-400'
                  : 'text-protocol-text-muted'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pb-24">
        {activeTab === 'domains' && (
          <div className="space-y-3">
            {isLoading ? (
              <div className="text-center py-8">
                <div
                  className={`text-sm ${
                    isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                  }`}
                >
                  Loading domains...
                </div>
              </div>
            ) : (
              ESCALATION_DOMAINS.map((domain) => (
                <DomainCard
                  key={domain}
                  domain={domain}
                  state={escalationStates[domain]}
                  onExpand={() => setSelectedDomain(domain)}
                  onLogEscalation={() => handleOpenLogModal(domain)}
                />
              ))
            )}
          </div>
        )}

        {activeTab === 'boundaries' && (
          <BoundaryDissolutionTracker />
        )}

        {activeTab === 'content' && (
          <ContentExposureTracker />
        )}
      </div>

      {/* FAB */}
      {activeTab === 'domains' && (
        <button
          onClick={() => handleOpenLogModal()}
          className={`fixed bottom-24 right-4 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-transform active:scale-95 ${
            isBambiMode
              ? 'bg-pink-500 text-white'
              : 'bg-purple-500 text-white'
          }`}
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* Log Escalation Modal */}
      {showLogModal && (
        <LogEscalationModal
          initialDomain={logDomain}
          currentLevels={currentLevels}
          onSubmit={handleLogEscalation}
          onClose={() => {
            setShowLogModal(false);
            setLogDomain(undefined);
          }}
        />
      )}

      {/* Domain Detail Modal */}
      {selectedDomain && (
        <DomainDetailModal
          domain={selectedDomain}
          state={escalationStates[selectedDomain]}
          events={recentEvents.filter((e) => e.domain === selectedDomain)}
          onClose={() => setSelectedDomain(null)}
          onLogEscalation={() => {
            setSelectedDomain(null);
            handleOpenLogModal(selectedDomain);
          }}
        />
      )}
    </div>
  );
}
