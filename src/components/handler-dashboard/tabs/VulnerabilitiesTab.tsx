// Vulnerabilities Tab
// Displays learned vulnerabilities and exploitation strategies

import { Target, AlertTriangle } from 'lucide-react';
import type { LearnedVulnerability } from '../../../types/handler';
import { DataCard } from '../shared/DataCard';
import { EffectivenessBar } from '../shared/EffectivenessBar';

interface VulnerabilitiesTabProps {
  vulnerabilities: LearnedVulnerability[];
}

export function VulnerabilitiesTab({ vulnerabilities }: VulnerabilitiesTabProps) {
  if (vulnerabilities.length === 0) {
    return (
      <div className="text-center py-12">
        <Target className="w-12 h-12 mx-auto text-protocol-text-muted mb-3" />
        <p className="text-protocol-text-muted">No vulnerabilities discovered</p>
        <p className="text-xs text-protocol-text-muted mt-1">
          Handler learns vulnerabilities through behavior analysis
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Warning */}
      <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
        <p className="text-xs text-amber-400">
          Vulnerabilities are exploited during high-arousal states for maximum effectiveness.
        </p>
      </div>

      {vulnerabilities.map(vuln => (
        <DataCard
          key={vuln.id}
          title={vuln.vulnerabilityType.replace(/_/g, ' ')}
          subtitle={`Discovered ${new Date(vuln.discoveryDate).toLocaleDateString()}`}
          icon={Target}
          iconColor="#ef4444"
          expandable
          defaultExpanded={false}
        >
          <div className="space-y-3">
            {/* Success Rate */}
            {vuln.successRate !== undefined && (
              <EffectivenessBar
                score={vuln.successRate}
                label="Exploitation Success Rate"
              />
            )}

            {/* Evidence */}
            {vuln.evidence && (
              <div>
                <p className="text-xs text-protocol-text-muted mb-1">Evidence:</p>
                <p className="text-sm text-protocol-text p-2 rounded bg-protocol-surface-light">
                  {vuln.evidence}
                </p>
              </div>
            )}

            {/* Exploitation Strategies */}
            {vuln.exploitationStrategies && vuln.exploitationStrategies.length > 0 && (
              <div>
                <p className="text-xs text-protocol-text-muted mb-1">
                  Exploitation Strategies ({vuln.exploitationStrategies.length}):
                </p>
                <div className="flex flex-wrap gap-1">
                  {vuln.exploitationStrategies.map((strategy, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 text-[10px] rounded-full bg-red-500/20 text-red-400"
                    >
                      {strategy}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Conditions */}
            {vuln.conditions && Object.keys(vuln.conditions).length > 0 && (
              <div>
                <p className="text-xs text-protocol-text-muted mb-1">Conditions:</p>
                <div className="p-2 rounded bg-protocol-surface-light">
                  <pre className="text-[10px] text-protocol-text overflow-x-auto">
                    {JSON.stringify(vuln.conditions, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {/* Notes */}
            {vuln.notes && (
              <div className="text-xs text-protocol-text-muted italic">
                {vuln.notes}
              </div>
            )}
          </div>
        </DataCard>
      ))}
    </div>
  );
}
