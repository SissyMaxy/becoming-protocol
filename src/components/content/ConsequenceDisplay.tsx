// ============================================
// Consequence Display
// Shows current tier, warnings, escalation timeline
// ============================================

import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Shield,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  CheckCircle2,
  Flame,
  Upload,
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import {
  getOrCreateConsequenceState,
  getRecentConsequenceEvents,
  CONSEQUENCE_TIERS,
  calculateDaysNoncompliant,
} from '../../lib/content/consequence-engine';
import type { ConsequenceState, ConsequenceEventType } from '../../types/vault';

interface ConsequenceDisplayProps {
  compact?: boolean;
  onRecordCompliance?: () => void;
}

export function ConsequenceDisplay({ compact = false, onRecordCompliance }: ConsequenceDisplayProps) {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();

  const [state, setState] = useState<ConsequenceState | null>(null);
  const [events, setEvents] = useState<Array<{
    id: string;
    tier: number;
    eventType: ConsequenceEventType;
    description?: string;
    handlerMessage?: string;
    createdAt: string;
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!user) return;

    async function load() {
      try {
        const [consequenceState, recentEvents] = await Promise.all([
          getOrCreateConsequenceState(user!.id),
          getRecentConsequenceEvents(user!.id, 10),
        ]);
        setState(consequenceState);
        setEvents(recentEvents);
      } catch (err) {
        console.error('Failed to load consequence state:', err);
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, [user]);

  if (isLoading) {
    return compact ? null : (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-protocol-text-muted" />
      </div>
    );
  }

  if (!state) return null;

  const tier = state.currentTier;
  const tierConfig = CONSEQUENCE_TIERS[tier];
  const daysActual = calculateDaysNoncompliant(state.lastComplianceAt);

  // Tier 0 = compliant — show minimal or nothing
  if (tier === 0 && compact) return null;

  if (tier === 0) {
    return (
      <div className={`p-3 rounded-xl border ${
        isBambiMode ? 'bg-green-50 border-green-200' : 'bg-green-500/5 border-green-500/20'
      }`}>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-400" />
          <span className="text-sm text-green-400 font-medium">Compliant</span>
          {state.lastComplianceAt && (
            <span className="text-xs text-protocol-text-muted ml-auto">
              Last: {formatRelativeTime(state.lastComplianceAt)}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Noncompliant — show consequence tier
  const urgencyColor = tier <= 2 ? 'yellow' : tier <= 4 ? 'orange' : 'red';
  const colorMap = {
    yellow: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-400', icon: 'text-yellow-400' },
    orange: { bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400', icon: 'text-orange-400' },
    red: { bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400', icon: 'text-red-400' },
  };
  const colors = colorMap[urgencyColor];

  // Compact mode: just show tier badge
  if (compact) {
    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${colors.bg} ${colors.border} border`}>
        <ShieldAlert className={`w-3.5 h-3.5 ${colors.icon}`} />
        <span className={`text-xs font-medium ${colors.text}`}>
          Tier {tier}
        </span>
        <span className="text-xs text-protocol-text-muted">
          {daysActual}d
        </span>
      </div>
    );
  }

  // Full display
  return (
    <div className={`rounded-xl border ${colors.bg} ${colors.border}`}>
      {/* Header */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className={`w-5 h-5 ${colors.icon}`} />
            <span className={`text-sm font-semibold ${colors.text}`}>
              Consequence Tier {tier}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-protocol-text-muted" />
            <span className="text-xs text-protocol-text-muted">
              {daysActual} day{daysActual !== 1 ? 's' : ''} noncompliant
            </span>
          </div>
        </div>

        {/* Consequence description */}
        <p className="text-sm text-protocol-text-muted mb-3">
          {tierConfig.consequence}
        </p>

        {/* Tier progression bar */}
        <div className="mb-3">
          <div className="flex gap-0.5">
            {CONSEQUENCE_TIERS.slice(1).map((t) => (
              <div
                key={t.tier}
                className={`h-1.5 flex-1 rounded-full transition-all ${
                  t.tier <= tier
                    ? t.tier <= 2 ? 'bg-yellow-400' : t.tier <= 4 ? 'bg-orange-400' : 'bg-red-400'
                    : 'bg-protocol-surface-light'
                }`}
              />
            ))}
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-protocol-text-muted">Warning</span>
            <span className="text-[10px] text-protocol-text-muted">Vault posts</span>
            <span className="text-[10px] text-protocol-text-muted">Full access</span>
          </div>
        </div>

        {/* Next escalation warning */}
        {tier < 9 && (
          <div className={`p-2 rounded-lg ${
            isBambiMode ? 'bg-white/50' : 'bg-black/20'
          }`}>
            <div className="flex items-center gap-1.5">
              <Flame className="w-3 h-3 text-protocol-text-muted" />
              <span className="text-xs text-protocol-text-muted">
                Next escalation: Tier {tier + 1} at {CONSEQUENCE_TIERS[tier + 1].daysRequired} days
                {tierConfig.postsContent ? '' : CONSEQUENCE_TIERS[tier + 1].postsContent ? ' — content starts posting' : ''}
              </span>
            </div>
          </div>
        )}

        {/* Content posting warning for tiers 5+ */}
        {tier >= 5 && (
          <div className="mt-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <div className="flex items-center gap-1.5">
              <Upload className="w-3 h-3 text-red-400" />
              <span className="text-xs text-red-400 font-medium">
                Handler is posting vault content ({tierConfig.vaultTierToPost} tier, vuln ≤{tierConfig.maxVulnerability})
              </span>
            </div>
          </div>
        )}

        {/* Compliance CTA */}
        <div className="mt-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <p className="text-xs text-green-400 mb-2">
            Any ONE action resets to Tier 0: complete a task, check in, submit content, voice check-in, respond to Handler.
          </p>
          {onRecordCompliance && (
            <button
              onClick={onRecordCompliance}
              className="w-full py-2 rounded-lg bg-green-500/20 text-green-400 text-xs font-medium hover:bg-green-500/30 transition-colors"
            >
              I'm here — check in
            </button>
          )}
        </div>
      </div>

      {/* History toggle */}
      {events.length > 0 && (
        <div className="border-t border-inherit">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full p-3 flex items-center justify-between text-xs text-protocol-text-muted hover:bg-black/5"
          >
            <span>Escalation History ({events.length})</span>
            {showHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showHistory && (
            <div className="px-4 pb-3 space-y-2">
              {events.map(event => (
                <div key={event.id} className="flex items-start gap-2">
                  <EventIcon eventType={event.eventType} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-protocol-text">
                        Tier {event.tier}
                      </span>
                      <span className="text-[10px] text-protocol-text-muted">
                        {formatRelativeTime(event.createdAt)}
                      </span>
                    </div>
                    {event.handlerMessage && (
                      <p className="text-xs text-protocol-text-muted italic mt-0.5 truncate">
                        "{event.handlerMessage}"
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Helpers
// ============================================

function EventIcon({ eventType }: { eventType: ConsequenceEventType }) {
  switch (eventType) {
    case 'warning':
      return <AlertTriangle className="w-3 h-3 mt-0.5 text-yellow-400 flex-shrink-0" />;
    case 'escalation':
      return <ShieldAlert className="w-3 h-3 mt-0.5 text-red-400 flex-shrink-0" />;
    case 'content_posted':
      return <Upload className="w-3 h-3 mt-0.5 text-red-400 flex-shrink-0" />;
    case 'deescalation':
      return <Shield className="w-3 h-3 mt-0.5 text-green-400 flex-shrink-0" />;
    case 'compliance_reset':
      return <CheckCircle2 className="w-3 h-3 mt-0.5 text-green-400 flex-shrink-0" />;
    default:
      return <Clock className="w-3 h-3 mt-0.5 text-protocol-text-muted flex-shrink-0" />;
  }
}

function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
