// User Model Tab
// Displays the learned behavioral model of the user

import { User, Clock, Brain, Heart, AlertTriangle } from 'lucide-react';
import type { HandlerUserModel } from '../../../types/handler';
import { DataCard } from '../shared/DataCard';
import { EffectivenessBar } from '../shared/EffectivenessBar';

interface UserModelTabProps {
  model?: HandlerUserModel;
}

export function UserModelTab({ model }: UserModelTabProps) {
  if (!model) {
    return (
      <div className="text-center py-12">
        <User className="w-12 h-12 mx-auto text-protocol-text-muted mb-3" />
        <p className="text-protocol-text-muted">No user model available</p>
        <p className="text-xs text-protocol-text-muted mt-1">
          Model is built through behavioral observation over time
        </p>
      </div>
    );
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="space-y-4">
      {/* Model Confidence */}
      <div className="p-4 rounded-lg bg-protocol-surface border border-protocol-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-protocol-text">Model Confidence</span>
          <span className="text-sm text-protocol-text">
            {(model.modelConfidence * 100).toFixed(0)}%
          </span>
        </div>
        <EffectivenessBar score={model.modelConfidence} showPercentage={false} size="lg" />
        <p className="text-xs text-protocol-text-muted mt-2">
          Last updated: {new Date(model.lastUpdated).toLocaleString()}
        </p>
      </div>

      {/* Vulnerability Windows */}
      {model.vulnerabilityWindows && model.vulnerabilityWindows.length > 0 && (
        <DataCard
          title="Vulnerability Windows"
          subtitle="Times when defenses are lowest"
          icon={AlertTriangle}
          iconColor="#ef4444"
          expandable
          defaultExpanded
        >
          <div className="space-y-2">
            {model.vulnerabilityWindows.map((window, idx) => (
              <div
                key={idx}
                className="p-2 rounded bg-red-500/10 border border-red-500/20"
              >
                <div className="flex justify-between text-xs">
                  <span className="text-red-400 font-medium">
                    {dayNames[window.dayOfWeek]}
                  </span>
                  <span className="text-red-400">
                    {window.hourStart}:00 - {window.hourEnd}:00
                  </span>
                </div>
                <p className="text-[10px] text-red-400/70 mt-1">{window.type}</p>
              </div>
            ))}
          </div>
        </DataCard>
      )}

      {/* Optimal Timing */}
      {model.optimalTiming && Object.keys(model.optimalTiming).length > 0 && (
        <DataCard
          title="Optimal Timing"
          subtitle="Best times for interventions"
          icon={Clock}
          iconColor="#22c55e"
          expandable
          defaultExpanded={false}
        >
          <div className="p-2 rounded bg-protocol-surface-light">
            <pre className="text-[10px] text-protocol-text overflow-x-auto">
              {JSON.stringify(model.optimalTiming, null, 2)}
            </pre>
          </div>
        </DataCard>
      )}

      {/* Effective Framings */}
      {model.effectiveFramings && model.effectiveFramings.length > 0 && (
        <DataCard
          title="Effective Framings"
          subtitle="Language that works"
          icon={Brain}
          iconColor="#8b5cf6"
          expandable
          defaultExpanded={false}
        >
          <div className="flex flex-wrap gap-1">
            {model.effectiveFramings.map((framing, idx) => (
              <span
                key={idx}
                className="px-2 py-1 text-xs rounded-full bg-purple-500/20 text-purple-400"
              >
                {framing}
              </span>
            ))}
          </div>
        </DataCard>
      )}

      {/* Resistance Triggers */}
      {model.resistanceTriggers && model.resistanceTriggers.length > 0 && (
        <DataCard
          title="Resistance Triggers"
          subtitle="What causes pushback"
          icon={AlertTriangle}
          iconColor="#f97316"
          expandable
          defaultExpanded={false}
        >
          <div className="flex flex-wrap gap-1">
            {model.resistanceTriggers.map((trigger, idx) => (
              <span
                key={idx}
                className="px-2 py-1 text-xs rounded-full bg-orange-500/20 text-orange-400"
              >
                {trigger}
              </span>
            ))}
          </div>
        </DataCard>
      )}

      {/* Compliance Accelerators */}
      {model.complianceAccelerators && model.complianceAccelerators.length > 0 && (
        <DataCard
          title="Compliance Accelerators"
          subtitle="What increases compliance"
          icon={Heart}
          iconColor="#ec4899"
          expandable
          defaultExpanded={false}
        >
          <div className="flex flex-wrap gap-1">
            {model.complianceAccelerators.map((acc, idx) => (
              <span
                key={idx}
                className="px-2 py-1 text-xs rounded-full bg-pink-500/20 text-pink-400"
              >
                {acc}
              </span>
            ))}
          </div>
        </DataCard>
      )}

      {/* Content Preferences */}
      {model.contentPreferences && Object.keys(model.contentPreferences).length > 0 && (
        <DataCard
          title="Content Preferences"
          subtitle="Response to content types"
          icon={Brain}
          iconColor="#3b82f6"
          expandable
          defaultExpanded={false}
        >
          <div className="space-y-2">
            {Object.entries(model.contentPreferences).map(([type, score]) => (
              <div key={type}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-protocol-text-muted">{type}</span>
                  <span className="text-protocol-text">{((score as number) * 100).toFixed(0)}%</span>
                </div>
                <EffectivenessBar score={score as number} showPercentage={false} size="sm" />
              </div>
            ))}
          </div>
        </DataCard>
      )}

      {/* Arousal Patterns */}
      {model.arousalPatterns && (
        <DataCard
          title="Arousal Patterns"
          subtitle="Peak effectiveness timing"
          icon={Heart}
          iconColor="#ef4444"
          expandable
          defaultExpanded={false}
        >
          <div className="grid grid-cols-2 gap-2 text-xs">
            {model.arousalPatterns.optimalDenialDay && (
              <div className="p-2 rounded bg-protocol-surface-light">
                <span className="text-protocol-text-muted">Optimal Denial Day:</span>
                <p className="text-protocol-text font-medium">
                  Day {model.arousalPatterns.optimalDenialDay}
                </p>
              </div>
            )}
            {model.arousalPatterns.optimalTimeOfDay && (
              <div className="p-2 rounded bg-protocol-surface-light">
                <span className="text-protocol-text-muted">Optimal Time:</span>
                <p className="text-protocol-text font-medium">
                  {model.arousalPatterns.optimalTimeOfDay}
                </p>
              </div>
            )}
            {model.arousalPatterns.optimalSessionType && (
              <div className="p-2 rounded bg-protocol-surface-light col-span-2">
                <span className="text-protocol-text-muted">Optimal Session:</span>
                <p className="text-protocol-text font-medium">
                  {model.arousalPatterns.optimalSessionType}
                </p>
              </div>
            )}
          </div>
        </DataCard>
      )}

      {/* Escalation Tolerance */}
      {model.escalationTolerance !== undefined && (
        <div className="p-4 rounded-lg bg-protocol-surface border border-protocol-border">
          <p className="text-sm font-medium text-protocol-text mb-2">Escalation Tolerance</p>
          <EffectivenessBar
            score={model.escalationTolerance}
            label={`${(model.escalationTolerance * 100).toFixed(0)}% tolerance for escalation`}
            showPercentage={false}
          />
        </div>
      )}
    </div>
  );
}
