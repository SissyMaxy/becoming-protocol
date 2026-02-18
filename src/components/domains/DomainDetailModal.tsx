/**
 * Domain Detail Modal
 *
 * Expanded view of a single escalation domain with history.
 */

import { X, TrendingUp, Calendar, Zap } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import {
  EscalationDomain,
  EscalationState,
  EscalationEvent,
  ESCALATION_DOMAIN_LABELS,
  ESCALATION_DOMAIN_COLORS,
  ESCALATION_DOMAIN_ICONS,
  DOMAIN_MAX_LEVELS,
  TriggerMethod,
} from '../../types/escalation';

interface DomainDetailModalProps {
  domain: EscalationDomain;
  state: EscalationState | null;
  events: EscalationEvent[];
  onClose: () => void;
  onLogEscalation: () => void;
}

const TRIGGER_METHOD_LABELS: Record<TriggerMethod, string> = {
  arousal_commitment: 'Arousal',
  handler_push: 'Handler',
  gina_directed: 'Gina',
  organic: 'Organic',
};

export function DomainDetailModal({
  domain,
  state,
  events,
  onClose,
  onLogEscalation,
}: DomainDetailModalProps) {
  const { isBambiMode } = useBambiMode();

  const color = ESCALATION_DOMAIN_COLORS[domain];
  const iconName = ESCALATION_DOMAIN_ICONS[domain];
  const label = ESCALATION_DOMAIN_LABELS[domain];
  const maxLevel = DOMAIN_MAX_LEVELS[domain];

  const currentLevel = state?.currentLevel || 0;
  const progress = (currentLevel / maxLevel) * 100;

  // Get the icon component dynamically
  const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>>)[iconName] || LucideIcons.Circle;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatRelativeDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return formatDate(dateStr);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-md max-h-[90vh] overflow-hidden rounded-2xl ${
          isBambiMode ? 'bg-pink-50' : 'bg-protocol-bg'
        }`}
      >
        {/* Header */}
        <div
          className="p-4 border-b flex items-center justify-between"
          style={{
            backgroundColor: `${color}10`,
            borderColor: isBambiMode ? '#fbcfe8' : `${color}30`,
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${color}20` }}
            >
              <IconComponent className="w-6 h-6" style={{ color }} />
            </div>
            <div>
              <h2
                className="text-lg font-semibold"
                style={{ color }}
              >
                {label}
              </h2>
              <p
                className={`text-xs ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}
              >
                Level {currentLevel} of {maxLevel}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              isBambiMode ? 'hover:bg-pink-100' : 'hover:bg-protocol-surface'
            }`}
          >
            <X
              className={`w-5 h-5 ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}
            />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-200px)] space-y-4">
          {/* Progress */}
          <div
            className={`p-4 rounded-xl ${
              isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span
                className={`text-sm font-medium ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                Progress
              </span>
              <span
                className="text-2xl font-bold"
                style={{ color }}
              >
                {Math.round(progress)}%
              </span>
            </div>
            <div
              className={`h-3 rounded-full overflow-hidden ${
                isBambiMode ? 'bg-pink-100' : 'bg-protocol-border'
              }`}
            >
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progress}%`,
                  backgroundColor: color,
                }}
              />
            </div>
          </div>

          {/* Current State */}
          <div
            className={`p-4 rounded-xl ${
              isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4" style={{ color }} />
              <span
                className={`text-sm font-semibold ${
                  isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                }`}
              >
                Current Level
              </span>
            </div>
            <p
              className={`text-sm ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}
            >
              {state?.currentDescription || 'Not started'}
            </p>
            {state?.lastEscalationDate && (
              <p
                className={`text-xs mt-2 ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                Since {formatDate(state.lastEscalationDate)}
              </p>
            )}
          </div>

          {/* Next Target */}
          {state?.nextLevelDescription && currentLevel < maxLevel && (
            <div
              className={`p-4 rounded-xl border-2 border-dashed ${
                isBambiMode ? 'border-pink-300 bg-pink-50/50' : 'border-protocol-border bg-protocol-surface/50'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4" style={{ color }} />
                <span
                  className={`text-sm font-semibold ${
                    isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                  }`}
                >
                  Next Target (Level {currentLevel + 1})
                </span>
              </div>
              <p
                className={`text-sm ${
                  isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
                }`}
              >
                {state.nextLevelDescription}
              </p>
            </div>
          )}

          {/* Escalation History */}
          {events.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Calendar
                  className={`w-4 h-4 ${
                    isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                  }`}
                />
                <span
                  className={`text-sm font-semibold ${
                    isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                  }`}
                >
                  Escalation History
                </span>
              </div>
              <div className="space-y-2">
                {events.slice(0, 10).map((event) => (
                  <div
                    key={event.id}
                    className={`p-3 rounded-lg ${
                      isBambiMode ? 'bg-white border border-pink-100' : 'bg-protocol-surface'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: `${color}20`, color }}
                        >
                          {event.fromLevel} → {event.toLevel}
                        </span>
                        {event.triggerMethod && (
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              isBambiMode
                                ? 'bg-pink-100 text-pink-600'
                                : 'bg-protocol-surface-light text-protocol-text-muted'
                            }`}
                          >
                            {TRIGGER_METHOD_LABELS[event.triggerMethod]}
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-xs ${
                          isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                        }`}
                      >
                        {formatRelativeDate(event.createdAt)}
                      </span>
                    </div>
                    {event.description && (
                      <p
                        className={`text-sm ${
                          isBambiMode ? 'text-pink-600' : 'text-protocol-text'
                        }`}
                      >
                        {event.description}
                      </p>
                    )}
                    {event.resistanceEncountered && (
                      <span
                        className={`text-[10px] ${
                          event.resistanceBypassed
                            ? 'text-green-500'
                            : 'text-amber-500'
                        }`}
                      >
                        Resistance {event.resistanceBypassed ? 'bypassed' : 'noted'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty History */}
          {events.length === 0 && (
            <div className="text-center py-4">
              <p
                className={`text-sm ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}
              >
                No escalations logged yet
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className={`p-4 border-t ${
            isBambiMode ? 'border-pink-200' : 'border-protocol-border'
          }`}
        >
          <button
            onClick={onLogEscalation}
            disabled={currentLevel >= maxLevel}
            className={`w-full py-3 rounded-lg font-medium transition-colors ${
              currentLevel >= maxLevel
                ? 'bg-gray-400 cursor-not-allowed text-gray-200'
                : 'text-white hover:brightness-110'
            }`}
            style={{
              backgroundColor: currentLevel < maxLevel ? color : undefined,
            }}
          >
            {currentLevel >= maxLevel ? 'Max Level Reached' : 'Log Escalation'}
          </button>
        </div>
      </div>
    </div>
  );
}
