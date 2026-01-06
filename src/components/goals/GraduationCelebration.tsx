// Graduation Celebration Component
// Celebrates when a goal becomes automatic/internalized

import { useEffect, useState } from 'react';
import { Trophy, Sparkles, Star, Heart } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { Goal } from '../../types/goals';
import { getDomainLabel, getDomainColor } from '../../types/goals';

interface GraduationCelebrationProps {
  goal: Goal;
  onClose: () => void;
}

export function GraduationCelebration({ goal, onClose }: GraduationCelebrationProps) {
  const { isBambiMode } = useBambiMode();
  const [showContent, setShowContent] = useState(false);
  const [confetti, setConfetti] = useState<Array<{ id: number; x: number; delay: number }>>([]);

  const domainColor = getDomainColor(goal.domain);

  useEffect(() => {
    // Generate confetti
    const pieces = Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 0.5,
    }));
    setConfetti(pieces);

    // Show content after a short delay
    const timer = setTimeout(() => setShowContent(true), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      {/* Confetti */}
      {confetti.map((piece) => (
        <div
          key={piece.id}
          className="absolute animate-fall"
          style={{
            left: `${piece.x}%`,
            top: '-20px',
            animationDelay: `${piece.delay}s`,
          }}
        >
          <Star
            className={`w-4 h-4 ${
              piece.id % 3 === 0
                ? 'text-yellow-400'
                : piece.id % 3 === 1
                ? 'text-pink-400'
                : 'text-purple-400'
            }`}
          />
        </div>
      ))}

      <div
        className={`w-full max-w-sm rounded-2xl overflow-hidden transform transition-all duration-500 ${
          showContent ? 'scale-100 opacity-100' : 'scale-90 opacity-0'
        } ${isBambiMode ? 'bg-white' : 'bg-protocol-surface'}`}
      >
        {/* Trophy header */}
        <div
          className="py-8 text-center"
          style={{
            background: `linear-gradient(135deg, ${domainColor}40, ${domainColor}20)`,
          }}
        >
          <div className="relative inline-block">
            <Trophy className="w-20 h-20 text-yellow-500 mx-auto" />
            <Sparkles
              className="absolute -top-2 -right-2 w-6 h-6 text-yellow-400 animate-pulse"
            />
            <Sparkles
              className="absolute -bottom-1 -left-2 w-5 h-5 text-pink-400 animate-pulse"
              style={{ animationDelay: '0.3s' }}
            />
          </div>
        </div>

        {/* Content */}
        <div className="p-6 text-center space-y-4">
          <h2
            className={`text-xl font-bold ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}
          >
            Goal Graduated!
          </h2>

          <div
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${
              isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface-light'
            }`}
          >
            <span
              className="text-sm px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: `${domainColor}30`,
                color: domainColor,
              }}
            >
              {getDomainLabel(goal.domain)}
            </span>
            <span
              className={`text-sm font-medium ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              {goal.name}
            </span>
          </div>

          <p
            className={`text-sm ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
            }`}
          >
            You've practiced this for{' '}
            <strong>{goal.graduationThreshold} consecutive days</strong>.
          </p>

          <div
            className={`py-4 px-5 rounded-xl ${
              isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface-light'
            }`}
          >
            <p
              className={`text-sm italic ${
                isBambiMode ? 'text-pink-700' : 'text-protocol-text'
              }`}
            >
              "This is no longer something you practice.
              <br />
              It's now part of who you are."
            </p>
          </div>

          <p
            className={`text-xs ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}
          >
            This goal has been moved to your "Graduated Skills" collection.
          </p>

          <div className="pt-2">
            <button
              onClick={onClose}
              className={`w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 ${
                isBambiMode
                  ? 'bg-pink-500 text-white hover:bg-pink-600'
                  : 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
              }`}
            >
              <Heart className="w-4 h-4" />
              Continue Becoming
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
        .animate-fall {
          animation: fall 3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
