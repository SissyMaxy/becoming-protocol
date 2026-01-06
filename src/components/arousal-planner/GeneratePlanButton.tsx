/**
 * Generate Plan Button
 * Shows when no plan exists for today
 */

import { useState } from 'react';
import { Sparkles, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { GeneratedPrescription } from '../../lib/arousal-planner';
import type { PlanIntensity } from '../../types/arousal-planner';
import { PLAN_INTENSITY_CONFIG } from '../../types/arousal-planner';

interface GeneratePlanButtonProps {
  onGenerate: () => Promise<void>;
  preview?: GeneratedPrescription | null;
  isGenerating?: boolean;
}

export function GeneratePlanButton({
  onGenerate,
  preview,
  isGenerating = false,
}: GeneratePlanButtonProps) {
  const { isBambiMode } = useBambiMode();
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className={`rounded-2xl p-5 ${
      isBambiMode ? 'bg-white shadow-sm' : 'bg-protocol-surface'
    }`}>
      {/* Header */}
      <div className="text-center mb-4">
        <div className={`inline-flex p-3 rounded-full mb-3 ${
          isBambiMode ? 'bg-purple-100' : 'bg-purple-900/30'
        }`}>
          <Sparkles className={`w-6 h-6 ${isBambiMode ? 'text-purple-600' : 'text-purple-400'}`} />
        </div>
        <h3 className={`text-lg font-bold ${
          isBambiMode ? 'text-gray-800' : 'text-protocol-text'
        }`}>
          Daily Arousal Plan
        </h3>
        <p className={`text-sm mt-1 ${
          isBambiMode ? 'text-gray-600' : 'text-protocol-text-muted'
        }`}>
          Generate your personalized prescription based on your current state
        </p>
      </div>

      {/* Preview toggle */}
      {preview && (
        <button
          onClick={() => setShowPreview(!showPreview)}
          className={`w-full flex items-center justify-between p-3 rounded-lg mb-4 ${
            isBambiMode
              ? 'bg-gray-50 hover:bg-gray-100'
              : 'bg-gray-800 hover:bg-gray-700'
          }`}
        >
          <span className={`text-sm font-medium ${
            isBambiMode ? 'text-gray-700' : 'text-protocol-text'
          }`}>
            Preview Plan
          </span>
          {showPreview ? (
            <ChevronUp className={`w-4 h-4 ${isBambiMode ? 'text-gray-500' : 'text-gray-400'}`} />
          ) : (
            <ChevronDown className={`w-4 h-4 ${isBambiMode ? 'text-gray-500' : 'text-gray-400'}`} />
          )}
        </button>
      )}

      {/* Preview content */}
      {showPreview && preview && (
        <div className={`p-4 rounded-lg mb-4 ${
          isBambiMode ? 'bg-purple-50' : 'bg-purple-900/20'
        }`}>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className={isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'}>Intensity</p>
              <p className={`font-semibold ${isBambiMode ? 'text-gray-800' : 'text-protocol-text'}`}>
                {PLAN_INTENSITY_CONFIG[preview.planIntensity as PlanIntensity].emoji} {PLAN_INTENSITY_CONFIG[preview.planIntensity as PlanIntensity].label}
              </p>
            </div>
            <div>
              <p className={isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'}>Sessions</p>
              <p className={`font-semibold ${isBambiMode ? 'text-gray-800' : 'text-protocol-text'}`}>
                {preview.sessions.length}
              </p>
            </div>
            <div>
              <p className={isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'}>Total Edges</p>
              <p className={`font-semibold ${isBambiMode ? 'text-gray-800' : 'text-protocol-text'}`}>
                {preview.totalTargetEdges}
              </p>
            </div>
            <div>
              <p className={isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'}>Total Time</p>
              <p className={`font-semibold ${isBambiMode ? 'text-gray-800' : 'text-protocol-text'}`}>
                {preview.totalTargetDurationMinutes} min
              </p>
            </div>
            <div>
              <p className={isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'}>Check-ins</p>
              <p className={`font-semibold ${isBambiMode ? 'text-gray-800' : 'text-protocol-text'}`}>
                {preview.checkIns.length}
              </p>
            </div>
            <div>
              <p className={isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'}>Milestones</p>
              <p className={`font-semibold ${isBambiMode ? 'text-gray-800' : 'text-protocol-text'}`}>
                {preview.milestones.length}
              </p>
            </div>
          </div>

          {/* Session times */}
          {preview.sessions.length > 0 && (
            <div className="mt-3 pt-3 border-t border-purple-200 dark:border-purple-800">
              <p className={`text-xs mb-2 ${isBambiMode ? 'text-gray-500' : 'text-protocol-text-muted'}`}>
                Session Schedule
              </p>
              <div className="flex flex-wrap gap-2">
                {preview.sessions.map((s, idx) => (
                  <span
                    key={idx}
                    className={`text-xs px-2 py-1 rounded ${
                      isBambiMode ? 'bg-white text-gray-700' : 'bg-gray-800 text-gray-300'
                    }`}
                  >
                    {s.scheduledTime} - {s.sessionType.replace('_', ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={onGenerate}
        disabled={isGenerating}
        className={`w-full py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 ${
          isBambiMode
            ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white'
            : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white'
        } disabled:opacity-50`}
      >
        {isGenerating ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <>
            <Sparkles className="w-5 h-5" />
            Generate Today's Plan
          </>
        )}
      </button>
    </div>
  );
}
