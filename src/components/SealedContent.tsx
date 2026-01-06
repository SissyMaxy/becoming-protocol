import { useState } from 'react';
import { useProtocol } from '../context/ProtocolContext';
import {
  getSealedContentStatus,
  getTriggerDescription,
  SealedContent as SealedContentType
} from '../lib/sealed';
import {
  Lock,
  Unlock,
  Mail,
  Lightbulb,
  Trophy,
  Star,
  X,
  ChevronRight
} from 'lucide-react';

const categoryIcons = {
  letter: Mail,
  insight: Lightbulb,
  challenge: Trophy,
  reward: Star
};

const categoryColors = {
  letter: '#f472b6',
  insight: '#a78bfa',
  challenge: '#fbbf24',
  reward: '#34d399'
};

interface SealedCardProps {
  content: SealedContentType & { isUnlocked: boolean };
  onClick: () => void;
}

function SealedCard({ content, onClick }: SealedCardProps) {
  const Icon = categoryIcons[content.category] || Mail;
  const color = categoryColors[content.category] || '#a855f7';

  return (
    <button
      onClick={onClick}
      disabled={!content.isUnlocked}
      className={`w-full p-4 rounded-lg border text-left transition-all duration-300 ${
        content.isUnlocked
          ? 'bg-protocol-surface border-protocol-border hover:border-protocol-accent cursor-pointer'
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
            <Lock className="w-5 h-5 text-protocol-text-muted" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className={`font-medium ${content.isUnlocked ? 'text-protocol-text' : 'text-protocol-text-muted'}`}>
            {content.title}
          </p>
          <p className="text-xs text-protocol-text-muted mt-0.5">
            {content.isUnlocked ? 'Tap to read' : content.teaser}
          </p>
        </div>

        {content.isUnlocked ? (
          <ChevronRight className="w-5 h-5 text-protocol-text-muted" />
        ) : (
          <div className="text-xs text-protocol-text-muted bg-protocol-surface-light px-2 py-1 rounded">
            {getTriggerDescription(content.trigger)}
          </div>
        )}
      </div>
    </button>
  );
}

interface ContentModalProps {
  content: SealedContentType;
  onClose: () => void;
}

function ContentModal({ content, onClose }: ContentModalProps) {
  const Icon = categoryIcons[content.category] || Mail;
  const color = categoryColors[content.category] || '#a855f7';

  return (
    <div className="fixed inset-0 z-50 bg-protocol-bg/95 overflow-y-auto animate-slide-up">
      <div className="min-h-screen p-4 max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              className="p-2 rounded-lg"
              style={{ backgroundColor: `${color}20` }}
            >
              <Icon className="w-5 h-5" style={{ color }} />
            </div>
            <div>
              <p className="text-xs text-protocol-text-muted uppercase tracking-wider">
                {content.category}
              </p>
              <h2 className="text-xl font-semibold text-protocol-text">
                {content.title}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-protocol-surface border border-protocol-border hover:border-protocol-text-muted transition-colors"
          >
            <X className="w-5 h-5 text-protocol-text" />
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
        <div className="card p-6">
          <div className="prose prose-invert max-w-none">
            {content.content.split('\n\n').map((paragraph, idx) => (
              <p key={idx} className="text-protocol-text text-sm leading-relaxed mb-4 last:mb-0">
                {paragraph}
              </p>
            ))}
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="w-full mt-6 py-4 rounded-lg font-medium bg-protocol-accent hover:bg-protocol-accent-soft text-white transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export function SealedContentView() {
  const { progress } = useProtocol();
  const [selectedContent, setSelectedContent] = useState<SealedContentType | null>(null);

  const allContent = getSealedContentStatus(progress);
  const unlockedCount = allContent.filter(c => c.isUnlocked).length;

  // Group by category
  const letters = allContent.filter(c => c.category === 'letter');
  const insights = allContent.filter(c => c.category === 'insight');
  const challenges = allContent.filter(c => c.category === 'challenge');
  const rewards = allContent.filter(c => c.category === 'reward');

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-protocol-text">Sealed Content</h2>
        <p className="text-sm text-protocol-text-muted">
          {unlockedCount} of {allContent.length} unlocked
        </p>
      </div>

      {/* Progress */}
      <div className="card p-4">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-protocol-text-muted">Discovery Progress</span>
          <span className="text-protocol-text font-medium">
            {Math.round((unlockedCount / allContent.length) * 100)}%
          </span>
        </div>
        <div className="h-2 bg-protocol-surface-light rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-protocol-accent to-protocol-accent-soft rounded-full transition-all duration-500"
            style={{ width: `${(unlockedCount / allContent.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Letters */}
      {letters.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-protocol-text-muted flex items-center gap-2">
            <Mail className="w-4 h-4" style={{ color: categoryColors.letter }} />
            Letters
          </h3>
          {letters.map(content => (
            <SealedCard
              key={content.id}
              content={content}
              onClick={() => content.isUnlocked && setSelectedContent(content)}
            />
          ))}
        </div>
      )}

      {/* Insights */}
      {insights.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-protocol-text-muted flex items-center gap-2">
            <Lightbulb className="w-4 h-4" style={{ color: categoryColors.insight }} />
            Insights
          </h3>
          {insights.map(content => (
            <SealedCard
              key={content.id}
              content={content}
              onClick={() => content.isUnlocked && setSelectedContent(content)}
            />
          ))}
        </div>
      )}

      {/* Challenges */}
      {challenges.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-protocol-text-muted flex items-center gap-2">
            <Trophy className="w-4 h-4" style={{ color: categoryColors.challenge }} />
            Challenges
          </h3>
          {challenges.map(content => (
            <SealedCard
              key={content.id}
              content={content}
              onClick={() => content.isUnlocked && setSelectedContent(content)}
            />
          ))}
        </div>
      )}

      {/* Rewards */}
      {rewards.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-protocol-text-muted flex items-center gap-2">
            <Star className="w-4 h-4" style={{ color: categoryColors.reward }} />
            Rewards
          </h3>
          {rewards.map(content => (
            <SealedCard
              key={content.id}
              content={content}
              onClick={() => content.isUnlocked && setSelectedContent(content)}
            />
          ))}
        </div>
      )}

      {/* Content Modal */}
      {selectedContent && (
        <ContentModal
          content={selectedContent}
          onClose={() => setSelectedContent(null)}
        />
      )}
    </div>
  );
}
