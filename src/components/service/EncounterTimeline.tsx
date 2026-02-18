/**
 * Encounter Timeline
 *
 * Displays chronological list of service encounters with details.
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, Heart, Users } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import {
  ENCOUNTER_TYPE_LABELS,
  ENCOUNTER_TYPE_COLORS,
  type ServiceEncounter,
  type EncounterType,
} from '../../types/escalation';

interface EncounterTimelineProps {
  encounters: ServiceEncounter[];
}

export function EncounterTimeline({ encounters }: EncounterTimelineProps) {
  const { isBambiMode } = useBambiMode();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<EncounterType | 'all'>('all');

  const filteredEncounters =
    filterType === 'all'
      ? encounters
      : encounters.filter(e => e.encounterType === filterType);

  if (encounters.length === 0) {
    return (
      <div className="text-center py-8">
        <Users
          className={`w-10 h-10 mx-auto mb-2 ${
            isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'
          }`}
        />
        <p
          className={`text-sm ${
            isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
          }`}
        >
          No encounters logged yet
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          onClick={() => setFilterType('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
            filterType === 'all'
              ? isBambiMode
                ? 'bg-pink-500 text-white'
                : 'bg-protocol-accent text-white'
              : isBambiMode
              ? 'bg-pink-100 text-pink-600'
              : 'bg-protocol-surface text-protocol-text-muted'
          }`}
        >
          All ({encounters.length})
        </button>
        {(['online', 'anonymous', 'regular', 'directed'] as EncounterType[]).map(type => {
          const count = encounters.filter(e => e.encounterType === type).length;
          if (count === 0) return null;
          return (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                filterType === type
                  ? 'text-white'
                  : isBambiMode
                  ? 'bg-pink-100 text-pink-600'
                  : 'bg-protocol-surface text-protocol-text-muted'
              }`}
              style={{
                backgroundColor:
                  filterType === type ? ENCOUNTER_TYPE_COLORS[type] : undefined,
              }}
            >
              {ENCOUNTER_TYPE_LABELS[type]} ({count})
            </button>
          );
        })}
      </div>

      {/* Timeline */}
      <div className="space-y-2">
        {filteredEncounters.map(encounter => {
          const isExpanded = expandedId === encounter.id;
          const color = ENCOUNTER_TYPE_COLORS[encounter.encounterType];

          return (
            <div
              key={encounter.id}
              className={`rounded-lg overflow-hidden ${
                isBambiMode ? 'bg-white border border-pink-200' : 'bg-protocol-surface'
              }`}
            >
              {/* Header */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : encounter.id)}
                className="w-full p-3 flex items-center gap-3 text-left"
              >
                {/* Type indicator */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${color}20` }}
                >
                  <Users className="w-5 h-5" style={{ color }} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: `${color}20`, color }}
                    >
                      {ENCOUNTER_TYPE_LABELS[encounter.encounterType]}
                    </span>
                    {encounter.ginaAware && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          encounter.ginaDirected
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-pink-500/20 text-pink-400'
                        }`}
                      >
                        {encounter.ginaDirected ? 'Gina Directed' : 'Gina Aware'}
                      </span>
                    )}
                  </div>
                  <p
                    className={`text-sm mt-1 truncate ${
                      isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                    }`}
                  >
                    {encounter.description || 'No description'}
                  </p>
                  <p
                    className={`text-xs mt-0.5 ${
                      isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                    }`}
                  >
                    {new Date(encounter.date).toLocaleDateString()}
                  </p>
                </div>

                {/* Expand icon */}
                {isExpanded ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div
                  className={`px-3 pb-3 pt-0 space-y-3 border-t ${
                    isBambiMode ? 'border-pink-100' : 'border-protocol-border/50'
                  }`}
                >
                  {/* Arousal level */}
                  {encounter.arousalLevel && (
                    <div className="flex items-center gap-2 pt-3">
                      <Heart className="w-4 h-4 text-pink-400" />
                      <span
                        className={`text-xs ${
                          isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
                        }`}
                      >
                        Arousal: {encounter.arousalLevel}/10
                      </span>
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-pink-500 rounded-full"
                          style={{ width: `${encounter.arousalLevel * 10}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Activities */}
                  {encounter.activities.length > 0 && (
                    <div>
                      <p
                        className={`text-xs font-medium mb-1 ${
                          isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
                        }`}
                      >
                        Activities
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {encounter.activities.map((activity, idx) => (
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
                    </div>
                  )}

                  {/* Psychological Impact */}
                  {encounter.psychologicalImpact && (
                    <div>
                      <p
                        className={`text-xs font-medium mb-1 ${
                          isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
                        }`}
                      >
                        Psychological Impact
                      </p>
                      <p
                        className={`text-sm ${
                          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                        }`}
                      >
                        {encounter.psychologicalImpact}
                      </p>
                    </div>
                  )}

                  {/* Escalation Effect */}
                  {encounter.escalationEffect && (
                    <div>
                      <p
                        className={`text-xs font-medium mb-1 ${
                          isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
                        }`}
                      >
                        Escalation Effect
                      </p>
                      <p
                        className={`text-sm ${
                          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                        }`}
                      >
                        {encounter.escalationEffect}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
