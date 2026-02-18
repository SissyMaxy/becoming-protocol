/**
 * Trigger Audit Dashboard
 *
 * Visualizes system trigger analytics and effectiveness metrics.
 */

import { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, Clock, Zap, Target, AlertTriangle,
  ChevronDown, ChevronUp, Loader2, RefreshCw, BarChart3, PieChart, Timer, Sparkles
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import {
  getTriggerAnalytics,
  type TriggerAnalytics,
  type EventBreakdown,
  type TargetBreakdown,
} from '../../lib/trigger-audit';
import type { SystemEvent, SystemTarget } from '../../lib/system-triggers';

interface TriggerAuditDashboardProps {
  compact?: boolean;
  onBack?: () => void;
}

const EVENT_LABELS: Partial<Record<SystemEvent, string>> = {
  task_completed: 'Task Complete',
  task_skipped: 'Task Skipped',
  all_tasks_completed: 'All Tasks Done',
  edge_reached: 'Edge Reached',
  edge_session_completed: 'Session Complete',
  denial_day_incremented: 'Denial Day+',
  hypno_completed: 'Hypno Complete',
  affirmation_spoken: 'Affirmation',
  commitment_made: 'Commitment Made',
  commitment_fulfilled: 'Commitment Done',
  guy_mode_entered: 'Guy Mode Start',
  guy_mode_exited: 'Guy Mode End',
  escalation_triggered: 'Escalation',
};

const TARGET_LABELS: Record<SystemTarget, string> = {
  haptic: 'Haptic',
  points: 'Points',
  hypno: 'Hypno',
  evidence: 'Evidence',
  identity: 'Identity',
  task: 'Task',
  conditioning: 'Conditioning',
  affirmation: 'Affirmation',
  notification: 'Notification',
  trigger: 'Trigger',
  content: 'Content',
};

export function TriggerAuditDashboard({ compact = false, onBack }: TriggerAuditDashboardProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<TriggerAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const loadAnalytics = async () => {
    if (!user?.id) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await getTriggerAnalytics(user.id);
      setAnalytics(data);
    } catch (err) {
      console.error('Failed to load trigger analytics:', err);
      setError('Could not load analytics');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [user?.id]);

  if (isLoading) {
    return (
      <div className={`p-6 rounded-xl flex items-center justify-center gap-2 ${
        isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
      }`}>
        <Loader2 className={`w-5 h-5 animate-spin ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
        }`} />
        <span className={isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}>
          Loading trigger data...
        </span>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className={`p-6 rounded-xl text-center ${
        isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
      }`}>
        <p className={isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}>
          {error || 'No trigger data available'}
        </p>
        <button
          onClick={loadAnalytics}
          className={`mt-3 px-4 py-2 rounded-lg text-sm font-medium ${
            isBambiMode
              ? 'bg-pink-200 text-pink-700 hover:bg-pink-300'
              : 'bg-protocol-accent/20 text-protocol-accent hover:bg-protocol-accent/30'
          }`}
        >
          <RefreshCw className="w-4 h-4 inline mr-1" />
          Retry
        </button>
      </div>
    );
  }

  const { overview, eventBreakdown, targetBreakdown, timePatterns, effectiveness, correlations, recommendations } = analytics;

  // Compact mode
  if (compact) {
    return (
      <div className={`p-4 rounded-xl ${
        isBambiMode ? 'bg-pink-50 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
      }`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className={`w-4 h-4 ${isBambiMode ? 'text-pink-500' : 'text-protocol-accent'}`} />
            <span className={`text-sm font-semibold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
              System Triggers
            </span>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded ${
            overview.successRate >= 90
              ? isBambiMode ? 'bg-green-100 text-green-700' : 'bg-green-900/30 text-green-400'
              : isBambiMode ? 'bg-yellow-100 text-yellow-700' : 'bg-yellow-900/30 text-yellow-400'
          }`}>
            {overview.successRate}% success
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className={`text-lg font-bold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
              {overview.totalExecutions}
            </p>
            <p className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
              Total
            </p>
          </div>
          <div className="text-center">
            <p className={`text-lg font-bold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
              {overview.executionsToday}
            </p>
            <p className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
              Today
            </p>
          </div>
          <div className="text-center">
            <p className={`text-lg font-bold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
              {overview.uniqueEvents}
            </p>
            <p className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
              Types
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Full dashboard
  return (
    <div className="space-y-4">
      {/* Back button */}
      {onBack && (
        <button
          onClick={onBack}
          className={`mb-2 text-sm ${isBambiMode ? 'text-pink-500 hover:text-pink-700' : 'text-protocol-text-muted hover:text-protocol-text'} transition-colors`}
        >
          &larr; Back to Menu
        </button>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className={`w-5 h-5 ${isBambiMode ? 'text-pink-500' : 'text-protocol-accent'}`} />
          <h2 className={`text-lg font-bold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
            Trigger Audit Trail
          </h2>
        </div>
        <button
          onClick={loadAnalytics}
          className={`p-2 rounded-lg transition-colors ${
            isBambiMode ? 'hover:bg-pink-100 text-pink-500' : 'hover:bg-protocol-surface text-protocol-text-muted'
          }`}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Overview Card */}
      <div className={`p-5 rounded-xl ${
        isBambiMode
          ? 'bg-gradient-to-br from-pink-100 to-pink-50 border border-pink-200'
          : 'bg-gradient-to-br from-protocol-accent/20 to-protocol-surface border border-protocol-accent/30'
      }`}>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className={`text-xs uppercase tracking-wider font-semibold mb-1 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
            }`}>
              Total Executions
            </p>
            <p className={`text-3xl font-bold ${isBambiMode ? 'text-pink-800' : 'text-protocol-text'}`}>
              {overview.totalExecutions.toLocaleString()}
            </p>
          </div>
          <div className="text-right">
            <p className={`text-xs uppercase tracking-wider font-semibold mb-1 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
            }`}>
              Success Rate
            </p>
            <p className={`text-3xl font-bold ${
              overview.successRate >= 90
                ? isBambiMode ? 'text-green-600' : 'text-green-400'
                : overview.successRate >= 70
                  ? isBambiMode ? 'text-yellow-600' : 'text-yellow-400'
                  : isBambiMode ? 'text-red-600' : 'text-red-400'
            }`}>
              {overview.successRate}%
            </p>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-4 gap-2">
          <StatBox
            label="Today"
            value={overview.executionsToday}
            isBambiMode={isBambiMode}
          />
          <StatBox
            label="This Week"
            value={overview.executionsThisWeek}
            isBambiMode={isBambiMode}
          />
          <StatBox
            label="Event Types"
            value={overview.uniqueEvents}
            isBambiMode={isBambiMode}
          />
          <StatBox
            label={`Peak: ${overview.mostActiveHour}:00`}
            value={<Clock className="w-4 h-4" />}
            isBambiMode={isBambiMode}
          />
        </div>
      </div>

      {/* Effectiveness Metrics */}
      <div className={`p-4 rounded-xl ${
        isBambiMode ? 'bg-pink-50 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
      }`}>
        <div className="flex items-center gap-2 mb-4">
          <Target className={`w-4 h-4 ${isBambiMode ? 'text-pink-500' : 'text-protocol-accent'}`} />
          <span className={`text-sm font-semibold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
            Effectiveness Metrics
          </span>
        </div>

        <div className="space-y-3">
          <EffectivenessBar
            label="Task Correlation"
            value={effectiveness.taskCompletionCorrelation}
            isBambiMode={isBambiMode}
          />
          <EffectivenessBar
            label="Session Follow-Through"
            value={effectiveness.sessionFollowThrough}
            isBambiMode={isBambiMode}
          />
          <EffectivenessBar
            label="Arousal Engagement"
            value={effectiveness.arousalEngagement}
            isBambiMode={isBambiMode}
          />
          <EffectivenessBar
            label="Conditioning Score"
            value={effectiveness.conditioningReinforcement}
            isBambiMode={isBambiMode}
          />
        </div>
      </div>

      {/* Correlations */}
      {correlations.length > 0 && (
        <div className={`p-4 rounded-xl ${
          isBambiMode ? 'bg-green-50 border border-green-200' : 'bg-green-900/20 border border-green-600/30'
        }`}>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className={`w-4 h-4 ${isBambiMode ? 'text-green-600' : 'text-green-400'}`} />
            <span className={`text-sm font-semibold ${isBambiMode ? 'text-green-700' : 'text-green-400'}`}>
              Discovered Patterns
            </span>
          </div>
          <div className="space-y-2">
            {correlations.slice(0, 3).map((corr, i) => (
              <div key={i} className={`p-3 rounded-lg ${
                isBambiMode ? 'bg-white/70' : 'bg-protocol-bg'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  {corr.direction === 'positive' ? (
                    <TrendingUp className="w-3 h-3 text-green-500" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-red-500" />
                  )}
                  <span className={`text-xs font-medium ${
                    isBambiMode ? 'text-green-700' : 'text-protocol-text'
                  }`}>
                    {EVENT_LABELS[corr.event] || corr.event} → {corr.correlatedOutcome}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    corr.strength === 'strong'
                      ? 'bg-green-200 text-green-700'
                      : corr.strength === 'moderate'
                        ? 'bg-yellow-200 text-yellow-700'
                        : 'bg-gray-200 text-gray-700'
                  }`}>
                    {corr.strength}
                  </span>
                </div>
                <p className={`text-xs ${isBambiMode ? 'text-green-600' : 'text-protocol-text-muted'}`}>
                  {corr.insight}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Event Breakdown */}
      <CollapsibleSection
        title="Event Breakdown"
        icon={<BarChart3 className="w-4 h-4" />}
        isExpanded={expandedSection === 'events'}
        onToggle={() => setExpandedSection(expandedSection === 'events' ? null : 'events')}
        isBambiMode={isBambiMode}
      >
        <div className="space-y-2">
          {eventBreakdown.slice(0, 8).map((event, i) => (
            <EventRow key={i} event={event} isBambiMode={isBambiMode} />
          ))}
          {eventBreakdown.length === 0 && (
            <p className={`text-sm text-center py-4 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}>
              No events recorded yet
            </p>
          )}
        </div>
      </CollapsibleSection>

      {/* Target Breakdown */}
      <CollapsibleSection
        title="Target Systems"
        icon={<PieChart className="w-4 h-4" />}
        isExpanded={expandedSection === 'targets'}
        onToggle={() => setExpandedSection(expandedSection === 'targets' ? null : 'targets')}
        isBambiMode={isBambiMode}
      >
        <div className="space-y-2">
          {targetBreakdown.slice(0, 8).map((target, i) => (
            <TargetRow key={i} target={target} isBambiMode={isBambiMode} />
          ))}
          {targetBreakdown.length === 0 && (
            <p className={`text-sm text-center py-4 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}>
              No target data yet
            </p>
          )}
        </div>
      </CollapsibleSection>

      {/* Time Patterns */}
      <CollapsibleSection
        title="Activity Patterns"
        icon={<Timer className="w-4 h-4" />}
        isExpanded={expandedSection === 'time'}
        onToggle={() => setExpandedSection(expandedSection === 'time' ? null : 'time')}
        isBambiMode={isBambiMode}
      >
        <div className="space-y-4">
          {/* Hourly heatmap */}
          <div>
            <p className={`text-xs font-semibold mb-2 ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
            }`}>
              Hourly Activity
            </p>
            <div className="flex gap-0.5">
              {timePatterns.hourlyDistribution.map((count, hour) => {
                const max = Math.max(...timePatterns.hourlyDistribution);
                const intensity = max > 0 ? count / max : 0;
                return (
                  <div
                    key={hour}
                    className={`flex-1 h-8 rounded-sm ${
                      isBambiMode
                        ? intensity > 0.7 ? 'bg-pink-500' : intensity > 0.3 ? 'bg-pink-300' : 'bg-pink-100'
                        : intensity > 0.7 ? 'bg-protocol-accent' : intensity > 0.3 ? 'bg-protocol-accent/50' : 'bg-protocol-bg'
                    }`}
                    title={`${hour}:00 - ${count} triggers`}
                  />
                );
              })}
            </div>
            <div className="flex justify-between mt-1">
              <span className={`text-xs ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`}>12am</span>
              <span className={`text-xs ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`}>12pm</span>
              <span className={`text-xs ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`}>11pm</span>
            </div>
          </div>

          {/* Peak hours */}
          {timePatterns.peakHours.length > 0 && (
            <div className={`p-3 rounded-lg ${
              isBambiMode ? 'bg-pink-100' : 'bg-protocol-bg'
            }`}>
              <p className={`text-xs font-semibold mb-1 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
              }`}>
                Peak Activity Hours
              </p>
              <p className={`text-sm ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
                {timePatterns.peakHours.map(h => `${h}:00`).join(', ')}
              </p>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className={`p-4 rounded-xl ${
          isBambiMode ? 'bg-yellow-50 border border-yellow-200' : 'bg-yellow-900/20 border border-yellow-600/30'
        }`}>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className={`w-4 h-4 ${
              isBambiMode ? 'text-yellow-600' : 'text-yellow-400'
            }`} />
            <span className={`text-sm font-semibold ${
              isBambiMode ? 'text-yellow-700' : 'text-yellow-400'
            }`}>
              Optimization Suggestions
            </span>
          </div>
          <div className="space-y-2">
            {recommendations.slice(0, 3).map((rec, i) => (
              <div key={i} className={`p-3 rounded-lg ${
                isBambiMode ? 'bg-white/70' : 'bg-protocol-bg'
              }`}>
                <p className={`text-sm font-medium ${
                  isBambiMode ? 'text-yellow-800' : 'text-protocol-text'
                }`}>
                  {rec.title}
                </p>
                <p className={`text-xs mt-1 ${
                  isBambiMode ? 'text-yellow-600' : 'text-protocol-text-muted'
                }`}>
                  {rec.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// HELPER COMPONENTS
// ============================================

function StatBox({
  label,
  value,
  isBambiMode
}: {
  label: string;
  value: React.ReactNode;
  isBambiMode: boolean;
}) {
  return (
    <div className={`p-2 rounded-lg text-center ${
      isBambiMode ? 'bg-pink-100' : 'bg-protocol-bg'
    }`}>
      <p className={`text-lg font-bold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
        {value}
      </p>
      <p className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
        {label}
      </p>
    </div>
  );
}

function EffectivenessBar({
  label,
  value,
  isBambiMode
}: {
  label: string;
  value: number;
  isBambiMode: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs ${isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}`}>
          {label}
        </span>
        <span className={`text-xs font-medium ${
          value >= 70
            ? isBambiMode ? 'text-green-600' : 'text-green-400'
            : value >= 50
              ? isBambiMode ? 'text-yellow-600' : 'text-yellow-400'
              : isBambiMode ? 'text-red-600' : 'text-red-400'
        }`}>
          {value}%
        </span>
      </div>
      <div className={`h-2 rounded-full ${isBambiMode ? 'bg-pink-200' : 'bg-protocol-bg'}`}>
        <div
          className={`h-full rounded-full transition-all ${
            value >= 70
              ? isBambiMode ? 'bg-green-500' : 'bg-green-400'
              : value >= 50
                ? isBambiMode ? 'bg-yellow-500' : 'bg-yellow-400'
                : isBambiMode ? 'bg-red-500' : 'bg-red-400'
          }`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function EventRow({ event, isBambiMode }: { event: EventBreakdown; isBambiMode: boolean }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex-1">
        <p className={`text-sm font-medium ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
          {EVENT_LABELS[event.event] || event.event}
        </p>
        <p className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
          {event.averageActionsPerTrigger} actions/trigger
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-sm font-bold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
          {event.count}
        </span>
        <span className={`text-xs px-1.5 py-0.5 rounded ${
          event.successRate >= 90
            ? isBambiMode ? 'bg-green-100 text-green-700' : 'bg-green-900/30 text-green-400'
            : isBambiMode ? 'bg-yellow-100 text-yellow-700' : 'bg-yellow-900/30 text-yellow-400'
        }`}>
          {event.successRate}%
        </span>
      </div>
    </div>
  );
}

function TargetRow({ target, isBambiMode }: { target: TargetBreakdown; isBambiMode: boolean }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex-1">
        <p className={`text-sm font-medium ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
          {TARGET_LABELS[target.target] || target.target}
        </p>
        <p className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
          {target.topActions.join(', ')}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-sm font-bold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
          {target.totalActions}
        </span>
        {target.failureCount > 0 && (
          <span className={`text-xs px-1.5 py-0.5 rounded ${
            isBambiMode ? 'bg-red-100 text-red-700' : 'bg-red-900/30 text-red-400'
          }`}>
            {target.failureCount} failed
          </span>
        )}
      </div>
    </div>
  );
}

function CollapsibleSection({
  title,
  icon,
  isExpanded,
  onToggle,
  children,
  isBambiMode
}: {
  title: string;
  icon: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  isBambiMode: boolean;
}) {
  return (
    <div className={`rounded-xl overflow-hidden ${
      isBambiMode ? 'bg-pink-50 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
    }`}>
      <button
        onClick={onToggle}
        className={`w-full p-4 flex items-center justify-between transition-colors ${
          isBambiMode ? 'hover:bg-pink-100' : 'hover:bg-protocol-border/30'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className={isBambiMode ? 'text-pink-500' : 'text-protocol-accent'}>
            {icon}
          </span>
          <span className={`text-sm font-semibold ${
            isBambiMode ? 'text-pink-700' : 'text-protocol-text'
          }`}>
            {title}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className={`w-4 h-4 ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`} />
        ) : (
          <ChevronDown className={`w-4 h-4 ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`} />
        )}
      </button>
      {isExpanded && (
        <div className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}
