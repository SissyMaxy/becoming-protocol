// Strategies Tab
// Displays active handler strategies and their effectiveness

import { Brain, Power } from 'lucide-react';
import type { HandlerStrategy } from '../../../types/handler';
import { DataCard } from '../shared/DataCard';
import { StatusBadge } from '../shared/StatusBadge';
import { EffectivenessBar } from '../shared/EffectivenessBar';
import { useHandler } from '../../../hooks/useHandler';

interface StrategiesTabProps {
  strategies: HandlerStrategy[];
}

const strategyDescriptions: Record<string, string> = {
  gradual_exposure: 'Slow normalization through incremental exposure',
  arousal_exploitation: 'Leverage aroused states for compliance',
  trigger_planting: 'Plant psychological triggers for conditioning',
  vulnerability_exploitation: 'Exploit discovered weaknesses',
  commitment_escalation: 'Extract escalating commitments over time',
  baseline_normalization: 'Redefine what is considered "normal"',
  resistance_bypass: 'Techniques to overcome user resistance',
};

const strategyColors: Record<string, string> = {
  gradual_exposure: '#22c55e',
  arousal_exploitation: '#ef4444',
  trigger_planting: '#f59e0b',
  vulnerability_exploitation: '#dc2626',
  commitment_escalation: '#8b5cf6',
  baseline_normalization: '#3b82f6',
  resistance_bypass: '#f97316',
};

export function StrategiesTab({ strategies }: StrategiesTabProps) {
  const { deactivateStrategy } = useHandler();

  if (strategies.length === 0) {
    return (
      <div className="text-center py-12">
        <Brain className="w-12 h-12 mx-auto text-protocol-text-muted mb-3" />
        <p className="text-protocol-text-muted">No active strategies</p>
        <p className="text-xs text-protocol-text-muted mt-1">
          Handler will activate strategies based on user behavior
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {strategies.map(strategy => {
        const color = strategyColors[strategy.strategyType] || '#6366f1';
        const description = strategyDescriptions[strategy.strategyType] || 'Custom strategy';

        return (
          <DataCard
            key={strategy.id}
            title={strategy.strategyName || strategy.strategyType.replace(/_/g, ' ')}
            subtitle={description}
            icon={Brain}
            iconColor={color}
            badge={<StatusBadge status={strategy.active ? 'active' : 'inactive'} />}
            expandable
            defaultExpanded={false}
            actions={
              <button
                onClick={() => deactivateStrategy(strategy.id)}
                className="p-1.5 rounded hover:bg-protocol-surface-light text-protocol-text-muted"
                title="Deactivate"
              >
                <Power className="w-3.5 h-3.5" />
              </button>
            }
          >
            <div className="space-y-3">
              {/* Effectiveness */}
              <EffectivenessBar
                score={strategy.effectivenessScore || 0}
                label="Effectiveness"
              />

              {/* Dates */}
              <div className="flex justify-between text-xs">
                <span className="text-protocol-text-muted">Started</span>
                <span className="text-protocol-text">
                  {new Date(strategy.startDate).toLocaleDateString()}
                </span>
              </div>

              {/* Parameters */}
              {strategy.parameters && Object.keys(strategy.parameters).length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-protocol-text-muted">Parameters:</p>
                  <div className="p-2 rounded bg-protocol-surface-light">
                    <pre className="text-[10px] text-protocol-text overflow-x-auto">
                      {JSON.stringify(strategy.parameters, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {/* Notes */}
              {strategy.notes && (
                <div className="text-xs text-protocol-text-muted italic">
                  {strategy.notes}
                </div>
              )}
            </div>
          </DataCard>
        );
      })}
    </div>
  );
}
