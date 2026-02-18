/**
 * Sealed Content View
 *
 * Phase H2: Time-locked content with BambiMode support.
 * Shows both hardcoded sealed content AND personalized letters from onboarding.
 * Unlock triggers: days, streak, phase, domain_level, date.
 */

import { useState, useEffect } from 'react';
import { useProtocol } from '../context/ProtocolContext';
import { useAuth } from '../context/AuthContext';
import { useBambiMode } from '../context/BambiModeContext';
import {
  getSealedContentStatus,
  getTriggerDescription,
  SealedContent as SealedContentType,
} from '../lib/sealed';
import { letterStorage } from '../lib/storage';
import type { SealedLetter } from '../components/Onboarding/types';
import {
  Lock, Unlock, Mail, Lightbulb, Trophy, Star, X, ChevronRight, Heart,
} from 'lucide-react';

const categoryIcons = {
  letter: Mail,
  insight: Lightbulb,
  challenge: Trophy,
  reward: Star,
};

const categoryColors = {
  letter: '#f472b6',
  insight: '#a78bfa',
  challenge: '#fbbf24',
  reward: '#34d399',
};

// ── Sealed Card ──

interface SealedCardProps {
  content: SealedContentType & { isUnlocked: boolean };
  onClick: () => void;
  isBambiMode: boolean;
}

function SealedCard({ content, onClick, isBambiMode }: SealedCardProps) {
  const Icon = categoryIcons[content.category] || Mail;
  const color = categoryColors[content.category] || '#a855f7';

  return (
    <button
      onClick={onClick}
      disabled={!content.isUnlocked}
      className={`w-full p-4 rounded-lg border text-left transition-all duration-300 ${
        content.isUnlocked
          ? isBambiMode
            ? 'bg-white border-pink-200 hover:border-pink-400'
            : 'bg-protocol-surface border-protocol-border hover:border-protocol-accent'
          : isBambiMode
            ? 'bg-pink-50/50 border-pink-100 cursor-not-allowed opacity-60'
            : 'bg-protocol-surface/50 border-protocol-border/50 cursor-not-allowed opacity-60'
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`p-2 rounded-lg ${content.isUnlocked ? '' : 'grayscale'}`}
          style={{ backgroundColor: `${color}20` }}
        >
          {content.isUnlocked ? (
            <Icon className="w-5 h-5" style={{ color }} />
          ) : (
            <Lock className={`w-5 h-5 ${isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'}`} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className={`font-medium ${
            content.isUnlocked
              ? isBambiMode ? 'text-pink-800' : 'text-protocol-text'
              : isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
          }`}>
            {content.title}
          </p>
          <p className={`text-xs mt-0.5 ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`}>
            {content.isUnlocked ? 'Tap to read' : content.teaser}
          </p>
        </div>

        {content.isUnlocked ? (
          <ChevronRight className={`w-5 h-5 ${isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'}`} />
        ) : (
          <div className={`text-xs px-2 py-1 rounded ${
            isBambiMode ? 'bg-pink-100 text-pink-500' : 'bg-protocol-surface-light text-protocol-text-muted'
          }`}>
            {getTriggerDescription(content.trigger)}
          </div>
        )}
      </div>
    </button>
  );
}

// ── Letter Card (personalized) ──

interface LetterCardProps {
  letter: SealedLetter & { isUnlocked: boolean };
  onClick: () => void;
  isBambiMode: boolean;
}

