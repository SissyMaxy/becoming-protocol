import { useState } from 'react';
import { StepNav } from '../OnboardingFlow';
import { SealedLetter } from '../types';
import { Mail, Lock, Sparkles } from 'lucide-react';

interface LetterStepProps {
  onAddLetter: (letter: SealedLetter) => void;
  onNext: () => void;
  onBack: () => void;
}

export function LetterStep({ onAddLetter, onNext, onBack }: LetterStepProps) {
  const [letterContent, setLetterContent] = useState('');
  const [hasWritten, setHasWritten] = useState(false);

  const handleSealLetter = () => {
    if (letterContent.trim()) {
      // Create a sealed letter with hidden unlock conditions
      // The user won't know exactly when this will unlock
      const letter: SealedLetter = {
        id: crypto.randomUUID(),
        title: 'Letter to Your Future Self',
        letterType: 'future_self',
        content: letterContent,
        unlockType: 'days',
        unlockValue: { days: 30 }, // Opens after 30 days
        unlockHint: 'This letter will find you when the time is right...'
      };
      onAddLetter(letter);

      // Create a hidden struggle letter that will unlock on a rough day
      const struggleLetter: SealedLetter = {
        id: crypto.randomUUID(),
        title: 'When You Need This Most',
        letterType: 'struggle',
        content: `Remember why you started this journey. ${letterContent.slice(0, 200)}...

You wrote this on your first day. Look how far you've come. Keep going.`,
        unlockType: 'pattern',
        unlockValue: { pattern: 'consecutive_low_alignment', threshold: 3 },
        unlockHint: 'Sealed until needed'
      };
      onAddLetter(struggleLetter);

      setHasWritten(true);
    }
  };

  const handleSkip = () => {
    // Create a default welcome letter even if they skip
    const welcomeLetter: SealedLetter = {
      id: crypto.randomUUID(),
      title: 'From The Protocol',
      letterType: 'welcome',
      content: `Welcome to your journey of becoming.

Every step you take, every practice you complete, every moment you spend in alignment with your true self matters.

This protocol isn't about perfection. It's about showing up. It's about the small daily acts that compound into profound transformation.

You've already taken the hardest step: beginning.

Trust the process. Trust yourself. You are becoming who you've always been.

With care,
The Protocol`,
      unlockType: 'days',
      unlockValue: { days: 7 },
      unlockHint: 'A message awaits...'
    };
    onAddLetter(welcomeLetter);
    onNext();
  };

  return (
    <div className="flex-1 p-6 pb-24 max-w-md mx-auto overflow-y-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-pink-500/20">
          <Mail className="w-5 h-5 text-pink-400" />
        </div>
        <h2 className="text-2xl font-bold text-protocol-text">
          Letter to Future Self
        </h2>
      </div>

      {!hasWritten ? (
        <>
          <p className="text-protocol-text-muted mb-6">
            Write a letter to yourself in the future. This will be sealed and delivered when you least expect it.
          </p>

          <div className="space-y-6">
            {/* Letter writing area */}
            <div className="card p-4 bg-protocol-surface-light">
              <div className="flex items-center gap-2 mb-3">
                <Lock className="w-4 h-4 text-pink-400" />
                <span className="text-xs text-protocol-text-muted">
                  This letter will be sealed and hidden from you
                </span>
              </div>
              <textarea
                value={letterContent}
                onChange={e => setLetterContent(e.target.value)}
                placeholder="Dear future me,

Write about your hopes, your fears, what you want to remember, what you want to tell yourself when things get hard...

This is just for you. Be honest. Be kind to yourself."
                rows={10}
                className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:outline-none focus:ring-2 focus:ring-pink-400 resize-none"
              />
            </div>

            {/* Prompts */}
            <div className="space-y-2">
              <p className="text-xs text-protocol-text-muted font-medium">
                Not sure what to write? Try:
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  'Why are you starting this?',
                  'What do you hope to feel?',
                  'What would make you proud?',
                  'What do you want to remember?'
                ].map(prompt => (
                  <button
                    key={prompt}
                    onClick={() => setLetterContent(prev => prev + (prev ? '\n\n' : '') + prompt + '\n')}
                    className="px-3 py-1.5 rounded-full text-xs bg-protocol-surface border border-protocol-border text-protocol-text-muted hover:border-pink-400/50 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            {/* Seal button */}
            <div className="space-y-3">
              <button
                onClick={handleSealLetter}
                disabled={!letterContent.trim()}
                className={`w-full py-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${
                  letterContent.trim()
                    ? 'bg-pink-500 text-white hover:bg-pink-500/90'
                    : 'bg-protocol-surface text-protocol-text-muted cursor-not-allowed'
                }`}
              >
                <Lock className="w-4 h-4" />
                Seal This Letter
              </button>

              <button
                onClick={handleSkip}
                className="w-full py-3 text-sm text-protocol-text-muted hover:text-protocol-text transition-colors"
              >
                Skip for now
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
          <div className="w-24 h-24 mb-6 rounded-full bg-pink-500/20 flex items-center justify-center animate-scale-in">
            <Sparkles className="w-12 h-12 text-pink-400" />
          </div>

          <h3 className="text-xl font-bold text-protocol-text mb-2">
            Letter Sealed
          </h3>

          <p className="text-protocol-text-muted mb-6 max-w-xs">
            Your words have been sealed away. They'll find you when the time is right.
          </p>

          <div className="card p-4 bg-protocol-surface-light max-w-xs">
            <div className="flex items-center gap-2 text-sm text-protocol-text-muted">
              <Lock className="w-4 h-4" />
              <span>2 letters created</span>
            </div>
          </div>
        </div>
      )}

      <StepNav
        onNext={hasWritten ? onNext : undefined}
        onBack={!hasWritten ? onBack : undefined}
        nextLabel="Continue"
        showBack={!hasWritten}
      />
    </div>
  );
}
