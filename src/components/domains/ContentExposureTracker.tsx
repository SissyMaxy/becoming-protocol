/**
 * Content Exposure Tracker
 *
 * Tracks content exposure by theme with intensity levels.
 */

import { useState, useEffect } from 'react';
import { Plus, Zap, TrendingUp } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAuth } from '../../context/AuthContext';
import { ContentEscalation, ContentTheme } from '../../types/escalation';
import { getContentEscalations, incrementExposure } from '../../lib/domainEscalation';
import { LogContentExposureModal } from './LogContentExposureModal';

// Content themes aligned with 5-domain priority structure
// Priority: arousal > sissification > submission > identity > feminization
const THEME_LABELS: Record<ContentTheme, string> = {
  // Arousal domain themes (highest priority)
  gooning: 'Gooning',
  edging: 'Edging',
  denial: 'Denial',
  hypno: 'Hypno',
  // Sissification domain themes
  sissification: 'Sissification',
  sissy_training: 'Sissy Training',
  turning_out: 'Turning Out',
  // Submission domain themes
  service: 'Service',
  submission: 'Submission',
  chastity: 'Chastity',
  humiliation: 'Humiliation',
  bbc: 'BBC',
  gangbang: 'Gangbang',
  gloryhole: 'Gloryhole',
  // Feminization themes (lowest priority)
  feminization: 'Feminization',
};

const THEME_COLORS: Record<ContentTheme, string> = {
  // Arousal domain - red/hot colors
  gooning: '#ef4444',
  edging: '#f87171',
  denial: '#dc2626',
  hypno: '#a855f7',
  // Sissification domain - pink colors
  sissification: '#f472b6',
  sissy_training: '#ec4899',
  turning_out: '#db2777',
  // Submission domain - indigo/purple colors
  service: '#6366f1',
  submission: '#a855f7',
  chastity: '#f59e0b',
  humiliation: '#ef4444',
  bbc: '#8b5cf6',
  gangbang: '#d946ef',
  gloryhole: '#f59e0b',
  // Feminization - pink
  feminization: '#ec4899',
};

interface GroupedContent {
  theme: ContentTheme;
  items: ContentEscalation[];
  totalExposures: number;
  maxIntensity: number;
}

export function ContentExposureTracker() {
  const { isBambiMode } = useBambiMode();
  const { user } = useAuth();
  const [content, setContent] = useState<ContentEscalation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showLogModal, setShowLogModal] = useState(false);
  const [expandedTheme, setExpandedTheme] = useState<ContentTheme | null>(null);

  const loadContent = async () => {
    if (!user) return;
    setIsLoading(true);
    const data = await getContentEscalations(user.id);
    setContent(data);
    setIsLoading(false);
  };

  useEffect(() => {
    loadContent();
  }, [user]);

  // Group by theme
  const groupedContent: GroupedContent[] = Object.keys(THEME_LABELS).map((theme) => {
    const items = content.filter((c) => c.theme === theme);
    const totalExposures = items.reduce((sum, i) => sum + i.exposureCount, 0);
    const maxIntensity = items.length > 0 ? Math.max(...items.map((i) => i.intensityLevel || 0)) : 0;
    return {
      theme: theme as ContentTheme,
      items,
      totalExposures,
      maxIntensity,
    };
  }).filter((g) => g.items.length > 0);

  const handleIncrementExposure = async (escalationId: string) => {
    await incrementExposure(escalationId);
    await loadContent();
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div
          className={`text-sm ${
            isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
          }`}
        >
          Loading content...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add Button */}
      <button
        onClick={() => setShowLogModal(true)}
        className={`w-full p-3 rounded-lg border-2 border-dashed flex items-center justify-center gap-2 transition-colors ${
          isBambiMode
            ? 'border-pink-300 text-pink-500 hover:bg-pink-50'
            : 'border-protocol-border text-protocol-text-muted hover:bg-protocol-surface'
        }`}
      >
        <Plus className="w-5 h-5" />
        <span className="text-sm font-medium">Log Content Exposure</span>
      </button>

      {/* Grouped Content */}
      {groupedContent.length > 0 ? (
        <div className="space-y-3">
          {groupedContent.map((group) => {
            const color = THEME_COLORS[group.theme];
            const isExpanded = expandedTheme === group.theme;

            return (
              <div
                key={group.theme}
                className={`rounded-xl overflow-hidden ${
                  isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface'
                }`}
              >
                {/* Theme Header */}
                <button
                  onClick={() => setExpandedTheme(isExpanded ? null : group.theme)}
                  className="w-full p-4 flex items-center gap-3 text-left"
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${color}20` }}
                  >
                    <Zap className="w-5 h-5" style={{ color }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`font-semibold ${
                          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                        }`}
                      >
                        {THEME_LABELS[group.theme]}
                      </span>
                      <span
                        className="text-sm font-medium px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${color}20`, color }}
                      >
                        Level {group.maxIntensity}/10
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div
                      className={`h-2 rounded-full overflow-hidden ${
                        isBambiMode ? 'bg-pink-100' : 'bg-protocol-border'
                      }`}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${(group.maxIntensity / 10) * 100}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>

                    <div
                      className={`flex items-center gap-3 mt-1.5 text-xs ${
                        isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                      }`}
                    >
                      <span>{group.totalExposures} exposures</span>
                      <span>{group.items.length} content types</span>
                    </div>
                  </div>

                  <TrendingUp
                    className={`w-4 h-4 transition-transform ${
                      isExpanded ? 'rotate-180' : ''
                    } ${isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'}`}
                  />
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div
                    className={`px-4 pb-4 border-t ${
                      isBambiMode ? 'border-pink-100' : 'border-protocol-border/50'
                    }`}
                  >
                    <div className="space-y-2 pt-3">
                      {group.items.map((item) => (
                        <div
                          key={item.id}
                          className={`p-3 rounded-lg ${
                            isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p
                                className={`text-sm font-medium ${
                                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                                }`}
                              >
                                {item.contentType}
                              </p>
                              <p
                                className={`text-xs ${
                                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                                }`}
                              >
                                Intensity {item.intensityLevel || 1}/10 • {item.exposureCount} views
                              </p>
                            </div>
                            <button
                              onClick={() => handleIncrementExposure(item.id)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                                isBambiMode
                                  ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
                                  : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface-light'
                              }`}
                            >
                              +1 View
                            </button>
                          </div>
                          {item.currentResponse && (
                            <p
                              className={`text-xs mt-2 italic ${
                                isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                              }`}
                            >
                              "{item.currentResponse}"
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8">
          <Zap
            className={`w-10 h-10 mx-auto mb-2 ${
              isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'
            }`}
          />
          <p
            className={`text-sm ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}
          >
            No content tracked yet
          </p>
          <p
            className={`text-xs mt-1 ${
              isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'
            }`}
          >
            Log content exposure to track intensity progression
          </p>
        </div>
      )}

      {/* Log Modal */}
      {showLogModal && (
        <LogContentExposureModal
          onSubmit={async () => {
            await loadContent();
          }}
          onClose={() => setShowLogModal(false)}
        />
      )}
    </div>
  );
}
