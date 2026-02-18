/**
 * Next Best Action Widget
 *
 * An intelligent recommendation widget that uses the server-side
 * context engine to suggest the most impactful action based on:
 * - Time of day
 * - Denial day / arousal level
 * - Streak status
 * - Overdue commitments
 * - Recent activity patterns
 */

import { useState, useEffect } from 'react';
import {
  Flame, CheckSquare, Sun, AlertTriangle, Shield,
  Anchor, Mic, BookOpen, Moon, Star, ArrowRight,
  Sparkles, Clock, Loader2, RefreshCw, ChevronRight
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import {
  getNextBestAction,
  getTopActions,
  getActionRoute,
  type NextAction,
  type ActionType
} from '../../lib/next-best-action';

interface NextBestActionWidgetProps {
  onNavigate?: (route: string) => void;
  compact?: boolean;
  showAlternatives?: boolean;
}

function getIcon(type: ActionType) {
  const icons: Record<ActionType, typeof Flame> = {
    start_session: Flame,
    complete_task: CheckSquare,
    morning_ritual: Sun,
    reminder_check: Clock,
    commitment_followup: AlertTriangle,
    streak_maintenance: Shield,
    anchor_practice: Anchor,
    voice_practice: Mic,
    reflection: BookOpen,
    rest: Moon,
  };
  const Icon = icons[type] || Star;
  return Icon;
}

function getUrgencyStyles(urgency: NextAction['urgency'], isBambiMode: boolean) {
  if (isBambiMode) {
    switch (urgency) {
      case 'critical':
        return 'bg-red-100 border-red-300 text-red-700';
      case 'high':
        return 'bg-orange-100 border-orange-300 text-orange-700';
      case 'medium':
        return 'bg-yellow-100 border-yellow-300 text-yellow-700';
      case 'low':
        return 'bg-green-100 border-green-300 text-green-700';
    }
  }
  switch (urgency) {
    case 'critical':
      return 'bg-red-900/30 border-red-600/50 text-red-400';
    case 'high':
      return 'bg-orange-900/30 border-orange-600/50 text-orange-400';
    case 'medium':
      return 'bg-yellow-900/30 border-yellow-600/50 text-yellow-400';
    case 'low':
      return 'bg-green-900/30 border-green-600/50 text-green-400';
  }
}

function getUrgencyLabel(urgency: NextAction['urgency']) {
  switch (urgency) {
    case 'critical': return 'Do Now';
    case 'high': return 'Important';
    case 'medium': return 'Suggested';
    case 'low': return 'Optional';
  }
}

export function NextBestActionWidget({
  onNavigate,
  compact = false,
  showAlternatives = true
}: NextBestActionWidgetProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();
  const [primaryAction, setPrimaryAction] = useState<NextAction | null>(null);
  const [alternativeActions, setAlternativeActions] = useState<NextAction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAlternativeList, setShowAlternativeList] = useState(false);

  const loadRecommendations = async () => {
    if (!user?.id) return;

    setIsLoading(true);
    setError(null);

    try {
      if (showAlternatives) {
        const actions = await getTopActions(user.id, 3);
        if (actions.length > 0) {
          setPrimaryAction(actions[0]);
          setAlternativeActions(actions.slice(1));
        }
      } else {
        const action = await getNextBestAction(user.id);
        setPrimaryAction(action);
      }
    } catch (err) {
      console.error('Failed to load recommendations:', err);
      setError('Could not load recommendations');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRecommendations();
  }, [user?.id]);

  const handleActionClick = (action: NextAction) => {
    const route = getActionRoute(action);
    if (onNavigate) {
      onNavigate(route);
    }
  };

  if (isLoading) {
    return (
      <div className={`mx-4 p-4 rounded-xl flex items-center justify-center gap-2 ${
        isBambiMode
          ? 'bg-pink-50 text-pink-500'
          : 'bg-protocol-surface text-protocol-text-muted'
      }`}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Finding your next best action...</span>
      </div>
    );
  }

  if (error || !primaryAction) {
    return (
      <div className={`mx-4 p-4 rounded-xl ${
        isBambiMode
          ? 'bg-pink-50 text-pink-600'
          : 'bg-protocol-surface text-protocol-text-muted'
      }`}>
        <div className="flex items-center justify-between">
          <span className="text-sm">{error || 'No recommendations available'}</span>
          <button
            onClick={loadRecommendations}
            className={`p-2 rounded-lg transition-colors ${
              isBambiMode
                ? 'hover:bg-pink-100'
                : 'hover:bg-protocol-border'
            }`}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  const Icon = getIcon(primaryAction.type);

  // Compact mode - minimal display
  if (compact) {
    return (
      <button
        onClick={() => handleActionClick(primaryAction)}
        className={`mx-4 p-3 rounded-xl flex items-center gap-3 transition-all active:scale-[0.98] ${
          isBambiMode
            ? 'bg-gradient-to-r from-pink-100 to-pink-50 border border-pink-200 hover:border-pink-300'
            : 'bg-gradient-to-r from-protocol-accent/20 to-protocol-surface border border-protocol-accent/30 hover:border-protocol-accent/50'
        }`}
      >
        <div className={`p-2 rounded-lg ${
          isBambiMode ? 'bg-pink-200 text-pink-600' : 'bg-protocol-accent/20 text-protocol-accent'
        }`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 text-left">
          <p className={`text-sm font-medium ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}>
            {primaryAction.title}
          </p>
          <p className={`text-xs ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
          }`}>
            {primaryAction.reasoning}
          </p>
        </div>
        <ChevronRight className={`w-4 h-4 ${
          isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
        }`} />
      </button>
    );
  }

  // Full mode - detailed recommendation
  return (
    <div className="mx-4 space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Sparkles className={`w-4 h-4 ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
          }`} />
          <span className={`text-xs uppercase tracking-wider font-semibold ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
          }`}>
            Recommended For You
          </span>
        </div>
        <button
          onClick={loadRecommendations}
          className={`p-1.5 rounded-lg transition-colors ${
            isBambiMode
              ? 'hover:bg-pink-100 text-pink-400'
              : 'hover:bg-protocol-surface text-protocol-text-muted'
          }`}
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Primary action card */}
      <div className={`p-4 rounded-xl border-2 ${
        isBambiMode
          ? 'bg-gradient-to-br from-pink-100 to-pink-50 border-pink-300'
          : 'bg-gradient-to-br from-protocol-accent/20 to-protocol-surface border-protocol-accent/50'
      }`}>
        {/* Urgency badge */}
        <div className="flex items-center gap-2 mb-3">
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
            getUrgencyStyles(primaryAction.urgency, isBambiMode)
          }`}>
            {getUrgencyLabel(primaryAction.urgency)}
          </span>
          {primaryAction.estimatedMinutes > 0 && (
            <span className={`text-xs ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}>
              <Clock className="w-3 h-3 inline mr-1" />
              {primaryAction.estimatedMinutes} min
            </span>
          )}
          {primaryAction.domain && (
            <span className={`text-xs px-2 py-0.5 rounded ${
              isBambiMode ? 'bg-pink-200/50 text-pink-600' : 'bg-protocol-surface text-protocol-text-muted'
            }`}>
              {primaryAction.domain}
            </span>
          )}
        </div>

        {/* Title and description */}
        <div className="flex items-start gap-3 mb-3">
          <div className={`p-2.5 rounded-xl ${
            isBambiMode ? 'bg-pink-200 text-pink-600' : 'bg-protocol-accent/20 text-protocol-accent'
          }`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`font-bold text-lg ${
              isBambiMode ? 'text-pink-800' : 'text-protocol-text'
            }`}>
              {primaryAction.title}
            </h3>
            <p className={`text-sm mt-0.5 ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
            }`}>
              {primaryAction.description}
            </p>
          </div>
        </div>

        {/* Reasoning */}
        <p className={`text-xs mb-4 italic ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
        }`}>
          "{primaryAction.reasoning}"
        </p>

        {/* Action button */}
        <button
          onClick={() => handleActionClick(primaryAction)}
          className={`w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
            primaryAction.urgency === 'critical' || primaryAction.urgency === 'high'
              ? isBambiMode
                ? 'bg-pink-500 hover:bg-pink-600 text-white shadow-lg shadow-pink-200'
                : 'bg-protocol-accent hover:bg-protocol-accent-bright text-white'
              : isBambiMode
                ? 'bg-pink-400 hover:bg-pink-500 text-white'
                : 'bg-protocol-accent/80 hover:bg-protocol-accent text-white'
          }`}
        >
          <span>Let's Go</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Alternative actions */}
      {showAlternatives && alternativeActions.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setShowAlternativeList(!showAlternativeList)}
            className={`w-full py-2 text-xs font-medium flex items-center justify-center gap-1 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}
          >
            <span>{showAlternativeList ? 'Hide' : 'Show'} {alternativeActions.length} other suggestions</span>
            <ChevronRight className={`w-3 h-3 transition-transform ${
              showAlternativeList ? 'rotate-90' : ''
            }`} />
          </button>

          {showAlternativeList && (
            <div className="space-y-2">
              {alternativeActions.map((action, index) => {
                const AltIcon = getIcon(action.type);
                return (
                  <button
                    key={`alt-${index}`}
                    onClick={() => handleActionClick(action)}
                    className={`w-full p-3 rounded-xl flex items-center gap-3 transition-all text-left ${
                      isBambiMode
                        ? 'bg-pink-50 hover:bg-pink-100 border border-pink-200'
                        : 'bg-protocol-surface hover:bg-protocol-border/50 border border-protocol-border'
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${
                      isBambiMode ? 'bg-pink-100 text-pink-500' : 'bg-protocol-bg text-protocol-text-muted'
                    }`}>
                      <AltIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${
                        isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                      }`}>
                        {action.title}
                      </p>
                      <p className={`text-xs truncate ${
                        isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                      }`}>
                        {action.description}
                      </p>
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${
                      getUrgencyStyles(action.urgency, isBambiMode)
                    }`}>
                      {action.estimatedMinutes}m
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
