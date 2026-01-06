/**
 * Quiz Progress Bar Component
 * Progress indicator with milestone celebrations
 */

import { useBambiMode } from '../../context/BambiModeContext';

interface QuizProgressBarProps {
  current: number;
  total: number;
  showMilestone: boolean;
}

export function QuizProgressBar({ current, total, showMilestone }: QuizProgressBarProps) {
  const { isBambiMode } = useBambiMode();
  const progress = (current / total) * 100;

  // Milestone messages
  const getMilestoneMessage = () => {
    if (current === 25) return "Great start! Keep going!";
    if (current === 50) return "Halfway there!";
    if (current === 75) return "Almost done!";
    if (current === 100) return "Final stretch!";
    return "";
  };

  return (
    <div className={`sticky top-0 z-10 p-4 border-b ${
      isBambiMode ? 'bg-white border-pink-200' : 'bg-protocol-bg border-protocol-border'
    }`}>
      {/* Progress bar */}
      <div className="relative">
        <div className={`h-2 rounded-full overflow-hidden ${
          isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface-light'
        }`}>
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              isBambiMode
                ? 'bg-gradient-to-r from-pink-400 to-pink-600'
                : 'bg-gradient-to-r from-protocol-accent to-purple-500'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Milestone markers */}
        <div className="absolute top-0 left-0 right-0 h-2 flex justify-between px-[12.5%]">
          {[25, 50, 75].map(milestone => (
            <div
              key={milestone}
              className={`w-1 h-full ${
                current >= milestone
                  ? isBambiMode ? 'bg-pink-300' : 'bg-protocol-accent/50'
                  : 'bg-transparent'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Progress text */}
      <div className="flex justify-between items-center mt-2">
        <span className={`text-xs font-medium ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
        }`}>
          {current} / {total}
        </span>
        <span className={`text-xs ${
          isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
        }`}>
          {Math.round(progress)}% complete
        </span>
      </div>

      {/* Milestone celebration overlay */}
      {showMilestone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className={`px-8 py-4 rounded-2xl shadow-2xl animate-bounce ${
            isBambiMode
              ? 'bg-pink-500 text-white'
              : 'bg-protocol-accent text-white'
          }`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">🎉</span>
              <span className="text-lg font-bold">{getMilestoneMessage()}</span>
              <span className="text-2xl">🎉</span>
            </div>
          </div>

          {/* Confetti effect (CSS-based) */}
          <div className="absolute inset-0 overflow-hidden">
            {[...Array(20)].map((_, i) => (
              <div
                key={i}
                className="absolute w-3 h-3 rounded-full animate-confetti"
                style={{
                  left: `${Math.random() * 100}%`,
                  backgroundColor: ['#ec4899', '#a855f7', '#f59e0b', '#22c55e', '#3b82f6'][i % 5],
                  animationDelay: `${Math.random() * 0.5}s`,
                  animationDuration: `${1 + Math.random()}s`,
                }}
              />
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes confetti {
          0% {
            transform: translateY(-100vh) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
        .animate-confetti {
          animation: confetti 2s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
