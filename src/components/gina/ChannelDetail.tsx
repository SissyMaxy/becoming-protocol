/**
 * Channel Detail
 *
 * Expanded view of a single Gina channel showing all 5 rungs,
 * seed history, advancement status, and cooldown information.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  AlertTriangle,
  Loader2,
  TrendingUp,
  Shield,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBambiMode } from '../../context/BambiModeContext';
import {
  type GinaChannel,
  type GinaLadderState,
  type AdvancementResult,
  getChannelState,
  checkAdvancement,
  advanceRung,
  isInCooldown,
  getCooldownRemaining,
} from '../../lib/gina/ladder-engine';
import {
  type SeedEntry,
  getSeedHistory,
  getSeedStats,
  getSeedsByRung,
} from '../../lib/gina/seed-manager';
import {
  getChannelMeasurementScore,
} from '../../lib/gina/measurement-engine';

interface ChannelDetailProps {
  channel: GinaChannel;
  onBack: () => void;
}

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

const RUNG_DESCRIPTIONS: Record<number, string> = {
  0: 'Not started — no seeds planted yet',
  1: 'Introduction — initial seeds, testing reception',
  2: 'Normalization — regular seeds, building comfort',
  3: 'Integration — seeds becoming routine',
  4: 'Ownership — Gina taking active role',
  5: 'Mastery — fully integrated, self-sustaining',
};

const RESPONSE_COLORS: Record<string, string> = {
  positive: 'text-green-400',
  neutral: 'text-gray-400',
  negative: 'text-red-400',
  callout: 'text-orange-400',
  no_reaction: 'text-gray-500',
};

export function ChannelDetail({ channel, onBack }: ChannelDetailProps) {
  const { user } = useAuth();
  const { isBambiMode } = useBambiMode();

  const [state, setState] = useState<GinaLadderState | null>(null);
  const [seeds, setSeeds] = useState<SeedEntry[]>([]);
  const [stats, setStats] = useState<{
    total: number; positive: number; neutral: number; negative: number;
    callout: number; noReaction: number; successRate: number; recoveriesTriggered: number;
  } | null>(null);
  const [advancement, setAdvancement] = useState<AdvancementResult | null>(null);
  const [measurementScore, setMeasurementScore] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [selectedRung, setSelectedRung] = useState<number | null>(null);
  const [rungSeeds, setRungSeeds] = useState<SeedEntry[]>([]);

  const config = CHANNEL_CONFIG[channel];

  const loadData = useCallback(async () => {
    if (!user) return;

    try {
      const [channelState, seedHistory, seedStats, measScore] = await Promise.all([
        getChannelState(user.id, channel),
        getSeedHistory(user.id, channel, 30),
        getSeedStats(user.id, channel),
        getChannelMeasurementScore(user.id, channel),
      ]);

      setState(channelState);
      setSeeds(seedHistory);
      setStats(seedStats);
      setMeasurementScore(measScore);

      // Check advancement
      if (channelState) {
        const advResult = await checkAdvancement(user.id, channel);
        setAdvancement(advResult);
      }
    } catch (err) {
      console.error('Failed to load channel detail:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user, channel]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleViewRungSeeds = useCallback(async (rung: number) => {
    if (!user) return;
    if (selectedRung === rung) {
      setSelectedRung(null);
      setRungSeeds([]);
      return;
    }
    setSelectedRung(rung);
    const seeds = await getSeedsByRung(user.id, channel, rung);
    setRungSeeds(seeds);
  }, [user, channel, selectedRung]);

  const handleAdvance = useCallback(async () => {
    if (!user || !advancement?.canAdvance) return;
    setIsAdvancing(true);
    try {
      await advanceRung(user.id, channel);
      await loadData();
    } catch (err) {
      console.error('Failed to advance rung:', err);
    } finally {
      setIsAdvancing(false);
    }
  }, [user, channel, advancement, loadData]);

  if (isLoading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'}`}>
        <Loader2 className={`w-8 h-8 animate-spin ${isBambiMode ? 'text-pink-500' : 'text-purple-400'}`} />
      </div>
    );
  }

  const currentRung = state?.currentRung || 0;
  const inCooldown = state ? isInCooldown(state) : false;
  const cooldownDays = state ? getCooldownRemaining(state) : 0;

  return (
    <div className={`min-h-screen ${isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'}`}>
      {/* Header */}
      <div className={`sticky top-0 z-10 px-4 py-3 flex items-center gap-3 border-b ${
        isBambiMode ? 'bg-pink-50 border-pink-200' : 'bg-protocol-bg border-protocol-border'
      }`}>
        <button onClick={onBack} className="p-1">
          <ChevronLeft className={`w-6 h-6 ${isBambiMode ? 'text-pink-600' : 'text-gray-400'}`} />
        </button>
        <span className="text-lg">{config.icon}</span>
        <h1 className={`text-lg font-semibold ${isBambiMode ? 'text-pink-800' : 'text-white'}`}>
          {config.label} Channel
        </h1>
      </div>

      <div className="p-4 space-y-4">
        {/* Status Card */}
        <div className={`rounded-lg p-4 ${isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface border border-protocol-border'}`}>
          <div className="flex items-center justify-between mb-3">
            <span className={`text-2xl font-bold ${isBambiMode ? 'text-pink-600' : 'text-purple-300'}`}>
              Rung {currentRung}
            </span>
            {inCooldown && (
              <span className={`flex items-center gap-1 text-sm px-2 py-1 rounded ${
                isBambiMode ? 'bg-orange-100 text-orange-600' : 'bg-orange-900/30 text-orange-400'
              }`}>
                <Shield className="w-4 h-4" />
                Cooldown {cooldownDays}d
              </span>
            )}
          </div>
          <p className={`text-sm mb-3 ${isBambiMode ? 'text-pink-500' : 'text-gray-400'}`}>
            {RUNG_DESCRIPTIONS[currentRung]}
          </p>

          {/* Rung progress visualization */}
          <div className="flex gap-2 mb-3">
            {[0, 1, 2, 3, 4, 5].map(rung => (
              <button
                key={rung}
                onClick={() => handleViewRungSeeds(rung)}
                className={`flex-1 py-3 rounded-lg text-center transition-colors ${
                  rung === currentRung
                    ? config.color + ' text-white font-bold'
                    : rung < currentRung
                      ? isBambiMode ? 'bg-green-100 text-green-700' : 'bg-green-900/30 text-green-400'
                      : isBambiMode ? 'bg-gray-100 text-gray-400' : 'bg-white/5 text-gray-600'
                } ${selectedRung === rung ? 'ring-2 ring-offset-1 ring-purple-500' : ''}`}
              >
                <div className="text-lg">{rung}</div>
                <div className="text-[10px]">
                  {rung < currentRung ? '✓' : rung === currentRung ? '●' : '○'}
                </div>
              </button>
            ))}
          </div>

          {/* Rung seeds (when selected) */}
          {selectedRung !== null && (
            <div className={`rounded p-2 mb-3 ${isBambiMode ? 'bg-pink-50' : 'bg-white/5'}`}>
              <p className={`text-xs mb-1 ${isBambiMode ? 'text-pink-600' : 'text-gray-400'}`}>
                Seeds at Rung {selectedRung} ({rungSeeds.length})
              </p>
              {rungSeeds.length === 0 ? (
                <p className={`text-xs ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>No seeds at this rung</p>
              ) : (
                rungSeeds.slice(0, 5).map(seed => (
                  <div key={seed.id} className={`text-xs py-1 flex justify-between ${isBambiMode ? 'text-pink-700' : 'text-gray-300'}`}>
                    <span className="truncate flex-1">{seed.seedDescription}</span>
                    <span className={RESPONSE_COLORS[seed.ginaResponse] || 'text-gray-500'}>
                      {seed.ginaResponse}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Advancement */}
          {advancement && (
            <div className={`rounded-lg p-3 ${
              advancement.canAdvance
                ? isBambiMode ? 'bg-green-50 border border-green-200' : 'bg-green-900/20 border border-green-700/30'
                : isBambiMode ? 'bg-gray-50 border border-gray-200' : 'bg-white/5 border border-white/5'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className={`w-4 h-4 ${
                  advancement.canAdvance
                    ? isBambiMode ? 'text-green-600' : 'text-green-400'
                    : isBambiMode ? 'text-gray-400' : 'text-gray-500'
                }`} />
                <span className={`text-sm font-medium ${
                  advancement.canAdvance
                    ? isBambiMode ? 'text-green-700' : 'text-green-300'
                    : isBambiMode ? 'text-gray-600' : 'text-gray-400'
                }`}>
                  {advancement.canAdvance ? `Ready to advance to Rung ${currentRung + 1}` : 'Advancement Progress'}
                </span>
              </div>

              {/* Reason */}
              {!advancement.canAdvance && advancement.reason && (
                <div className={`text-xs flex items-center gap-1 mb-2 ${isBambiMode ? 'text-orange-600' : 'text-orange-400'}`}>
                  <AlertTriangle className="w-3 h-3" />
                  {advancement.reason}
                </div>
              )}

              {advancement.canAdvance && (
                <button
                  onClick={handleAdvance}
                  disabled={isAdvancing}
                  className={`w-full py-2 rounded font-medium flex items-center justify-center gap-2 ${
                    isBambiMode ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  {isAdvancing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <TrendingUp className="w-4 h-4" />
                  )}
                  Advance to Rung {currentRung + 1}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Stats Card */}
        {stats && (
          <div className={`rounded-lg p-4 ${isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface border border-protocol-border'}`}>
            <h3 className={`text-sm font-medium mb-3 ${isBambiMode ? 'text-pink-800' : 'text-white'}`}>
              Seed Statistics
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <StatBox label="Total" value={stats.total} color={isBambiMode ? 'text-pink-700' : 'text-white'} isBambiMode={isBambiMode} />
              <StatBox label="Success" value={`${stats.successRate}%`} color="text-green-400" isBambiMode={isBambiMode} />
              <StatBox label="Positive" value={stats.positive} color="text-green-400" isBambiMode={isBambiMode} />
              <StatBox label="Neutral" value={stats.neutral} color="text-gray-400" isBambiMode={isBambiMode} />
              <StatBox label="Negative" value={stats.negative} color="text-red-400" isBambiMode={isBambiMode} />
              <StatBox label="Callouts" value={stats.callout} color="text-orange-400" isBambiMode={isBambiMode} />
            </div>
            {measurementScore !== null && (
              <div className={`mt-3 pt-3 border-t ${isBambiMode ? 'border-pink-100' : 'border-white/10'}`}>
                <div className="flex justify-between text-sm">
                  <span className={isBambiMode ? 'text-pink-600' : 'text-gray-400'}>Latest measurement score</span>
                  <span className={`font-medium ${isBambiMode ? 'text-pink-800' : 'text-purple-300'}`}>
                    {measurementScore.toFixed(1)}/5
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recent Seeds */}
        <div className={`rounded-lg p-4 ${isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface border border-protocol-border'}`}>
          <h3 className={`text-sm font-medium mb-3 ${isBambiMode ? 'text-pink-800' : 'text-white'}`}>
            <Zap className="w-4 h-4 inline mr-1" />
            Recent Seeds ({seeds.length})
          </h3>
          {seeds.length === 0 ? (
            <p className={`text-sm ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>
              No seeds logged for this channel yet.
            </p>
          ) : (
            <div className="space-y-2">
              {seeds.slice(0, 15).map(seed => (
                <div key={seed.id} className={`rounded p-2 ${isBambiMode ? 'bg-pink-50' : 'bg-white/5'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-medium ${RESPONSE_COLORS[seed.ginaResponse]}`}>
                      {seed.ginaResponse.replace(/_/g, ' ')}
                    </span>
                    <span className={`text-xs ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>
                      R{seed.rung} · {seed.createdAt.toLocaleDateString()}
                    </span>
                  </div>
                  <p className={`text-xs ${isBambiMode ? 'text-pink-700' : 'text-gray-300'}`}>
                    {seed.seedDescription}
                  </p>
                  {seed.ginaExactWords && (
                    <p className={`text-xs italic mt-1 ${isBambiMode ? 'text-pink-500' : 'text-gray-400'}`}>
                      "{seed.ginaExactWords}"
                    </p>
                  )}
                  {seed.recoveryTriggered && (
                    <span className={`text-xs ${isBambiMode ? 'text-orange-500' : 'text-orange-400'}`}>
                      Recovery: {seed.recoveryType?.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, color, isBambiMode }: {
  label: string; value: string | number; color: string; isBambiMode: boolean;
}) {
  return (
    <div className={`text-center p-2 rounded ${isBambiMode ? 'bg-pink-50' : 'bg-white/5'}`}>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className={`text-xs ${isBambiMode ? 'text-pink-400' : 'text-gray-500'}`}>{label}</div>
    </div>
  );
}
