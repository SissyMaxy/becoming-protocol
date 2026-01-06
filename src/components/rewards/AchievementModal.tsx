import { useState, useEffect } from 'react';
import { Trophy, Star, Sparkles, Crown, Gem, Medal, X } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { Achievement, AchievementRarity } from '../../types/rewards';

interface AchievementModalProps {
  achievement: Achievement;
  pointsAwarded: number;
  onDismiss: () => void;
}

const RARITY_COLORS: Record<AchievementRarity, { bg: string; text: string; border: string; glow: string }> = {
  common: {
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    border: 'border-gray-300',
    glow: 'rgba(156, 163, 175, 0.4)',
  },
  uncommon: {
    bg: 'bg-green-100',
    text: 'text-green-600',
    border: 'border-green-300',
    glow: 'rgba(34, 197, 94, 0.4)',
  },
  rare: {
    bg: 'bg-blue-100',
    text: 'text-blue-600',
    border: 'border-blue-300',
    glow: 'rgba(59, 130, 246, 0.4)',
  },
  epic: {
    bg: 'bg-purple-100',
    text: 'text-purple-600',
    border: 'border-purple-300',
    glow: 'rgba(168, 85, 247, 0.5)',
  },
  legendary: {
    bg: 'bg-amber-100',
    text: 'text-amber-600',
    border: 'border-amber-300',
    glow: 'rgba(245, 158, 11, 0.5)',
  },
};

const RARITY_ICONS: Record<AchievementRarity, React.ElementType> = {
  common: Medal,
  uncommon: Star,
  rare: Gem,
  epic: Crown,
  legendary: Trophy,
};

export function AchievementModal({
  achievement,
  pointsAwarded,
  onDismiss,
}: AchievementModalProps) {
  const { isBambiMode, triggerHearts } = useBambiMode();
  const [animationPhase, setAnimationPhase] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  const rarityConfig = RARITY_COLORS[achievement.rarity];
  const RarityIcon = RARITY_ICONS[achievement.rarity];

  useEffect(() => {
    // Phase animations
    setTimeout(() => setIsVisible(true), 50);
    setTimeout(() => setAnimationPhase(1), 300);
    setTimeout(() => setAnimationPhase(2), 800);
    setTimeout(() => setAnimationPhase(3), 1200);

    // Trigger hearts for epic/legendary in Bambi mode
    if (isBambiMode && (achievement.rarity === 'epic' || achievement.rarity === 'legendary')) {
      triggerHearts();
    }
  }, [achievement.rarity, isBambiMode, triggerHearts]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      } ${
        isBambiMode ? 'bg-pink-900/90' : 'bg-protocol-bg/95'
      }`}
    >
      {/* Background particles for epic/legendary */}
      {(achievement.rarity === 'epic' || achievement.rarity === 'legendary') && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-2 h-2 rounded-full animate-float"
              style={{
                backgroundColor: rarityConfig.glow,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${3 + Math.random() * 2}s`,
              }}
            />
          ))}
        </div>
      )}

      <div
        className={`w-full max-w-sm transition-all duration-500 ${
          isVisible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'
        }`}
      >
        <div
          className={`relative overflow-hidden rounded-2xl p-6 text-center ${
            isBambiMode
              ? 'bg-white border-2 border-pink-200'
              : 'bg-protocol-surface border border-protocol-border'
          }`}
          style={{
            boxShadow: `0 0 40px ${rarityConfig.glow}`,
          }}
        >
          {/* Close button */}
          <button
            onClick={onDismiss}
            disabled={animationPhase < 3}
            className={`absolute top-3 right-3 p-1 rounded-full transition-opacity ${
              animationPhase >= 3 ? 'opacity-100' : 'opacity-0'
            } ${
              isBambiMode
                ? 'text-pink-400 hover:bg-pink-100'
                : 'text-protocol-text-muted hover:bg-protocol-surface-light'
            }`}
          >
            <X className="w-5 h-5" />
          </button>

          {/* Header text */}
          <div
            className={`mb-4 transition-all duration-500 ${
              animationPhase >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <span
              className={`text-sm font-medium uppercase tracking-wider ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
              }`}
            >
              Achievement Unlocked!
            </span>
          </div>

          {/* Icon with ring */}
          <div
            className={`relative w-24 h-24 mx-auto mb-6 transition-all duration-500 ${
              animationPhase >= 1 ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
            }`}
          >
            {/* Outer ring */}
            <div
              className={`absolute inset-0 rounded-full border-4 ${rarityConfig.border} transition-all duration-500 ${
                animationPhase >= 1 ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
              }`}
            />
            {/* Inner glow */}
            <div
              className={`absolute inset-2 rounded-full ${rarityConfig.bg}`}
            />
            {/* Icon */}
            <div
              className={`absolute inset-0 flex items-center justify-center ${rarityConfig.text}`}
            >
              <RarityIcon className="w-10 h-10" />
            </div>
          </div>

          {/* Achievement name */}
          <h2
            className={`text-2xl font-bold mb-2 transition-all duration-500 ${
              animationPhase >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            } ${isBambiMode ? 'text-pink-800' : 'text-protocol-text'}`}
          >
            {achievement.name}
          </h2>

          {/* Rarity badge */}
          <div
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium mb-3 ${
              rarityConfig.bg
            } ${rarityConfig.text} transition-all duration-500 ${
              animationPhase >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <RarityIcon className="w-4 h-4" />
            <span className="capitalize">{achievement.rarity}</span>
          </div>

          {/* Description */}
          <p
            className={`mb-6 transition-all duration-500 ${
              animationPhase >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            } ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
            }`}
          >
            {achievement.description}
          </p>

          {/* Points awarded */}
          <div
            className={`flex items-center justify-center gap-2 mb-6 transition-all duration-500 ${
              animationPhase >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <Sparkles
              className={`w-5 h-5 ${
                isBambiMode ? 'text-pink-500' : 'text-protocol-accent'
              }`}
            />
            <span
              className={`text-xl font-bold ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-accent'
              }`}
            >
              +{pointsAwarded} points
            </span>
          </div>

          {/* Continue button */}
          <button
            onClick={onDismiss}
            disabled={animationPhase < 3}
            className={`w-full py-3 rounded-xl font-medium transition-all duration-300 ${
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
