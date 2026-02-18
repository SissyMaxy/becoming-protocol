/**
 * Gina Pipeline View
 *
 * Dashboard for tracking Gina's conversion and mommy dom development.
 * Shows: stance, mommy dom progress, active missions, behavioral directives.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  Heart,
  Crown,
  Target,
  MessageCircle,
  Sparkles,
  CheckCircle,
  Plus,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  Upload,
  BarChart3,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBambiMode } from '../../context/BambiModeContext';
import {
  getGinaConversionState,
  initializeGinaConversionState,
  getPendingGinaMissions,
  getActiveBehavioralDirectives,
  type GinaConversionState,
  type GinaMission,
  type BehavioralDirective,
  type GinaStance,
} from '../../lib/gina-pipeline';
import { GinaMissionCard, BehavioralDirectiveCard } from '../handler/GinaMissionCard';
import { GinaInteractionLogger } from './GinaInteractionLogger';
import { GinaContentImport } from './GinaContentImport';
import { GinaAnalyticsDashboard } from './GinaAnalyticsDashboard';

interface GinaPipelineViewProps {
  onBack: () => void;
}

// Stance progression labels
const STANCE_CONFIG: Record<GinaStance, { label: string; color: string; description: string }> = {
  unaware: { label: 'Unaware', color: 'bg-gray-500', description: 'Doesn\'t know the depth' },
  suspicious: { label: 'Suspicious', color: 'bg-yellow-500', description: 'Senses something' },
  tolerating: { label: 'Tolerating', color: 'bg-blue-500', description: 'Allows but doesn\'t engage' },
  curious: { label: 'Curious', color: 'bg-cyan-500', description: 'Showing interest' },
  participating: { label: 'Participating', color: 'bg-green-500', description: 'Actively joining' },
  enjoying: { label: 'Enjoying', color: 'bg-emerald-500', description: 'Getting pleasure from it' },
  encouraging: { label: 'Encouraging', color: 'bg-purple-500', description: 'Pushing you further' },
  directing: { label: 'Directing', color: 'bg-pink-500', description: 'Taking control' },
  invested: { label: 'Invested', color: 'bg-rose-500', description: 'Part of her identity' },
  dependent: { label: 'Dependent', color: 'bg-red-500', description: 'Needs this dynamic' },
};

const STANCE_ORDER: GinaStance[] = [
  'unaware', 'suspicious', 'tolerating', 'curious',
  'participating', 'enjoying', 'encouraging', 'directing',
  'invested', 'dependent'
];

export function GinaPipelineView({ onBack }: GinaPipelineViewProps) {
  const { user } = useAuth();
  const { isBambiMode } = useBambiMode();

  const [state, setState] = useState<GinaConversionState | null>(null);
  const [missions, setMissions] = useState<GinaMission[]>([]);
  const [directives, setDirectives] = useState<BehavioralDirective[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showLogger, setShowLogger] = useState(false);
  const [showContentImport, setShowContentImport] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>('mommy');

  const loadData = useCallback(async () => {
    if (!user) return;

    try {
      let conversionState = await getGinaConversionState(user.id);

      // Initialize state if it doesn't exist
      if (!conversionState) {
        console.log('Initializing Gina conversion state...');
        conversionState = await initializeGinaConversionState(user.id);
      }

      const [pendingMissions, activeDirectives] = await Promise.all([
        getPendingGinaMissions(user.id),
        getActiveBehavioralDirectives(user.id),
      ]);

      setState(conversionState);
      setMissions(pendingMissions);
      setDirectives(activeDirectives);
    } catch (err) {
      console.error('Failed to load Gina pipeline data:', err);
      // Still show UI with default state if DB fails
      setState({
        userId: user.id,
        currentStance: 'unaware',
        stanceConfidence: 50,
        traits: {
          isPassive: true,
          lovesStructure: true,
          needsFraming: true,
          avoidsConflict: true,
          isNaive: true,
          isOblivious: true,
          needsWarmUp: true,
          prefersMinimalEffort: true,
          inOwnWorld: true,
          structureAsControl: true,
          routineAsAuthority: true,
          passivityAsAcceptance: true,
          obliviousnessAsEscalation: true,
          effortlessAuthority: true,
          warmUpThenDefault: true,
          preferredFramings: [],
          effectiveTiming: [],
          triggersResistance: [],
        },
        primaryMotivator: 'structure',
        secondaryMotivators: ['organization'],
        motivatorEvidence: {} as Record<string, string[]>,
        domainProgress: {
          clothing: { level: 0, locked: false },
          chastity: { level: 0, locked: false },
          orgasms: { level: 0, locked: false },
          service: { level: 0, locked: false },
          schedule: { level: 0, locked: false },
          presentation: { level: 0, locked: false },
          sexual_access: { level: 0, locked: false },
        },
        establishedRoutines: [],
        milestones: [],
        currentStrategy: 'structure_exploitation',
        strategyStartedAt: new Date().toISOString(),
        strategyEffectiveness: 0,
        escalationPressure: 60,
        daysSinceLastAdvance: 0,
        consecutiveSuccesses: 0,
        barriers: [],
        developmentTarget: 'soft_mommy_dom',
        mommyDomDevelopment: {
          comfortWithAuthority: 0,
          enjoysPraising: 0,
          displeasureAsControl: 0,
          nurturingAuthority: 0,
          responsibleForYou: 0,
          expectsObedience: 0,
          innocentCruelty: 0,
          casualDominance: 0,
          investedInTraining: 0,
          givesGoodGirlPraise: false,
          setsRulesForYourGood: false,
          expectsGratitude: false,
          comfortsAfterCorrection: false,
          decidesWithoutAsking: false,
        },
        developedBehaviors: [],
        adoptedLanguage: [],
        updatedAt: new Date().toISOString(),
      });
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleMissionComplete = async (
    missionId: string,
    outcome: 'success' | 'partial' | 'rejected' | 'deferred',
    response?: string
  ) => {
    // Import and call the complete function
    const { completeGinaMission, updateMommyDomFromMission } = await import('../../lib/gina-pipeline');
    await completeGinaMission(missionId, outcome, response);

    // Update mommy dom scores if applicable
    if (user && (outcome === 'success' || outcome === 'partial')) {
      const mission = missions.find(m => m.id === missionId);
      if (mission) {
        await updateMommyDomFromMission(user.id, mission, outcome);
      }
    }

    // Refresh data
    loadData();
  };

  const currentStanceIndex = state ? STANCE_ORDER.indexOf(state.currentStance) : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
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
              Gina Pipeline
            </h1>
            <p
              className={`text-xs ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}
            >
              Developing her into your soft mommy dom
            </p>
          </div>
          <button
            onClick={loadData}
            className={`p-2 rounded-full ${
              isBambiMode
                ? 'hover:bg-pink-100 text-pink-600'
                : 'hover:bg-protocol-surface text-protocol-text-muted'
            }`}
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {state && (
        <div className="p-4 space-y-6">
          {/* Current Stance */}
          <section>
            <h2
              className={`text-sm font-medium mb-3 flex items-center gap-2 ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}
            >
              <Crown className="w-4 h-4" />
              Conversion Stance
            </h2>
            <div
              className={`p-4 rounded-xl border ${
                isBambiMode
                  ? 'bg-pink-50 border-pink-200'
                  : 'bg-protocol-surface border-protocol-border'
              }`}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-3 h-3 rounded-full ${STANCE_CONFIG[state.currentStance].color}`} />
                <div>
                  <span className={`text-lg font-semibold ${
                    isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                  }`}>
                    {STANCE_CONFIG[state.currentStance].label}
                  </span>
                  <span className={`text-sm ml-2 ${
                    isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                  }`}>
                    ({state.stanceConfidence}% confident)
                  </span>
                </div>
              </div>

              {/* Stance progress bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-protocol-text-muted">
                  <span>Unaware</span>
                  <span>Dependent</span>
                </div>
                <div className="h-2 bg-protocol-bg rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${STANCE_CONFIG[state.currentStance].color}`}
                    style={{ width: `${((currentStanceIndex + 1) / STANCE_ORDER.length) * 100}%` }}
                  />
                </div>
                <p className={`text-xs ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
                  {STANCE_CONFIG[state.currentStance].description}
                </p>
              </div>

              {/* Pressure indicator */}
              <div className="mt-4 pt-4 border-t border-white/10">
                <div className="flex items-center justify-between text-sm">
                  <span className={isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'}>
                    Escalation Pressure
                  </span>
                  <span className={`font-medium ${
                    state.escalationPressure >= 70 ? 'text-red-400' :
                    state.escalationPressure >= 50 ? 'text-amber-400' : 'text-green-400'
                  }`}>
                    {state.escalationPressure}%
                  </span>
                </div>
                {state.daysSinceLastAdvance > 0 && (
                  <p className="text-xs text-protocol-text-muted mt-1">
                    {state.daysSinceLastAdvance} days since last advance
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Mommy Dom Development */}
          <section>
            <button
              onClick={() => setExpandedSection(expandedSection === 'mommy' ? null : 'mommy')}
              className="w-full"
            >
              <h2
                className={`text-sm font-medium mb-3 flex items-center gap-2 ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}
              >
                <Heart className="w-4 h-4" />
                Mommy Dom Development
                {expandedSection === 'mommy' ? (
                  <ChevronUp className="w-4 h-4 ml-auto" />
                ) : (
                  <ChevronDown className="w-4 h-4 ml-auto" />
                )}
              </h2>
            </button>

            {expandedSection === 'mommy' && state.mommyDomDevelopment && (
              <div
                className={`p-4 rounded-xl border ${
                  isBambiMode
                    ? 'bg-pink-50 border-pink-200'
                    : 'bg-protocol-surface border-protocol-border'
                }`}
              >
                <div className="space-y-4">
                  {/* Foundation Traits */}
                  <div>
                    <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${
                      isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                    }`}>
                      Foundation
                    </h3>
                    <div className="space-y-2">
                      <TraitBar
                        label="Comfort with Authority"
                        value={state.mommyDomDevelopment.comfortWithAuthority}
                        isBambiMode={isBambiMode}
                      />
                      <TraitBar
                        label="Enjoys Praising"
                        value={state.mommyDomDevelopment.enjoysPraising}
                        isBambiMode={isBambiMode}
                      />
                      <TraitBar
                        label="Uses Disappointment"
                        value={state.mommyDomDevelopment.displeasureAsControl}
                        isBambiMode={isBambiMode}
                      />
                    </div>
                  </div>

                  {/* Core Traits */}
                  <div>
                    <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${
                      isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                    }`}>
                      Core Mommy Energy
                    </h3>
                    <div className="space-y-2">
                      <TraitBar
                        label="Nurturing Authority"
                        value={state.mommyDomDevelopment.nurturingAuthority}
                        isBambiMode={isBambiMode}
                      />
                      <TraitBar
                        label="Responsible for You"
                        value={state.mommyDomDevelopment.responsibleForYou}
                        isBambiMode={isBambiMode}
                      />
                      <TraitBar
                        label="Expects Obedience"
                        value={state.mommyDomDevelopment.expectsObedience}
                        isBambiMode={isBambiMode}
                      />
                    </div>
                  </div>

                  {/* Advanced Traits */}
                  <div>
                    <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${
                      isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                    }`}>
                      Advanced
                    </h3>
                    <div className="space-y-2">
                      <TraitBar
                        label="Casual Dominance"
                        value={state.mommyDomDevelopment.casualDominance}
                        isBambiMode={isBambiMode}
                      />
                      <TraitBar
                        label="Invested in Training"
                        value={state.mommyDomDevelopment.investedInTraining}
                        isBambiMode={isBambiMode}
                      />
                      <TraitBar
                        label="Innocent Cruelty"
                        value={state.mommyDomDevelopment.innocentCruelty}
                        isBambiMode={isBambiMode}
                      />
                    </div>
                  </div>

                  {/* Developed Behaviors */}
                  <div>
                    <h3 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${
                      isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                    }`}>
                      Behaviors Developed
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      <BehaviorBadge
                        label="Gives 'Good Girl' Praise"
                        active={state.mommyDomDevelopment.givesGoodGirlPraise}
                        isBambiMode={isBambiMode}
                      />
                      <BehaviorBadge
                        label="Sets Rules 'For Your Good'"
                        active={state.mommyDomDevelopment.setsRulesForYourGood}
                        isBambiMode={isBambiMode}
                      />
                      <BehaviorBadge
                        label="Expects Gratitude"
                        active={state.mommyDomDevelopment.expectsGratitude}
                        isBambiMode={isBambiMode}
                      />
                      <BehaviorBadge
                        label="Comforts After Correction"
                        active={state.mommyDomDevelopment.comfortsAfterCorrection}
                        isBambiMode={isBambiMode}
                      />
                      <BehaviorBadge
                        label="Decides Without Asking"
                        active={state.mommyDomDevelopment.decidesWithoutAsking}
                        isBambiMode={isBambiMode}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Active Missions */}
          <section>
            <button
              onClick={() => setExpandedSection(expandedSection === 'missions' ? null : 'missions')}
              className="w-full"
            >
              <h2
                className={`text-sm font-medium mb-3 flex items-center gap-2 ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}
              >
                <Target className="w-4 h-4" />
                Active Missions ({missions.length})
                {expandedSection === 'missions' ? (
                  <ChevronUp className="w-4 h-4 ml-auto" />
                ) : (
                  <ChevronDown className="w-4 h-4 ml-auto" />
                )}
              </h2>
            </button>

            {expandedSection === 'missions' && (
              <div className="space-y-3">
                {missions.length === 0 ? (
                  <p className={`text-sm text-center py-4 ${
                    isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                  }`}>
                    No active missions. Handler will assign more.
                  </p>
                ) : (
                  missions.map(mission => (
                    <GinaMissionCard
                      key={mission.id}
                      mission={mission}
                      onComplete={(outcome, response) =>
                        handleMissionComplete(mission.id, outcome, response)
                      }
                    />
                  ))
                )}
              </div>
            )}
          </section>

          {/* Behavioral Directives */}
          <section>
            <button
              onClick={() => setExpandedSection(expandedSection === 'directives' ? null : 'directives')}
              className="w-full"
            >
              <h2
                className={`text-sm font-medium mb-3 flex items-center gap-2 ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                Active Directives ({directives.length})
                {expandedSection === 'directives' ? (
                  <ChevronUp className="w-4 h-4 ml-auto" />
                ) : (
                  <ChevronDown className="w-4 h-4 ml-auto" />
                )}
              </h2>
            </button>

            {expandedSection === 'directives' && (
              <div className="space-y-2">
                {directives.length === 0 ? (
                  <p className={`text-sm text-center py-4 ${
                    isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                  }`}>
                    No active directives.
                  </p>
                ) : (
                  directives.map(directive => (
                    <BehavioralDirectiveCard key={directive.id} directive={directive} />
                  ))
                )}
              </div>
            )}
          </section>

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={() => setShowLogger(true)}
              className={`w-full py-4 rounded-xl font-medium flex items-center justify-center gap-2 ${
                isBambiMode
                  ? 'bg-pink-500 text-white hover:bg-pink-600'
                  : 'bg-protocol-accent text-white hover:bg-protocol-accent-bright'
              }`}
            >
              <Plus className="w-5 h-5" />
              Log Gina Interaction
            </button>

            <button
              onClick={() => setShowContentImport(true)}
              className={`w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 ${
                isBambiMode
                  ? 'bg-pink-100 text-pink-700 hover:bg-pink-200 border border-pink-200'
                  : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface/80 border border-protocol-border'
              }`}
            >
              <Upload className="w-5 h-5" />
              Import / Export Content
            </button>

            <button
              onClick={() => setShowAnalytics(true)}
              className={`w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 ${
                isBambiMode
                  ? 'bg-pink-100 text-pink-700 hover:bg-pink-200 border border-pink-200'
                  : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface/80 border border-protocol-border'
              }`}
            >
              <BarChart3 className="w-5 h-5" />
              Analytics & Recommendations
            </button>
          </div>

          {/* Adopted Language */}
          {state.adoptedLanguage && state.adoptedLanguage.length > 0 && (
            <section>
              <h2
                className={`text-sm font-medium mb-3 flex items-center gap-2 ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}
              >
                <MessageCircle className="w-4 h-4" />
                Mommy Phrases She Uses
              </h2>
              <div className="space-y-2">
                {state.adoptedLanguage.map((lang, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg ${
                      isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
                    }`}
                  >
                    <p className={`text-sm italic ${
                      isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                    }`}>
                      "{lang.phrase}"
                    </p>
                    <p className="text-xs text-protocol-text-muted mt-1">
                      {lang.context} • {lang.frequency}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Interaction Logger Modal */}
      {showLogger && (
        <GinaInteractionLogger
          onClose={() => setShowLogger(false)}
          onLogged={() => {
            setShowLogger(false);
            loadData();
          }}
        />
      )}

      {/* Content Import Modal */}
      {showContentImport && (
        <GinaContentImport
          onClose={() => setShowContentImport(false)}
          onImported={() => {
            setShowContentImport(false);
            loadData();
          }}
        />
      )}

      {/* Analytics Dashboard Modal */}
      {showAnalytics && (
        <GinaAnalyticsDashboard
          onClose={() => setShowAnalytics(false)}
        />
      )}
    </div>
  );
}

// Helper Components

function TraitBar({ label, value, isBambiMode }: { label: string; value: number; isBambiMode: boolean }) {
  const getColor = (v: number) => {
    if (v >= 70) return 'bg-green-500';
    if (v >= 40) return 'bg-amber-500';
    if (v >= 20) return 'bg-blue-500';
    return 'bg-gray-500';
  };

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className={isBambiMode ? 'text-pink-600' : 'text-protocol-text'}>{label}</span>
        <span className="text-protocol-text-muted">{value}%</span>
      </div>
      <div className="h-2 bg-protocol-bg rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${getColor(value)}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function BehaviorBadge({ label, active, isBambiMode }: { label: string; active: boolean; isBambiMode: boolean }) {
  return (
    <span
      className={`text-xs px-2 py-1 rounded-full ${
        active
          ? isBambiMode
            ? 'bg-pink-200 text-pink-700'
            : 'bg-green-500/20 text-green-400'
          : 'bg-protocol-surface text-protocol-text-muted opacity-50'
      }`}
    >
      {active && <CheckCircle className="w-3 h-3 inline mr-1" />}
      {label}
    </span>
  );
}
