// Service Progression View
// Tracks progression through sexual service stages with encounter logging

import { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  Users,
  Clock,
  CheckCircle,
  Loader2,
  Plus,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBambiMode } from '../../context/BambiModeContext';
import {
  SERVICE_STAGES,
  SERVICE_STAGE_LABELS,
  type ServiceStage,
  type ServiceProgression,
  type ServiceEncounter,
} from '../../types/escalation';
import {
  getServiceProgressionHistory,
  getServiceEncounters,
  getEncounterStats,
  logEncounter,
  logActivity,
  updateComfortLevel,
  updateArousalAssociation,
  advanceStage,
  initializeServiceProgression,
} from '../../lib/service';
import { LogEncounterModal } from './LogEncounterModal';
import { LogActivityModal } from './LogActivityModal';
import { AdvanceStageModal } from './AdvanceStageModal';
import { EncounterTimeline } from './EncounterTimeline';

interface ServiceProgressionViewProps {
  onBack: () => void;
}

const SERVICE_STAGE_DESCRIPTIONS: Record<ServiceStage, string> = {
  fantasy: 'Exploring through imagination and fantasy only',
  content_consumption: 'Watching and consuming related content',
  online_interaction: 'Engaging online with others',
  first_encounter: 'First real-world experience',
  regular_service: 'Established pattern of service',
  organized_availability: 'Structured availability for service',
  gina_directed: 'Service directed by Gina',
};

const SERVICE_STAGE_COLORS: Record<ServiceStage, string> = {
  fantasy: '#6366f1',
  content_consumption: '#8b5cf6',
  online_interaction: '#a855f7',
  first_encounter: '#d946ef',
  regular_service: '#ec4899',
  organized_availability: '#f43f5e',
  gina_directed: '#ef4444',
};

