import { useState, useEffect } from 'react';
import { Star, Sparkles, ArrowUp, Crown } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { LEVEL_TITLES } from '../../types/rewards';

interface RewardLevelUpModalProps {
  newLevel: number;
  newTitle: string;
  onDismiss: () => void;
}

export function RewardLevelUpModal({
  newLevel,
  newTitle,
  onDismiss,
}: RewardLevelUpModalProps) {
  const { isBambiMode, triggerHearts } = useBambiMode();
  const [animationPhase, setAnimationPhase] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Phase animations
    setTimeout(() => setIsVisible(true), 50);
    setTimeout(() => setAnimationPhase(1), 300);
    setTimeout(() => setAnimationPhase(2), 800);
    setTimeout(() => setAnimationPhase(3), 1200);

    // Trigger hearts in Bambi mode for high levels
    if (isBambiMode && newLevel >= 5) {
      triggerHearts();
    }
  }, [isBambiMode, newLevel, triggerHearts]);

  const isMaxLevel = newLevel >= LEVEL_TITLES.length;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      } ${isBambiMode ? 'bg-pink-900/90' : 'bg-protocol-bg/95'}`}
    >
      {/* Background particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 15 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 rounded-full animate-float"
            style={{
              backgroundColor: isBambiMode
                ? 'rgba(255, 105, 180, 0.4)'
                : 'rgba(139, 92, 246, 0.4)',
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${3 + Math.random() * 2}s`,
            }}
          />
        ))}
      </div>

      <div
        className={`w-full max-w-sm transition-all duration-500 ${
          isVisible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'
        }`}
      >
        <div
          className={`relative overflow-hidden rounded-2xl p-8 text-center ${
            isBambiMode
              ? 'bg-white border-2 border-pink-200'
              : 'bg-protocol-surface border border-protocol-border'
          }`}
          style={{
            boxShadow: isBambiMode
              ? '0 0 60px rgba(255, 105, 180, 0.4)'
              : '0 0 60px rgba(139, 92, 246, 0.3)',
          }}
        >
          {/* Level up badge */}
          <div
            className={`mb-6 transition-all duration-500 ${
              animationPhase >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <div
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
                isBambiMode
                  ? 'bg-pink-100 text-pink-600'
                  : 'bg-protocol-accent/20 text-protocol-accent'
              }`}
            >
              <ArrowUp className="w-4 h-4" />
              <span>Level Up!</span>
            </div>
          </div>

          {/* Level number with icon */}
          <div
            className={`relative w-28 h-28 mx-auto mb-6 transition-all duration-500 ${
              animationPhase >= 1 ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
            }`}
          >
            {/* Outer ring */}
            <div
              className={`absolute inset-0 rounded-full border-4 ${
                isBambiMode ? 'border-pink-300' : 'border-protocol-accent/40'
              }`}
            />

            {/* Inner circle with level */}
            <div
              className={`absolute inset-2 rounded-full flex items-center justify-center ${
                isBambiMode
                  ? 'bg-gradient-to-br from-pink-100 to-pink-200'
                  : 'bg-protocol-accent/20'
              }`}
            >
              {isMaxLevel ? (
                <Crown
                  className={`w-12 h-12 ${
                    isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
                  }`}
                />
              ) : (
                <span
                  className={`text-4xl font-bold ${
                    isBambiMode ? 'text-pink-600' : 'text-protocol-accent'
                  }`}
                >
                  {newLevel}
                </span>
              )}
            </div>

            {/* Sparkle decorations */}
            <Sparkles
              className={`absolute -top-1 -right-1 w-6 h-6 ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-accent'
              } ${animationPhase >= 2 ? 'animate-pulse' : 'opacity-0'}`}
            />
            <Star
              className={`absolute -bottom-1 -left-1 w-5 h-5 ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-accent'
              } ${animationPhase >= 2 ? 'animate-pulse' : 'opacity-0'}`}
              style={{ animationDelay: '0.2s' }}
            />
          </div>

          {/* Title */}
          <h2
            className={`text-3xl font-bold mb-2 transition-all duration-500 ${
              animationPhase >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            } ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}
          >
            {newTitle}
          </h2>

          {/* Level indicator */}
          <p
            className={`text-lg mb-6 transition-all duration-500 ${
              animationPhase >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            } ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}
          >
            {isMaxLevel ? 'Maximum Level Achieved!' : `Level ${newLevel}`}
          </p>

          {/* Motivational message */}
          <p
            className={`mb-8 transition-all duration-500 ${
              animationPhase >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            } ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`}
          >
            {getMotivationalMessage(newLevel, isBambiMode)}
          </p>

          {/* Stars showing level progress */}
          <div
            className={`flex justify-center gap-2 mb-8 transition-all duration-500 ${
              animationPhase >= 3 ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {Array.from({ length: Math.min(newLevel, 10) }).map((_, i) => (
              <Star
                key={i}
                className={`w-5 h-5 transition-all ${
                  isBambiMode
                    ? 'text-pink-400 fill-pink-400'
                    : 'text-protocol-accent fill-protocol-accent'
                }`}
                style={{
                  animationDelay: `${i * 100}ms`,
                  opacity: animationPhase >= 3 ? 1 : 0,
                  transform: animationPhase >= 3 ? 'scale(1)' : 'scale(0)',
                  transition: `all 0.3s ease ${i * 50}ms`,
                }}
              />
            ))}
          </div>

          {/* Continue button */}
          <button
            onClick={onDismiss}
            disabled={animationPhase < 3}
            className={`w-full py-4 rounded-xl font-medium transition-all duration-300 ${
              animationPhase >= 3
                ? isBambiMode
                  ? 'bg-gradient-to-r from-pink-400 to-pink-600 text-white hover:shadow-lg'
                  : 'bg-protocol-accent text-white hover:bg-protocol-accent-soft'
                : isBambiMode
                  ? 'bg-pink-100 text-pink-300'
                  : 'bg-protocol-surface-light text-protocol-text-muted'
            }`}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

function getMotivationalMessage(level: number, isBambi: boolean): string {
  const messages = [
    '', // Level 0/1
    "You're just getting started!",
    'Building momentum...',
    'Your dedication is showing!',
    "You're halfway there!",
    'Truly transforming...',
    'Your commitment inspires!',
    'Nearly at the top!',
    'Outstanding progress!',
    'You are radiant!',
    'You have achieved everything!',
  ];

  const bambiMessages = [
    '',
    'Starting your journey~',
    'Such a good start!',
    'So proud of you!',
    'Halfway to being perfect!',
    'Becoming so beautiful!',
    'Your glow is showing!',
    'Almost at the top!',
    'So amazing!',
    'Absolutely stunning!',
    'Perfect in every way!',
  ];

  const index = Math.min(level, messages.length - 1);
  return isBambi ? bambiMessages[index] : messages[index];
}
