// Influence History Tab
// Displays timeline of influence attempts and their outcomes

import { History, CheckCircle, XCircle, Clock } from 'lucide-react';
import type { InfluenceAttempt } from '../../../types/handler';
import { StatusBadge } from '../shared/StatusBadge';

interface InfluenceHistoryTabProps {
  attempts: InfluenceAttempt[];
}

export function InfluenceHistoryTab({ attempts }: InfluenceHistoryTabProps) {
  if (attempts.length === 0) {
    return (
      <div className="text-center py-12">
        <History className="w-12 h-12 mx-auto text-protocol-text-muted mb-3" />
        <p className="text-protocol-text-muted">No influence attempts recorded</p>
        <p className="text-xs text-protocol-text-muted mt-1">
          Handler interventions will appear here
        </p>
      </div>
    );
  }

  // Calculate stats
  const successCount = attempts.filter(a => a.success === true).length;
  const failureCount = attempts.filter(a => a.success === false).length;
  const pendingCount = attempts.filter(a => a.success === undefined).length;

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
          <CheckCircle className="w-5 h-5 mx-auto text-green-400 mb-1" />
          <p className="text-lg font-bold text-green-400">{successCount}</p>
          <p className="text-[10px] text-green-400/70">Successful</p>
        </div>
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-center">
          <XCircle className="w-5 h-5 mx-auto text-red-400 mb-1" />
          <p className="text-lg font-bold text-red-400">{failureCount}</p>
          <p className="text-[10px] text-red-400/70">Failed</p>
        </div>
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-center">
          <Clock className="w-5 h-5 mx-auto text-amber-400 mb-1" />
          <p className="text-lg font-bold text-amber-400">{pendingCount}</p>
          <p className="text-[10px] text-amber-400/70">Pending</p>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-2">
        {attempts.map((attempt, idx) => {
          const isSuccess = attempt.success === true;
          const isFailed = attempt.success === false;
          const isPending = attempt.success === undefined;

          return (
            <div
              key={attempt.id}
              className="p-3 rounded-lg bg-protocol-surface border border-protocol-border"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  {isSuccess && <CheckCircle className="w-4 h-4 text-green-400" />}
                  {isFailed && <XCircle className="w-4 h-4 text-red-400" />}
                  {isPending && <Clock className="w-4 h-4 text-amber-400" />}
                  <span className="text-sm font-medium text-protocol-text">
                    {attempt.attemptType.replace(/_/g, ' ')}
                  </span>
                </div>
                <StatusBadge
                  status={isSuccess ? 'success' : isFailed ? 'failure' : 'pending'}
                />
              </div>

              {/* Details */}
              <div className="space-y-1 text-xs">
                {attempt.method && (
                  <div className="flex justify-between">
                    <span className="text-protocol-text-muted">Method:</span>
                    <span className="text-protocol-text">{attempt.method}</span>
                  </div>
                )}
                {attempt.targetBehavior && (
                  <div className="flex justify-between">
                    <span className="text-protocol-text-muted">Target:</span>
                    <span className="text-protocol-text">{attempt.targetBehavior}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-protocol-text-muted">Time:</span>
                  <span className="text-protocol-text">
                    {new Date(attempt.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-protocol-text-muted">User Aware:</span>
                  <span className="text-protocol-text">
                    {attempt.userAware ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>

              {/* Response */}
              {attempt.userResponse && (
                <div className="mt-2 p-2 rounded bg-protocol-surface-light">
                  <p className="text-[10px] text-protocol-text-muted mb-1">Response:</p>
                  <p className="text-xs text-protocol-text">{attempt.userResponse}</p>
                </div>
              )}

              {/* Notes */}
              {attempt.notes && (
                <p className="mt-2 text-[10px] text-protocol-text-muted italic">
                  {attempt.notes}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
