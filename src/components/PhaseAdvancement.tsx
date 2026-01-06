import { useProtocol } from '../context/ProtocolContext';
import { checkPhaseStatus, getPhaseInfo, RequirementStatus } from '../lib/phases';
import { DOMAINS } from '../data/constants';
import {
  ChevronRight,
  Check,
  Flame,
  Calendar,
  Target,
  BookOpen,
  TrendingUp
} from 'lucide-react';

const requirementIcons: Record<string, React.ElementType> = {
  days: Calendar,
  streak: Flame,
  domain_level: TrendingUp,
  completion_rate: Target,
  journal_count: BookOpen
};

interface RequirementCardProps {
  status: RequirementStatus;
}

function RequirementCard({ status }: RequirementCardProps) {
  const Icon = requirementIcons[status.requirement.type] || Target;
  const isMet = status.met;

  // Get domain name if applicable
  let displayText = status.requirement.description;
  if (status.requirement.type === 'domain_level' && status.requirement.domain) {
    const domainInfo = DOMAINS.find(d => d.domain === status.requirement.domain);
    if (domainInfo) {
      displayText = `${domainInfo.label} level ${status.target}`;
    }
  }

  return (
    <div
      className={`p-4 rounded-lg border ${
        isMet
          ? 'bg-protocol-success/10 border-protocol-success/30'
          : 'bg-protocol-surface border-protocol-border'
      }`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className={`p-2 rounded-lg ${
            isMet ? 'bg-protocol-success/20' : 'bg-protocol-surface-light'
          }`}
        >
          {isMet ? (
            <Check className="w-4 h-4 text-protocol-success" />
          ) : (
            <Icon className="w-4 h-4 text-protocol-text-muted" />
          )}
        </div>
        <div className="flex-1">
          <p className={`text-sm font-medium ${isMet ? 'text-protocol-success' : 'text-protocol-text'}`}>
            {displayText}
          </p>
          <p className="text-xs text-protocol-text-muted">
            {status.current} / {status.target}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-protocol-surface-light rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isMet ? 'bg-protocol-success' : 'bg-protocol-accent'
          }`}
          style={{ width: `${status.progress}%` }}
        />
      </div>
    </div>
  );
}

export function PhaseAdvancement() {
  const { progress, history } = useProtocol();
  const phaseStatus = checkPhaseStatus(progress, history);
  const currentPhaseInfo = getPhaseInfo(progress.phase.currentPhase);
  const nextPhaseInfo = phaseStatus.nextPhase ? getPhaseInfo(phaseStatus.nextPhase) : null;

  return (
    <div className="space-y-6">
      {/* Current Phase */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs text-protocol-text-muted uppercase tracking-wider">
              Current Phase
            </p>
            <h3 className="text-2xl font-bold text-gradient">
              {currentPhaseInfo?.name || 'Foundation'}
            </h3>
          </div>
          <div className="text-4xl font-bold text-protocol-text-muted opacity-20">
            {progress.phase.currentPhase}
          </div>
        </div>
        <p className="text-sm text-protocol-text-muted">
          {currentPhaseInfo?.description}
        </p>
      </div>

      {/* Next Phase Requirements */}
      {nextPhaseInfo && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-lg font-medium text-protocol-text">
              Path to {nextPhaseInfo.name}
            </h4>
            <span className="text-sm text-protocol-text-muted">
              {Math.round(phaseStatus.progressPercent)}% complete
            </span>
          </div>

          {/* Overall progress */}
          <div className="h-3 bg-protocol-surface-light rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-protocol-accent to-protocol-accent-soft rounded-full transition-all duration-500"
              style={{ width: `${phaseStatus.progressPercent}%` }}
            />
          </div>

          {/* Individual requirements */}
          <div className="space-y-3">
            {phaseStatus.requirements.map((req, idx) => (
              <RequirementCard key={idx} status={req} />
            ))}
          </div>

          {/* Advancement ready */}
          {phaseStatus.canAdvance && (
            <div className="p-4 rounded-lg bg-protocol-success/10 border border-protocol-success/30">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-protocol-success/20">
                  <Check className="w-5 h-5 text-protocol-success" />
                </div>
                <div>
                  <p className="font-medium text-protocol-success">
                    Ready to advance!
                  </p>
                  <p className="text-xs text-protocol-text-muted">
                    You've met all requirements for {nextPhaseInfo.name}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Max phase reached */}
      {!nextPhaseInfo && (
        <div className="card p-6 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-protocol-accent/20 flex items-center justify-center">
            <TrendingUp className="w-8 h-8 text-protocol-accent" />
          </div>
          <h4 className="text-lg font-medium text-protocol-text mb-2">
            You've reached Embodiment
          </h4>
          <p className="text-sm text-protocol-text-muted">
            The final phase. Continue your practice and deepen your journey.
          </p>
        </div>
      )}

      {/* Phase timeline */}
      <div className="card p-4">
        <p className="text-xs text-protocol-text-muted uppercase tracking-wider mb-4">
          Your Journey
        </p>
        <div className="flex items-center justify-between">
          {[1, 2, 3, 4].map((phase) => {
            const info = getPhaseInfo(phase);
            const isCurrent = phase === progress.phase.currentPhase;
            const isPast = phase < progress.phase.currentPhase;

            return (
              <div key={phase} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                      isPast
                        ? 'bg-protocol-success text-white'
                        : isCurrent
                        ? 'bg-protocol-accent text-white ring-4 ring-protocol-accent/20'
                        : 'bg-protocol-surface-light text-protocol-text-muted'
                    }`}
                  >
                    {isPast ? <Check className="w-5 h-5" /> : phase}
                  </div>
                  <p className={`text-xs mt-2 ${isCurrent ? 'text-protocol-accent font-medium' : 'text-protocol-text-muted'}`}>
                    {info?.name}
                  </p>
                </div>
                {phase < 4 && (
                  <ChevronRight className={`w-4 h-4 mx-2 ${isPast ? 'text-protocol-success' : 'text-protocol-border'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
