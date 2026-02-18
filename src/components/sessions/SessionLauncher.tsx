// SessionLauncher.tsx
// Menu to select and launch different session types with smart recommendations

import { useState, useMemo } from 'react';
import {
  Target,
  Moon,
  Waves,
  Flame,
  Sparkles,
  Clock,
  Zap,
  X,
  Vibrate,
  AlertCircle,
  Star,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useLovense } from '../../hooks/useLovense';
import { useCurrentDenialDay } from '../../hooks/useCurrentDenialDay';
import { useArousalState } from '../../hooks/useArousalState';
import { DenialTracker } from './DenialTracker';
import { UnifiedSessionView, type SessionType as UnifiedSessionType } from './UnifiedSessionView';
import {
  getSessionRecommendations,
  getTimeOfDay,
  isWeekend,
  SESSION_DISPLAY_INFO,
  type SessionRecommendation,
  type RecommendationContext,
} from '../../lib/session-recommendations';
import { getRecommendedProtocols } from '../../lib/edge-protocols';

type SessionType = 'edge' | 'goon' | 'denial' | 'freestyle' | 'conditioning' | null;

interface SessionLauncherProps {
  className?: string;
}

interface SessionCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  duration: string;
  intensity: 'Low' | 'Medium' | 'High' | 'Variable';
  color: string;
  onClick: () => void;
  isBambiMode: boolean;
  disabled?: boolean;
}

