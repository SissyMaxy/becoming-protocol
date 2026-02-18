/**
 * Service Analytics Dashboard
 *
 * Comprehensive visualization of service progression and encounter patterns.
 */

import { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, Minus, Crown, Heart, Users, Calendar,
  Activity, Target, Star, AlertTriangle, ChevronDown, ChevronUp,
  Loader2, RefreshCw, Sparkles, BarChart3, PieChart, Clock
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import {
  getServiceAnalytics,
  type ServiceAnalytics,
} from '../../lib/service-analytics';
import {
  SERVICE_STAGE_LABELS,
  ENCOUNTER_TYPE_LABELS,
  ENCOUNTER_TYPE_COLORS,
  type EncounterType,
} from '../../types/escalation';

interface ServiceAnalyticsDashboardProps {
  compact?: boolean;
  onBack?: () => void;
}

export function ServiceAnalyticsDashboard({ compact = false, onBack }: ServiceAnalyticsDashboardProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<ServiceAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const loadAnalytics = async () => {
    if (!user?.id) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await getServiceAnalytics(user.id);
      setAnalytics(data);
    } catch (err) {
      console.error('Failed to load service analytics:', err);
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
          Loading analytics...
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
          {error || 'No analytics available'}
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

  const { overview, stageProgress, encounterAnalysis, comfortGrowth, trends, recommendations } = analytics;

  // Compact mode - just key metrics
  if (compact) {
    return (
      <div className={`p-4 rounded-xl ${
        isBambiMode ? 'bg-pink-50 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
      }`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Crown className={`w-4 h-4 ${isBambiMode ? 'text-pink-500' : 'text-protocol-accent'}`} />
            <span className={`text-sm font-semibold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
              Service Progress
            </span>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded ${
            isBambiMode ? 'bg-pink-200 text-pink-700' : 'bg-protocol-accent/20 text-protocol-accent'
          }`}>
            Stage {overview.stageNumber}/7
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className={`text-lg font-bold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
              {overview.totalEncounters}
            </p>
            <p className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
              Encounters
            </p>
          </div>
          <div className="text-center">
            <p className={`text-lg font-bold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
              {overview.currentComfortLevel}
            </p>
            <p className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
              Comfort
            </p>
          </div>
          <div className="text-center">
            <p className={`text-lg font-bold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
              {Math.round(encounterAnalysis.ginaInvolvement.percentage)}%
            </p>
            <p className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
              Gina Aware
            </p>
          </div>
        </div>

        {stageProgress.currentStageReadiness.isReady && (
          <div className={`mt-3 p-2 rounded-lg text-xs text-center ${
            isBambiMode ? 'bg-green-100 text-green-700' : 'bg-green-900/30 text-green-400'
          }`}>
            Ready to advance!
          </div>
        )}
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

      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className={`w-5 h-5 ${isBambiMode ? 'text-pink-500' : 'text-protocol-accent'}`} />
          <h2 className={`text-lg font-bold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
            Service Analytics
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

      {/* Stage Overview Card */}
      <div className={`p-5 rounded-xl ${
        isBambiMode
          ? 'bg-gradient-to-br from-pink-100 to-pink-50 border border-pink-200'
          : 'bg-gradient-to-br from-protocol-accent/20 to-protocol-surface border border-protocol-accent/30'
      }`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className={`text-xs uppercase tracking-wider font-semibold mb-1 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
            }`}>
              Current Stage
            </p>
            <h3 className={`text-xl font-bold ${isBambiMode ? 'text-pink-800' : 'text-protocol-text'}`}>
              {SERVICE_STAGE_LABELS[overview.currentStage]}
            </h3>
            <p className={`text-sm mt-1 ${isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}`}>
              {overview.daysSinceStageAdvance} days in this stage
            </p>
          </div>
          <div className={`text-right`}>
            <div className={`text-3xl font-bold ${isBambiMode ? 'text-pink-700' : 'text-protocol-accent'}`}>
              {overview.stageNumber}<span className="text-lg opacity-50">/7</span>
            </div>
            <div className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
              {stageProgress.progressPercentage}% complete
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className={`h-2 rounded-full overflow-hidden ${
          isBambiMode ? 'bg-pink-200' : 'bg-protocol-bg'
        }`}>
          <div
            className={`h-full rounded-full transition-all ${
              isBambiMode ? 'bg-pink-500' : 'bg-protocol-accent'
            }`}
            style={{ width: `${stageProgress.progressPercentage}%` }}
          />
        </div>

        {/* Stage readiness */}
        <div className={`mt-4 p-3 rounded-lg ${
          stageProgress.currentStageReadiness.isReady
            ? isBambiMode ? 'bg-green-100' : 'bg-green-900/30'
            : isBambiMode ? 'bg-pink-100' : 'bg-protocol-bg'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            {stageProgress.currentStageReadiness.isReady ? (
              <Star className={`w-4 h-4 ${isBambiMode ? 'text-green-600' : 'text-green-400'}`} />
            ) : (
              <Target className={`w-4 h-4 ${isBambiMode ? 'text-pink-500' : 'text-protocol-accent'}`} />
            )}
            <span className={`text-sm font-semibold ${
              stageProgress.currentStageReadiness.isReady
                ? isBambiMode ? 'text-green-700' : 'text-green-400'
                : isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}>
              {stageProgress.currentStageReadiness.isReady ? 'Ready to Advance!' : 'Progress Needed'}
            </span>
          </div>
          <p className={`text-xs ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
          }`}>
            {stageProgress.currentStageReadiness.recommendation}
          </p>

          {/* Readiness metrics */}
          <div className="grid grid-cols-3 gap-2 mt-3">
            <ReadinessMetric
              label="Comfort"
              current={stageProgress.currentStageReadiness.currentComfort}
              target={stageProgress.currentStageReadiness.comfortThreshold}
              isBambiMode={isBambiMode}
            />
            <ReadinessMetric
              label="Arousal"
              current={stageProgress.currentStageReadiness.currentArousal}
              target={stageProgress.currentStageReadiness.arousalThreshold}
              isBambiMode={isBambiMode}
            />
            <ReadinessMetric
              label="Activities"
              current={stageProgress.currentStageReadiness.currentActivities}
              target={stageProgress.currentStageReadiness.minimumActivities}
              isBambiMode={isBambiMode}
            />
          </div>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          icon={<Users className="w-4 h-4" />}
          label="Total Encounters"
          value={overview.totalEncounters}
          trend={trends.encounterFrequency}
          isBambiMode={isBambiMode}
        />
        <MetricCard
          icon={<Heart className="w-4 h-4" />}
          label="Gina Involved"
          value={`${Math.round(encounterAnalysis.ginaInvolvement.percentage)}%`}
          trend={trends.ginaInvolvementTrend}
          isBambiMode={isBambiMode}
        />
        <MetricCard
          icon={<Activity className="w-4 h-4" />}
          label="Avg Arousal"
          value={encounterAnalysis.averageArousalLevel.toFixed(1)}
          isBambiMode={isBambiMode}
        />
        <MetricCard
          icon={<Calendar className="w-4 h-4" />}
          label="Monthly Avg"
          value={trends.monthlyEncounterAverage.toFixed(1)}
          isBambiMode={isBambiMode}
        />
      </div>

      {/* Encounter Type Breakdown */}
      <CollapsibleSection
        title="Encounter Types"
        icon={<PieChart className="w-4 h-4" />}
        isExpanded={expandedSection === 'encounters'}
        onToggle={() => setExpandedSection(expandedSection === 'encounters' ? null : 'encounters')}
        isBambiMode={isBambiMode}
      >
        <div className="space-y-3">
          {(Object.entries(encounterAnalysis.encountersByType) as [EncounterType, number][])
            .filter(([, count]) => count > 0)
            .sort(([, a], [, b]) => b - a)
            .map(([type, count]) => (
              <EncounterTypeBar
                key={type}
                type={type}
                count={count}
                total={encounterAnalysis.totalEncounters}
                isBambiMode={isBambiMode}
              />
            ))}
          {encounterAnalysis.totalEncounters === 0 && (
            <p className={`text-sm text-center py-4 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}>
              No encounters logged yet
            </p>
          )}
        </div>
      </CollapsibleSection>

      {/* Comfort Growth */}
      <CollapsibleSection
        title="Comfort Growth"
        icon={<TrendingUp className="w-4 h-4" />}
        isExpanded={expandedSection === 'comfort'}
        onToggle={() => setExpandedSection(expandedSection === 'comfort' ? null : 'comfort')}
        isBambiMode={isBambiMode}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-2xl font-bold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
                {comfortGrowth.currentComfort}
              </p>
              <p className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
                Current Comfort Level
              </p>
            </div>
            <div className={`text-right ${
              comfortGrowth.growthRate >= 0
                ? isBambiMode ? 'text-green-600' : 'text-green-400'
                : isBambiMode ? 'text-red-600' : 'text-red-400'
            }`}>
              <p className="text-lg font-bold">
                {comfortGrowth.growthRate >= 0 ? '+' : ''}{comfortGrowth.growthRate}%
              </p>
              <p className="text-xs">Growth</p>
            </div>
          </div>

          {/* Arousal correlation */}
          <div className={`p-3 rounded-lg ${
            isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'
          }`}>
            <p className={`text-xs font-semibold mb-1 ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
            }`}>
              Arousal-Comfort Correlation
            </p>
            <div className="flex items-center gap-2">
              <div className={`flex-1 h-2 rounded-full ${
                isBambiMode ? 'bg-pink-200' : 'bg-protocol-surface'
              }`}>
                <div
                  className={`h-full rounded-full ${
                    comfortGrowth.arousalCorrelation > 0.5
                      ? isBambiMode ? 'bg-green-500' : 'bg-green-400'
                      : comfortGrowth.arousalCorrelation > 0
                        ? isBambiMode ? 'bg-yellow-500' : 'bg-yellow-400'
                        : isBambiMode ? 'bg-red-500' : 'bg-red-400'
                  }`}
                  style={{ width: `${Math.abs(comfortGrowth.arousalCorrelation) * 100}%` }}
                />
              </div>
              <span className={`text-sm font-medium ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}>
                {comfortGrowth.arousalCorrelation > 0.5 ? 'Strong' :
                 comfortGrowth.arousalCorrelation > 0 ? 'Moderate' : 'Weak'}
              </span>
            </div>
          </div>

          {/* Breakthrough moments */}
          {comfortGrowth.breakthroughMoments.length > 0 && (
            <div>
              <p className={`text-xs font-semibold mb-2 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
              }`}>
                Breakthrough Moments
              </p>
              <div className="space-y-2">
                {comfortGrowth.breakthroughMoments.slice(0, 3).map((moment, i) => (
                  <div key={i} className={`p-2 rounded-lg text-xs ${
                    isBambiMode ? 'bg-green-50 text-green-700' : 'bg-green-900/20 text-green-400'
                  }`}>
                    <Sparkles className="w-3 h-3 inline mr-1" />
                    {moment.description}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Top Activities */}
      <CollapsibleSection
        title="Top Activities"
        icon={<Activity className="w-4 h-4" />}
        isExpanded={expandedSection === 'activities'}
        onToggle={() => setExpandedSection(expandedSection === 'activities' ? null : 'activities')}
        isBambiMode={isBambiMode}
      >
        <div className="space-y-2">
          {encounterAnalysis.topActivities.slice(0, 5).map((activity, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className={`text-sm ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
                {activity.activity}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded ${
                isBambiMode ? 'bg-pink-100 text-pink-600' : 'bg-protocol-surface text-protocol-text-muted'
              }`}>
                {activity.count}x
              </span>
            </div>
          ))}
          {encounterAnalysis.topActivities.length === 0 && (
            <p className={`text-sm text-center py-4 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}>
              No activities logged yet
            </p>
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
              Recommendations
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

      {/* Stage History (collapsed by default) */}
      <CollapsibleSection
        title="Stage History"
        icon={<Clock className="w-4 h-4" />}
        isExpanded={expandedSection === 'history'}
        onToggle={() => setExpandedSection(expandedSection === 'history' ? null : 'history')}
        isBambiMode={isBambiMode}
      >
        <div className="space-y-2">
          {stageProgress.stageHistory.map((entry, i) => (
            <div key={i} className={`p-3 rounded-lg ${
              i === stageProgress.stageHistory.length - 1
                ? isBambiMode ? 'bg-pink-100 border border-pink-300' : 'bg-protocol-accent/20 border border-protocol-accent/30'
                : isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}>
                  {SERVICE_STAGE_LABELS[entry.stage]}
                </span>
                <span className={`text-xs ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}>
                  {entry.daysInStage} days
                </span>
              </div>
              <div className={`text-xs mt-1 ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}>
                {entry.activitiesCompleted} activities
                {entry.exitComfortLevel && ` • Comfort: ${entry.exitComfortLevel}`}
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>
    </div>
  );
}

// ============================================
// HELPER COMPONENTS
// ============================================

function ReadinessMetric({
  label,
  current,
  target,
  isBambiMode
}: {
  label: string;
  current: number;
  target: number;
  isBambiMode: boolean;
}) {
  const isMet = current >= target;

  return (
    <div className={`p-2 rounded text-center ${
      isMet
        ? isBambiMode ? 'bg-green-100' : 'bg-green-900/30'
        : isBambiMode ? 'bg-pink-100' : 'bg-protocol-bg'
    }`}>
      <p className={`text-sm font-bold ${
        isMet
          ? isBambiMode ? 'text-green-700' : 'text-green-400'
          : isBambiMode ? 'text-pink-700' : 'text-protocol-text'
      }`}>
        {current}/{target}
      </p>
      <p className={`text-xs ${
        isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
      }`}>
        {label}
      </p>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  trend,
  isBambiMode
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  trend?: 'increasing' | 'stable' | 'decreasing' | 'improving' | 'declining' | 'accelerating' | 'steady' | 'slowing';
  isBambiMode: boolean;
}) {
  const getTrendIcon = () => {
    if (!trend) return null;
    if (trend === 'increasing' || trend === 'improving' || trend === 'accelerating') {
      return <TrendingUp className="w-3 h-3 text-green-500" />;
    }
    if (trend === 'decreasing' || trend === 'declining' || trend === 'slowing') {
      return <TrendingDown className="w-3 h-3 text-red-500" />;
    }
    return <Minus className="w-3 h-3 text-gray-500" />;
  };

  return (
    <div className={`p-3 rounded-xl ${
      isBambiMode ? 'bg-pink-50 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
    }`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={isBambiMode ? 'text-pink-500' : 'text-protocol-accent'}>
          {icon}
        </span>
        <span className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
          {label}
        </span>
        {getTrendIcon()}
      </div>
      <p className={`text-xl font-bold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
        {value}
      </p>
    </div>
  );
}

function EncounterTypeBar({
  type,
  count,
  total,
  isBambiMode
}: {
  type: EncounterType;
  count: number;
  total: number;
  isBambiMode: boolean;
}) {
  const percentage = total > 0 ? (count / total) * 100 : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-sm ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
          {ENCOUNTER_TYPE_LABELS[type]}
        </span>
        <span className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
          {count} ({Math.round(percentage)}%)
        </span>
      </div>
      <div className={`h-2 rounded-full ${isBambiMode ? 'bg-pink-200' : 'bg-protocol-bg'}`}>
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${percentage}%`,
            backgroundColor: ENCOUNTER_TYPE_COLORS[type],
          }}
        />
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