function LetterCard({ letter, onClick, isBambiMode }: LetterCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={!letter.isUnlocked}
      className={`w-full p-4 rounded-lg border text-left transition-all duration-300 ${
        letter.isUnlocked
          ? isBambiMode
            ? 'bg-white border-pink-200 hover:border-pink-400'
            : 'bg-protocol-surface border-protocol-border hover:border-protocol-accent'
          : isBambiMode
            ? 'bg-pink-50/50 border-pink-100 cursor-not-allowed opacity-60'
            : 'bg-protocol-surface/50 border-protocol-border/50 cursor-not-allowed opacity-60'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg" style={{ backgroundColor: '#ec489920' }}>
          {letter.isUnlocked ? (
            <Heart className="w-5 h-5 text-pink-500" />
          ) : (
            <Lock className={`w-5 h-5 ${isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'}`} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className={`font-medium ${
            letter.isUnlocked
              ? isBambiMode ? 'text-pink-800' : 'text-protocol-text'
              : isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
          }`}>
            {letter.title}
          </p>
          <p className={`text-xs mt-0.5 ${isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'}`}>
            {letter.isUnlocked ? 'Personal letter — tap to read' : (letter.unlockHint || 'A personal letter awaits...')}
          </p>
        </div>

        {letter.isUnlocked && (
          <ChevronRight className={`w-5 h-5 ${isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'}`} />
        )}
      </div>
    </button>
  );
}

// ── Content Modal ──

interface ContentModalProps {
  title: string;
  category: string;
  content: string;
  onClose: () => void;
  isBambiMode: boolean;
}

function ContentModal({ title, category, content, onClose, isBambiMode }: ContentModalProps) {
  const Icon = categoryIcons[category as keyof typeof categoryIcons] || Heart;
  const color = categoryColors[category as keyof typeof categoryColors] || '#ec4899';

  return (
    <div className={`fixed inset-0 z-50 overflow-y-auto animate-slide-up ${
      isBambiMode ? 'bg-white' : 'bg-protocol-bg/95'
    }`}>
      <div className="min-h-screen p-4 max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}20` }}>
              <Icon className="w-5 h-5" style={{ color }} />
            </div>
            <div>
              <p className={`text-xs uppercase tracking-wider ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}>
                {category}
              </p>
              <h2 className={`text-xl font-semibold ${
                isBambiMode ? 'text-pink-800' : 'text-protocol-text'
              }`}>
                {title}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg border transition-colors ${
              isBambiMode
                ? 'bg-pink-50 border-pink-200 hover:border-pink-400'
                : 'bg-protocol-surface border-protocol-border hover:border-protocol-text-muted'
            }`}
          >
            <X className={`w-5 h-5 ${isBambiMode ? 'text-pink-600' : 'text-protocol-text'}`} />
          </button>
        </div>

        {/* Unlock animation */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center animate-pulse"
              style={{ backgroundColor: `${color}20` }}
            >
              <Unlock className="w-8 h-8" style={{ color }} />
            </div>
            <div
              className="absolute inset-0 rounded-full animate-ping opacity-20"
              style={{ backgroundColor: color }}
            />
          </div>
        </div>

        {/* Content */}
        <div className={`rounded-xl p-6 ${
          isBambiMode ? 'bg-pink-50 border border-pink-200' : 'card'
        }`}>
          <div className="prose prose-invert max-w-none">
            {content.split('\n\n').map((paragraph, idx) => (
              <p key={idx} className={`text-sm leading-relaxed mb-4 last:mb-0 ${
                isBambiMode ? 'text-pink-800' : 'text-protocol-text'
              }`}>
                {paragraph}
              </p>
            ))}
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className={`w-full mt-6 py-4 rounded-lg font-medium transition-colors ${
            isBambiMode
              ? 'bg-pink-500 hover:bg-pink-600 text-white'
              : 'bg-protocol-accent hover:bg-protocol-accent-soft text-white'
          }`}
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ── Main View ──

export function SealedContentView() {
  const { progress } = useProtocol();
  const { user } = useAuth();
  const { isBambiMode } = useBambiMode();
  const [selectedContent, setSelectedContent] = useState<{ title: string; category: string; content: string } | null>(null);

  // Hardcoded sealed content
  const allContent = getSealedContentStatus(progress);
  const unlockedCount = allContent.filter(c => c.isUnlocked).length;

  // Personalized letters from onboarding
  const [personalLetters, setPersonalLetters] = useState<(SealedLetter & { isUnlocked: boolean })[]>([]);

  useEffect(() => {
    async function loadLetters() {
      if (!user) return;
      try {
        const unlocked = await letterStorage.getUnlockedLetters();
        const hints = await letterStorage.getLockedLetterHints();

        const unlockedWithFlag = unlocked.map(l => ({ ...l, isUnlocked: true }));
        const lockedWithFlag = hints.map(h => ({
          id: h.id,
          title: 'Sealed Letter',
          letterType: 'milestone' as const,
          content: '',
          unlockType: 'days' as const,
          unlockValue: {},
          unlockHint: h.hint,
          isUnlocked: false,
        }));

        setPersonalLetters([...unlockedWithFlag, ...lockedWithFlag]);
      } catch (err) {
        console.error('Failed to load personal letters:', err);
      }
    }
    loadLetters();
  }, [user]);

  const totalCount = allContent.length + personalLetters.length;
  const totalUnlocked = unlockedCount + personalLetters.filter(l => l.isUnlocked).length;

  // Group hardcoded content by category
  const letters = allContent.filter(c => c.category === 'letter');
  const insights = allContent.filter(c => c.category === 'insight');
  const challenges = allContent.filter(c => c.category === 'challenge');
  const rewards = allContent.filter(c => c.category === 'reward');

  const handleSelectContent = (item: SealedContentType) => {
    setSelectedContent({ title: item.title, category: item.category, content: item.content });
  };

  const handleSelectLetter = (letter: SealedLetter) => {
    setSelectedContent({ title: letter.title, category: 'letter', content: letter.content });
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div>
        <h2 className={`text-xl font-semibold ${isBambiMode ? 'text-pink-800' : 'text-protocol-text'}`}>
          Sealed Content
        </h2>
        <p className={`text-sm ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
          {totalUnlocked} of {totalCount} unlocked
        </p>
      </div>

      {/* Progress */}
      <div className={`p-4 rounded-xl ${
        isBambiMode ? 'bg-white border border-pink-200' : 'card'
      }`}>
        <div className="flex justify-between text-sm mb-2">
          <span className={isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}>
            Discovery Progress
          </span>
          <span className={`font-medium ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
            {totalCount > 0 ? Math.round((totalUnlocked / totalCount) * 100) : 0}%
          </span>
        </div>
        <div className={`h-2 rounded-full overflow-hidden ${
          isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface-light'
        }`}>
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isBambiMode
                ? 'bg-gradient-to-r from-pink-400 to-pink-600'
                : 'bg-gradient-to-r from-protocol-accent to-protocol-accent-soft'
            }`}
            style={{ width: `${totalCount > 0 ? (totalUnlocked / totalCount) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Personal Letters */}
      {personalLetters.length > 0 && (
        <div className="space-y-3">
          <h3 className={`text-sm font-medium flex items-center gap-2 ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
          }`}>
            <Heart className="w-4 h-4" style={{ color: '#ec4899' }} />
            Personal Letters
          </h3>
          {personalLetters.map(letter => (
            <LetterCard
              key={letter.id}
              letter={letter}
              onClick={() => letter.isUnlocked && handleSelectLetter(letter)}
              isBambiMode={isBambiMode}
            />
          ))}
        </div>
      )}

      {/* Letters */}
      {letters.length > 0 && (
        <div className="space-y-3">
          <h3 className={`text-sm font-medium flex items-center gap-2 ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
          }`}>
            <Mail className="w-4 h-4" style={{ color: categoryColors.letter }} />
            Letters
          </h3>
          {letters.map(content => (
            <SealedCard
              key={content.id}
              content={content}
              onClick={() => content.isUnlocked && handleSelectContent(content)}
              isBambiMode={isBambiMode}
            />
          ))}
        </div>
      )}

      {/* Insights */}
      {insights.length > 0 && (
        <div className="space-y-3">
          <h3 className={`text-sm font-medium flex items-center gap-2 ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
          }`}>
            <Lightbulb className="w-4 h-4" style={{ color: categoryColors.insight }} />
            Insights
          </h3>
          {insights.map(content => (
            <SealedCard
              key={content.id}
              content={content}
              onClick={() => content.isUnlocked && handleSelectContent(content)}
              isBambiMode={isBambiMode}
            />
          ))}
        </div>
      )}

      {/* Challenges */}
      {challenges.length > 0 && (
        <div className="space-y-3">
          <h3 className={`text-sm font-medium flex items-center gap-2 ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
          }`}>
            <Trophy className="w-4 h-4" style={{ color: categoryColors.challenge }} />
            Challenges
          </h3>
          {challenges.map(content => (
            <SealedCard
              key={content.id}
              content={content}
              onClick={() => content.isUnlocked && handleSelectContent(content)}
              isBambiMode={isBambiMode}
            />
          ))}
        </div>
      )}

      {/* Rewards */}
      {rewards.length > 0 && (
        <div className="space-y-3">
          <h3 className={`text-sm font-medium flex items-center gap-2 ${
            isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
          }`}>
            <Star className="w-4 h-4" style={{ color: categoryColors.reward }} />
            Rewards
          </h3>
          {rewards.map(content => (
            <SealedCard
              key={content.id}
              content={content}
              onClick={() => content.isUnlocked && handleSelectContent(content)}
              isBambiMode={isBambiMode}
            />
          ))}
        </div>
      )}

      {/* Content Modal */}
      {selectedContent && (
        <ContentModal
          title={selectedContent.title}
          category={selectedContent.category}
          content={selectedContent.content}
          onClose={() => setSelectedContent(null)}
          isBambiMode={isBambiMode}
        />
      )}
    </div>
  );
}