function SessionCard({
  title,
  description,
  icon,
  duration,
  intensity,
  color,
  onClick,
  isBambiMode,
  disabled,
}: SessionCardProps) {
  const intensityColors = {
    Low: 'text-green-500',
    Medium: 'text-yellow-500',
    High: 'text-red-500',
    Variable: 'text-purple-500',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full p-4 rounded-xl text-left transition-all ${
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : 'hover:scale-[1.02] active:scale-[0.98]'
      } ${
        isBambiMode
          ? 'bg-white border border-pink-200 hover:border-pink-400'
          : 'bg-protocol-surface border border-protocol-border hover:border-protocol-accent'
      }`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`p-3 rounded-lg ${color}`}
        >
          {icon}
        </div>
        <div className="flex-1">
          <h3
            className={`font-bold text-lg ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            {title}
          </h3>
          <p
            className={`text-sm mt-1 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}
          >
            {description}
          </p>
          <div className="flex items-center gap-4 mt-3 text-xs">
            <div
              className={`flex items-center gap-1 ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            >
              <Clock className="w-3 h-3" />
              <span>{duration}</span>
            </div>
            <div className={`flex items-center gap-1 ${intensityColors[intensity]}`}>
              <Zap className="w-3 h-3" />
              <span>{intensity}</span>
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

export function SessionLauncher({ className = '' }: SessionLauncherProps) {
  const { isBambiMode } = useBambiMode();
  const lovense = useLovense();
  const denial = useCurrentDenialDay();
  const { currentState } = useArousalState();
  const [activeSession, setActiveSession] = useState<SessionType>(null);
  const [showSessionComplete, setShowSessionComplete] = useState(false);
  const [lastSessionStats, setLastSessionStats] = useState<any>(null);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [showProtocols, setShowProtocols] = useState(false);

  const isConnected = lovense.status === 'connected' || lovense.cloudConnected;

  // Generate smart recommendations
  const recommendations = useMemo(() => {
    const context: RecommendationContext = {
      arousalState: currentState || 'building',
      denialDay: denial.currentDay,
      timeOfDay: getTimeOfDay(),
      isWeekend: isWeekend(),
      isInSweetSpot: currentState === 'sweet_spot',
    };
    return getSessionRecommendations(context);
  }, [currentState, denial.currentDay]);

  // Get top 3 recommendations
  const topRecommendations = recommendations.slice(0, 3);

  // Get recommended protocols for current denial day
  const recommendedProtocols = useMemo(() => {
    return getRecommendedProtocols(denial.currentDay).slice(0, 3);
  }, [denial.currentDay]);

  const handleSessionComplete = (stats: any) => {
    setLastSessionStats(stats);
    setShowSessionComplete(true);
    setActiveSession(null);
  };

  const closeSession = () => {
    setActiveSession(null);
  };

  // Render active session using unified view
  if (activeSession) {
    return (
      <UnifiedSessionView
        sessionType={activeSession as UnifiedSessionType}
        onClose={closeSession}
        onComplete={handleSessionComplete}
      />
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2
          className={`text-xl font-bold ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}
        >
          Sessions
        </h2>
        {!isConnected && (
          <div
            className={`flex items-center gap-2 text-sm ${
              isBambiMode ? 'text-orange-500' : 'text-orange-400'
            }`}
          >
            <AlertCircle className="w-4 h-4" />
            <span>Connect toy for full experience</span>
          </div>
        )}
      </div>

      {/* Connection Status */}
      {isConnected && lovense.activeToy && (
        <div
          className={`flex items-center gap-2 p-3 rounded-lg ${
            isBambiMode ? 'bg-green-50 text-green-700' : 'bg-green-900/20 text-green-400'
          }`}
        >
          <Vibrate className="w-4 h-4" />
          <span className="text-sm">
            Connected: {lovense.activeToy.name} ({lovense.activeToy.battery}%)
          </span>
        </div>
      )}

      {/* Cloud mode status - show when waiting for connection */}
      {lovense.cloudApiEnabled && !isConnected && (
        <div
          className={`p-3 rounded-lg ${
            isBambiMode ? 'bg-yellow-50 text-yellow-700' : 'bg-yellow-900/20 text-yellow-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm">
              {lovense.cloudQrUrl ? 'Waiting for connection...' : 'Cloud mode enabled'}
            </span>
            <button
              onClick={() => lovense.checkCloudConnection()}
              className={`text-xs px-2 py-1 rounded ${
                isBambiMode ? 'bg-yellow-200 hover:bg-yellow-300' : 'bg-yellow-800/50 hover:bg-yellow-700/50'
              }`}
            >
              Refresh
            </button>
          </div>
          <p className="text-xs mt-1 opacity-70">
            Scan QR code in Lovense Remote app to connect
          </p>
        </div>
      )}

      {/* Denial Tracker */}
      <DenialTracker compact className="mb-4" />

      {/* Recommended Sessions */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-sm font-semibold ${isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}`}>
            Recommended For You
          </h3>
          {currentState && (
            <span className={`text-xs px-2 py-1 rounded-full ${
              isBambiMode ? 'bg-pink-100 text-pink-600' : 'bg-protocol-accent/20 text-protocol-accent'
            }`}>
              {currentState.replace('_', ' ')} · Day {denial.currentDay}
            </span>
          )}
        </div>

        <div className="space-y-2">
          {topRecommendations.map((rec, index) => (
            <RecommendedSessionCard
              key={rec.sessionType}
              recommendation={rec}
              rank={index + 1}
              onClick={() => setActiveSession(rec.sessionType)}
              isBambiMode={isBambiMode}
            />
          ))}
        </div>
      </div>

      {/* Edge Protocols Quick Access */}
      {recommendedProtocols.length > 0 && (
        <div className="mb-6">
          <button
            onClick={() => setShowProtocols(!showProtocols)}
            className={`w-full flex items-center justify-between p-3 rounded-xl ${
              isBambiMode
                ? 'bg-pink-50 border border-pink-200 hover:border-pink-400'
                : 'bg-protocol-surface border border-protocol-border hover:border-protocol-accent'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${isBambiMode ? 'bg-pink-200' : 'bg-protocol-accent/20'}`}>
                <Target className={`w-5 h-5 ${isBambiMode ? 'text-pink-600' : 'text-protocol-accent'}`} />
              </div>
              <div className="text-left">
                <div className={`font-medium ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
                  Edge Protocols
                </div>
                <div className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
                  {recommendedProtocols.length} programs for Day {denial.currentDay}
                </div>
              </div>
            </div>
            <ChevronRight className={`w-5 h-5 transition-transform ${showProtocols ? 'rotate-90' : ''} ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`} />
          </button>

          {showProtocols && (
            <div className="mt-2 space-y-2">
              {recommendedProtocols.map(protocol => (
                <div
                  key={protocol.id}
                  className={`p-3 rounded-xl ${
                    isBambiMode ? 'bg-white border border-pink-100' : 'bg-protocol-bg border border-protocol-border'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className={`font-medium ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
                        {protocol.name}
                      </div>
                      <div className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
                        {protocol.totalEdges} edges · {protocol.estimatedDuration} min · {protocol.difficulty}
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveSession('edge')}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                        isBambiMode
                          ? 'bg-pink-500 text-white hover:bg-pink-600'
                          : 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
                      }`}
                    >
                      Start
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* All Sessions Toggle */}
      <button
        onClick={() => setShowAllSessions(!showAllSessions)}
        className={`w-full mb-3 text-center text-sm ${
          isBambiMode ? 'text-pink-500 hover:text-pink-700' : 'text-protocol-text-muted hover:text-protocol-text'
        }`}
      >
        {showAllSessions ? 'Hide all sessions' : 'Show all sessions'}
      </button>

      {/* All Session Cards */}
      {showAllSessions && (
        <div className="space-y-3">
          <SessionCard
            title="Conditioning"
            description="Rewire your responses. Deep focus."
            icon={<Sparkles className="w-6 h-6 text-white" />}
            duration="15-30 min"
            intensity="Medium"
            color="bg-gradient-to-br from-purple-500 to-pink-500"
            onClick={() => setActiveSession('conditioning')}
            isBambiMode={isBambiMode}
          />

          <SessionCard
            title="Edge Training"
            description="Build up, get close, back off. Repeat."
            icon={<Target className="w-6 h-6 text-white" />}
            duration="15-30 min"
            intensity="Variable"
            color="bg-gradient-to-br from-pink-500 to-red-500"
            onClick={() => setActiveSession('edge')}
            isBambiMode={isBambiMode}
          />

          <SessionCard
            title="Goon"
            description="Zone out. Let go. Just feel it."
            icon={<Moon className="w-6 h-6 text-white" />}
            duration="20-45 min"
            intensity="High"
            color="bg-gradient-to-br from-purple-500 to-indigo-500"
            onClick={() => setActiveSession('goon')}
            isBambiMode={isBambiMode}
          />

          <SessionCard
            title="Denial Training"
            description="Build up and denial cycles. Stay on the edge without going over."
            icon={<Flame className="w-6 h-6 text-white" />}
            duration="20-40 min"
            intensity="High"
            color="bg-gradient-to-br from-orange-500 to-red-600"
            onClick={() => setActiveSession('denial')}
            isBambiMode={isBambiMode}
          />

          <SessionCard
            title="Freestyle"
            description="Just vibes. Watch and enjoy at your own pace."
            icon={<Waves className="w-6 h-6 text-white" />}
            duration="Any"
            intensity="Variable"
            color="bg-gradient-to-br from-cyan-500 to-blue-500"
            onClick={() => setActiveSession('freestyle')}
            isBambiMode={isBambiMode}
          />
        </div>
      )}

      {/* Session Complete Modal */}
      {showSessionComplete && lastSessionStats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            className={`w-full max-w-md rounded-2xl p-6 ${
              isBambiMode ? 'bg-white' : 'bg-protocol-surface'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <h3
                className={`text-xl font-bold ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                Session Complete
              </h3>
              <button
                onClick={() => setShowSessionComplete(false)}
                className={`p-2 rounded-full ${
                  isBambiMode ? 'hover:bg-pink-100' : 'hover:bg-protocol-surface-light'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex justify-center mb-6">
              <Sparkles
                className={`w-16 h-16 ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
                }`}
              />
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <StatBox
                label="Duration"
                value={`${Math.floor(lastSessionStats.duration / 60)}:${(lastSessionStats.duration % 60).toString().padStart(2, '0')}`}
                isBambiMode={isBambiMode}
              />
              <StatBox
                label="Peak Intensity"
                value={`${lastSessionStats.peakIntensity}/20`}
                isBambiMode={isBambiMode}
              />
              {lastSessionStats.edgeCount !== undefined && (
                <StatBox
                  label="Edges"
                  value={lastSessionStats.edgeCount}
                  isBambiMode={isBambiMode}
                />
              )}
              {lastSessionStats.cyclesCompleted !== undefined && (
                <StatBox
                  label="Cycles"
                  value={lastSessionStats.cyclesCompleted}
                  isBambiMode={isBambiMode}
                />
              )}
              {lastSessionStats.denials !== undefined && (
                <StatBox
                  label="Denials"
                  value={lastSessionStats.denials}
                  isBambiMode={isBambiMode}
                />
              )}
              {lastSessionStats.averageIntensity !== undefined && (
                <StatBox
                  label="Avg Intensity"
                  value={Math.round(lastSessionStats.averageIntensity)}
                  isBambiMode={isBambiMode}
                />
              )}
            </div>

            <button
              onClick={() => setShowSessionComplete(false)}
              className={`w-full py-3 rounded-xl font-medium ${
                isBambiMode
                  ? 'bg-pink-500 text-white hover:bg-pink-600'
                  : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
              }`}
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({
  label,
  value,
  isBambiMode,
}: {
  label: string;
  value: string | number;
  isBambiMode: boolean;
}) {
  return (
    <div
      className={`p-3 rounded-lg text-center ${
        isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'
      }`}
    >
      <div
        className={`text-2xl font-bold ${
          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
        }`}
      >
        {value}
      </div>
      <div
        className={`text-xs ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
        }`}
      >
        {label}
      </div>
    </div>
  );
}

// Recommended session card with badges
function RecommendedSessionCard({
  recommendation,
  rank,
  onClick,
  isBambiMode,
}: {
  recommendation: SessionRecommendation;
  rank: number;
  onClick: () => void;
  isBambiMode: boolean;
}) {
  const info = SESSION_DISPLAY_INFO[recommendation.sessionType];
  const isTopPick = rank === 1;

  const getBadgeStyle = (badge: SessionRecommendation['badges'][0]) => {
    switch (badge) {
      case 'recommended':
        return isBambiMode ? 'bg-pink-500 text-white' : 'bg-protocol-accent text-white';
      case 'breakthrough':
        return 'bg-purple-500 text-white';
      case 'challenging':
        return 'bg-orange-500 text-white';
      case 'recovery':
        return 'bg-green-500 text-white';
      case 'avoid':
        return 'bg-red-500/20 text-red-400';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  return (
    <button
      onClick={onClick}
      className={`w-full p-4 rounded-xl text-left transition-all hover:scale-[1.01] ${
        isTopPick
          ? isBambiMode
            ? 'bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white'
            : 'bg-gradient-to-r from-protocol-accent to-purple-600 text-white'
          : isBambiMode
            ? 'bg-white border border-pink-200 hover:border-pink-400'
            : 'bg-protocol-surface border border-protocol-border hover:border-protocol-accent'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Rank indicator */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
          isTopPick ? 'bg-white/20' : isBambiMode ? 'bg-pink-100' : 'bg-protocol-accent/20'
        }`}>
          {isTopPick ? (
            <Star className={`w-4 h-4 ${isTopPick ? 'text-white' : isBambiMode ? 'text-pink-600' : 'text-protocol-accent'}`} />
          ) : (
            <span className={`text-sm font-bold ${isBambiMode ? 'text-pink-600' : 'text-protocol-accent'}`}>
              {rank}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-lg ${isTopPick ? '' : ''}`}>{info.emoji}</span>
            <span className={`font-bold ${
              isTopPick ? 'text-white' : isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}>
              {info.name}
            </span>
          </div>

          <p className={`text-sm mb-2 ${
            isTopPick ? 'text-white/80' : isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
          }`}>
            {recommendation.reason}
          </p>

          {/* Badges */}
          <div className="flex flex-wrap gap-1">
            {recommendation.badges.map((badge, i) => (
              <span
                key={i}
                className={`text-xs px-2 py-0.5 rounded-full ${getBadgeStyle(badge)}`}
              >
                {badge.charAt(0).toUpperCase() + badge.slice(1)}
              </span>
            ))}
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              isTopPick ? 'bg-white/20 text-white' : isBambiMode ? 'bg-pink-100 text-pink-600' : 'bg-protocol-bg text-protocol-text-muted'
            }`}>
              {recommendation.suggestedDuration.min}-{recommendation.suggestedDuration.max} min
            </span>
          </div>

          {/* Warnings */}
          {recommendation.warnings.length > 0 && !isTopPick && (
            <div className="flex items-center gap-1 mt-2 text-xs text-orange-500">
              <AlertTriangle className="w-3 h-3" />
              <span>{recommendation.warnings[0]}</span>
            </div>
          )}
        </div>

        <ChevronRight className={`w-5 h-5 flex-shrink-0 ${
          isTopPick ? 'text-white/70' : isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
        }`} />
      </div>
    </button>
  );
}

export { UnifiedSessionView };
