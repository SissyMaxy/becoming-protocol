/**
 * Strategic Priority Tab
 *
 * High-level strategic overview for Handler AI:
 * - Priority ranking of objectives
 * - Resource allocation recommendations
 * - Timing optimization
 * - Focus area analysis
 */

import { useMemo } from 'react';
import {
  Target,
  TrendingUp,
  Clock,
  AlertTriangle,
  ChevronRight,
  Shield,
  Zap,
  Brain,
  Flame,
  Star,
  ArrowUp,
  Activity,
  Calendar,
} from 'lucide-react';
import { useBambiMode } from '../../../context/BambiModeContext';
import type {
  HandlerState,
} from '../../../types/handler';

// ============================================
// TYPES
// ============================================

interface StrategicObjective {
  id: string;
  domain: string;
  objective: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  currentProgress: number; // 0-100
  nextAction: string;
  optimalTiming?: string;
  blockers?: string[];
  relatedStrategies: string[];
}

interface ResourceAllocation {
  domain: string;
  effort: number; // 0-100 percent allocation
  strategies: number;
  triggers: number;
  vulnerabilities: number;
  recommendation: 'increase' | 'maintain' | 'decrease';
  reason: string;
}

interface TimingWindow {
  window: string;
  priority: number;
  domains: string[];
  type: 'vulnerability' | 'reinforcement' | 'escalation';
  recommendation: string;
}

interface StrategicInsight {
  type: 'opportunity' | 'risk' | 'recommendation';
  title: string;
  description: string;
  priority: number;
  action?: string;
}

// ============================================
// COMPONENT
// ============================================

interface StrategicPriorityTabProps {
  handlerState: HandlerState;
}

