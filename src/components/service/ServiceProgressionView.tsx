// Service Progression View
// Tracks progression through sexual service stages

import { useState, useEffect } from 'react';
import {
  ChevronLeft,
  Users,
  Clock,
  CheckCircle,
  Heart,
  Loader2,
  TrendingUp,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useBambiMode } from '../../context/BambiModeContext';
import {
  SERVICE_STAGES,
  SERVICE_STAGE_LABELS,
  type ServiceStage,
  type ServiceProgression,
} from '../../types/escalation';

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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadProgressions() {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('service_progression')
          .select('*')
          .eq('user_id', user.id)
          .order('entered_at', { ascending: false });

        if (error) throw error;

        const mapped: ServiceProgression[] = (data || []).map(p => ({
          id: p.id,
          userId: p.user_id,
          stage: p.stage as ServiceStage,
          enteredAt: p.entered_at,
          activities: p.activities || [],
          comfortLevel: p.comfort_level || undefined,
          arousalAssociation: p.arousal_association || undefined,
          notes: p.notes || undefined,
        }));

        setProgressions(mapped);
      } catch (err) {
        console.error('Failed to load service progression:', err);
        setError('Failed to load service progression data');
      } finally {
        setIsLoading(false);
      }
    }

    loadProgressions();
  }, [user]);

  const currentStage = progressions[0]?.stage || 'fantasy';
  const currentStageIndex = SERVICE_STAGES.indexOf(currentStage);

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
                  ? 'bg-pink-50 border-pink-200'
                  : 'bg-protocol-surface border-protocol-border'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${SERVICE_STAGE_COLORS[currentStage]}20` }}
                >
                  <Users
                    className="w-6 h-6"
                    style={{ color: SERVICE_STAGE_COLORS[currentStage] }}
                  />
                </div>
                <div>
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

              {/* Current progression details */}
              {progressions[0] && (
                <div className="space-y-2 pt-2 border-t border-protocol-border/50">
                  <div className="flex items-center gap-2 text-xs text-protocol-text-muted">
                    <Clock className="w-3 h-3" />
                    Since {new Date(progressions[0].enteredAt).toLocaleDateString()}
                  </div>

                  {progressions[0].comfortLevel !== undefined && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-protocol-text-muted">Comfort:</span>
                      <div className="flex-1 h-2 bg-protocol-surface-light rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full"
                          style={{ width: `${progressions[0].comfortLevel * 10}%` }}
                        />
                      </div>
                      <span className="text-xs text-protocol-text">
                        {progressions[0].comfortLevel}/10
                      </span>
                    </div>
                  )}

                  {progressions[0].arousalAssociation !== undefined && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-protocol-text-muted">Arousal:</span>
                      <div className="flex-1 h-2 bg-protocol-surface-light rounded-full overflow-hidden">
                        <div
                          className="h-full bg-pink-500 rounded-full"
                          style={{ width: `${progressions[0].arousalAssociation * 10}%` }}
                        />
                      </div>
                      <span className="text-xs text-protocol-text">
                        {progressions[0].arousalAssociation}/10
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

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
                    style={isCurrent ? { borderColor: stageColor, backgroundColor: `${stageColor}10` } : {}}
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
                {progressions.map(prog => (
                  prog.activities && prog.activities.length > 0 && (
                    <div
                      key={prog.id}
                      className={`p-3 rounded-lg ${
                        isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
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
                ))}
              </div>
            </section>
          )}

          {/* Empty State */}
          {progressions.length === 0 && (
            <div className="text-center py-12">
              <Users className="w-12 h-12 mx-auto text-protocol-text-muted mb-3" />
              <p className="text-protocol-text-muted">No service progression recorded</p>
              <p className="text-xs text-protocol-text-muted mt-1">
                Your journey will be tracked as you progress
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
