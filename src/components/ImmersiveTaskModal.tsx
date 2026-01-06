// ImmersiveTaskModal.tsx
// Clean, focused task view with essential information only

import { useState } from 'react';
import {
  X,
  Clock,
  ChevronDown,
  ChevronUp,
  Check,
  Target,
  Heart,
  Sparkles,
  ListChecks,
} from 'lucide-react';
import { ProtocolTask } from '../types';
import { getDomainInfo } from '../data/constants';
import { useBambiMode } from '../context/BambiModeContext';

interface ImmersiveTaskModalProps {
  task: ProtocolTask;
  onClose: () => void;
  onComplete: () => void;
  isCompleted: boolean;
}

export function ImmersiveTaskModal({
  task,
  onClose,
  onComplete,
  isCompleted,
}: ImmersiveTaskModalProps) {
  const { isBambiMode, triggerHearts } = useBambiMode();
  const [showSteps, setShowSteps] = useState(true);
  const [showTips, setShowTips] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const domainInfo = getDomainInfo(task.domain);

  const handleComplete = () => {
    onComplete();
    if (isBambiMode) {
      triggerHearts();
    }
  };

  const toggleStep = (index: number) => {
    setCompletedSteps(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const allStepsCompleted = task.instructions?.steps
    ? completedSteps.size === task.instructions.steps.length
    : false;

  return (
    <div className="fixed inset-0 z-50 bg-black overflow-hidden">
      {/* Hero Image */}
      <div className="relative h-48 overflow-hidden">
        {task.imageUrl ? (
          <img
            src={task.imageUrl}
            alt={task.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className={`w-full h-full bg-gradient-to-br ${
              isBambiMode
                ? 'from-pink-500 via-pink-600 to-fuchsia-700'
                : 'from-gray-800 via-gray-900 to-black'
            }`}
          />
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Domain badge */}
        <div className="absolute top-4 left-4">
          <span
            className="px-3 py-1.5 rounded-full text-sm font-medium"
            style={{
              backgroundColor: domainInfo.color,
              color: 'white',
            }}
          >
            {domainInfo.label}
          </span>
        </div>

        {/* Title overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-5">
          <h1 className="text-2xl font-bold text-white mb-1">{task.title}</h1>
          <div className="flex items-center gap-4 text-white/80 text-sm">
            {task.duration && (
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {task.duration} min
              </span>
            )}
            {task.instructions?.steps && (
              <span className="flex items-center gap-1">
                <ListChecks className="w-4 h-4" />
                {task.instructions.steps.length} steps
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Goal Card - Fixed at top */}
      {task.instructions?.goal && (
        <div className={`mx-4 -mt-5 relative z-10 p-4 rounded-xl border ${
          isBambiMode
            ? 'bg-pink-900/90 border-pink-500'
            : 'bg-emerald-900/90 border-emerald-500'
        }`}>
          <div className="flex items-center gap-3">
            <Target className={`w-5 h-5 ${isBambiMode ? 'text-pink-400' : 'text-emerald-400'}`} />
            <p className="text-white font-semibold">{task.instructions.goal}</p>
          </div>
        </div>
      )}

      {/* Scrollable content */}
      <div className="h-[calc(100vh-12rem-5rem)] overflow-y-auto">
        <div className="p-4 space-y-4">

          {/* Overview */}
          {task.instructions?.overview && (
            <p className={`text-sm leading-relaxed ${
              isBambiMode ? 'text-pink-100' : 'text-gray-300'
            }`}>
              {task.instructions.overview}
            </p>
          )}

          {/* Steps */}
          {task.instructions?.steps && task.instructions.steps.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => setShowSteps(!showSteps)}
                className={`w-full flex items-center justify-between p-3 rounded-xl ${
                  isBambiMode
                    ? 'bg-pink-900/40 border border-pink-700/50'
                    : 'bg-gray-900/50 border border-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <ListChecks className={`w-5 h-5 ${isBambiMode ? 'text-pink-400' : 'text-white'}`} />
                  <span className={`font-medium ${isBambiMode ? 'text-pink-100' : 'text-white'}`}>
                    Steps
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    allStepsCompleted
                      ? 'bg-green-500/20 text-green-400'
                      : isBambiMode
                        ? 'bg-pink-800/50 text-pink-300'
                        : 'bg-gray-700 text-gray-300'
                  }`}>
                    {completedSteps.size}/{task.instructions.steps.length}
                  </span>
                </div>
                {showSteps ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>

              {showSteps && (
                <div className="space-y-2">
                  {task.instructions.steps.map((step, index) => (
                    <button
                      key={index}
                      onClick={() => toggleStep(index)}
                      className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all ${
                        completedSteps.has(index)
                          ? isBambiMode
                            ? 'bg-pink-800/30 border border-pink-600/50'
                            : 'bg-green-900/20 border border-green-700/50'
                          : isBambiMode
                            ? 'bg-pink-900/20 border border-pink-800/30'
                            : 'bg-gray-900/30 border border-gray-800'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${
                        completedSteps.has(index)
                          ? isBambiMode
                            ? 'bg-pink-500 text-white'
                            : 'bg-green-500 text-white'
                          : isBambiMode
                            ? 'bg-pink-800/50 text-pink-300 border border-pink-600'
                            : 'bg-gray-800 text-gray-300 border border-gray-600'
                      }`}>
                        {completedSteps.has(index) ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          index + 1
                        )}
                      </div>
                      <p className={`flex-1 text-sm ${
                        completedSteps.has(index)
                          ? isBambiMode ? 'text-pink-300' : 'text-green-300'
                          : isBambiMode ? 'text-pink-100' : 'text-gray-200'
                      }`}>
                        {step}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tips */}
          {task.instructions?.tips && task.instructions.tips.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => setShowTips(!showTips)}
                className={`w-full flex items-center justify-between p-3 rounded-xl ${
                  isBambiMode
                    ? 'bg-purple-900/30 border border-purple-700/50'
                    : 'bg-blue-900/20 border border-blue-800/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Sparkles className={`w-5 h-5 ${isBambiMode ? 'text-purple-400' : 'text-blue-400'}`} />
                  <span className={`font-medium ${isBambiMode ? 'text-purple-100' : 'text-blue-100'}`}>
                    Tips
                  </span>
                </div>
                {showTips ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>

              {showTips && (
                <div className={`p-3 rounded-xl space-y-2 ${
                  isBambiMode ? 'bg-purple-900/20' : 'bg-blue-900/10'
                }`}>
                  {task.instructions.tips.map((tip, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <Sparkles className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                        isBambiMode ? 'text-purple-400' : 'text-blue-400'
                      }`} />
                      <p className={`text-sm ${
                        isBambiMode ? 'text-purple-100' : 'text-blue-100'
                      }`}>
                        {tip}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Affirmation */}
          {task.affirmation && (
            <div className={`p-4 rounded-xl text-center ${
              isBambiMode
                ? 'bg-pink-900/30 border border-pink-600/30'
                : 'bg-purple-900/30 border border-purple-600/30'
            }`}>
              <Heart className={`w-5 h-5 mx-auto mb-2 ${
                isBambiMode ? 'text-pink-400' : 'text-purple-400'
              }`} />
              <p className={`text-sm italic ${
                isBambiMode ? 'text-pink-100' : 'text-purple-100'
              }`}>
                "{task.affirmation}"
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Fixed bottom action */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black via-black to-transparent pt-8">
        <button
          onClick={handleComplete}
          disabled={isCompleted}
          className={`w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 transition-all ${
            isCompleted
              ? isBambiMode
                ? 'bg-pink-800/50 text-pink-300'
                : 'bg-gray-800 text-gray-400'
              : allStepsCompleted
                ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white shadow-lg shadow-green-500/30'
                : isBambiMode
                  ? 'bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white hover:from-pink-400 hover:to-fuchsia-400 shadow-lg shadow-pink-500/30'
                  : 'bg-white text-black hover:bg-gray-100'
          }`}
        >
          <Check className="w-5 h-5" />
          {isCompleted ? 'Completed' : allStepsCompleted ? 'All Done!' : 'Complete'}
        </button>
      </div>
    </div>
  );
}