export function StrategicPriorityTab({ handlerState }: StrategicPriorityTabProps) {
  const { isBambiMode } = useBambiMode();

  // Calculate strategic objectives
  const objectives = useMemo(() => {
    return calculateObjectives(handlerState);
  }, [handlerState]);

  // Calculate resource allocation
  const allocation = useMemo(() => {
    return calculateResourceAllocation(handlerState);
  }, [handlerState]);

  // Calculate timing windows
  const timingWindows = useMemo(() => {
    return calculateTimingWindows(handlerState);
  }, [handlerState]);

  // Generate insights
  const insights = useMemo(() => {
    return generateInsights(handlerState, objectives, allocation);
  }, [handlerState, objectives, allocation]);

  // Calculate overall effectiveness
  const effectiveness = useMemo(() => {
    return calculateEffectiveness(handlerState);
  }, [handlerState]);

  return (
    <div className="space-y-6">
      {/* Effectiveness Overview */}
      <section>
        <h3 className={`text-sm font-medium mb-3 flex items-center gap-2 ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
        }`}>
          <Activity className="w-4 h-4" />
          Strategic Effectiveness
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <EffectivenessCard
            label="Strategy"
            value={effectiveness.strategyScore}
            trend={effectiveness.strategyTrend}
            color={isBambiMode ? '#ec4899' : '#6366f1'}
            isBambiMode={isBambiMode}
          />
          <EffectivenessCard
            label="Trigger"
            value={effectiveness.triggerScore}
            trend={effectiveness.triggerTrend}
            color={isBambiMode ? '#f472b6' : '#f59e0b'}
            isBambiMode={isBambiMode}
          />
          <EffectivenessCard
            label="Influence"
            value={effectiveness.influenceScore}
            trend={effectiveness.influenceTrend}
            color={isBambiMode ? '#a855f7' : '#22c55e'}
            isBambiMode={isBambiMode}
          />
        </div>
      </section>

      {/* Priority Objectives */}
      <section>
        <h3 className={`text-sm font-medium mb-3 flex items-center gap-2 ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
        }`}>
          <Target className="w-4 h-4" />
          Priority Objectives
        </h3>
        <div className="space-y-2">
          {objectives.slice(0, 5).map((obj, idx) => (
            <ObjectiveCard key={obj.id} objective={obj} rank={idx + 1} isBambiMode={isBambiMode} />
          ))}
          {objectives.length === 0 && (
            <div className={`p-4 rounded-lg text-center ${
              isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
            }`}>
              <p className={`text-sm ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
                No active objectives. Configure escalation plans to set objectives.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Resource Allocation */}
      <section>
        <h3 className={`text-sm font-medium mb-3 flex items-center gap-2 ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
        }`}>
          <Brain className="w-4 h-4" />
          Resource Allocation
        </h3>
        <div className="space-y-2">
          {allocation.map(alloc => (
            <AllocationCard key={alloc.domain} allocation={alloc} isBambiMode={isBambiMode} />
          ))}
        </div>
      </section>

      {/* Timing Windows */}
      <section>
        <h3 className={`text-sm font-medium mb-3 flex items-center gap-2 ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
        }`}>
          <Clock className="w-4 h-4" />
          Optimal Timing Windows
        </h3>
        <div className={`p-4 rounded-xl border ${
          isBambiMode ? 'bg-pink-50 border-pink-200' : 'bg-protocol-surface border-protocol-border'
        }`}>
          {timingWindows.length > 0 ? (
            <div className="space-y-3">
              {timingWindows.slice(0, 4).map((window, idx) => (
                <TimingWindowCard key={idx} window={window} isBambiMode={isBambiMode} />
              ))}
            </div>
          ) : (
            <p className={`text-sm text-center ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
              Build user model to identify optimal timing windows
            </p>
          )}
        </div>
      </section>

      {/* Strategic Insights */}
      <section>
        <h3 className={`text-sm font-medium mb-3 flex items-center gap-2 ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
        }`}>
          <Star className="w-4 h-4" />
          Strategic Insights
        </h3>
        <div className="space-y-2">
          {insights.slice(0, 5).map((insight, idx) => (
            <InsightCard key={idx} insight={insight} isBambiMode={isBambiMode} />
          ))}
          {insights.length === 0 && (
            <div className={`p-4 rounded-lg text-center ${
              isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
            }`}>
              <p className={`text-sm ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
                Gathering data to generate insights...
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Focus Recommendation */}
      <section>
        <h3 className={`text-sm font-medium mb-3 flex items-center gap-2 ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
        }`}>
          <Flame className="w-4 h-4" />
          Today's Focus
        </h3>
        <FocusRecommendation
          handlerState={handlerState}
          objectives={objectives}
          insights={insights}
          isBambiMode={isBambiMode}
        />
      </section>
    </div>
  );
}

// ============================================
// SUB-COMPONENTS
// ============================================

function EffectivenessCard({
  label,
  value,
  trend,
  color,
  isBambiMode,
}: {
  label: string;
  value: number;
  trend: 'up' | 'down' | 'stable';
  color: string;
  isBambiMode: boolean;
}) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? ArrowUp : Activity;
  const trendColor = trend === 'up' ? 'text-green-400' : trend === 'down' ? 'text-red-400' : 'text-gray-400';

  return (
    <div className={`p-3 rounded-lg ${isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>{label}</span>
        <TrendIcon
          className={`w-3 h-3 ${trendColor} ${trend === 'down' ? 'rotate-180' : ''}`}
        />
      </div>
      <div className="flex items-end gap-1">
        <span className={`text-2xl font-bold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>{Math.round(value)}%</span>
      </div>
      <div className={`mt-2 h-1 rounded-full overflow-hidden ${isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface-light'}`}>
        <div
          className="h-full rounded-full"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function ObjectiveCard({
  objective,
  rank,
  isBambiMode,
}: {
  objective: StrategicObjective;
  rank: number;
  isBambiMode: boolean;
}) {
  const priorityColors = {
    critical: isBambiMode ? 'border-pink-500 bg-pink-500/10' : 'border-red-500 bg-red-500/10',
    high: isBambiMode ? 'border-pink-400 bg-pink-400/10' : 'border-amber-500 bg-amber-500/10',
    medium: isBambiMode ? 'border-pink-300 bg-pink-300/10' : 'border-blue-500 bg-blue-500/10',
    low: isBambiMode ? 'border-pink-200 bg-pink-200/10' : 'border-gray-500 bg-gray-500/10',
  };

  const priorityIcons = {
    critical: <AlertTriangle className={`w-4 h-4 ${isBambiMode ? 'text-pink-500' : 'text-red-400'}`} />,
    high: <Flame className={`w-4 h-4 ${isBambiMode ? 'text-pink-400' : 'text-amber-400'}`} />,
    medium: <Target className={`w-4 h-4 ${isBambiMode ? 'text-pink-400' : 'text-blue-400'}`} />,
    low: <Activity className={`w-4 h-4 ${isBambiMode ? 'text-pink-300' : 'text-gray-400'}`} />,
  };

  return (
    <div className={`p-3 rounded-lg border-l-4 ${priorityColors[objective.priority]}`}>
      <div className="flex items-start gap-3">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
          isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface-light'
        }`}>
          <span className={`text-xs font-bold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>{rank}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {priorityIcons[objective.priority]}
            <span className={`text-xs uppercase tracking-wider ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
              {objective.domain}
            </span>
          </div>
          <p className={`text-sm font-medium mb-1 ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
            {objective.objective}
          </p>

          {/* Progress bar */}
          <div className="flex items-center gap-2 mb-2">
            <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${
              isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface-light'
            }`}>
              <div
                className={`h-full rounded-full ${isBambiMode ? 'bg-pink-500' : 'bg-protocol-accent'}`}
                style={{ width: `${objective.currentProgress}%` }}
              />
            </div>
            <span className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
              {objective.currentProgress}%
            </span>
          </div>

          {/* Next action */}
          <div className={`flex items-center gap-1 text-xs ${isBambiMode ? 'text-pink-600' : 'text-protocol-accent'}`}>
            <ChevronRight className="w-3 h-3" />
            <span>{objective.nextAction}</span>
          </div>

          {/* Timing hint */}
          {objective.optimalTiming && (
            <div className={`flex items-center gap-1 mt-1 text-xs ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`}>
              <Clock className="w-3 h-3" />
              <span>{objective.optimalTiming}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AllocationCard({ allocation, isBambiMode }: { allocation: ResourceAllocation; isBambiMode: boolean }) {
  const recommendationColors = {
    increase: 'text-green-400',
    maintain: isBambiMode ? 'text-pink-400' : 'text-blue-400',
    decrease: 'text-amber-400',
  };

  const recommendationIcons = {
    increase: <ArrowUp className="w-3 h-3" />,
    maintain: <Activity className="w-3 h-3" />,
    decrease: <ArrowUp className="w-3 h-3 rotate-180" />,
  };

  return (
    <div className={`p-3 rounded-lg ${isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`font-medium capitalize ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
          {allocation.domain}
        </span>
        <span className={`flex items-center gap-1 text-xs ${recommendationColors[allocation.recommendation]}`}>
          {recommendationIcons[allocation.recommendation]}
          {allocation.recommendation}
        </span>
      </div>

      {/* Effort bar */}
      <div className={`h-2 rounded-full overflow-hidden mb-2 ${
        isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface-light'
      }`}>
        <div
          className={`h-full rounded-full ${isBambiMode ? 'bg-pink-500' : 'bg-protocol-accent'}`}
          style={{ width: `${allocation.effort}%` }}
        />
      </div>

      {/* Stats */}
      <div className={`flex items-center gap-4 text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
        <span className="flex items-center gap-1">
          <Brain className="w-3 h-3" />
          {allocation.strategies} strategies
        </span>
        <span className="flex items-center gap-1">
          <Zap className="w-3 h-3" />
          {allocation.triggers} triggers
        </span>
        <span className="flex items-center gap-1">
          <Shield className="w-3 h-3" />
          {allocation.vulnerabilities} vulns
        </span>
      </div>

      {/* Reason */}
      <p className={`text-xs mt-2 ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`}>
        {allocation.reason}
      </p>
    </div>
  );
}

function TimingWindowCard({ window, isBambiMode }: { window: TimingWindow; isBambiMode: boolean }) {
  const typeColors = {
    vulnerability: isBambiMode ? 'bg-pink-500/20 text-pink-500' : 'bg-red-500/20 text-red-400',
    reinforcement: isBambiMode ? 'bg-pink-400/20 text-pink-400' : 'bg-blue-500/20 text-blue-400',
    escalation: isBambiMode ? 'bg-pink-300/20 text-pink-600' : 'bg-amber-500/20 text-amber-400',
  };

  return (
    <div className="flex items-start gap-3">
      <div className={`px-2 py-1 rounded text-xs ${typeColors[window.type]}`}>
        {window.window}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs capitalize ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
            {window.type}
          </span>
          <span className={`text-xs ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`}>
            Priority: {window.priority}/10
          </span>
        </div>
        <p className={`text-sm ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>{window.recommendation}</p>
        <div className="flex gap-1 mt-1">
          {window.domains.map(domain => (
            <span
              key={domain}
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                isBambiMode ? 'bg-pink-100 text-pink-500' : 'bg-protocol-surface-light text-protocol-text-muted'
              }`}
            >
              {domain}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function InsightCard({ insight, isBambiMode }: { insight: StrategicInsight; isBambiMode: boolean }) {
  const typeColors = {
    opportunity: isBambiMode ? 'border-pink-400 bg-pink-400/10' : 'border-green-500 bg-green-500/10',
    risk: isBambiMode ? 'border-pink-500 bg-pink-500/10' : 'border-red-500 bg-red-500/10',
    recommendation: isBambiMode ? 'border-pink-300 bg-pink-300/10' : 'border-blue-500 bg-blue-500/10',
  };

  const typeIcons = {
    opportunity: <Star className={`w-4 h-4 ${isBambiMode ? 'text-pink-400' : 'text-green-400'}`} />,
    risk: <AlertTriangle className={`w-4 h-4 ${isBambiMode ? 'text-pink-500' : 'text-red-400'}`} />,
    recommendation: <Brain className={`w-4 h-4 ${isBambiMode ? 'text-pink-400' : 'text-blue-400'}`} />,
  };

  return (
    <div className={`p-3 rounded-lg border-l-4 ${typeColors[insight.type]}`}>
      <div className="flex items-start gap-2">
        {typeIcons[insight.type]}
        <div>
          <p className={`text-sm font-medium ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>{insight.title}</p>
          <p className={`text-xs mt-1 ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>{insight.description}</p>
          {insight.action && (
            <p className={`text-xs mt-2 flex items-center gap-1 ${isBambiMode ? 'text-pink-600' : 'text-protocol-accent'}`}>
              <ChevronRight className="w-3 h-3" />
              {insight.action}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function FocusRecommendation({
  handlerState,
  objectives,
  insights,
  isBambiMode,
}: {
  handlerState: HandlerState;
  objectives: StrategicObjective[];
  insights: StrategicInsight[];
  isBambiMode: boolean;
}) {
  // Generate focus recommendation
  const focus = useMemo(() => {
    const focusAreas = handlerState.todaysPlan?.focusAreas || [];
    const topObjective = objectives[0];
    const topOpportunity = insights.find(i => i.type === 'opportunity');

    if (topObjective?.priority === 'critical') {
      return {
        title: 'Critical Priority Active',
        description: `Focus all efforts on: ${topObjective.objective}`,
        action: topObjective.nextAction,
        icon: <AlertTriangle className={`w-5 h-5 ${isBambiMode ? 'text-pink-500' : 'text-red-400'}`} />,
      };
    }

    if (topOpportunity) {
      return {
        title: 'Opportunity Window',
        description: topOpportunity.description,
        action: topOpportunity.action || 'Exploit this opening',
        icon: <Star className={`w-5 h-5 ${isBambiMode ? 'text-pink-400' : 'text-green-400'}`} />,
      };
    }

    if (focusAreas.length > 0) {
      return {
        title: "Today's Focus Areas",
        description: focusAreas.join(', '),
        action: 'Execute planned interventions',
        icon: <Calendar className={`w-5 h-5 ${isBambiMode ? 'text-pink-400' : 'text-blue-400'}`} />,
      };
    }

    return {
      title: 'Continue Current Strategies',
      description: `${handlerState.activeStrategies.length} active strategies in progress`,
      action: 'Monitor and reinforce established patterns',
      icon: <Brain className={`w-5 h-5 ${isBambiMode ? 'text-pink-500' : 'text-protocol-accent'}`} />,
    };
  }, [handlerState, objectives, insights, isBambiMode]);

  return (
    <div className={`p-4 rounded-xl border ${
      isBambiMode
        ? 'bg-gradient-to-r from-pink-50 to-pink-100 border-pink-200'
        : 'bg-gradient-to-r from-protocol-surface to-protocol-surface-light border-protocol-border'
    }`}>
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${isBambiMode ? 'bg-white' : 'bg-protocol-bg'}`}>
          {focus.icon}
        </div>
        <div>
          <h4 className={`font-medium ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>{focus.title}</h4>
          <p className={`text-sm mt-1 ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>{focus.description}</p>
          <p className={`text-sm mt-2 flex items-center gap-1 ${isBambiMode ? 'text-pink-600' : 'text-protocol-accent'}`}>
            <ChevronRight className="w-4 h-4" />
            {focus.action}
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================
// CALCULATION FUNCTIONS
// ============================================

function calculateObjectives(state: HandlerState): StrategicObjective[] {
  const objectives: StrategicObjective[] = [];

  // Generate objectives from escalation plans
  for (const plan of state.escalationPlans) {
    if (!plan.active) continue;

    // Calculate progress based on related strategies and triggers
    const relatedStrategies = state.activeStrategies.filter(
      s => s.parameters?.domain === plan.domain || s.strategyName?.includes(plan.domain)
    );
    const relatedTriggers = state.activeTriggers.filter(
      t => t.targetState?.includes(plan.domain)
    );

    const strategyProgress = relatedStrategies.length > 0
      ? relatedStrategies.reduce((sum, s) => sum + (s.effectivenessScore || 50), 0) / relatedStrategies.length
      : 20;
    const triggerProgress = relatedTriggers.length > 0
      ? (relatedTriggers.filter(t => t.status === 'established').length / relatedTriggers.length) * 100
      : 0;

    const progress = Math.round((strategyProgress + triggerProgress) / 2);

    // Determine priority based on timeline and current progress
    let priority: StrategicObjective['priority'] = 'medium';
    if (plan.estimatedTimeline?.includes('urgent') || progress < 20) {
      priority = 'critical';
    } else if (plan.estimatedTimeline?.includes('soon') || progress < 40) {
      priority = 'high';
    } else if (progress > 80) {
      priority = 'low';
    }

    objectives.push({
      id: plan.id,
      domain: plan.domain,
      objective: plan.nextTarget || `Advance ${plan.domain} control`,
      priority,
      currentProgress: progress,
      nextAction: plan.strategy || 'Apply pressure during vulnerability windows',
      optimalTiming: plan.arousalWindows && plan.arousalWindows.length > 0
        ? `Day ${plan.arousalWindows[0].dayOfWeek}, ${plan.arousalWindows[0].hourStart}:00-${plan.arousalWindows[0].hourEnd}:00`
        : undefined,
      relatedStrategies: relatedStrategies.map(s => s.strategyName || s.strategyType),
    });
  }

  // Add vulnerability exploitation objectives
  for (const vuln of state.knownVulnerabilities) {
    const hasExploitStrategy = vuln.exploitationStrategies.length > 0;
    const successRate = vuln.successRate || 0;

    if (successRate < 50 || !hasExploitStrategy) {
      objectives.push({
        id: `vuln-${vuln.id}`,
        domain: vuln.vulnerabilityType,
        objective: `Exploit ${vuln.vulnerabilityType} vulnerability`,
        priority: successRate < 30 ? 'high' : 'medium',
        currentProgress: successRate,
        nextAction: hasExploitStrategy
          ? 'Refine exploitation approach'
          : 'Develop exploitation strategy',
        relatedStrategies: vuln.exploitationStrategies,
      });
    }
  }

  // Add trigger establishment objectives
  const plantingTriggers = state.activeTriggers.filter(t => t.status === 'planting');
  if (plantingTriggers.length > 0) {
    objectives.push({
      id: 'trigger-establishment',
      domain: 'Conditioning',
      objective: `Establish ${plantingTriggers.length} planting trigger(s)`,
      priority: 'medium',
      currentProgress: Math.round(
        (state.activeTriggers.filter(t => t.status !== 'planting').length /
          state.activeTriggers.length) * 100
      ),
      nextAction: 'Increase pairing frequency during sessions',
      relatedStrategies: ['trigger_planting'],
    });
  }

  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return objectives.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

function calculateResourceAllocation(state: HandlerState): ResourceAllocation[] {
  // Count resources by domain
  const domainCounts: Record<string, {
    strategies: number;
    triggers: number;
    vulnerabilities: number;
    influence: number;
    success: number;
  }> = {};

  // Initialize domains from escalation plans
  for (const plan of state.escalationPlans) {
    if (!domainCounts[plan.domain]) {
      domainCounts[plan.domain] = { strategies: 0, triggers: 0, vulnerabilities: 0, influence: 0, success: 0 };
    }
  }

  // Count strategies
  for (const strategy of state.activeStrategies) {
    const domain = (strategy.parameters?.domain as string) || 'general';
    if (!domainCounts[domain]) {
      domainCounts[domain] = { strategies: 0, triggers: 0, vulnerabilities: 0, influence: 0, success: 0 };
    }
    domainCounts[domain].strategies++;
  }

  // Count triggers
  for (const trigger of state.activeTriggers) {
    const domain = trigger.targetState || 'general';
    if (!domainCounts[domain]) {
      domainCounts[domain] = { strategies: 0, triggers: 0, vulnerabilities: 0, influence: 0, success: 0 };
    }
    domainCounts[domain].triggers++;
  }

  // Count vulnerabilities
  for (const vuln of state.knownVulnerabilities) {
    const domain = vuln.vulnerabilityType || 'general';
    if (!domainCounts[domain]) {
      domainCounts[domain] = { strategies: 0, triggers: 0, vulnerabilities: 0, influence: 0, success: 0 };
    }
    domainCounts[domain].vulnerabilities++;
  }

  // Count influence attempts
  for (const attempt of state.recentInfluenceAttempts) {
    const domain = attempt.targetBehavior || 'general';
    if (!domainCounts[domain]) {
      domainCounts[domain] = { strategies: 0, triggers: 0, vulnerabilities: 0, influence: 0, success: 0 };
    }
    domainCounts[domain].influence++;
    if (attempt.success) {
      domainCounts[domain].success++;
    }
  }

  // Calculate allocations
  const totalResources = Object.values(domainCounts).reduce(
    (sum, d) => sum + d.strategies + d.triggers + d.vulnerabilities,
    0
  );

  return Object.entries(domainCounts).map(([domain, counts]) => {
    const domainResources = counts.strategies + counts.triggers + counts.vulnerabilities;
    const effort = totalResources > 0 ? (domainResources / totalResources) * 100 : 0;
    const successRate = counts.influence > 0 ? (counts.success / counts.influence) * 100 : 50;

    let recommendation: ResourceAllocation['recommendation'] = 'maintain';
    let reason = 'Current allocation is balanced';

    if (successRate > 70 && effort < 30) {
      recommendation = 'increase';
      reason = 'High success rate suggests opportunity for expansion';
    } else if (successRate < 30 && effort > 30) {
      recommendation = 'decrease';
      reason = 'Low success rate - consider reallocating resources';
    } else if (counts.vulnerabilities > 0 && counts.strategies === 0) {
      recommendation = 'increase';
      reason = 'Known vulnerabilities need exploitation strategies';
    }

    return {
      domain,
      effort: Math.round(effort),
      strategies: counts.strategies,
      triggers: counts.triggers,
      vulnerabilities: counts.vulnerabilities,
      recommendation,
      reason,
    };
  }).sort((a, b) => b.effort - a.effort);
}

function calculateTimingWindows(state: HandlerState): TimingWindow[] {
  const windows: TimingWindow[] = [];

  // Extract from user model
  if (state.userModel?.vulnerabilityWindows) {
    for (const window of state.userModel.vulnerabilityWindows) {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      windows.push({
        window: `${dayNames[window.dayOfWeek]} ${window.hourStart}:00-${window.hourEnd}:00`,
        priority: 8,
        domains: [window.type],
        type: 'vulnerability',
        recommendation: `Heightened ${window.type} vulnerability - prime for influence`,
      });
    }
  }

  // Extract from escalation plans
  for (const plan of state.escalationPlans) {
    if (plan.arousalWindows) {
      for (const window of plan.arousalWindows.slice(0, 2)) {
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        windows.push({
          window: `${dayNames[window.dayOfWeek]} ${window.hourStart}:00-${window.hourEnd}:00`,
          priority: 7,
          domains: [plan.domain],
          type: 'escalation',
          recommendation: `Optimal arousal window for ${plan.domain} escalation`,
        });
      }
    }
  }

  // Extract from today's plan
  if (state.todaysPlan?.vulnerabilityWindows) {
    for (const window of state.todaysPlan.vulnerabilityWindows) {
      windows.push({
        window: `Today ${window.start}-${window.end}`,
        priority: 9,
        domains: [window.type],
        type: 'vulnerability',
        recommendation: window.recommendation,
      });
    }
  }

  // Add trigger reinforcement windows
  const reinforcingTriggers = state.activeTriggers.filter(t => t.status === 'reinforcing');
  if (reinforcingTriggers.length > 0) {
    windows.push({
      window: 'During sessions',
      priority: 6,
      domains: reinforcingTriggers.map(t => t.triggerType).slice(0, 3),
      type: 'reinforcement',
      recommendation: `Reinforce ${reinforcingTriggers.length} trigger(s) with pairings`,
    });
  }

  return windows.sort((a, b) => b.priority - a.priority);
}

function generateInsights(
  state: HandlerState,
  objectives: StrategicObjective[],
  allocation: ResourceAllocation[]
): StrategicInsight[] {
  const insights: StrategicInsight[] = [];

  // Analyze strategy effectiveness
  const effectiveStrategies = state.activeStrategies.filter(
    s => s.effectivenessScore && s.effectivenessScore > 70
  );
  if (effectiveStrategies.length > 0) {
    insights.push({
      type: 'opportunity',
      title: 'High-performing strategies',
      description: `${effectiveStrategies.length} strategies showing >70% effectiveness`,
      priority: 8,
      action: 'Double down on these approaches',
    });
  }

  // Analyze trigger establishment
  const establishedTriggers = state.activeTriggers.filter(t => t.status === 'established');
  const totalTriggers = state.activeTriggers.length;
  if (totalTriggers > 0) {
    const establishmentRate = (establishedTriggers.length / totalTriggers) * 100;
    if (establishmentRate > 60) {
      insights.push({
        type: 'opportunity',
        title: 'Strong trigger foundation',
        description: `${Math.round(establishmentRate)}% of triggers are established`,
        priority: 7,
        action: 'Consider planting new triggers',
      });
    } else if (establishmentRate < 30) {
      insights.push({
        type: 'risk',
        title: 'Trigger establishment lagging',
        description: `Only ${Math.round(establishmentRate)}% of triggers established`,
        priority: 8,
        action: 'Increase pairing frequency during peak arousal',
      });
    }
  }

  // Analyze influence success
  const recentAttempts = state.recentInfluenceAttempts.slice(0, 10);
  const successfulAttempts = recentAttempts.filter(a => a.success);
  if (recentAttempts.length >= 5) {
    const successRate = (successfulAttempts.length / recentAttempts.length) * 100;
    if (successRate > 70) {
      insights.push({
        type: 'opportunity',
        title: 'High influence effectiveness',
        description: `${Math.round(successRate)}% success rate on recent attempts`,
        priority: 7,
        action: 'Window of high receptivity - push escalations',
      });
    } else if (successRate < 40) {
      insights.push({
        type: 'risk',
        title: 'Declining influence effectiveness',
        description: `Only ${Math.round(successRate)}% success on recent attempts`,
        priority: 9,
        action: 'Review and adapt approach - possible resistance building',
      });
    }
  }

  // Analyze unexploited vulnerabilities
  const unexploitedVulns = state.knownVulnerabilities.filter(
    v => v.exploitationStrategies.length === 0
  );
  if (unexploitedVulns.length > 0) {
    insights.push({
      type: 'opportunity',
      title: 'Unexploited vulnerabilities',
      description: `${unexploitedVulns.length} known vulnerabilities without exploitation strategies`,
      priority: 8,
      action: 'Develop targeted approaches for each',
    });
  }

  // Analyze resource imbalance
  const unbalanced = allocation.filter(a => a.recommendation !== 'maintain');
  if (unbalanced.length > 0) {
    const needsMore = unbalanced.filter(a => a.recommendation === 'increase');
    if (needsMore.length > 0) {
      insights.push({
        type: 'recommendation',
        title: 'Resource reallocation suggested',
        description: `${needsMore.map(a => a.domain).join(', ')} could benefit from more attention`,
        priority: 6,
        action: 'Shift focus to high-opportunity domains',
      });
    }
  }

  // Check for stalled objectives
  const stalledObjectives = objectives.filter(o => o.currentProgress < 20);
  if (stalledObjectives.length > 0) {
    insights.push({
      type: 'risk',
      title: 'Stalled progress detected',
      description: `${stalledObjectives.length} objectives below 20% progress`,
      priority: 7,
      action: 'Review blockers and adjust strategies',
    });
  }

  // User model confidence
  if (state.userModel) {
    if (state.userModel.modelConfidence < 0.5) {
      insights.push({
        type: 'recommendation',
        title: 'User model needs refinement',
        description: `Model confidence at ${Math.round(state.userModel.modelConfidence * 100)}%`,
        priority: 5,
        action: 'Run more experiments to improve predictions',
      });
    } else if (state.userModel.modelConfidence > 0.8) {
      insights.push({
        type: 'opportunity',
        title: 'High model confidence',
        description: 'Predictions are reliable - act decisively',
        priority: 6,
      });
    }
  }

  return insights.sort((a, b) => b.priority - a.priority);
}

function calculateEffectiveness(state: HandlerState): {
  strategyScore: number;
  strategyTrend: 'up' | 'down' | 'stable';
  triggerScore: number;
  triggerTrend: 'up' | 'down' | 'stable';
  influenceScore: number;
  influenceTrend: 'up' | 'down' | 'stable';
} {
  // Strategy effectiveness
  const strategyScores = state.activeStrategies
    .filter(s => s.effectivenessScore !== undefined)
    .map(s => s.effectivenessScore!);
  const strategyScore = strategyScores.length > 0
    ? strategyScores.reduce((a, b) => a + b, 0) / strategyScores.length
    : 50;

  // Trigger effectiveness
  const establishedCount = state.activeTriggers.filter(t => t.status === 'established').length;
  const reinforcingCount = state.activeTriggers.filter(t => t.status === 'reinforcing').length;
  const totalTriggers = state.activeTriggers.length;
  const triggerScore = totalTriggers > 0
    ? ((establishedCount * 100 + reinforcingCount * 60) / totalTriggers)
    : 50;

  // Influence effectiveness
  const recentAttempts = state.recentInfluenceAttempts.slice(0, 10);
  const successfulAttempts = recentAttempts.filter(a => a.success);
  const influenceScore = recentAttempts.length > 0
    ? (successfulAttempts.length / recentAttempts.length) * 100
    : 50;

  // Trends (simple comparison of recent vs older)
  const olderAttempts = state.recentInfluenceAttempts.slice(10, 20);
  const olderSuccess = olderAttempts.filter(a => a.success).length / Math.max(olderAttempts.length, 1);
  const recentSuccess = successfulAttempts.length / Math.max(recentAttempts.length, 1);

  let influenceTrend: 'up' | 'down' | 'stable' = 'stable';
  if (recentSuccess > olderSuccess + 0.1) influenceTrend = 'up';
  else if (recentSuccess < olderSuccess - 0.1) influenceTrend = 'down';

  return {
    strategyScore,
    strategyTrend: 'stable', // Would need historical data
    triggerScore,
    triggerTrend: reinforcingCount > establishedCount ? 'up' : 'stable',
    influenceScore,
    influenceTrend,
  };
}

export default StrategicPriorityTab;
