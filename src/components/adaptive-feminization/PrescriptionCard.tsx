/**
 * Prescription Card
 * Displays a vector prescription with priority, tasks, and engagement options
 */

import { useState } from 'react';
import {
  Target,
  Clock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Zap,
  Star,
  Play
} from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { VectorPrescription, VectorDisplayInfo } from '../../types/adaptive-feminization';
import { getVectorById } from '../../data/vector-definitions';

interface PrescriptionCardProps {
  prescription: VectorPrescription;
  vectorInfo: VectorDisplayInfo;
  isActive?: boolean;
  isCompleted?: boolean;
  onStart?: () => void;
  onComplete?: (quality: 'excellent' | 'good' | 'mediocre' | 'poor') => void;
}

export function PrescriptionCard({
  prescription,
  vectorInfo,
  isActive = false,
  isCompleted = false,
  onStart,
  onComplete,
}: PrescriptionCardProps) {
  const { isBambiMode } = useBambiMode();
  const [expanded, setExpanded] = useState(false);
  const [showQualitySelect, setShowQualitySelect] = useState(false);

  const vector = getVectorById(prescription.vectorId);
  if (!vector) return null;

  const priorityConfig = {
    primary: {
      label: 'Primary Focus',
      icon: Target,
      bgClass: isBambiMode ? 'bg-pink-100 border-pink-300' : 'bg-protocol-accent/20 border-protocol-accent/30',
      textClass: isBambiMode ? 'text-pink-600' : 'text-protocol-accent',
    },
    secondary: {
      label: 'Secondary',
      icon: Zap,
      bgClass: isBambiMode ? 'bg-purple-50 border-purple-200' : 'bg-purple-900/20 border-purple-600/30',
      textClass: isBambiMode ? 'text-purple-600' : 'text-purple-400',
    },
    tertiary: {
      label: 'Tertiary',
      icon: Star,
      bgClass: isBambiMode ? 'bg-gray-50 border-gray-200' : 'bg-protocol-surface border-protocol-border',
      textClass: isBambiMode ? 'text-gray-600' : 'text-protocol-text-muted',
    },
  };

  const config = priorityConfig[prescription.priority];
  const Icon = config.icon;

  return (
    <div className={`rounded-xl overflow-hidden border transition-all ${
      isCompleted
        ? 'opacity-60'
        : isActive
          ? isBambiMode ? 'border-pink-400 shadow-lg shadow-pink-200/50' : 'border-protocol-accent shadow-lg shadow-protocol-accent/20'
          : config.bgClass
    }`}>
      {/* Header */}
      <div className={`p-4 ${config.bgClass}`}>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${
              isBambiMode ? 'bg-white/80' : 'bg-protocol-bg/80'
            }`}>
              <Icon className={`w-5 h-5 ${config.textClass}`} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-medium uppercase tracking-wider ${config.textClass}`}>
                  {config.label}
                </span>
                {isCompleted && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                )}
              </div>
              <h3 className={`font-semibold ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}>
                {vector.name}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs">
              <Clock className={`w-3.5 h-3.5 ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`} />
              <span className={isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}>
                {prescription.suggestedDuration}m
              </span>
            </div>
            <button
              onClick={() => setExpanded(!expanded)}
              className={`p-1 rounded hover:bg-black/5`}
            >
              {expanded ? (
                <ChevronUp className={`w-4 h-4 ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`} />
              ) : (
                <ChevronDown className={`w-4 h-4 ${
                  isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                }`} />
              )}
            </button>
          </div>
        </div>

        {/* Level indicator */}
        <div className="mt-3 flex items-center gap-2">
          <span className={`text-xs ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
          }`}>
            Level {vectorInfo.level}
          </span>
          <div className="flex-1 h-1.5 bg-black/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${vectorInfo.progress}%`, backgroundColor: vectorInfo.color }}
            />
          </div>
          <span className={`text-xs ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
          }`}>
            {vectorInfo.progress.toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className={`p-4 border-t ${
          isBambiMode ? 'bg-white border-pink-100' : 'bg-protocol-bg border-protocol-border'
        }`}>
          {/* Suggested tasks */}
          {prescription.suggestedTasks.length > 0 && (
            <div className="mb-4">
              <p className={`text-xs font-medium mb-2 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}>
                Suggested Tasks
              </p>
              <ul className="space-y-1">
                {prescription.suggestedTasks.map((task, i) => (
                  <li
                    key={i}
                    className={`text-sm flex items-start gap-2 ${
                      isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: vectorInfo.color }} />
                    {task}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Context notes */}
          {prescription.contextNotes.length > 0 && (
            <div className="mb-4">
              <p className={`text-xs font-medium mb-2 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}>
                Context
              </p>
              <div className="flex flex-wrap gap-2">
                {prescription.contextNotes.map((note, i) => (
                  <span
                    key={i}
                    className={`text-xs px-2 py-1 rounded-full ${
                      isBambiMode ? 'bg-pink-50 text-pink-500' : 'bg-protocol-surface text-protocol-text-muted'
                    }`}
                  >
                    {note}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Reasoning */}
          <div className="mb-4">
            <p className={`text-xs font-medium mb-1 ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text'
            }`}>
              Why This Vector
            </p>
            <p className={`text-xs ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}>
              {prescription.reasoning}
            </p>
          </div>

          {/* Actions */}
          {!isCompleted && (
            <div className="pt-3 border-t border-protocol-border">
              {!showQualitySelect ? (
                <div className="flex gap-2">
                  {!isActive && onStart && (
                    <button
                      onClick={onStart}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium transition-colors ${
                        isBambiMode
                          ? 'bg-pink-500 text-white hover:bg-pink-600'
                          : 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
                      }`}
                    >
                      <Play className="w-4 h-4" />
                      Start Session
                    </button>
                  )}
                  {onComplete && (
                    <button
                      onClick={() => setShowQualitySelect(true)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium transition-colors ${
                        isBambiMode
                          ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                          : 'bg-emerald-600 text-white hover:bg-emerald-700'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Mark Complete
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  <p className={`text-xs font-medium mb-2 ${
                    isBambiMode ? 'text-pink-600' : 'text-protocol-text'
                  }`}>
                    How was your session?
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {(['excellent', 'good', 'mediocre', 'poor'] as const).map((quality) => (
                      <button
                        key={quality}
                        onClick={() => {
                          onComplete?.(quality);
                          setShowQualitySelect(false);
                        }}
                        className={`py-2 px-3 rounded-lg text-xs font-medium transition-colors ${
                          quality === 'excellent'
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            : quality === 'good'
                              ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                              : quality === 'mediocre'
                                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                : 'bg-red-100 text-red-700 hover:bg-red-200'
                        }`}
                      >
                        {quality.charAt(0).toUpperCase() + quality.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
