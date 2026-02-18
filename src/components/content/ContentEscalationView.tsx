// Content Escalation View
// Tracks content consumption and intensity escalation

import { useState, useEffect } from 'react';
import {
  ChevronLeft,
  Film,
  TrendingUp,
  Loader2,
  Eye,
  Flame,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useBambiMode } from '../../context/BambiModeContext';
import type { ContentEscalation } from '../../types/escalation';

interface ContentEscalationViewProps {
  onBack: () => void;
}

const THEME_LABELS: Record<string, string> = {
  feminization: 'Feminization',
  sissification: 'Sissification',
  service: 'Service',
  humiliation: 'Humiliation',
  bbc: 'BBC',
  gangbang: 'Gangbang',
  gloryhole: 'Gloryhole',
  submission: 'Submission',
  hypno: 'Hypno',
  chastity: 'Chastity',
};

const THEME_COLORS: Record<string, string> = {
  feminization: '#ec4899',
  sissification: '#f472b6',
  service: '#8b5cf6',
  humiliation: '#f97316',
  bbc: '#1f2937',
  gangbang: '#dc2626',
  gloryhole: '#6b7280',
  submission: '#3b82f6',
  hypno: '#a855f7',
  chastity: '#f59e0b',
};

export function ContentEscalationView({ onBack }: ContentEscalationViewProps) {
  const { user } = useAuth();
  const { isBambiMode } = useBambiMode();
  const [escalations, setEscalations] = useState<ContentEscalation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadEscalations() {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('content_escalation')
          .select('*')
          .eq('user_id', user.id)
          .order('exposure_count', { ascending: false });

        if (error) throw error;

        const mapped: ContentEscalation[] = (data || []).map(e => ({
          id: e.id,
          userId: e.user_id,
          contentType: e.content_type,
          theme: e.theme,
          intensityLevel: e.intensity_level || undefined,
          firstExposure: e.first_exposure,
          exposureCount: e.exposure_count,
          currentResponse: e.current_response || undefined,
          nextIntensityTarget: e.next_intensity_target || undefined,
          notes: e.notes || undefined,
        }));

        setEscalations(mapped);
      } catch (err) {
        console.error('Failed to load content escalation:', err);
        setError('Failed to load content escalation data');
      } finally {
        setIsLoading(false);
      }
    }

    loadEscalations();
  }, [user]);

  // Group by theme
  const groupedByTheme = escalations.reduce((acc, esc) => {
    if (!acc[esc.theme]) acc[esc.theme] = [];
    acc[esc.theme].push(esc);
    return acc;
  }, {} as Record<string, ContentEscalation[]>);

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
              Content Escalation
            </h1>
            <p
              className={`text-xs ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}
            >
              Tracking content intensity progression
            </p>
          </div>
          <Film className={`w-6 h-6 ${isBambiMode ? 'text-pink-400' : 'text-purple-400'}`} />
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
          {/* Summary Stats */}
          {escalations.length > 0 && (
            <section>
              <div className="grid grid-cols-3 gap-2">
                <div
                  className={`p-3 rounded-lg text-center ${
                    isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
                  }`}
                >
                  <p
                    className={`text-2xl font-bold ${
                      isBambiMode ? 'text-pink-600' : 'text-protocol-accent'
                    }`}
                  >
                    {Object.keys(groupedByTheme).length}
                  </p>
                  <p className="text-xs text-protocol-text-muted">Themes</p>
                </div>
                <div
                  className={`p-3 rounded-lg text-center ${
                    isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
                  }`}
                >
                  <p
                    className={`text-2xl font-bold ${
                      isBambiMode ? 'text-pink-600' : 'text-protocol-accent'
                    }`}
                  >
                    {escalations.reduce((sum, e) => sum + e.exposureCount, 0)}
                  </p>
                  <p className="text-xs text-protocol-text-muted">Exposures</p>
                </div>
                <div
                  className={`p-3 rounded-lg text-center ${
                    isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
                  }`}
                >
                  <p
                    className={`text-2xl font-bold ${
                      isBambiMode ? 'text-pink-600' : 'text-protocol-accent'
                    }`}
                  >
                    {Math.max(...escalations.map(e => e.intensityLevel || 0), 0)}
                  </p>
                  <p className="text-xs text-protocol-text-muted">Max Level</p>
                </div>
              </div>
            </section>
          )}

          {/* Content by Theme */}
          {Object.entries(groupedByTheme).map(([theme, contents]) => {
            const color = THEME_COLORS[theme] || '#6366f1';
            const label = THEME_LABELS[theme] || theme;
            const maxIntensity = Math.max(...contents.map(c => c.intensityLevel || 0));
            const totalExposures = contents.reduce((sum, c) => sum + c.exposureCount, 0);

            return (
              <section key={theme}>
                <div
                  className={`p-4 rounded-xl border ${
                    isBambiMode
                      ? 'bg-white border-pink-200'
                      : 'bg-protocol-surface border-protocol-border'
                  }`}
                >
                  {/* Theme Header */}
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${color}20` }}
                    >
                      <Flame className="w-5 h-5" style={{ color }} />
                    </div>
                    <div className="flex-1">
                      <h3
                        className={`font-semibold ${
                          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                        }`}
                      >
                        {label}
                      </h3>
                      <div className="flex items-center gap-3 text-xs text-protocol-text-muted">
                        <span className="flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {totalExposures} exposures
                        </span>
                        <span className="flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" />
                          Level {maxIntensity}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Intensity Bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-protocol-text-muted">Intensity Level</span>
                      <span className="text-protocol-text">{maxIntensity}/10</span>
                    </div>
                    <div className="h-3 bg-protocol-surface-light rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${maxIntensity * 10}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                  </div>

                  {/* Content Types */}
                  <div className="space-y-2">
                    {contents.map(content => (
                      <div
                        key={content.id}
                        className={`p-2 rounded-lg ${
                          isBambiMode
                            ? 'bg-pink-50'
                            : 'bg-protocol-surface-light'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-sm ${
                              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                            }`}
                          >
                            {content.contentType}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-protocol-text-muted">
                              Lv {content.intensityLevel || 0}
                            </span>
                            <span className="text-xs text-protocol-text-muted">
                              x{content.exposureCount}
                            </span>
                          </div>
                        </div>
                        {content.currentResponse && (
                          <p className="text-xs text-protocol-text-muted mt-1">
                            Response: {content.currentResponse}
                          </p>
                        )}
                        {content.nextIntensityTarget && (
                          <div className="flex items-center gap-1 mt-1">
                            <TrendingUp className="w-3 h-3 text-green-500" />
                            <span className="text-xs text-green-500">
                              Target: Level {content.nextIntensityTarget}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            );
          })}

          {/* Empty State */}
          {escalations.length === 0 && (
            <div className="text-center py-12">
              <Film className="w-12 h-12 mx-auto text-protocol-text-muted mb-3" />
              <p className="text-protocol-text-muted">No content escalation recorded</p>
              <p className="text-xs text-protocol-text-muted mt-1">
                Content exposure will be tracked as you progress
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
