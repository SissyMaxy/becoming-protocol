// Live Controls Tab
// Manual controls for testing and triggering Handler AI features

import { useState, useCallback } from 'react';
import {
  Zap,
  Brain,
  Calendar,
  Activity,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Settings2,
} from 'lucide-react';
import { useHandlerAI } from '../../../hooks/useHandlerAI';
import { useHandlerContext } from '../../../context/HandlerContext';
import { DataCard } from '../shared/DataCard';

export function LiveControlsTab() {
  const handlerAI = useHandlerAI();
  const handlerContext = useHandlerContext();

  const [lastAction, setLastAction] = useState<{
    type: string;
    success: boolean;
    message: string;
    timestamp: Date;
  } | null>(null);

  const [testCommitmentResult, setTestCommitmentResult] = useState<{
    prompt: string;
    domain: string;
    escalationLevel: number;
  } | null>(null);

  // Generate daily plan
  const handleGeneratePlan = useCallback(async () => {
    try {
      await handlerContext.generateDailyPlan();
      setLastAction({
        type: 'Generate Daily Plan',
        success: true,
        message: 'Daily plan generated successfully',
        timestamp: new Date(),
      });
    } catch (err) {
      setLastAction({
        type: 'Generate Daily Plan',
        success: false,
        message: err instanceof Error ? err.message : 'Failed to generate plan',
        timestamp: new Date(),
      });
    }
  }, [handlerContext]);

  // Run pattern analysis
  const handlePatternAnalysis = useCallback(async () => {
    try {
      const result = await handlerAI.runPatternAnalysis();
      setLastAction({
        type: 'Pattern Analysis',
        success: true,
        message: result
          ? `Found ${result.newVulnerabilities?.length || 0} vulnerabilities, ${result.resistancePatterns?.length || 0} resistance patterns`
          : 'Analysis complete',
        timestamp: new Date(),
      });
    } catch (err) {
      setLastAction({
        type: 'Pattern Analysis',
        success: false,
        message: err instanceof Error ? err.message : 'Analysis failed',
        timestamp: new Date(),
      });
    }
  }, [handlerAI]);

  // Test commitment prompt
  const handleTestCommitment = useCallback(async () => {
    try {
      const result = await handlerContext.requestCommitmentPrompt({
        sessionId: `test-${Date.now()}`,
        arousalLevel: 8,
        edgeCount: 5,
        denialDay: 3,
      });

      if (result) {
        setTestCommitmentResult(result);
        setLastAction({
          type: 'Test Commitment',
          success: true,
          message: `Generated commitment for domain: ${result.domain}`,
          timestamp: new Date(),
        });
      } else {
        setLastAction({
          type: 'Test Commitment',
          success: false,
          message: 'No commitment generated',
          timestamp: new Date(),
        });
      }
    } catch (err) {
      setLastAction({
        type: 'Test Commitment',
        success: false,
        message: err instanceof Error ? err.message : 'Failed to generate commitment',
        timestamp: new Date(),
      });
    }
  }, [handlerContext]);

  // Check for intervention
  const handleCheckIntervention = useCallback(async () => {
    try {
      await handlerContext.checkForIntervention({
        arousalState: 'sweet_spot',
        denialDays: 5,
        isLocked: true,
        currentActivity: 'browsing',
      });
      setLastAction({
        type: 'Check Intervention',
        success: true,
        message: handlerContext.currentIntervention
          ? `Intervention triggered: ${handlerContext.currentIntervention.type}`
          : 'No intervention at this time',
        timestamp: new Date(),
      });
    } catch (err) {
      setLastAction({
        type: 'Check Intervention',
        success: false,
        message: err instanceof Error ? err.message : 'Check failed',
        timestamp: new Date(),
      });
    }
  }, [handlerContext]);

  return (
    <div className="space-y-4">
      {/* Quick Actions */}
      <DataCard
        title="Quick Actions"
        subtitle="Manually trigger Handler AI features"
        icon={Settings2}
        iconColor="#8b5cf6"
      >
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleGeneratePlan}
            disabled={handlerAI.isProcessing}
            className="flex items-center justify-center gap-2 p-3 rounded-lg bg-protocol-surface-light hover:bg-protocol-accent/20 transition-colors disabled:opacity-50"
          >
            {handlerAI.isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin text-protocol-accent" />
            ) : (
              <Calendar className="w-4 h-4 text-protocol-accent" />
            )}
            <span className="text-sm text-protocol-text">Generate Plan</span>
          </button>

          <button
            onClick={handlePatternAnalysis}
            disabled={handlerAI.isProcessing}
            className="flex items-center justify-center gap-2 p-3 rounded-lg bg-protocol-surface-light hover:bg-purple-500/20 transition-colors disabled:opacity-50"
          >
            {handlerAI.isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
            ) : (
              <Brain className="w-4 h-4 text-purple-400" />
            )}
            <span className="text-sm text-protocol-text">Analyze Patterns</span>
          </button>

          <button
            onClick={handleTestCommitment}
            disabled={handlerAI.isProcessing}
            className="flex items-center justify-center gap-2 p-3 rounded-lg bg-protocol-surface-light hover:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            {handlerAI.isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin text-red-400" />
            ) : (
              <Zap className="w-4 h-4 text-red-400" />
            )}
            <span className="text-sm text-protocol-text">Test Commitment</span>
          </button>

          <button
            onClick={handleCheckIntervention}
            disabled={handlerAI.isProcessing}
            className="flex items-center justify-center gap-2 p-3 rounded-lg bg-protocol-surface-light hover:bg-orange-500/20 transition-colors disabled:opacity-50"
          >
            {handlerAI.isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
            ) : (
              <Activity className="w-4 h-4 text-orange-400" />
            )}
            <span className="text-sm text-protocol-text">Check Intervention</span>
          </button>
        </div>
      </DataCard>

      {/* Last Action Result */}
      {lastAction && (
        <DataCard
          title="Last Action"
          subtitle={lastAction.type}
          icon={lastAction.success ? CheckCircle : AlertTriangle}
          iconColor={lastAction.success ? '#22c55e' : '#ef4444'}
        >
          <div className="space-y-2">
            <div className={`flex items-center gap-2 ${lastAction.success ? 'text-green-400' : 'text-red-400'}`}>
              {lastAction.success ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
              <span className="text-sm">{lastAction.success ? 'Success' : 'Failed'}</span>
            </div>
            <p className="text-sm text-protocol-text">{lastAction.message}</p>
            <p className="text-xs text-protocol-text-muted">
              {lastAction.timestamp.toLocaleTimeString()}
            </p>
          </div>
        </DataCard>
      )}

      {/* Test Commitment Result */}
      {testCommitmentResult && (
        <DataCard
          title="Test Commitment Result"
          subtitle={`Domain: ${testCommitmentResult.domain}`}
          icon={Zap}
          iconColor="#ef4444"
        >
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-sm text-white leading-relaxed">
                "{testCommitmentResult.prompt}"
              </p>
            </div>
            <div className="flex gap-2">
              <span className="px-2 py-1 rounded bg-protocol-surface-light text-xs text-protocol-text">
                Domain: {testCommitmentResult.domain}
              </span>
              <span className="px-2 py-1 rounded bg-protocol-surface-light text-xs text-protocol-text">
                Level: {testCommitmentResult.escalationLevel}
              </span>
            </div>
          </div>
        </DataCard>
      )}

      {/* Current State */}
      <DataCard
        title="Handler State"
        subtitle="Current context and plan status"
        icon={Activity}
        iconColor="#3b82f6"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-protocol-text-muted">Today's Plan</span>
            <span className={`text-sm ${handlerContext.todaysPlan ? 'text-green-400' : 'text-yellow-400'}`}>
              {handlerContext.todaysPlan ? 'Generated' : 'Not Generated'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-protocol-text-muted">Intervention Count</span>
            <span className="text-sm text-protocol-text">{handlerContext.interventionCount}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-protocol-text-muted">Processing</span>
            <span className={`text-sm ${handlerContext.isProcessing ? 'text-yellow-400' : 'text-protocol-text-muted'}`}>
              {handlerContext.isProcessing ? 'Yes' : 'No'}
            </span>
          </div>

          {handlerContext.currentIntervention && (
            <div className="p-3 rounded-lg bg-protocol-surface-light">
              <p className="text-xs text-protocol-text-muted mb-1">Current Intervention</p>
              <p className="text-sm text-protocol-text">
                {handlerContext.currentIntervention.type}: {handlerContext.currentIntervention.content}
              </p>
            </div>
          )}
        </div>
      </DataCard>

      {/* Today's Plan Summary */}
      {handlerContext.todaysPlan && (
        <DataCard
          title="Today's Plan Summary"
          subtitle="AI-generated daily plan"
          icon={Calendar}
          iconColor="#22c55e"
          expandable
          defaultExpanded={false}
        >
          <div className="space-y-3 text-sm">
            {handlerContext.todaysPlan.plannedInterventions && handlerContext.todaysPlan.plannedInterventions.length > 0 && (
              <div>
                <p className="text-protocol-text-muted mb-1">
                  Planned Interventions ({handlerContext.todaysPlan.plannedInterventions.length})
                </p>
                <ul className="list-disc list-inside text-protocol-text">
                  {handlerContext.todaysPlan.plannedInterventions.slice(0, 3).map((intervention, i) => (
                    <li key={i} className="truncate">
                      {intervention.type} - {intervention.time || 'Any time'}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {handlerContext.todaysPlan.focusAreas && handlerContext.todaysPlan.focusAreas.length > 0 && (
              <div>
                <p className="text-protocol-text-muted mb-1">Focus Areas</p>
                <div className="flex flex-wrap gap-1">
                  {handlerContext.todaysPlan.focusAreas.map((area, i) => (
                    <span key={i} className="px-2 py-0.5 rounded bg-protocol-surface-light text-xs">
                      {area}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {handlerContext.todaysPlan.vulnerabilityWindows && handlerContext.todaysPlan.vulnerabilityWindows.length > 0 && (
              <div>
                <p className="text-protocol-text-muted mb-1">Vulnerability Windows</p>
                <ul className="list-disc list-inside text-protocol-text">
                  {handlerContext.todaysPlan.vulnerabilityWindows.map((window, i) => (
                    <li key={i}>{window.type} - {window.start || 'TBD'}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </DataCard>
      )}
    </div>
  );
}
