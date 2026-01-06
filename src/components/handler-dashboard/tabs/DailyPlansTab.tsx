// Daily Plans Tab
// Displays today's handler plan and escalation strategies

import { Calendar, Clock, Target, AlertCircle } from 'lucide-react';
import type { HandlerDailyPlan, HandlerEscalationPlan } from '../../../types/handler';
import { DataCard, Stat } from '../shared/DataCard';
import { StatusBadge } from '../shared/StatusBadge';

interface DailyPlansTabProps {
  plan?: HandlerDailyPlan;
  escalationPlans: HandlerEscalationPlan[];
}

export function DailyPlansTab({ plan, escalationPlans }: DailyPlansTabProps) {
  return (
    <div className="space-y-6">
      {/* Today's Plan */}
      <section>
        <h3 className="text-sm font-medium text-protocol-text mb-3 flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Today's Plan
        </h3>

        {!plan ? (
          <div className="p-4 rounded-lg bg-protocol-surface border border-protocol-border text-center">
            <AlertCircle className="w-8 h-8 mx-auto text-protocol-text-muted mb-2" />
            <p className="text-sm text-protocol-text-muted">No plan generated for today</p>
            <p className="text-xs text-protocol-text-muted mt-1">
              Plans are generated automatically based on user patterns
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Plan Status */}
            <div className="p-3 rounded-lg bg-protocol-surface border border-protocol-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-protocol-text">
                  {plan.planDate}
                </span>
                <StatusBadge status={plan.executed ? 'completed' : 'pending'} />
              </div>
              <div className="text-xs text-protocol-text-muted">
                Created: {new Date(plan.createdAt).toLocaleString()}
              </div>
            </div>

            {/* Focus Areas */}
            {plan.focusAreas && plan.focusAreas.length > 0 && (
              <div className="p-3 rounded-lg bg-protocol-surface border border-protocol-border">
                <p className="text-xs text-protocol-text-muted mb-2">Focus Areas:</p>
                <div className="flex flex-wrap gap-1">
                  {plan.focusAreas.map((area, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 text-[10px] rounded-full bg-blue-500/20 text-blue-400"
                    >
                      {area}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Planned Interventions */}
            {plan.plannedInterventions && plan.plannedInterventions.length > 0 && (
              <DataCard
                title="Planned Interventions"
                subtitle={`${plan.plannedInterventions.length} scheduled`}
                icon={Clock}
                iconColor="#22c55e"
                expandable
                defaultExpanded
              >
                <div className="space-y-2">
                  {plan.plannedInterventions.map((intervention, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded bg-protocol-surface-light flex items-start gap-2"
                    >
                      <span className="text-xs text-protocol-text-muted whitespace-nowrap">
                        {intervention.time}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={intervention.type} size="sm" />
                          {intervention.priority > 7 && (
                            <StatusBadge status="high" size="sm" />
                          )}
                        </div>
                        <p className="text-xs text-protocol-text mt-1">
                          {intervention.content}
                        </p>
                        {intervention.targetDomain && (
                          <p className="text-[10px] text-protocol-text-muted mt-0.5">
                            Target: {intervention.targetDomain}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </DataCard>
            )}

            {/* Vulnerability Windows */}
            {plan.vulnerabilityWindows && plan.vulnerabilityWindows.length > 0 && (
              <DataCard
                title="Vulnerability Windows"
                subtitle="Optimal intervention times"
                icon={Target}
                iconColor="#ef4444"
                expandable
                defaultExpanded={false}
              >
                <div className="space-y-2">
                  {plan.vulnerabilityWindows.map((window, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded bg-red-500/10 border border-red-500/20"
                    >
                      <div className="flex justify-between text-xs">
                        <span className="text-red-400">
                          {window.start} - {window.end}
                        </span>
                        <span className="text-red-400/70">{window.type}</span>
                      </div>
                      <p className="text-[10px] text-protocol-text-muted mt-1">
                        {window.recommendation}
                      </p>
                    </div>
                  ))}
                </div>
              </DataCard>
            )}

            {/* Execution Notes */}
            {plan.executionNotes && (
              <div className="p-3 rounded-lg bg-protocol-surface border border-protocol-border">
                <p className="text-xs text-protocol-text-muted mb-1">Execution Notes:</p>
                <p className="text-sm text-protocol-text">{plan.executionNotes}</p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Escalation Plans */}
      <section>
        <h3 className="text-sm font-medium text-protocol-text mb-3 flex items-center gap-2">
          <Target className="w-4 h-4" />
          Escalation Plans
        </h3>

        {escalationPlans.length === 0 ? (
          <div className="p-4 rounded-lg bg-protocol-surface border border-protocol-border text-center">
            <p className="text-sm text-protocol-text-muted">No active escalation plans</p>
          </div>
        ) : (
          <div className="space-y-2">
            {escalationPlans.map(plan => (
              <DataCard
                key={plan.id}
                title={plan.domain.replace(/_/g, ' ')}
                subtitle={plan.strategy || 'Auto-escalate'}
                icon={Target}
                iconColor="#f59e0b"
                badge={<StatusBadge status={plan.active ? 'active' : 'inactive'} />}
                expandable
                defaultExpanded={false}
              >
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-protocol-text-muted">Current Edge:</span>
                      <p className="text-protocol-text">{plan.currentEdge || 'None'}</p>
                    </div>
                    <div>
                      <span className="text-protocol-text-muted">Next Target:</span>
                      <p className="text-protocol-text">{plan.nextTarget || 'Auto'}</p>
                    </div>
                  </div>
                  {plan.estimatedTimeline && (
                    <div className="text-xs">
                      <span className="text-protocol-text-muted">Timeline: </span>
                      <span className="text-protocol-text">{plan.estimatedTimeline}</span>
                    </div>
                  )}
                </div>
              </DataCard>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
