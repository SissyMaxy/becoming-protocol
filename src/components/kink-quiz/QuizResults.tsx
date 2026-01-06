/**
 * Quiz Results Component
 * Display calculated vector levels after quiz completion
 */

import { useState, useMemo } from 'react';
import { Trophy, TrendingUp, RotateCcw, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { QUIZ_QUESTIONS } from '../../data/kink-quiz-data';
import {
  calculateAllVectorLevels,
  getQuizSummary,
  getTopVectors,
  type QuizResponse,
} from '../../lib/kink-quiz';
import { ALL_VECTORS } from '../../data/vector-definitions';
import type { VectorId } from '../../types/adaptive-feminization';

interface QuizResultsProps {
  responses: QuizResponse[];
  xpEarned: number;
  onRetake: () => void;
  onDone: () => void;
}

export function QuizResults({ responses, xpEarned, onRetake, onDone }: QuizResultsProps) {
  const { isBambiMode } = useBambiMode();
  const [showAllVectors, setShowAllVectors] = useState(false);

  // Calculate results
  const levels = useMemo(() => calculateAllVectorLevels(responses), [responses]);
  const summary = useMemo(() => getQuizSummary(levels), [levels]);
  const topVectors = useMemo(() => getTopVectors(levels, 5), [levels]);

  // Get vector display info
  const getVectorName = (vectorId: VectorId): string => {
    const vector = ALL_VECTORS.find(v => v.id === vectorId);
    return vector?.name || vectorId;
  };

  const getVectorCategory = (vectorId: VectorId): 'feminization' | 'sissification' => {
    const question = QUIZ_QUESTIONS.find(q => q.vectorId === vectorId);
    return question?.category || 'feminization';
  };

  // Group vectors by category
  const feminizationVectors = Object.entries(levels)
    .filter(([id]) => getVectorCategory(id as VectorId) === 'feminization')
    .sort((a, b) => b[1].level - a[1].level);

  const sissificationVectors = Object.entries(levels)
    .filter(([id]) => getVectorCategory(id as VectorId) === 'sissification')
    .sort((a, b) => b[1].level - a[1].level);

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className={`p-6 text-center ${
        isBambiMode
          ? 'bg-gradient-to-b from-pink-100 to-white'
          : 'bg-gradient-to-b from-protocol-surface to-protocol-bg'
      }`}>
        {/* Trophy */}
        <div className={`w-20 h-20 mx-auto mb-4 rounded-full flex items-center justify-center ${
          isBambiMode ? 'bg-pink-200' : 'bg-protocol-accent/20'
        }`}>
          <Trophy className={`w-10 h-10 ${
            isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
          }`} />
        </div>

        <h1 className={`text-2xl font-bold mb-2 ${
          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
        }`}>
          Quiz Complete!
        </h1>

        <p className={`text-sm ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
        }`}>
          Your readiness profile has been calculated
        </p>

        {/* XP earned */}
        <div className={`inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-full ${
          isBambiMode ? 'bg-pink-100 text-pink-600' : 'bg-amber-900/30 text-amber-400'
        }`}>
          <span className="text-lg">✨</span>
          <span className="font-bold">+{xpEarned} XP</span>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Summary stats */}
        <div className={`grid grid-cols-2 gap-4 p-4 rounded-xl ${
          isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
        }`}>
          <div className="text-center">
            <p className={`text-2xl font-bold ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text'
            }`}>
              {summary.averageLevel.toFixed(1)}
            </p>
            <p className={`text-xs ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}>
              Average Level
            </p>
          </div>
          <div className="text-center">
            <p className={`text-2xl font-bold ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text'
            }`}>
              {summary.vectorsWithProgress}
            </p>
            <p className={`text-xs ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}>
              Active Vectors
            </p>
          </div>
          <div className="text-center">
            <p className={`text-2xl font-bold ${
              isBambiMode ? 'text-pink-600' : 'text-pink-400'
            }`}>
              {summary.feminizationAverage.toFixed(1)}
            </p>
            <p className={`text-xs ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}>
              Feminization
            </p>
          </div>
          <div className="text-center">
            <p className={`text-2xl font-bold ${
              isBambiMode ? 'text-purple-600' : 'text-purple-400'
            }`}>
              {summary.sissificationAverage.toFixed(1)}
            </p>
            <p className={`text-xs ${
              isBambiMode ? 'text-purple-400' : 'text-protocol-text-muted'
            }`}>
              Sissification
            </p>
          </div>
        </div>

        {/* Top vectors */}
        <div>
          <h3 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text'
          }`}>
            <TrendingUp className="w-4 h-4" />
            Your Strongest Areas
          </h3>
          <div className="space-y-2">
            {topVectors.map((result) => (
              <VectorBar
                key={result.vectorId}
                vectorId={result.vectorId}
                level={result.level}
                name={getVectorName(result.vectorId)}
                category={getVectorCategory(result.vectorId)}
              />
            ))}
          </div>
        </div>

        {/* All vectors (collapsible) */}
        <div>
          <button
            onClick={() => setShowAllVectors(!showAllVectors)}
            className={`w-full p-3 rounded-xl flex items-center justify-between ${
              isBambiMode
                ? 'bg-pink-50 text-pink-600 hover:bg-pink-100'
                : 'bg-protocol-surface text-protocol-text hover:bg-protocol-surface-light'
            }`}
          >
            <span className="font-medium">View All Vectors</span>
            {showAllVectors ? (
              <ChevronUp className="w-5 h-5" />
            ) : (
              <ChevronDown className="w-5 h-5" />
            )}
          </button>

          {showAllVectors && (
            <div className="mt-4 space-y-6">
              {/* Feminization */}
              <div>
                <h4 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${
                  isBambiMode ? 'text-pink-500' : 'text-pink-400'
                }`}>
                  Feminization ({feminizationVectors.length})
                </h4>
                <div className="space-y-2">
                  {feminizationVectors.map(([vectorId, result]) => (
                    <VectorBar
                      key={vectorId}
                      vectorId={vectorId as VectorId}
                      level={result.level}
                      name={getVectorName(vectorId as VectorId)}
                      category="feminization"
                      compact
                    />
                  ))}
                </div>
              </div>

              {/* Sissification */}
              <div>
                <h4 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${
                  isBambiMode ? 'text-purple-500' : 'text-purple-400'
                }`}>
                  Sissification ({sissificationVectors.length})
                </h4>
                <div className="space-y-2">
                  {sissificationVectors.map(([vectorId, result]) => (
                    <VectorBar
                      key={vectorId}
                      vectorId={vectorId as VectorId}
                      level={result.level}
                      name={getVectorName(vectorId as VectorId)}
                      category="sissification"
                      compact
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-3 pt-4">
          <button
            onClick={onDone}
            className={`w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 ${
              isBambiMode
                ? 'bg-pink-500 text-white hover:bg-pink-600'
                : 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
            }`}
          >
            <Check className="w-5 h-5" />
            Done
          </button>

          <button
            onClick={onRetake}
            className={`w-full py-4 rounded-xl font-semibold border flex items-center justify-center gap-2 ${
              isBambiMode
                ? 'border-pink-300 text-pink-600 hover:bg-pink-50'
                : 'border-protocol-border text-protocol-text hover:bg-protocol-surface'
            }`}
          >
            <RotateCcw className="w-5 h-5" />
            Retake Quiz
          </button>
        </div>
      </div>
    </div>
  );
}

// Vector level bar component
function VectorBar({
  vectorId: _vectorId,
  level,
  name,
  category,
  compact = false,
}: {
  vectorId: VectorId;
  level: number;
  name: string;
  category: 'feminization' | 'sissification';
  compact?: boolean;
}) {
  const { isBambiMode } = useBambiMode();
  const percentage = (level / 10) * 100;

  const barColor = category === 'feminization'
    ? isBambiMode ? 'bg-pink-400' : 'bg-pink-500'
    : isBambiMode ? 'bg-purple-400' : 'bg-purple-500';

  const bgColor = category === 'feminization'
    ? isBambiMode ? 'bg-pink-100' : 'bg-pink-900/30'
    : isBambiMode ? 'bg-purple-100' : 'bg-purple-900/30';

  return (
    <div className={`p-3 rounded-lg ${
      isBambiMode ? 'bg-white border border-pink-100' : 'bg-protocol-surface'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`${compact ? 'text-xs' : 'text-sm'} font-medium ${
          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
        }`}>
          {name}
        </span>
        <span className={`${compact ? 'text-xs' : 'text-sm'} font-bold ${
          category === 'feminization'
            ? isBambiMode ? 'text-pink-500' : 'text-pink-400'
            : isBambiMode ? 'text-purple-500' : 'text-purple-400'
        }`}>
          L{level.toFixed(1)}
        </span>
      </div>
      <div className={`h-2 rounded-full overflow-hidden ${bgColor}`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
