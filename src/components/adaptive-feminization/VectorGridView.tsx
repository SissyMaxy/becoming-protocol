/**
 * Vector Grid View
 * Browse all vectors organized by category
 */

import { useState } from 'react';
import { Sparkles, Filter, Lock, ChevronDown, ChevronUp } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useAdaptiveFeminization } from '../../hooks/useAdaptiveFeminization';
import { VectorCard } from './VectorCard';
import {
  FEMINIZATION_GROUPS,
  SISSIFICATION_GROUPS,
} from '../../types/adaptive-feminization';
import type { VectorId, VectorCategory } from '../../types/adaptive-feminization';

type FilterType = 'all' | 'feminization' | 'sissification' | 'locked' | 'progressing';

const GROUP_LABELS = {
  // Feminization groups
  physical: 'Physical Foundation',
  social: 'Social Expression',
  internal: 'Internal Development',
  medical: 'Medical/Permanent',
  // Sissification groups
  arousal: 'Arousal Architecture',
  submission: 'Submission Framework',
  erosion: 'Identity Erosion',
  conditioning: 'Behavioral Conditioning',
};

interface VectorGridViewProps {
  onVectorSelect?: (vectorId: VectorId) => void;
}

export function VectorGridView({ onVectorSelect }: VectorGridViewProps) {
  const { isBambiMode } = useBambiMode();
  const {
    vectorDisplayInfos,
    vectorStates,
    lockInStatuses,
    getVectorState,
  } = useAdaptiveFeminization();

  const [filter, setFilter] = useState<FilterType>('all');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['physical', 'arousal']));

  // Toggle group expansion
  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  // Filter vectors
  const getFilteredVectors = (vectorIds: readonly string[]) => {
    return vectorIds.filter(id => {
      const info = vectorDisplayInfos.find(v => v.id === id);
      const state = getVectorState(id as VectorId);

      switch (filter) {
        case 'feminization':
          return info?.category === 'feminization';
        case 'sissification':
          return info?.category === 'sissification';
        case 'locked':
          return info?.isLockedIn;
        case 'progressing':
          return state && state.velocityTrend === 'accelerating';
        default:
          return true;
      }
    });
  };

  // Render a group of vectors
  const renderGroup = (
    groupKey: string,
    vectorIds: readonly string[],
    category: VectorCategory
  ) => {
    const filteredIds = getFilteredVectors(vectorIds);

    // Skip empty groups after filtering
    if (filteredIds.length === 0 && filter !== 'all') return null;

    // Calculate group stats
    const groupVectors = vectorIds.map(id => vectorDisplayInfos.find(v => v.id === id)).filter(Boolean);
    const avgLevel = groupVectors.length > 0
      ? groupVectors.reduce((sum, v) => sum + (v?.level || 0), 0) / groupVectors.length
      : 0;
    const lockedCount = groupVectors.filter(v => v?.isLockedIn).length;

    const isExpanded = expandedGroups.has(groupKey);

    return (
      <div key={groupKey} className="mb-4">
        {/* Group header */}
        <button
          onClick={() => toggleGroup(groupKey)}
          className={`w-full p-3 rounded-lg flex items-center justify-between transition-colors ${
            isBambiMode
              ? 'bg-pink-50 hover:bg-pink-100'
              : 'bg-protocol-surface hover:bg-protocol-surface-light'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className={`text-sm font-semibold ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}>
              {GROUP_LABELS[groupKey as keyof typeof GROUP_LABELS]}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              category === 'feminization'
                ? isBambiMode ? 'bg-pink-200 text-pink-700' : 'bg-pink-900/30 text-pink-400'
                : isBambiMode ? 'bg-purple-200 text-purple-700' : 'bg-purple-900/30 text-purple-400'
            }`}>
              Avg Lv. {avgLevel.toFixed(1)}
            </span>
            {lockedCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-amber-500">
                <Lock className="w-3 h-3" />
                {lockedCount}
              </span>
            )}
          </div>
          {isExpanded ? (
            <ChevronUp className={`w-5 h-5 ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`} />
          ) : (
            <ChevronDown className={`w-5 h-5 ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`} />
          )}
        </button>

        {/* Group content */}
        {isExpanded && (
          <div className="grid grid-cols-2 gap-3 mt-3">
            {filteredIds.map(id => {
              const info = vectorDisplayInfos.find(v => v.id === id);
              const state = getVectorState(id as VectorId);

              if (!info) return null;

              return (
                <VectorCard
                  key={id}
                  info={info}
                  state={state}
                  compact
                  onClick={() => onVectorSelect?.(id as VectorId)}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${
            isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'
          }`}>
            <Sparkles className={`w-5 h-5 ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
            }`} />
          </div>
          <div>
            <h2 className={`text-lg font-semibold ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}>
              All Vectors
            </h2>
            <p className="text-xs text-protocol-text-muted">
              {vectorDisplayInfos.length} vectors across all domains
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        <Filter className={`w-4 h-4 flex-shrink-0 ${
          isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
        }`} />
        {[
          { id: 'all', label: 'All' },
          { id: 'feminization', label: 'Feminization' },
          { id: 'sissification', label: 'Sissification' },
          { id: 'locked', label: 'Locked In' },
          { id: 'progressing', label: 'Progressing' },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setFilter(id as FilterType)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filter === id
                ? isBambiMode
                  ? 'bg-pink-500 text-white'
                  : 'bg-protocol-accent text-white'
                : isBambiMode
                  ? 'bg-pink-100 text-pink-600 hover:bg-pink-200'
                  : 'bg-protocol-surface text-protocol-text-muted hover:bg-protocol-surface-light'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-2">
        <div className={`p-3 rounded-lg text-center ${
          isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
        }`}>
          <p className={`text-lg font-bold ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}>
            {vectorDisplayInfos.filter(v => v.category === 'feminization').length}
          </p>
          <p className={`text-xs ${
            isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
          }`}>
            Fem
          </p>
        </div>
        <div className={`p-3 rounded-lg text-center ${
          isBambiMode ? 'bg-purple-50' : 'bg-protocol-surface'
        }`}>
          <p className={`text-lg font-bold ${
            isBambiMode ? 'text-purple-600' : 'text-protocol-text'
          }`}>
            {vectorDisplayInfos.filter(v => v.category === 'sissification').length}
          </p>
          <p className={`text-xs ${
            isBambiMode ? 'text-purple-400' : 'text-protocol-text-muted'
          }`}>
            Sissy
          </p>
        </div>
        <div className={`p-3 rounded-lg text-center ${
          isBambiMode ? 'bg-amber-50' : 'bg-protocol-surface'
        }`}>
          <p className={`text-lg font-bold ${
            isBambiMode ? 'text-amber-600' : 'text-protocol-text'
          }`}>
            {lockInStatuses.filter(l => l.isLockedIn).length}
          </p>
          <p className={`text-xs ${
            isBambiMode ? 'text-amber-400' : 'text-protocol-text-muted'
          }`}>
            Locked
          </p>
        </div>
        <div className={`p-3 rounded-lg text-center ${
          isBambiMode ? 'bg-emerald-50' : 'bg-protocol-surface'
        }`}>
          <p className={`text-lg font-bold ${
            isBambiMode ? 'text-emerald-600' : 'text-protocol-text'
          }`}>
            {vectorStates.filter(s => s.velocityTrend === 'accelerating').length}
          </p>
          <p className={`text-xs ${
            isBambiMode ? 'text-emerald-400' : 'text-protocol-text-muted'
          }`}>
            Active
          </p>
        </div>
      </div>

      {/* Feminization vectors */}
      {(filter === 'all' || filter === 'feminization' || filter === 'locked' || filter === 'progressing') && (
        <div>
          <h3 className={`text-sm font-semibold mb-3 ${
            isBambiMode ? 'text-pink-600' : 'text-pink-400'
          }`}>
            Feminization Vectors
          </h3>
          {renderGroup('physical', FEMINIZATION_GROUPS.physical, 'feminization')}
          {renderGroup('social', FEMINIZATION_GROUPS.social, 'feminization')}
          {renderGroup('internal', FEMINIZATION_GROUPS.internal, 'feminization')}
          {renderGroup('medical', FEMINIZATION_GROUPS.medical, 'feminization')}
        </div>
      )}

      {/* Sissification vectors */}
      {(filter === 'all' || filter === 'sissification' || filter === 'locked' || filter === 'progressing') && (
        <div>
          <h3 className={`text-sm font-semibold mb-3 ${
            isBambiMode ? 'text-purple-600' : 'text-purple-400'
          }`}>
            Sissification Vectors
          </h3>
          {renderGroup('arousal', SISSIFICATION_GROUPS.arousal, 'sissification')}
          {renderGroup('submission', SISSIFICATION_GROUPS.submission, 'sissification')}
          {renderGroup('erosion', SISSIFICATION_GROUPS.erosion, 'sissification')}
          {renderGroup('conditioning', SISSIFICATION_GROUPS.conditioning, 'sissification')}
        </div>
      )}
    </div>
  );
}
