/**
 * Streak Warnings Widget
 *
 * Displays proactive warnings about streak risk based on:
 * - Historical slip patterns
 * - Arousal forecasting
 * - Time-based risk factors
 */

import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  AlertOctagon,
  Info,
  X,
  ChevronRight,
  Shield,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBambiMode } from '../../context/BambiModeContext';
import {
  checkStreakWarnings,
  getStreakStatus,
  acknowledgeWarning,
  dismissWarning,
  getWarningColor,
  type StreakWarning,
  type StreakStatus,
  type WarningLevel,
} from '../../lib/streak-warnings';

// ============================================
// COMPONENT
// ============================================

interface StreakWarningsWidgetProps {
  compact?: boolean;
  showRecommendations?: boolean;
  onWarningAction?: (warning: StreakWarning) => void;
}

export function StreakWarningsWidget({
  compact = false,
  showRecommendations = true,
  onWarningAction,
}: StreakWarningsWidgetProps) {
  const { user } = useAuth();
  const { isBambiMode } = useBambiMode();
  const [status, setStatus] = useState<StreakStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function loadStatus() {
      if (!user?.id) return;

      try {
        // Check for new warnings
        await checkStreakWarnings(user.id);
        // Get current status
        const currentStatus = await getStreakStatus(user.id);
        setStatus(currentStatus);
      } catch (err) {
        console.error('Failed to load streak status:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadStatus();

    // Refresh every hour
    const interval = setInterval(loadStatus, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user?.id]);

  const handleDismiss = async (warning: StreakWarning) => {
    await dismissWarning(warning.id);
    setDismissedIds(prev => new Set([...prev, warning.id]));
  };

  const handleAcknowledge = async (warning: StreakWarning) => {
    await acknowledgeWarning(warning.id);
    onWarningAction?.(warning);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className={`w-5 h-5 animate-spin ${isBambiMode ? 'text-pink-400' : 'text-protocol-accent'}`} />
      </div>
    );
  }

  if (!status) return null;

  const visibleWarnings = status.activeWarnings.filter(w => !dismissedIds.has(w.id));

  if (compact) {
    return (
      <CompactView
        status={status}
        warnings={visibleWarnings}
        isBambiMode={isBambiMode}
        onDismiss={handleDismiss}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Safety Score */}
      <SafetyScoreCard status={status} isBambiMode={isBambiMode} />

      {/* Active Warnings */}
      {visibleWarnings.length > 0 && (
        <div className="space-y-2">
          <h3 className={`text-sm font-medium ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
            Active Alerts
          </h3>
          {visibleWarnings.map(warning => (
            <WarningCard
              key={warning.id}
              warning={warning}
              isBambiMode={isBambiMode}
              onDismiss={() => handleDismiss(warning)}
              onAcknowledge={() => handleAcknowledge(warning)}
            />
          ))}
        </div>
      )}

      {/* Recommendations */}
      {showRecommendations && status.recommendations.length > 0 && (
        <div className="space-y-2">
          <h3 className={`text-sm font-medium flex items-center gap-2 ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
            <Shield className="w-4 h-4" />
            Recommendations
          </h3>
          <div className={`p-4 rounded-xl ${isBambiMode ? 'bg-pink-50 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'}`}>
            <ul className="space-y-2">
              {status.recommendations.map((rec, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <ChevronRight className={`w-4 h-4 mt-0.5 shrink-0 ${isBambiMode ? 'text-pink-400' : 'text-protocol-accent'}`} />
                  <span className={isBambiMode ? 'text-pink-700' : 'text-protocol-text'}>
                    {rec}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* All Clear Message */}
      {visibleWarnings.length === 0 && status.safetyScore >= 70 && (
        <div className={`p-4 rounded-xl text-center ${
          isBambiMode ? 'bg-green-50 border border-green-200' : 'bg-green-900/20 border border-green-700/30'
        }`}>
          <Shield className={`w-8 h-8 mx-auto mb-2 ${isBambiMode ? 'text-green-500' : 'text-green-400'}`} />
          <p className={`font-medium ${isBambiMode ? 'text-green-700' : 'text-green-400'}`}>
            Streak Looking Healthy
          </p>
          <p className={`text-sm mt-1 ${isBambiMode ? 'text-green-600' : 'text-green-400/70'}`}>
            Day {status.currentStreak} - Keep going strong!
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================
// SUB-COMPONENTS
// ============================================

function CompactView({
  status,
  warnings,
  isBambiMode,
  onDismiss,
}: {
  status: StreakStatus;
  warnings: StreakWarning[];
  isBambiMode: boolean;
  onDismiss: (warning: StreakWarning) => void;
}) {
  if (warnings.length === 0 && status.safetyScore >= 70) {
    return null; // Don't show anything if all clear in compact mode
  }

  const highestLevel = warnings.reduce<WarningLevel>((highest, w) => {
    const order: WarningLevel[] = ['info', 'caution', 'warning', 'critical'];
    return order.indexOf(w.level) > order.indexOf(highest) ? w.level : highest;
  }, 'info');

  const bgColor = getWarningColor(highestLevel, isBambiMode);

  return (
    <div className={`p-3 rounded-xl ${bgColor}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <WarningIcon level={highestLevel} />
          <div>
            <p className={`text-sm font-medium ${isBambiMode ? 'text-gray-800' : 'text-protocol-text'}`}>
              {warnings.length > 0
                ? `${warnings.length} active alert${warnings.length > 1 ? 's' : ''}`
                : 'Moderate Risk'}
            </p>
            <p className={`text-xs ${isBambiMode ? 'text-gray-600' : 'text-protocol-text-muted'}`}>
              Day {status.currentStreak} | Safety: {status.safetyScore}%
            </p>
          </div>
        </div>
        {warnings.length === 1 && (
          <button
            onClick={() => onDismiss(warnings[0])}
            className="p-1 rounded hover:bg-black/10"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function SafetyScoreCard({
  status,
  isBambiMode,
}: {
  status: StreakStatus;
  isBambiMode: boolean;
}) {
  const getScoreColor = () => {
    if (status.safetyScore >= 80) return isBambiMode ? 'text-green-500' : 'text-green-400';
    if (status.safetyScore >= 60) return isBambiMode ? 'text-yellow-500' : 'text-yellow-400';
    if (status.safetyScore >= 40) return isBambiMode ? 'text-orange-500' : 'text-orange-400';
    return isBambiMode ? 'text-red-500' : 'text-red-400';
  };

  const getScoreBg = () => {
    if (status.safetyScore >= 80) return isBambiMode ? 'bg-green-500' : 'bg-green-400';
    if (status.safetyScore >= 60) return isBambiMode ? 'bg-yellow-500' : 'bg-yellow-400';
    if (status.safetyScore >= 40) return isBambiMode ? 'bg-orange-500' : 'bg-orange-400';
    return isBambiMode ? 'bg-red-500' : 'bg-red-400';
  };

  return (
    <div className={`p-4 rounded-xl ${isBambiMode ? 'bg-pink-50 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className={`text-xs uppercase tracking-wider font-semibold ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
            Streak Safety
          </p>
          <p className={`text-2xl font-bold ${getScoreColor()}`}>
            {status.safetyScore}%
          </p>
        </div>
        <div className="text-right">
          <p className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
            Current Streak
          </p>
          <p className={`text-xl font-bold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
            Day {status.currentStreak}
          </p>
        </div>
      </div>

      {/* Safety bar */}
      <div className="h-2 bg-protocol-surface-light rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${getScoreBg()}`}
          style={{ width: `${status.safetyScore}%` }}
        />
      </div>

      {/* Risk indicator */}
      <div className="flex items-center justify-between mt-3">
        <span className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
          Risk Level
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${getWarningColor(status.riskLevel, isBambiMode)}`}>
          {status.riskLevel}
        </span>
      </div>
    </div>
  );
}

function WarningCard({
  warning,
  isBambiMode,
  onDismiss,
  onAcknowledge,
}: {
  warning: StreakWarning;
  isBambiMode: boolean;
  onDismiss: () => void;
  onAcknowledge: () => void;
}) {
  const bgColor = getWarningColor(warning.level, isBambiMode);

  return (
    <div className={`p-4 rounded-xl ${bgColor}`}>
      <div className="flex items-start gap-3">
        <WarningIcon level={warning.level} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <p className={`font-medium text-sm ${isBambiMode ? 'text-gray-800' : 'text-protocol-text'}`}>
              {warning.title}
            </p>
            <button
              onClick={onDismiss}
              className="p-1 rounded hover:bg-black/10 -mr-1 -mt-1"
            >
              <X className="w-4 h-4 opacity-60" />
            </button>
          </div>
          <p className={`text-xs mt-1 ${isBambiMode ? 'text-gray-600' : 'text-protocol-text-muted'}`}>
            {warning.message}
          </p>
          {warning.details && (
            <p className={`text-xs mt-1 opacity-70 ${isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'}`}>
              {warning.details}
            </p>
          )}
          {warning.actionSuggestion && (
            <button
              onClick={onAcknowledge}
              className={`mt-3 text-xs font-medium flex items-center gap-1 ${
                isBambiMode ? 'text-pink-600 hover:text-pink-700' : 'text-protocol-accent hover:underline'
              }`}
            >
              <ChevronRight className="w-3 h-3" />
              {warning.actionSuggestion}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function WarningIcon({ level }: { level: WarningLevel }) {
  switch (level) {
    case 'critical':
      return <AlertOctagon className="w-5 h-5 text-red-500 shrink-0" />;
    case 'warning':
      return <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0" />;
    case 'caution':
      return <AlertCircle className="w-5 h-5 text-yellow-500 shrink-0" />;
    case 'info':
    default:
      return <Info className="w-5 h-5 text-blue-500 shrink-0" />;
  }
}

// ============================================
// EXPORTS
// ============================================

export default StreakWarningsWidget;