export function ServiceProgressionView({ onBack }: ServiceProgressionViewProps) {
  const { user } = useAuth();
  const { isBambiMode } = useBambiMode();

  const [progressions, setProgressions] = useState<ServiceProgression[]>([]);
  const [encounters, setEncounters] = useState<ServiceEncounter[]>([]);
  const [stats, setStats] = useState<{
    total: number;
    byType: Record<string, number>;
    ginaAwareCount: number;
    ginaDirectedCount: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [showEncounterModal, setShowEncounterModal] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);

  // Current progression
  const currentProgression = progressions[0];
  const currentStage = currentProgression?.stage || 'fantasy';
  const currentStageIndex = SERVICE_STAGES.indexOf(currentStage);
  const comfortLevel = currentProgression?.comfortLevel || 1;
  const arousalAssociation = currentProgression?.arousalAssociation || 1;

  // Load data
  const loadData = useCallback(async () => {
    if (!user) return;

    try {
      setIsLoading(true);
      const [progs, encs, encounterStats] = await Promise.all([
        getServiceProgressionHistory(user.id),
        getServiceEncounters(user.id),
        getEncounterStats(user.id),
      ]);

      // Initialize if no progression exists
      if (progs.length === 0) {
        const initial = await initializeServiceProgression(user.id);
        if (initial) {
          setProgressions([initial]);
        }
      } else {
        setProgressions(progs);
      }

      setEncounters(encs);
      setStats(encounterStats);
    } catch (err) {
      console.error('Failed to load service data:', err);
      setError('Failed to load service progression data');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handlers
  const handleLogEncounter = async (
    encounter: Omit<ServiceEncounter, 'id' | 'userId'>
  ) => {
    if (!user) return;
    await logEncounter(user.id, encounter);
    await loadData();
  };

  const handleLogActivity = async (activity: string) => {
    if (!currentProgression) return;
    await logActivity(currentProgression.id, activity);
    await loadData();
  };

  const handleAdvanceStage = async (notes?: string) => {
    if (!user) return;
    await advanceStage(user.id, notes);
    await loadData();
  };

  const handleUpdateComfort = async (level: number) => {
    if (!currentProgression) return;
    await updateComfortLevel(currentProgression.id, level);
    setProgressions(prev =>
      prev.map((p, i) => (i === 0 ? { ...p, comfortLevel: level } : p))
    );
  };

  const handleUpdateArousal = async (level: number) => {
    if (!currentProgression) return;
    await updateArousalAssociation(currentProgression.id, level);
    setProgressions(prev =>
      prev.map((p, i) => (i === 0 ? { ...p, arousalAssociation: level } : p))
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-protocol-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className={`min-h-screen pb-24 ${isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'}`}>
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
              Service Progression
            </h1>
            <p
              className={`text-xs ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}
            >
              Your journey of service
            </p>
          </div>
          <Users className={`w-6 h-6 ${isBambiMode ? 'text-pink-400' : 'text-purple-400'}`} />
        </div>
      </div>

      {error ? (
        <div className="p-4">
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        </div>
      ) : (
        <div className="p-4 space-y-6">
          {/* Current Stage Card */}
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
                  ? 'bg-white border-pink-200'
                  : 'bg-protocol-surface border-protocol-border'
              }`}
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${SERVICE_STAGE_COLORS[currentStage]}20` }}
                >
                  <Users
                    className="w-6 h-6"
                    style={{ color: SERVICE_STAGE_COLORS[currentStage] }}
                  />
                </div>
                <div className="flex-1">
                  <h3
                    className={`text-lg font-semibold ${
                      isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                    }`}
                  >
                    {SERVICE_STAGE_LABELS[currentStage]}
                  </h3>
                  <p
                    className={`text-sm ${
                      isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                    }`}
                  >
                    {SERVICE_STAGE_DESCRIPTIONS[currentStage]}
                  </p>
                </div>
              </div>

              {/* Date entered */}
              {currentProgression && (
                <div className="flex items-center gap-2 text-xs text-protocol-text-muted mb-4">
                  <Clock className="w-3 h-3" />
                  Since {new Date(currentProgression.enteredAt).toLocaleDateString()}
                </div>
              )}

              {/* Comfort Level Slider */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-xs ${
                      isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
                    }`}
                  >
                    Comfort Level
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                    }`}
                  >
                    {comfortLevel}/10
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={comfortLevel}
                  onChange={e => handleUpdateComfort(parseInt(e.target.value))}
                  className="w-full accent-green-500"
                />
              </div>

              {/* Arousal Association Slider */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-xs ${
                      isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
                    }`}
                  >
                    Arousal Association
                  </span>
                  <span
                    className={`text-xs font-medium ${
                      isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                    }`}
                  >
                    {arousalAssociation}/10
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={arousalAssociation}
                  onChange={e => handleUpdateArousal(parseInt(e.target.value))}
                  className="w-full accent-pink-500"
                />
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowActivityModal(true)}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 ${
                    isBambiMode
                      ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
                      : 'bg-protocol-surface-light text-protocol-text hover:bg-protocol-border'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  Log Activity
                </button>
                {currentStageIndex < SERVICE_STAGES.length - 1 && (
                  <button
                    onClick={() => setShowAdvanceModal(true)}
                    disabled={comfortLevel < 6}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 ${
                      comfortLevel < 6
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:brightness-110'
                    }`}
                  >
                    <ArrowRight className="w-4 h-4" />
                    Advance Stage
                  </button>
                )}
              </div>
              {comfortLevel < 6 && currentStageIndex < SERVICE_STAGES.length - 1 && (
                <p className="text-xs text-center text-protocol-text-muted mt-2">
                  Comfort level must be 6+ to advance
                </p>
              )}
            </div>
          </section>

          {/* Encounter Stats */}
          {stats && stats.total > 0 && (
            <section>
              <h2
                className={`text-sm font-medium mb-3 ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}
              >
                Encounter Stats
              </h2>
              <div
                className={`p-4 rounded-xl border ${
                  isBambiMode
                    ? 'bg-white border-pink-200'
                    : 'bg-protocol-surface border-protocol-border'
                }`}
              >
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div>
                    <p
                      className={`text-lg font-bold ${
                        isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                      }`}
                    >
                      {stats.total}
                    </p>
                    <p className="text-[10px] text-protocol-text-muted">Total</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-blue-500">
                      {stats.byType.online || 0}
                    </p>
                    <p className="text-[10px] text-protocol-text-muted">Online</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-500">
                      {stats.byType.anonymous || 0}
                    </p>
                    <p className="text-[10px] text-protocol-text-muted">Anon</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-pink-500">
                      {stats.ginaAwareCount}
                    </p>
                    <p className="text-[10px] text-protocol-text-muted">Gina</p>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Stage Timeline */}
          <section>
            <h2
              className={`text-sm font-medium mb-3 ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}
            >
              Stage Progression
            </h2>
            <div className="space-y-2">
              {SERVICE_STAGES.map((stage, idx) => {
                const isComplete = idx < currentStageIndex;
                const isCurrent = idx === currentStageIndex;
                const isFuture = idx > currentStageIndex;
                const stageColor = SERVICE_STAGE_COLORS[stage];

                return (
                  <div
                    key={stage}
                    className={`p-3 rounded-lg flex items-center gap-3 ${
                      isCurrent
                        ? 'border-2'
                        : isComplete
                        ? isBambiMode
                          ? 'bg-pink-50'
                          : 'bg-protocol-surface'
                        : 'bg-protocol-surface/50 opacity-60'
                    }`}
                    style={
                      isCurrent
                        ? { borderColor: stageColor, backgroundColor: `${stageColor}10` }
                        : {}
                    }
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{
                        backgroundColor: isComplete || isCurrent ? stageColor : '#374151',
                        opacity: isFuture ? 0.3 : 1,
                      }}
                    >
                      {isComplete ? (
                        <CheckCircle className="w-4 h-4 text-white" />
                      ) : (
                        <span className="text-sm font-medium text-white">{idx + 1}</span>
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
                        {SERVICE_STAGE_LABELS[stage]}
                      </p>
                      <p className="text-xs text-protocol-text-muted">
                        {SERVICE_STAGE_DESCRIPTIONS[stage]}
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

          {/* Encounter Timeline */}
          <section>
            <h2
              className={`text-sm font-medium mb-3 ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}
            >
              Encounter History
            </h2>
            <EncounterTimeline encounters={encounters} />
          </section>

          {/* Activities History */}
          {progressions.some(p => p.activities && p.activities.length > 0) && (
            <section>
              <h2
                className={`text-sm font-medium mb-3 ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}
              >
                Activities Log
              </h2>
              <div className="space-y-2">
                {progressions.map(
                  prog =>
                    prog.activities &&
                    prog.activities.length > 0 && (
                      <div
                        key={prog.id}
                        className={`p-3 rounded-lg ${
                          isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: `${SERVICE_STAGE_COLORS[prog.stage]}20`,
                              color: SERVICE_STAGE_COLORS[prog.stage],
                            }}
                          >
                            {SERVICE_STAGE_LABELS[prog.stage]}
                          </span>
                          <span className="text-[10px] text-protocol-text-muted">
                            {new Date(prog.enteredAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {prog.activities.map((activity, idx) => (
                            <span
                              key={idx}
                              className={`text-xs px-2 py-0.5 rounded ${
                                isBambiMode
                                  ? 'bg-pink-100 text-pink-600'
                                  : 'bg-protocol-surface-light text-protocol-text-muted'
                              }`}
                            >
                              {activity}
                            </span>
                          ))}
                        </div>
                        {prog.notes && (
                          <p className="text-xs text-protocol-text-muted mt-2 italic">
                            {prog.notes}
                          </p>
                        )}
                      </div>
                    )
                )}
              </div>
            </section>
          )}
        </div>
      )}

      {/* FAB - Log Encounter */}
      <button
        onClick={() => setShowEncounterModal(true)}
        className={`fixed bottom-24 right-4 w-14 h-14 rounded-full shadow-lg flex items-center justify-center z-30 ${
          isBambiMode
            ? 'bg-pink-500 text-white'
            : 'bg-purple-500 text-white'
        }`}
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Modals */}
      {showEncounterModal && (
        <LogEncounterModal
          onSubmit={handleLogEncounter}
          onClose={() => setShowEncounterModal(false)}
        />
      )}

      {showActivityModal && (
        <LogActivityModal
          currentStage={currentStage}
          onSubmit={handleLogActivity}
          onClose={() => setShowActivityModal(false)}
        />
      )}

      {showAdvanceModal && (
        <AdvanceStageModal
          currentStage={currentStage}
          comfortLevel={comfortLevel}
          onAdvance={handleAdvanceStage}
          onClose={() => setShowAdvanceModal(false)}
        />
      )}
    </div>
  );
}
