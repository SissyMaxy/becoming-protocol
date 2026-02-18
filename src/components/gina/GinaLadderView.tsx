/**
 * Gina Ladder View
 *
 * Main dashboard for the 10-channel ladder system.
 * Shows: channel progress bars with rung indicators, arc status,
 * composite score, recent seeds, recovery status, and action buttons.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  Layers,
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Plus,
  BarChart3,
  Shield,
  Zap,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBambiMode } from '../../context/BambiModeContext';
import {
  type GinaChannel,
  type GinaLadderState,
  GINA_CHANNELS,
  getAllChannelStates,
  initializeLadder,
  isInCooldown,
  getCooldownRemaining,
  getPipelineComposite,
} from '../../lib/gina/ladder-engine';
import {
  type SeedEntry,
  getRecentSeeds,
  getChannelsInRecovery,
} from '../../lib/gina/seed-manager';
import {
  type MeasurementDue,
  generateMasterComposite,
  getDueMeasurements,
} from '../../lib/gina/measurement-engine';
import { SeedLogger } from './SeedLogger';
import { MeasurementForm } from './MeasurementForm';
import { ChannelDetail } from './ChannelDetail';
import { DisclosureMap } from './DisclosureMap';

interface GinaLadderViewProps {
  onBack: () => void;
}

// Channel display config
const CHANNEL_CONFIG: Record<GinaChannel, { label: string; icon: string; color: string }> = {
  scent: { label: 'Scent', icon: '🌸', color: 'bg-pink-500' },
  touch: { label: 'Touch', icon: '✋', color: 'bg-amber-500' },
  domestic: { label: 'Domestic', icon: '🏠', color: 'bg-blue-500' },
  intimacy: { label: 'Intimacy', icon: '💜', color: 'bg-purple-500' },
  visual: { label: 'Visual', icon: '👗', color: 'bg-rose-500' },
  social: { label: 'Social', icon: '👥', color: 'bg-green-500' },
  bedroom: { label: 'Bedroom', icon: '🛏️', color: 'bg-indigo-500' },
  pronoun: { label: 'Pronoun', icon: '💬', color: 'bg-teal-500' },
  financial: { label: 'Financial', icon: '💳', color: 'bg-yellow-500' },
  body_change_touch: { label: 'Body Change', icon: '✨', color: 'bg-fuchsia-500' },
};

const RUNG_LABELS = ['Not Started', 'Rung 1', 'Rung 2', 'Rung 3', 'Rung 4', 'Rung 5'];

const HEALTH_CONFIG: Record<string, { label: string; color: string }> = {
  healthy: { label: 'Healthy', color: 'text-green-400' },
  uneven: { label: 'Uneven', color: 'text-yellow-400' },
  stalled: { label: 'Stalled', color: 'text-orange-400' },
  regressing: { label: 'Regressing', color: 'text-red-400' },
};

export function GinaLadderView({ onBack }: GinaLadderViewProps) {
  const { user } = useAuth();
  const { isBambiMode } = useBambiMode();

  const [channelStates, setChannelStates] = useState<GinaLadderState[]>([]);
  const [recentSeeds, setRecentSeeds] = useState<SeedEntry[]>([]);
  const [recoveryChannels, setRecoveryChannels] = useState<{ channel: GinaChannel; recoveryType: string; cooldownDaysRemaining: number }[]>([]);
  const [composite, setComposite] = useState<{
    average: number;
    leading: { channel: GinaChannel; rung: number } | null;
    lagging: { channel: GinaChannel; rung: number } | null;
    widestGap: number;
    channelsStarted: number;
    channelsAtMax: number;
  } | null>(null);
  const [dueMeasurements, setDueMeasurements] = useState<MeasurementDue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View states
  const [expandedSection, setExpandedSection] = useState<string | null>('channels');
  const [showSeedLogger, setShowSeedLogger] = useState(false);
  const [showMeasurementForm, setShowMeasurementForm] = useState(false);
  const [showDisclosureMap, setShowDisclosureMap] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<GinaChannel | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;

    try {
      setError(null);
      const [states, seeds, recovery, due] = await Promise.all([
        getAllChannelStates(user.id),
        getRecentSeeds(user.id, 7),
        getChannelsInRecovery(user.id),
        getDueMeasurements(user.id),
      ]);

      // Initialize if no states exist
      if (states.length === 0) {
        await initializeLadder(user.id);
        const freshStates = await getAllChannelStates(user.id);
        setChannelStates(freshStates);
      } else {
        setChannelStates(states);
      }

      setRecentSeeds(seeds);
      setRecoveryChannels(recovery);
      setDueMeasurements(due);

      // Generate composite
      const comp = await getPipelineComposite(user.id);
      setComposite(comp);
    } catch (err) {
      console.error('Failed to load ladder data:', err);
      setError('Failed to load ladder data');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setIsLoading(true);
    await loadData();
  }, [loadData]);

  const handleSeedLogged = useCallback(() => {
    setShowSeedLogger(false);
    loadData();
  }, [loadData]);

  const handleMeasurementSaved = useCallback(() => {
    setShowMeasurementForm(false);
    loadData();
  }, [loadData]);

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  // Sub-views
  if (selectedChannel) {
    return (
      <ChannelDetail
        channel={selectedChannel}
        onBack={() => setSelectedChannel(null)}
      />
    );
  }

  if (showSeedLogger) {
    return (
      <SeedLogger
        onBack={() => setShowSeedLogger(false)}
        onSaved={handleSeedLogged}
      />
    );
  }

  if (showMeasurementForm) {
    return (
      <MeasurementForm
        onBack={() => setShowMeasurementForm(false)}
        onSaved={handleMeasurementSaved}
        dueMeasurements={dueMeasurements}
      />
    );
  }

  if (showDisclosureMap) {
    return (
      <DisclosureMap
        onBack={() => setShowDisclosureMap(false)}
      />
    );
  }

  if (isLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'}`}>
        <Loader2 className={`w-8 h-8 animate-spin ${isBambiMode ? 'text-pink-500' : 'text-purple-400'}`} />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`min-h-screen p-4 ${isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'}`}>
        <div className={`p-4 rounded-lg ${isBambiMode ? 'bg-red-100 text-red-700' : 'bg-red-900/30 text-red-300'}`}>
          <AlertTriangle className="w-5 h-5 inline mr-2" />
          {error}
          <button onClick={handleRefresh} className="ml-4 underline">Retry</button>
        </div>
      </div>
    );
  }

  const healthLabel = composite
    ? composite.average === 0
      ? 'stalled'
      : composite.widestGap >= 3
        ? 'uneven'
        : composite.average < 1
          ? 'stalled'
          : 'healthy'
    : null;
  const healthConfig = healthLabel ? HEALTH_CONFIG[healthLabel] : null;

  return (
    <div className={`min-h-screen ${isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'}`}>
      {/* Header */}
      <div className={`sticky top-0 z-10 px-4 py-3 flex items-center gap-3 border-b ${
        isBambiMode ? 'bg-pink-50 border-pink-200' : 'bg-protocol-bg border-protocol-border'
      }`}>
        <button onClick={onBack} className="p-1">
          <ChevronLeft className={`w-6 h-6 ${isBambiMode ? 'text-pink-600' : 'text-gray-400'}`} />
        </button>
        <Layers className={`w-5 h-5 ${isBambiMode ? 'text-pink-500' : 'text-purple-400'}`} />
        <h1 className={`text-lg font-semibold ${isBambiMode ? 'text-pink-800' : 'text-white'}`}>
          Gina Ladder System
        </h1>
        <button onClick={handleRefresh} className="ml-auto p-1">
          <RefreshCw className={`w-5 h-5 ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Composite Score Card */}
        {composite && (
          <div className={`rounded-lg p-4 ${isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface border border-protocol-border'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity className={`w-5 h-5 ${isBambiMode ? 'text-pink-500' : 'text-purple-400'}`} />
                <span className={`font-medium ${isBambiMode ? 'text-pink-800' : 'text-white'}`}>
                  Composite Score
                </span>
              </div>
              <span className={`text-2xl font-bold ${isBambiMode ? 'text-pink-600' : 'text-purple-300'}`}>
                {composite.average.toFixed(1)}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className={healthConfig?.color || ''}>
                {healthConfig?.label || 'Unknown'}
              </span>
              {composite.leading && (
                <span className={isBambiMode ? 'text-pink-500' : 'text-gray-400'}>
                  Leading: {CHANNEL_CONFIG[composite.leading.channel]?.label} (R{composite.leading.rung})
                </span>
              )}
              {composite.lagging && (
                <span className={isBambiMode ? 'text-pink-500' : 'text-gray-400'}>
                  Lagging: {CHANNEL_CONFIG[composite.lagging.channel]?.label} (R{composite.lagging.rung})
                </span>
              )}
            </div>
            {composite.widestGap >= 2 && (
              <div className={`mt-2 text-xs ${isBambiMode ? 'text-orange-600' : 'text-yellow-400'}`}>
                <AlertTriangle className="w-3 h-3 inline mr-1" />
                Gap of {composite.widestGap} rungs between channels
              </div>
            )}
          </div>
        )}

        {/* Recovery Alerts */}
        {recoveryChannels.length > 0 && (
          <div className={`rounded-lg p-3 ${isBambiMode ? 'bg-orange-50 border border-orange-200' : 'bg-orange-900/20 border border-orange-700/30'}`}>
            <div className="flex items-center gap-2 mb-2">
              <Shield className={`w-4 h-4 ${isBambiMode ? 'text-orange-600' : 'text-orange-400'}`} />
              <span className={`text-sm font-medium ${isBambiMode ? 'text-orange-800' : 'text-orange-300'}`}>
                Channels in Recovery
              </span>
            </div>
            {recoveryChannels.map(rc => (
              <div key={rc.channel} className={`flex items-center justify-between text-xs py-1 ${
                isBambiMode ? 'text-orange-700' : 'text-orange-200'
              }`}>
                <span>{CHANNEL_CONFIG[rc.channel]?.icon} {CHANNEL_CONFIG[rc.channel]?.label}</span>
                <span>
                  {rc.recoveryType.replace(/_/g, ' ')}
                  {rc.cooldownDaysRemaining > 0 && ` (${rc.cooldownDaysRemaining}d remaining)`}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Due Measurements Alert */}
        {dueMeasurements.length > 0 && (
          <button
            onClick={() => setShowMeasurementForm(true)}
            className={`w-full rounded-lg p-3 text-left ${
              isBambiMode ? 'bg-blue-50 border border-blue-200' : 'bg-blue-900/20 border border-blue-700/30'
            }`}
          >
            <div className="flex items-center gap-2">
              <Clock className={`w-4 h-4 ${isBambiMode ? 'text-blue-600' : 'text-blue-400'}`} />
              <span className={`text-sm font-medium ${isBambiMode ? 'text-blue-800' : 'text-blue-300'}`}>
                {dueMeasurements.length} measurement{dueMeasurements.length > 1 ? 's' : ''} due
              </span>
              <ChevronDown className={`w-4 h-4 ml-auto ${isBambiMode ? 'text-blue-400' : 'text-blue-500'}`} />
            </div>
          </button>
        )}

        {/* Channel Ladders Section */}
        <div className={`rounded-lg overflow-hidden ${isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface border border-protocol-border'}`}>
          <button
            onClick={() => toggleSection('channels')}
            className={`w-full px-4 py-3 flex items-center justify-between ${
              isBambiMode ? 'hover:bg-pink-50' : 'hover:bg-white/5'
            }`}
          >
            <div className="flex items-center gap-2">
              <Layers className={`w-4 h-4 ${isBambiMode ? 'text-pink-500' : 'text-purple-400'}`} />
              <span className={`font-medium ${isBambiMode ? 'text-pink-800' : 'text-white'}`}>
                10 Channels
              </span>
            </div>
            {expandedSection === 'channels' ? (
              <ChevronUp className={`w-4 h-4 ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`} />
            ) : (
              <ChevronDown className={`w-4 h-4 ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`} />
            )}
          </button>

          {expandedSection === 'channels' && (
            <div className="px-4 pb-3 space-y-2">
              {GINA_CHANNELS.map(channel => {
                const state = channelStates.find(s => s.channel === channel);
                const config = CHANNEL_CONFIG[channel];
                const rung = state?.currentRung || 0;
                const inCooldown = state ? isInCooldown(state) : false;
                const cooldownDays = state ? getCooldownRemaining(state) : 0;

                return (
                  <button
                    key={channel}
                    onClick={() => setSelectedChannel(channel)}
                    className={`w-full rounded-lg p-3 text-left transition-colors ${
                      isBambiMode
                        ? 'bg-pink-50 hover:bg-pink-100 border border-pink-100'
                        : 'bg-white/5 hover:bg-white/10 border border-white/5'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{config.icon}</span>
                        <span className={`text-sm font-medium ${isBambiMode ? 'text-pink-800' : 'text-white'}`}>
                          {config.label}
                        </span>
                        {inCooldown && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            isBambiMode ? 'bg-orange-100 text-orange-600' : 'bg-orange-900/30 text-orange-400'
                          }`}>
                            Cooldown {cooldownDays}d
                          </span>
                        )}
                      </div>
                      <span className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-gray-400'}`}>
                        {RUNG_LABELS[rung]}
                      </span>
                    </div>

                    {/* Rung progress bar */}
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(r => (
                        <div
                          key={r}
                          className={`h-2 flex-1 rounded-full transition-colors ${
                            r <= rung
                              ? config.color
                              : isBambiMode
                                ? 'bg-pink-100'
                                : 'bg-white/10'
                          }`}
                        />
                      ))}
                    </div>

                    {/* Stats row */}
                    {state && (
                      <div className={`flex gap-4 mt-2 text-xs ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>
                        <span>
                          <CheckCircle className="w-3 h-3 inline mr-0.5" />
                          {state.positiveSeedsAtRung} positive
                        </span>
                        <span>
                          {state.totalSeedsAtRung} total at rung
                        </span>
                        {state.consecutiveFailures > 0 && (
                          <span className={isBambiMode ? 'text-orange-500' : 'text-orange-400'}>
                            <AlertTriangle className="w-3 h-3 inline mr-0.5" />
                            {state.consecutiveFailures} failures
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Seeds Section */}
        <div className={`rounded-lg overflow-hidden ${isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface border border-protocol-border'}`}>
          <button
            onClick={() => toggleSection('seeds')}
            className={`w-full px-4 py-3 flex items-center justify-between ${
              isBambiMode ? 'hover:bg-pink-50' : 'hover:bg-white/5'
            }`}
          >
            <div className="flex items-center gap-2">
              <Zap className={`w-4 h-4 ${isBambiMode ? 'text-pink-500' : 'text-purple-400'}`} />
              <span className={`font-medium ${isBambiMode ? 'text-pink-800' : 'text-white'}`}>
                Recent Seeds ({recentSeeds.length})
              </span>
            </div>
            {expandedSection === 'seeds' ? (
              <ChevronUp className={`w-4 h-4 ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`} />
            ) : (
              <ChevronDown className={`w-4 h-4 ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`} />
            )}
          </button>

          {expandedSection === 'seeds' && (
            <div className="px-4 pb-3 space-y-2">
              {recentSeeds.length === 0 ? (
                <p className={`text-sm py-2 ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>
                  No seeds logged yet. Start by logging a seed attempt.
                </p>
              ) : (
                recentSeeds.slice(0, 10).map(seed => (
                  <SeedRow key={seed.id} seed={seed} isBambiMode={isBambiMode} />
                ))
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setShowSeedLogger(true)}
            className={`flex items-center justify-center gap-2 py-3 rounded-lg font-medium ${
              isBambiMode
                ? 'bg-pink-500 text-white hover:bg-pink-600'
                : 'bg-purple-600 text-white hover:bg-purple-700'
            }`}
          >
            <Plus className="w-4 h-4" />
            Log Seed
          </button>
          <button
            onClick={() => setShowMeasurementForm(true)}
            className={`flex items-center justify-center gap-2 py-3 rounded-lg font-medium ${
              isBambiMode
                ? 'bg-pink-100 text-pink-700 hover:bg-pink-200'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Measurement
          </button>
          <button
            onClick={() => setShowDisclosureMap(true)}
            className={`flex items-center justify-center gap-2 py-3 rounded-lg font-medium ${
              isBambiMode
                ? 'bg-pink-100 text-pink-700 hover:bg-pink-200'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <Users className="w-4 h-4" />
            Disclosure Map
          </button>
          <button
            onClick={async () => {
              if (!user) return;
              setIsLoading(true);
              await generateMasterComposite(user.id);
              await loadData();
            }}
            className={`flex items-center justify-center gap-2 py-3 rounded-lg font-medium ${
              isBambiMode
                ? 'bg-pink-100 text-pink-700 hover:bg-pink-200'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <RefreshCw className="w-4 h-4" />
            Recalculate
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// SEED ROW SUB-COMPONENT
// ============================================

const RESPONSE_CONFIG: Record<string, { label: string; color: string }> = {
  positive: { label: 'Positive', color: 'text-green-400' },
  neutral: { label: 'Neutral', color: 'text-gray-400' },
  negative: { label: 'Negative', color: 'text-red-400' },
  callout: { label: 'Callout', color: 'text-orange-400' },
  no_reaction: { label: 'No Reaction', color: 'text-gray-500' },
};

function SeedRow({ seed, isBambiMode }: { seed: SeedEntry; isBambiMode: boolean }) {
  const channelCfg = CHANNEL_CONFIG[seed.channel];
  const responseCfg = RESPONSE_CONFIG[seed.ginaResponse] || RESPONSE_CONFIG.neutral;
  const timeAgo = getTimeAgo(seed.createdAt);

  return (
    <div className={`rounded p-2 ${isBambiMode ? 'bg-pink-50' : 'bg-white/5'}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-xs">{channelCfg?.icon}</span>
          <span className={`text-xs font-medium ${isBambiMode ? 'text-pink-700' : 'text-gray-300'}`}>
            {channelCfg?.label} R{seed.rung}
          </span>
          <span className={`text-xs ${responseCfg.color}`}>
            {responseCfg.label}
          </span>
        </div>
        <span className={`text-xs ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>
          {timeAgo}
        </span>
      </div>
      <p className={`text-xs truncate ${isBambiMode ? 'text-pink-600' : 'text-gray-400'}`}>
        {seed.seedDescription}
      </p>
      {seed.recoveryTriggered && (
        <span className={`text-xs ${isBambiMode ? 'text-orange-500' : 'text-orange-400'}`}>
          <AlertTriangle className="w-3 h-3 inline mr-0.5" />
          Recovery: {seed.recoveryType?.replace(/_/g, ' ')}
        </span>
      )}
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}
