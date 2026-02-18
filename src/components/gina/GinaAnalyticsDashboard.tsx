/**
 * Gina Analytics Dashboard
 *
 * Comprehensive analytics for the Gina Pipeline:
 * - Interaction patterns
 * - Mission performance
 * - Behavior adoption timeline
 * - Next best action recommendations
 * - Domain escalation guidance
 */

import { useState, useEffect, useCallback } from 'react';
import {
  X,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Sparkles,
  AlertTriangle,
  Lightbulb,
  BarChart3,
  Clock,
  CheckCircle,
  XCircle,
  ArrowRight,
  Zap,
  Heart,
  Crown,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBambiMode } from '../../context/BambiModeContext';
import {
  getInteractionAnalytics,
  getMissionPerformance,
  getBehaviorTimeline,
  getDomainSequencing,
  getStrategyRecommendations,
  getHandlerIntegration,
  type InteractionAnalytics,
  type MissionPerformance,
  type BehaviorTimeline,
  type DomainSequencing,
  type StrategyRecommendation,
  type GinaHandlerIntegration,
} from '../../lib/gina-analytics';

interface GinaAnalyticsDashboardProps {
  onClose: () => void;
}

export function GinaAnalyticsDashboard({ onClose }: GinaAnalyticsDashboardProps) {
  const { user } = useAuth();
  const { isBambiMode } = useBambiMode();

  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'interactions' | 'missions' | 'behaviors' | 'domains'>('overview');

  // Data
  const [interactions, setInteractions] = useState<InteractionAnalytics | null>(null);
  const [missions, setMissions] = useState<MissionPerformance | null>(null);
  const [behaviors, setBehaviors] = useState<BehaviorTimeline | null>(null);
  const [domains, setDomains] = useState<DomainSequencing | null>(null);
  const [strategy, setStrategy] = useState<StrategyRecommendation | null>(null);
  const [handlerSync, setHandlerSync] = useState<GinaHandlerIntegration | null>(null);

  const loadData = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const [
        interactionsData,
        missionsData,
        behaviorsData,
        domainsData,
        strategyData,
        handlerData,
      ] = await Promise.all([
        getInteractionAnalytics(user.id),
        getMissionPerformance(user.id),
        getBehaviorTimeline(user.id),
        getDomainSequencing(user.id),
        getStrategyRecommendations(user.id),
        getHandlerIntegration(user.id),
      ]);

      setInteractions(interactionsData);
      setMissions(missionsData);
      setBehaviors(behaviorsData);
      setDomains(domainsData);
      setStrategy(strategyData);
      setHandlerSync(handlerData);
    } catch (err) {
      console.error('Failed to load Gina analytics:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getTrendIcon = (trend: 'improving' | 'stable' | 'declining') => {
    switch (trend) {
      case 'improving': return <TrendingUp className="w-4 h-4 text-green-400" />;
      case 'declining': return <TrendingDown className="w-4 h-4 text-red-400" />;
      default: return <Minus className="w-4 h-4 text-gray-400" />;
    }
  };

  const getMomentumIcon = (momentum: 'building' | 'stable' | 'losing') => {
    switch (momentum) {
      case 'building': return <TrendingUp className="w-4 h-4 text-green-400" />;
      case 'losing': return <TrendingDown className="w-4 h-4 text-red-400" />;
      default: return <Minus className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div
        className={`w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-xl overflow-hidden flex flex-col ${
          isBambiMode ? 'bg-white' : 'bg-protocol-surface'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between p-4 border-b ${
            isBambiMode ? 'border-pink-200' : 'border-protocol-border'
          }`}
        >
          <div className="flex items-center gap-3">
            <BarChart3 className={`w-6 h-6 ${isBambiMode ? 'text-pink-500' : 'text-protocol-accent'}`} />
            <div>
              <h2 className={`text-lg font-semibold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
                Gina Analytics
              </h2>
              <p className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
                Intelligence & Recommendations
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={isLoading}
              className={`p-2 rounded-full ${
                isBambiMode ? 'hover:bg-pink-100' : 'hover:bg-protocol-bg'
              }`}
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''} ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`} />
            </button>
            <button
              onClick={onClose}
              className={`p-2 rounded-full ${
                isBambiMode ? 'hover:bg-pink-100' : 'hover:bg-protocol-bg'
              }`}
            >
              <X className={`w-5 h-5 ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className={`flex border-b ${isBambiMode ? 'border-pink-200' : 'border-protocol-border'}`}>
          {(['overview', 'interactions', 'missions', 'behaviors', 'domains'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? isBambiMode
                    ? 'text-pink-600 border-b-2 border-pink-500'
                    : 'text-protocol-accent border-b-2 border-protocol-accent'
                  : isBambiMode
                    ? 'text-pink-400 hover:text-pink-600'
                    : 'text-protocol-text-muted hover:text-protocol-text'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className={`w-8 h-8 animate-spin ${isBambiMode ? 'text-pink-500' : 'text-protocol-accent'}`} />
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <OverviewTab
                  strategy={strategy}
                  missions={missions}
                  interactions={interactions}
                  handlerSync={handlerSync}
                  isBambiMode={isBambiMode}
                />
              )}
              {activeTab === 'interactions' && (
                <InteractionsTab
                  data={interactions}
                  getTrendIcon={getTrendIcon}
                  isBambiMode={isBambiMode}
                />
              )}
              {activeTab === 'missions' && (
                <MissionsTab
                  data={missions}
                  getMomentumIcon={getMomentumIcon}
                  isBambiMode={isBambiMode}
                />
              )}
              {activeTab === 'behaviors' && (
                <BehaviorsTab data={behaviors} isBambiMode={isBambiMode} />
              )}
              {activeTab === 'domains' && (
                <DomainsTab data={domains} isBambiMode={isBambiMode} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// TAB COMPONENTS
// ============================================================================

function OverviewTab({
  strategy,
  missions,
  interactions,
  handlerSync,
  isBambiMode,
}: {
  strategy: StrategyRecommendation | null;
  missions: MissionPerformance | null;
  interactions: InteractionAnalytics | null;
  handlerSync: GinaHandlerIntegration | null;
  isBambiMode: boolean;
}) {
  if (!strategy) return <p className="text-center text-protocol-text-muted">No data available</p>;

  return (
    <div className="space-y-6">
      {/* Next Best Actions */}
      <section>
        <h3 className={`text-sm font-semibold uppercase tracking-wider mb-3 flex items-center gap-2 ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
        }`}>
          <Zap className="w-4 h-4" />
          Next Best Actions
        </h3>
        <div className="space-y-3">
          {strategy.recommendations.length === 0 ? (
            <p className={`text-sm ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
              No specific recommendations at this time.
            </p>
          ) : (
            strategy.recommendations.map((rec, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-xl border ${
                  isBambiMode ? 'bg-pink-50 border-pink-200' : 'bg-protocol-bg border-protocol-border'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${
                    rec.urgency === 'high'
                      ? 'bg-red-500/20 text-red-400'
                      : rec.urgency === 'medium'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-blue-500/20 text-blue-400'
                  }`}>
                    {rec.type === 'mission' && <Target className="w-5 h-5" />}
                    {rec.type === 'seed' && <Sparkles className="w-5 h-5" />}
                    {rec.type === 'escalation' && <TrendingUp className="w-5 h-5" />}
                    {rec.type === 'consolidation' && <Heart className="w-5 h-5" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`font-medium ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
                        {rec.title}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        rec.urgency === 'high'
                          ? 'bg-red-500/20 text-red-400'
                          : rec.urgency === 'medium'
                            ? 'bg-amber-500/20 text-amber-400'
                            : 'bg-blue-500/20 text-blue-400'
                      }`}>
                        {rec.urgency}
                      </span>
                    </div>
                    <p className={`text-sm mb-2 ${isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}`}>
                      {rec.description}
                    </p>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-green-400" />
                        {Math.round(rec.successProbability)}% success
                      </span>
                      {rec.timing && (
                        <span className="flex items-center gap-1 text-protocol-text-muted">
                          <Clock className="w-3 h-3" />
                          {rec.timing}
                        </span>
                      )}
                      {rec.exploitsMotivator && (
                        <span className="text-protocol-text-muted">
                          Uses: {rec.exploitsMotivator}
                        </span>
                      )}
                    </div>
                    {rec.script && (
                      <p className={`mt-2 text-sm italic ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
                        "{rec.script}"
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Warnings & Opportunities */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {strategy.warnings.length > 0 && (
          <div className={`p-4 rounded-xl border ${isBambiMode ? 'bg-red-50 border-red-200' : 'bg-red-500/10 border-red-500/30'}`}>
            <h4 className="text-sm font-medium text-red-400 flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4" />
              Warnings
            </h4>
            <ul className="space-y-1">
              {strategy.warnings.map((warning, idx) => (
                <li key={idx} className="text-sm text-red-300">
                  {warning}
                </li>
              ))}
            </ul>
          </div>
        )}

        {strategy.opportunities.length > 0 && (
          <div className={`p-4 rounded-xl border ${isBambiMode ? 'bg-green-50 border-green-200' : 'bg-green-500/10 border-green-500/30'}`}>
            <h4 className="text-sm font-medium text-green-400 flex items-center gap-2 mb-2">
              <Lightbulb className="w-4 h-4" />
              Opportunities
            </h4>
            <ul className="space-y-1">
              {strategy.opportunities.map((opp, idx) => (
                <li key={idx} className="text-sm text-green-300">
                  {opp}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Mission Success"
          value={`${Math.round(missions?.successRate || 0)}%`}
          sublabel={`${missions?.completed || 0} completed`}
          isBambiMode={isBambiMode}
        />
        <StatCard
          label="Positive Interactions"
          value={`${Math.round(interactions?.positiveRate || 0)}%`}
          sublabel={`${interactions?.totalInteractions || 0} logged`}
          isBambiMode={isBambiMode}
        />
        <StatCard
          label="Strategy Effectiveness"
          value={`${strategy.effectiveness}%`}
          sublabel={strategy.currentStrategy || 'Not set'}
          isBambiMode={isBambiMode}
        />
        <StatCard
          label="Handler Readiness"
          value={`${Math.round(handlerSync?.ginaReadinessForAuthority || 0)}%`}
          sublabel={`Level ${handlerSync?.suggestedAuthorityLevel || 1} suggested`}
          isBambiMode={isBambiMode}
        />
      </div>

      {/* Handler Sync */}
      {handlerSync && handlerSync.handlerActionsForGina.length > 0 && (
        <section>
          <h3 className={`text-sm font-semibold uppercase tracking-wider mb-3 flex items-center gap-2 ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
          }`}>
            <Crown className="w-4 h-4" />
            Handler Integration
          </h3>
          <div className="space-y-2">
            {handlerSync.handlerActionsForGina.map((action, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg ${isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'}`}
              >
                <p className={`font-medium ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
                  {action.action}
                </p>
                <p className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
                  {action.purpose} | Gina: {action.ginaImpact}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function InteractionsTab({
  data,
  getTrendIcon,
  isBambiMode,
}: {
  data: InteractionAnalytics | null;
  getTrendIcon: (trend: 'improving' | 'stable' | 'declining') => React.ReactNode;
  isBambiMode: boolean;
}) {
  if (!data) return <p className="text-center text-protocol-text-muted">No interaction data</p>;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Logged" value={String(data.totalInteractions)} isBambiMode={isBambiMode} />
        <StatCard label="Positive Rate" value={`${Math.round(data.positiveRate)}%`} isBambiMode={isBambiMode} />
        <StatCard label="Avg Significance" value={data.averageSignificance.toFixed(1)} isBambiMode={isBambiMode} />
        <div className={`p-4 rounded-xl border ${isBambiMode ? 'bg-pink-50 border-pink-200' : 'bg-protocol-bg border-protocol-border'}`}>
          <p className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>Trend</p>
          <div className="flex items-center gap-2 mt-1">
            {getTrendIcon(data.recentTrend)}
            <span className={`font-semibold capitalize ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
              {data.recentTrend}
            </span>
          </div>
        </div>
      </div>

      {/* Insights */}
      <div className={`p-4 rounded-xl border ${isBambiMode ? 'bg-pink-50 border-pink-200' : 'bg-protocol-bg border-protocol-border'}`}>
        <h4 className={`text-sm font-medium mb-3 ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
          Key Insights
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {data.strongestMotivator && (
            <div>
              <p className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>Strongest Motivator</p>
              <p className={`font-medium capitalize ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
                {data.strongestMotivator}
              </p>
            </div>
          )}
          {data.mostEffectiveContext && (
            <div>
              <p className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>Best Context</p>
              <p className={`font-medium ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
                {data.mostEffectiveContext}
              </p>
            </div>
          )}
          {data.mostCommonMood && (
            <div>
              <p className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>Common Mood</p>
              <p className={`font-medium ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
                {data.mostCommonMood}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Distributions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DistributionChart title="By Mood" data={data.byMood} isBambiMode={isBambiMode} />
        <DistributionChart title="By Motivator" data={data.byMotivator} isBambiMode={isBambiMode} />
      </div>
    </div>
  );
}

function MissionsTab({
  data,
  getMomentumIcon,
  isBambiMode,
}: {
  data: MissionPerformance | null;
  getMomentumIcon: (momentum: 'building' | 'stable' | 'losing') => React.ReactNode;
  isBambiMode: boolean;
}) {
  if (!data) return <p className="text-center text-protocol-text-muted">No mission data</p>;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Missions" value={String(data.totalMissions)} isBambiMode={isBambiMode} />
        <StatCard label="Success Rate" value={`${Math.round(data.successRate)}%`} sublabel={`${data.completed} completed`} isBambiMode={isBambiMode} />
        <StatCard label="Avg Time" value={`${data.averageTimeToComplete.toFixed(1)}d`} sublabel="to complete" isBambiMode={isBambiMode} />
        <div className={`p-4 rounded-xl border ${isBambiMode ? 'bg-pink-50 border-pink-200' : 'bg-protocol-bg border-protocol-border'}`}>
          <p className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>Momentum</p>
          <div className="flex items-center gap-2 mt-1">
            {getMomentumIcon(data.recentMomentum)}
            <span className={`font-semibold capitalize ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
              {data.recentMomentum}
            </span>
          </div>
        </div>
      </div>

      {/* Outcome Distribution */}
      <div className={`p-4 rounded-xl border ${isBambiMode ? 'bg-pink-50 border-pink-200' : 'bg-protocol-bg border-protocol-border'}`}>
        <h4 className={`text-sm font-medium mb-3 ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
          Outcome Distribution
        </h4>
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <div className="flex items-center justify-center gap-1">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span className="font-semibold text-green-400">{Math.round(data.successRate)}%</span>
            </div>
            <p className="text-xs text-protocol-text-muted">Success</p>
          </div>
          <div>
            <span className="font-semibold text-amber-400">{Math.round(data.partialRate)}%</span>
            <p className="text-xs text-protocol-text-muted">Partial</p>
          </div>
          <div>
            <div className="flex items-center justify-center gap-1">
              <XCircle className="w-4 h-4 text-red-400" />
              <span className="font-semibold text-red-400">{Math.round(data.rejectedRate)}%</span>
            </div>
            <p className="text-xs text-protocol-text-muted">Rejected</p>
          </div>
          <div>
            <span className="font-semibold text-gray-400">{Math.round(data.deferredRate)}%</span>
            <p className="text-xs text-protocol-text-muted">Deferred</p>
          </div>
        </div>
      </div>

      {/* By Type */}
      <div className={`p-4 rounded-xl border ${isBambiMode ? 'bg-pink-50 border-pink-200' : 'bg-protocol-bg border-protocol-border'}`}>
        <h4 className={`text-sm font-medium mb-3 ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
          Performance by Mission Type
        </h4>
        <div className="space-y-2">
          {Object.entries(data.byType)
            .sort((a, b) => b[1].successRate - a[1].successRate)
            .map(([type, stats]) => (
              <div key={type} className="flex items-center gap-3">
                <span className={`text-sm w-32 ${isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}`}>
                  {type.replace('_', ' ')}
                </span>
                <div className="flex-1 h-2 bg-protocol-surface rounded-full overflow-hidden">
                  <div
                    className={`h-full ${stats.successRate >= 70 ? 'bg-green-500' : stats.successRate >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${stats.successRate}%` }}
                  />
                </div>
                <span className={`text-sm font-medium w-16 text-right ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
                  {Math.round(stats.successRate)}%
                </span>
                <span className="text-xs text-protocol-text-muted w-12">
                  ({stats.total})
                </span>
              </div>
            ))}
        </div>
      </div>

      {/* By Motivator */}
      {Object.keys(data.byMotivator).length > 0 && (
        <div className={`p-4 rounded-xl border ${isBambiMode ? 'bg-pink-50 border-pink-200' : 'bg-protocol-bg border-protocol-border'}`}>
          <h4 className={`text-sm font-medium mb-3 ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
            Performance by Motivator
          </h4>
          <div className="space-y-2">
            {Object.entries(data.byMotivator)
              .sort((a, b) => b[1].successRate - a[1].successRate)
              .map(([motivator, stats]) => (
                <div key={motivator} className="flex items-center gap-3">
                  <span className={`text-sm w-32 capitalize ${isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}`}>
                    {motivator}
                  </span>
                  <div className="flex-1 h-2 bg-protocol-surface rounded-full overflow-hidden">
                    <div
                      className={`h-full ${stats.successRate >= 70 ? 'bg-green-500' : stats.successRate >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${stats.successRate}%` }}
                    />
                  </div>
                  <span className={`text-sm font-medium w-16 text-right ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
                    {Math.round(stats.successRate)}%
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BehaviorsTab({ data, isBambiMode }: { data: BehaviorTimeline | null; isBambiMode: boolean }) {
  const [expandedBehavior, setExpandedBehavior] = useState<string | null>(null);

  if (!data) return <p className="text-center text-protocol-text-muted">No behavior data</p>;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Behaviors" value={String(data.totalBehaviors)} isBambiMode={isBambiMode} />
        <StatCard label="Reinforced" value={String(data.reinforcedCount)} sublabel={`${data.totalBehaviors > 0 ? Math.round((data.reinforcedCount / data.totalBehaviors) * 100) : 0}%`} isBambiMode={isBambiMode} />
        <StatCard label="Naturalization" value={`${Math.round(data.naturalizationScore)}%`} sublabel="behaviors at 'always'" isBambiMode={isBambiMode} />
      </div>

      {/* Behavior Timeline */}
      <section>
        <h4 className={`text-sm font-medium mb-3 ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
          Developed Behaviors
        </h4>
        {data.behaviors.length === 0 ? (
          <p className={`text-sm ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
            No behaviors logged yet. Log interactions to track behavior development.
          </p>
        ) : (
          <div className="space-y-2">
            {data.behaviors.map((behavior, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg border ${isBambiMode ? 'bg-pink-50 border-pink-200' : 'bg-protocol-bg border-protocol-border'}`}
              >
                <button
                  onClick={() => setExpandedBehavior(expandedBehavior === behavior.behavior ? null : behavior.behavior)}
                  className="w-full flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <FrequencyBadge frequency={behavior.frequency} />
                    <span className={`font-medium ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
                      {behavior.behavior}
                    </span>
                    {behavior.reinforced && (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    )}
                  </div>
                  {expandedBehavior === behavior.behavior ? (
                    <ChevronUp className="w-4 h-4 text-protocol-text-muted" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-protocol-text-muted" />
                  )}
                </button>

                {expandedBehavior === behavior.behavior && (
                  <div className="mt-3 pt-3 border-t border-protocol-border space-y-2">
                    <div className="flex items-center gap-2 text-xs">
                      <Clock className="w-3 h-3 text-protocol-text-muted" />
                      <span className="text-protocol-text-muted">
                        First occurrence: {behavior.daysSinceFirst} days ago
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Sparkles className="w-3 h-3 text-protocol-text-muted" />
                      <span className="text-protocol-text-muted">
                        Triggered by: {behavior.triggered}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-2">
                      <span className="text-xs text-protocol-text-muted mr-2">Progression:</span>
                      {behavior.progressionPath.map((step, i) => (
                        <span key={step} className="flex items-center">
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            step === behavior.frequency
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-protocol-surface text-protocol-text-muted'
                          }`}>
                            {step}
                          </span>
                          {i < behavior.progressionPath.length - 1 && (
                            <ArrowRight className="w-3 h-3 text-protocol-text-muted mx-1" />
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Adopted Language */}
      <section>
        <h4 className={`text-sm font-medium mb-3 ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
          Adopted Language
        </h4>
        {data.adoptedLanguage.length === 0 ? (
          <p className={`text-sm ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
            No phrases logged yet.
          </p>
        ) : (
          <div className="space-y-2">
            {data.adoptedLanguage.map((lang, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg ${isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'}`}
              >
                <p className={`text-sm italic ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
                  "{lang.phrase}"
                </p>
                <div className="flex items-center gap-4 mt-1 text-xs text-protocol-text-muted">
                  <span>{lang.context}</span>
                  <span>{lang.daysSinceFirst}d ago</span>
                  <FrequencyBadge frequency={lang.frequency} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DomainsTab({ data, isBambiMode }: { data: DomainSequencing | null; isBambiMode: boolean }) {
  if (!data) return <p className="text-center text-protocol-text-muted">No domain data</p>;

  return (
    <div className="space-y-6">
      {/* Current Domains */}
      <section>
        <h4 className={`text-sm font-medium mb-3 ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
          Current Domain Control
        </h4>
        {data.currentDomains.length === 0 ? (
          <p className={`text-sm ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
            No domains being tracked yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.currentDomains.map((domain) => (
              <div
                key={domain.domain}
                className={`p-4 rounded-xl border ${isBambiMode ? 'bg-pink-50 border-pink-200' : 'bg-protocol-bg border-protocol-border'}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`font-medium capitalize ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
                    {domain.domain}
                  </span>
                  {domain.locked && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                      Locked
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mb-2">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <div
                      key={level}
                      className={`w-full h-2 rounded ${
                        level <= domain.level
                          ? 'bg-protocol-accent'
                          : 'bg-protocol-surface'
                      }`}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-protocol-text-muted">Level {domain.level}/5</span>
                  <span className="text-protocol-text-muted">
                    Readiness: {domain.readinessForNext}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recommended Escalations */}
      <section>
        <h4 className={`text-sm font-medium mb-3 flex items-center gap-2 ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
          <TrendingUp className="w-4 h-4" />
          Recommended Next Escalations
        </h4>
        <div className="space-y-3">
          {data.recommendedNext.map((rec, idx) => (
            <div
              key={idx}
              className={`p-4 rounded-xl border ${isBambiMode ? 'bg-pink-50 border-pink-200' : 'bg-protocol-bg border-protocol-border'}`}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${
                  rec.successProbability >= 70
                    ? 'bg-green-500/20 text-green-400'
                    : rec.successProbability >= 50
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-red-500/20 text-red-400'
                }`}>
                  <Target className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`font-medium capitalize ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
                      {rec.domain}
                    </span>
                    {rec.prerequisitesMet ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                        Ready
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
                        Prerequisites needed
                      </span>
                    )}
                  </div>
                  <p className={`text-sm ${isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}`}>
                    {rec.reason}
                  </p>
                  <div className="flex items-center gap-2 mt-2 text-xs">
                    <CheckCircle className="w-3 h-3 text-green-400" />
                    <span className="text-protocol-text-muted">
                      {Math.round(rec.successProbability)}% predicted success
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Sequence Patterns */}
      <section>
        <h4 className={`text-sm font-medium mb-3 ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
          Proven Escalation Sequences
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {data.sequencePatterns.map((seq, idx) => (
            <div
              key={idx}
              className={`p-3 rounded-lg flex items-center gap-2 ${isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'}`}
            >
              <span className={`text-sm capitalize ${isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}`}>
                {seq.from}
              </span>
              <ArrowRight className="w-4 h-4 text-protocol-text-muted" />
              <span className={`text-sm capitalize ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
                {seq.to}
              </span>
              <span className={`ml-auto text-xs ${
                seq.historicalSuccess >= 80 ? 'text-green-400' : 'text-amber-400'
              }`}>
                {seq.historicalSuccess}%
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function StatCard({
  label,
  value,
  sublabel,
  isBambiMode,
}: {
  label: string;
  value: string;
  sublabel?: string;
  isBambiMode: boolean;
}) {
  return (
    <div className={`p-4 rounded-xl border ${isBambiMode ? 'bg-pink-50 border-pink-200' : 'bg-protocol-bg border-protocol-border'}`}>
      <p className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>{label}</p>
      <p className={`text-2xl font-bold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>{value}</p>
      {sublabel && (
        <p className={`text-xs ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`}>{sublabel}</p>
      )}
    </div>
  );
}

function DistributionChart({
  title,
  data,
  isBambiMode,
}: {
  title: string;
  data: Record<string, number>;
  isBambiMode: boolean;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = entries[0]?.[1] || 1;

  return (
    <div className={`p-4 rounded-xl border ${isBambiMode ? 'bg-pink-50 border-pink-200' : 'bg-protocol-bg border-protocol-border'}`}>
      <h4 className={`text-sm font-medium mb-3 ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
        {title}
      </h4>
      {entries.length === 0 ? (
        <p className="text-xs text-protocol-text-muted">No data</p>
      ) : (
        <div className="space-y-2">
          {entries.slice(0, 5).map(([key, count]) => (
            <div key={key} className="flex items-center gap-2">
              <span className={`text-xs w-20 truncate capitalize ${isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}`}>
                {key}
              </span>
              <div className="flex-1 h-2 bg-protocol-surface rounded-full overflow-hidden">
                <div
                  className={`h-full ${isBambiMode ? 'bg-pink-400' : 'bg-protocol-accent'}`}
                  style={{ width: `${(count / max) * 100}%` }}
                />
              </div>
              <span className="text-xs text-protocol-text-muted w-8 text-right">{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FrequencyBadge({ frequency }: { frequency: string }) {
  const colors: Record<string, string> = {
    once: 'bg-gray-500/20 text-gray-400',
    sometimes: 'bg-blue-500/20 text-blue-400',
    often: 'bg-amber-500/20 text-amber-400',
    always: 'bg-green-500/20 text-green-400',
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${colors[frequency] || colors.once}`}>
      {frequency}
    </span>
  );
}
