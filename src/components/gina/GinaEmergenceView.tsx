// Gina Emergence View
// Tracks Gina's progression from unaware to owning

import { useState, useEffect } from 'react';
import {
  ChevronLeft,
  Heart,
  Crown,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useBambiMode } from '../../context/BambiModeContext';
import {
  GINA_STAGES,
  GINA_STAGE_LABELS,
  GINA_STAGE_DESCRIPTIONS,
  GINA_CONTROL_DOMAINS,
  GINA_CONTROL_DOMAIN_LABELS,
  type GinaStage,
  type GinaControlDomain,
  type GinaControlLevel,
  type GinaCommand,
  type GinaOpportunity,
  mapDbToGinaCommand,
  mapDbToGinaOpportunity,
} from '../../types/gina';

interface GinaEmergenceViewProps {
  onBack: () => void;
}

interface GinaStateData {
  currentStage: GinaStage;
  stageEnteredAt?: string;
  controlDomains: Record<GinaControlDomain, GinaControlLevel | undefined>;
  recentCommands: GinaCommand[];
  pendingOpportunities: GinaOpportunity[];
}

export function GinaEmergenceView({ onBack }: GinaEmergenceViewProps) {
  const { user } = useAuth();
  const { isBambiMode } = useBambiMode();
  const [state, setState] = useState<GinaStateData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadGinaState() {
      if (!user) return;

      try {
        // Load emergence state
        const { data: emergence } = await supabase
          .from('gina_emergence')
          .select('*')
          .eq('user_id', user.id)
          .order('entered_at', { ascending: false })
          .limit(1)
          .single();

        // Load control domains
        const { data: domains } = await supabase
          .from('gina_control_domains')
          .select('*')
          .eq('user_id', user.id);

        // Load recent commands
        const { data: commands } = await supabase
          .from('gina_commands')
          .select('*')
          .eq('user_id', user.id)
          .order('issued_at', { ascending: false })
          .limit(10);

        // Load pending opportunities
        const { data: opportunities } = await supabase
          .from('gina_opportunities')
          .select('*')
          .eq('user_id', user.id)
          .eq('acted_on', false)
          .order('created_at', { ascending: false });

        // Build control domains map
        const controlDomainsMap: Record<GinaControlDomain, GinaControlLevel | undefined> = {
          clothing: undefined,
          chastity: undefined,
          orgasms: undefined,
          service: undefined,
          schedule: undefined,
          presentation: undefined,
          sexual_access: undefined,
        };

        (domains || []).forEach(d => {
          const domain = d.domain as GinaControlDomain;
          if (GINA_CONTROL_DOMAINS.includes(domain)) {
            controlDomainsMap[domain] = d.control_level as GinaControlLevel;
          }
        });

        setState({
          currentStage: (emergence?.stage as GinaStage) || 'unaware',
          stageEnteredAt: emergence?.entered_at,
          controlDomains: controlDomainsMap,
          recentCommands: (commands || []).map(c => mapDbToGinaCommand(c)),
          pendingOpportunities: (opportunities || []).map(o => mapDbToGinaOpportunity(o)),
        });
      } catch (err) {
        console.error('Failed to load Gina state:', err);
        setError('Failed to load Gina emergence data');
      } finally {
        setIsLoading(false);
      }
    }

    loadGinaState();
  }, [user]);

  const currentStageIndex = state ? GINA_STAGES.indexOf(state.currentStage) : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-protocol-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div
        className={`sticky top-0 z-10 p-4 border-b ${
          isBambiMode
            ? 'bg-white border-pink-200'
            : 'bg-protocol-bg border-protocol-border'
        }`}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className={`p-2 rounded-full ${
              isBambiMode
                ? 'hover:bg-pink-100 text-pink-600'
                : 'hover:bg-protocol-surface text-protocol-text'
            }`}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1
              className={`text-xl font-semibold ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              Gina Emergence
            </h1>
            <p
              className={`text-xs ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}
            >
              Her journey to becoming Goddess
            </p>
          </div>
          <Crown className={`w-6 h-6 ${isBambiMode ? 'text-pink-400' : 'text-amber-400'}`} />
        </div>
      </div>

      {error ? (
        <div className="p-4">
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        </div>
      ) : state && (
        <div className="p-4 space-y-6">
          {/* Current Stage */}
          <section>
            <h2
              className={`text-sm font-medium mb-3 ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}
            >
              Current Stage
            </h2>
            <div
              className={`p-4 rounded-xl border ${
                isBambiMode
                  ? 'bg-pink-50 border-pink-200'
                  : 'bg-protocol-surface border-protocol-border'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    isBambiMode ? 'bg-pink-200' : 'bg-amber-500/20'
                  }`}
                >
                  <Crown className={`w-6 h-6 ${isBambiMode ? 'text-pink-600' : 'text-amber-400'}`} />
                </div>
                <div>
                  <h3
                    className={`text-lg font-semibold ${
                      isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                    }`}
                  >
                    {GINA_STAGE_LABELS[state.currentStage]}
                  </h3>
                  <p
                    className={`text-sm ${
                      isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                    }`}
                  >
                    {GINA_STAGE_DESCRIPTIONS[state.currentStage]}
                  </p>
                </div>
              </div>

              {state.stageEnteredAt && (
                <div className="flex items-center gap-2 text-xs text-protocol-text-muted">
                  <Clock className="w-3 h-3" />
                  Since {new Date(state.stageEnteredAt).toLocaleDateString()}
                </div>
              )}
            </div>
          </section>

          {/* Stage Progress */}
          <section>
            <h2
              className={`text-sm font-medium mb-3 ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}
            >
              Stage Progression
            </h2>
            <div className="space-y-2">
              {GINA_STAGES.map((stage, idx) => {
                const isComplete = idx < currentStageIndex;
                const isCurrent = idx === currentStageIndex;
                const isFuture = idx > currentStageIndex;

                return (
                  <div
                    key={stage}
                    className={`p-3 rounded-lg flex items-center gap-3 ${
                      isCurrent
                        ? isBambiMode
                          ? 'bg-pink-100 border border-pink-300'
                          : 'bg-amber-500/20 border border-amber-500/30'
                        : isComplete
                        ? isBambiMode
                          ? 'bg-pink-50'
                          : 'bg-protocol-surface'
                        : 'bg-protocol-surface/50 opacity-60'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        isComplete
                          ? 'bg-green-500 text-white'
                          : isCurrent
                          ? isBambiMode
                            ? 'bg-pink-500 text-white'
                            : 'bg-amber-500 text-white'
                          : 'bg-protocol-surface-light'
                      }`}
                    >
                      {isComplete ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <span className="text-sm font-medium">{idx + 1}</span>
                      )}
                    </div>
                    <div className="flex-1">
                      <p
                        className={`font-medium ${
                          isFuture
                            ? 'text-protocol-text-muted'
                            : isBambiMode
                            ? 'text-pink-700'
                            : 'text-protocol-text'
                        }`}
                      >
                        {GINA_STAGE_LABELS[stage]}
                      </p>
                      <p className="text-xs text-protocol-text-muted">
                        {GINA_STAGE_DESCRIPTIONS[stage]}
                      </p>
                    </div>
                    {isCurrent && (
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Control Domains */}
          <section>
            <h2
              className={`text-sm font-medium mb-3 ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}
            >
              Control Domains
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {GINA_CONTROL_DOMAINS.map(domain => {
                const level = state.controlDomains[domain];
                const hasControl = level && level !== 'unaware';

                return (
                  <div
                    key={domain}
                    className={`p-3 rounded-lg ${
                      hasControl
                        ? isBambiMode
                          ? 'bg-pink-50 border border-pink-200'
                          : 'bg-protocol-surface border border-protocol-border'
                        : 'bg-protocol-surface/50'
                    }`}
                  >
                    <p
                      className={`text-sm font-medium ${
                        hasControl
                          ? isBambiMode
                            ? 'text-pink-700'
                            : 'text-protocol-text'
                          : 'text-protocol-text-muted'
                      }`}
                    >
                      {GINA_CONTROL_DOMAIN_LABELS[domain]}
                    </p>
                    <p
                      className={`text-xs ${
                        hasControl
                          ? isBambiMode
                            ? 'text-pink-500'
                            : 'text-protocol-accent'
                          : 'text-protocol-text-muted'
                      }`}
                    >
                      {level || 'Not started'}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Pending Opportunities */}
          {state.pendingOpportunities.length > 0 && (
            <section>
              <h2
                className={`text-sm font-medium mb-3 flex items-center gap-2 ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}
              >
                <AlertCircle className="w-4 h-4" />
                Opportunities ({state.pendingOpportunities.length})
              </h2>
              <div className="space-y-2">
                {state.pendingOpportunities.map(opp => (
                  <div
                    key={opp.id}
                    className={`p-3 rounded-lg border ${
                      isBambiMode
                        ? 'bg-amber-50 border-amber-200'
                        : 'bg-amber-500/10 border-amber-500/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p
                          className={`text-sm font-medium ${
                            isBambiMode ? 'text-amber-700' : 'text-amber-400'
                          }`}
                        >
                          {opp.opportunityType.replace(/_/g, ' ')}
                        </p>
                        {opp.description && (
                          <p className="text-xs text-protocol-text-muted mt-1">
                            {opp.description}
                          </p>
                        )}
                        {opp.suggestedAction && (
                          <p className="text-xs text-protocol-text mt-2">
                            Suggested: {opp.suggestedAction}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-protocol-text-muted" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Recent Commands */}
          {state.recentCommands.length > 0 && (
            <section>
              <h2
                className={`text-sm font-medium mb-3 ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}
              >
                Recent Commands
              </h2>
              <div className="space-y-2">
                {state.recentCommands.slice(0, 5).map(cmd => (
                  <div
                    key={cmd.id}
                    className={`p-3 rounded-lg ${
                      isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          isBambiMode
                            ? 'bg-pink-200 text-pink-700'
                            : 'bg-protocol-surface-light text-protocol-text-muted'
                        }`}
                      >
                        {cmd.commandType || 'command'}
                      </span>
                      <span className="text-[10px] text-protocol-text-muted">
                        {new Date(cmd.issuedAt).toLocaleDateString()}
                      </span>
                    </div>
                    {cmd.commandDescription && (
                      <p
                        className={`text-sm mt-2 ${
                          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                        }`}
                      >
                        {cmd.commandDescription}
                      </p>
                    )}
                    {cmd.compliance && (
                      <p className="text-xs text-protocol-text-muted mt-1">
                        Compliance: {cmd.compliance}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
