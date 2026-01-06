// Triggers Tab
// Displays planted triggers and their conditioning status

import { Zap, RefreshCw } from 'lucide-react';
import type { PlantedTrigger } from '../../../types/handler';
import { DataCard } from '../shared/DataCard';
import { StatusBadge } from '../shared/StatusBadge';
import { EffectivenessBar } from '../shared/EffectivenessBar';

interface TriggersTabProps {
  triggers: PlantedTrigger[];
}

const statusColors: Record<string, string> = {
  planting: '#f59e0b',
  reinforcing: '#f97316',
  established: '#22c55e',
  dormant: '#6b7280',
};

export function TriggersTab({ triggers }: TriggersTabProps) {
  if (triggers.length === 0) {
    return (
      <div className="text-center py-12">
        <Zap className="w-12 h-12 mx-auto text-protocol-text-muted mb-3" />
        <p className="text-protocol-text-muted">No active triggers</p>
        <p className="text-xs text-protocol-text-muted mt-1">
          Triggers are planted during conditioning sessions
        </p>
      </div>
    );
  }

  // Group by status
  const grouped = triggers.reduce((acc, trigger) => {
    const status = trigger.status;
    if (!acc[status]) acc[status] = [];
    acc[status].push(trigger);
    return acc;
  }, {} as Record<string, PlantedTrigger[]>);

  const statusOrder = ['established', 'reinforcing', 'planting', 'dormant'];

  return (
    <div className="space-y-4">
      {statusOrder.map(status => {
        const statusTriggers = grouped[status];
        if (!statusTriggers || statusTriggers.length === 0) return null;

        return (
          <div key={status}>
            <h3 className="text-xs font-medium text-protocol-text-muted mb-2 uppercase tracking-wide">
              {status} ({statusTriggers.length})
            </h3>
            <div className="space-y-2">
              {statusTriggers.map(trigger => (
                <DataCard
                  key={trigger.id}
                  title={trigger.triggerContent}
                  subtitle={`Target: ${trigger.targetState}`}
                  icon={Zap}
                  iconColor={statusColors[trigger.status]}
                  badge={<StatusBadge status={trigger.status} />}
                  expandable
                  defaultExpanded={false}
                >
                  <div className="space-y-3">
                    {/* Effectiveness */}
                    {trigger.effectivenessScore !== undefined && (
                      <EffectivenessBar
                        score={trigger.effectivenessScore}
                        label="Effectiveness"
                      />
                    )}

                    {/* Stats Grid */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 rounded bg-protocol-surface-light">
                        <p className="text-lg font-bold text-protocol-text">
                          {trigger.pairingCount}
                        </p>
                        <p className="text-[10px] text-protocol-text-muted">Pairings</p>
                      </div>
                      <div className="p-2 rounded bg-protocol-surface-light">
                        <p className="text-lg font-bold text-protocol-text">
                          {trigger.timesActivated}
                        </p>
                        <p className="text-[10px] text-protocol-text-muted">Activations</p>
                      </div>
                      <div className="p-2 rounded bg-protocol-surface-light">
                        <p className="text-sm font-bold text-protocol-text">
                          {trigger.triggerType}
                        </p>
                        <p className="text-[10px] text-protocol-text-muted">Type</p>
                      </div>
                    </div>

                    {/* Planted Date */}
                    <div className="flex justify-between text-xs">
                      <span className="text-protocol-text-muted">Planted</span>
                      <span className="text-protocol-text">
                        {new Date(trigger.plantedAt).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Activation Conditions */}
                    {trigger.activationConditions && (
                      <div className="text-xs">
                        <span className="text-protocol-text-muted">Conditions: </span>
                        <span className="text-protocol-text">{trigger.activationConditions}</span>
                      </div>
                    )}
                  </div>
                </DataCard>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
