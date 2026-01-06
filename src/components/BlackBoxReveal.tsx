import { useState, useEffect } from 'react';
import { Sparkles, X, MessageCircle, Gift, Zap, Clock } from 'lucide-react';

type ReinforcementType =
  | 'surprise_celebration'
  | 'hidden_unlock'
  | 'bonus_insight'
  | 'mystery_challenge'
  | 'easter_egg'
  | 'callback_reference';

interface ReinforcementContent {
  message?: string;
  title?: string;
  challenge?: string;
  reward?: string;
  date?: string;
  snippet?: string;
}

interface BlackBoxRevealProps {
  type: ReinforcementType;
  content: ReinforcementContent;
  onDismiss: () => void;
}

const typeConfig: Record<ReinforcementType, { icon: React.ElementType; color: string; bgColor: string; label: string }> = {
  surprise_celebration: { icon: Gift, color: 'text-pink-400', bgColor: 'bg-pink-500/20', label: 'The Protocol Noticed' },
  hidden_unlock: { icon: Sparkles, color: 'text-protocol-accent', bgColor: 'bg-protocol-accent/20', label: 'Something Unlocked' },
  bonus_insight: { icon: MessageCircle, color: 'text-purple-400', bgColor: 'bg-purple-500/20', label: 'A Whisper' },
  mystery_challenge: { icon: Zap, color: 'text-amber-400', bgColor: 'bg-amber-500/20', label: 'Mystery Challenge' },
  easter_egg: { icon: Sparkles, color: 'text-green-400', bgColor: 'bg-green-500/20', label: 'You Found Something' },
  callback_reference: { icon: Clock, color: 'text-blue-400', bgColor: 'bg-blue-500/20', label: 'From Your Past' }
};

export function BlackBoxReveal({ type, content, onDismiss }: BlackBoxRevealProps) {
  const [isVisible, setIsVisible] = useState(false);
  const config = typeConfig[type];
  const Icon = config.icon;

  useEffect(() => {
    // Animate in
    setTimeout(() => setIsVisible(true), 100);
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(onDismiss, 300);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${
        isVisible ? 'bg-protocol-bg/90' : 'bg-transparent pointer-events-none'
      }`}
      onClick={handleDismiss}
    >
      <div
        className={`max-w-sm w-full transition-all duration-500 ${
          isVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4'
        }`}
        onClick={e => e.stopPropagation()}
      >
        <div className="card p-6 relative overflow-hidden">
          {/* Animated background glow */}
          <div className={`absolute inset-0 ${config.bgColor} opacity-30 animate-pulse`} />

          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="absolute top-4 right-4 p-1 text-protocol-text-muted hover:text-protocol-text transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Content */}
          <div className="relative z-10">
            {/* Icon */}
            <div className={`w-16 h-16 mx-auto mb-4 rounded-full ${config.bgColor} flex items-center justify-center`}>
              <Icon className={`w-8 h-8 ${config.color}`} />
            </div>

            {/* Label */}
            <p className={`text-xs text-center uppercase tracking-wider ${config.color} mb-2`}>
              {config.label}
            </p>

            {/* Title */}
            {content.title && (
              <h3 className="text-xl font-bold text-protocol-text text-center mb-3">
                {content.title}
              </h3>
            )}

            {/* Message */}
            {content.message && (
              <p className="text-protocol-text-muted text-center mb-4 leading-relaxed">
                {content.message}
              </p>
            )}

            {/* Challenge content */}
            {content.challenge && (
              <div className="space-y-3 mb-4">
                <div className="p-3 rounded-lg bg-protocol-surface-light">
                  <p className="text-sm font-medium text-protocol-text">
                    {content.challenge}
                  </p>
                </div>
                {content.reward && (
                  <p className="text-xs text-protocol-text-muted text-center italic">
                    "{content.reward}"
                  </p>
                )}
              </div>
            )}

            {/* Callback content */}
            {content.snippet && (
              <div className="mb-4">
                <div className="p-3 rounded-lg bg-protocol-surface-light border-l-2 border-blue-400">
                  <p className="text-sm text-protocol-text-muted italic">
                    "{content.snippet}..."
                  </p>
                  {content.date && (
                    <p className="text-xs text-protocol-text-muted mt-2">
                      — You, {new Date(content.date).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Dismiss button */}
            <button
              onClick={handleDismiss}
              className={`w-full py-3 rounded-lg ${config.bgColor} ${config.color} font-medium hover:opacity-90 transition-opacity`}
            >
              {type === 'mystery_challenge' ? 'Accept Challenge' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Unasked Question Modal
 * Shows ~10% of the time with a thought-provoking question
 */
interface UnaskedQuestionProps {
  onAnswer: (answer: string) => void;
  onSkip: () => void;
}

const UNASKED_QUESTIONS = [
  {
    question: "What would she do right now?",
    subtext: "The woman you're becoming. What would be her next move?",
    placeholder: "She would..."
  },
  {
    question: "What are you avoiding?",
    subtext: "Not judging. Just noticing. What task or feeling are you stepping around?",
    placeholder: "I've been avoiding..."
  },
  {
    question: "When did you last feel fully yourself?",
    subtext: "Even for a moment. What were you doing?",
    placeholder: "I felt like myself when..."
  },
  {
    question: "What would make today a win?",
    subtext: "Not perfect. Just... a win.",
    placeholder: "Today would be a win if..."
  },
  {
    question: "What are you afraid to want?",
    subtext: "The thing that feels too big to say out loud.",
    placeholder: "I'm afraid to admit I want..."
  },
  {
    question: "Who sees you most clearly?",
    subtext: "The person who sees past what you show the world.",
    placeholder: "The person who sees me is..."
  },
  {
    question: "What's one thing you're proud of that no one knows?",
    subtext: "A private victory. Something you did for yourself.",
    placeholder: "I'm secretly proud that..."
  },
  {
    question: "If fear wasn't a factor, what would you do this week?",
    subtext: "Just hypothetically. What becomes possible?",
    placeholder: "Without fear, I would..."
  }
];

// Special question for users without a name (shown at day 3-5)
export const NAME_QUESTION = {
  question: "Have you thought about what you'd like to be called?",
  subtext: "A name can be powerful. It doesn't have to be permanent—just what feels right today.",
  placeholder: "I've been thinking about..."
};

/**
 * Name Question Modal
 * Special modal that appears at day 3-5 for users without a name
 */
interface NameQuestionModalProps {
  onSubmitName: (name: string) => void;
  onSkip: () => void;
}

export function NameQuestionModal({ onSubmitName, onSkip }: NameQuestionModalProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    setTimeout(() => setIsVisible(true), 100);
  }, []);

  const handleSubmit = () => {
    if (name.trim()) {
      setIsVisible(false);
      setTimeout(() => onSubmitName(name.trim()), 300);
    }
  };

  const handleSkip = () => {
    setIsVisible(false);
    setTimeout(onSkip, 300);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${
        isVisible ? 'bg-protocol-bg/95' : 'bg-transparent pointer-events-none'
      }`}
    >
      <div
        className={`max-w-sm w-full transition-all duration-500 ${
          isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        <div className="card p-6">
          {/* Icon */}
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-protocol-accent/20 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-protocol-accent" />
          </div>

          {/* Label */}
          <p className="text-xs text-center uppercase tracking-wider text-protocol-accent mb-4">
            A Gentle Question
          </p>

          {/* Question */}
          <h3 className="text-xl font-bold text-protocol-text text-center mb-2">
            {NAME_QUESTION.question}
          </h3>
          <p className="text-sm text-protocol-text-muted text-center mb-6">
            {NAME_QUESTION.subtext}
          </p>

          {/* Name input */}
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name..."
            className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:outline-none focus:ring-2 focus:ring-protocol-accent mb-4"
          />

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleSkip}
              className="flex-1 py-3 rounded-lg border border-protocol-border text-protocol-text-muted hover:text-protocol-text transition-colors"
            >
              Not yet
            </button>
            <button
              onClick={handleSubmit}
              disabled={!name.trim()}
              className={`flex-1 py-3 rounded-lg font-medium transition-all ${
                name.trim()
                  ? 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
                  : 'bg-protocol-surface text-protocol-text-muted cursor-not-allowed'
              }`}
            >
              That's me
            </button>
          </div>

          <p className="text-xs text-protocol-text-muted text-center mt-4">
            You can always change this later in settings.
          </p>
        </div>
      </div>
    </div>
  );
}

export function UnaskedQuestion({ onAnswer, onSkip }: UnaskedQuestionProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [answer, setAnswer] = useState('');
  const [question] = useState(() =>
    UNASKED_QUESTIONS[Math.floor(Math.random() * UNASKED_QUESTIONS.length)]
  );

  useEffect(() => {
    setTimeout(() => setIsVisible(true), 100);
  }, []);

  const handleSubmit = () => {
    if (answer.trim()) {
      setIsVisible(false);
      setTimeout(() => onAnswer(answer), 300);
    }
  };

  const handleSkip = () => {
    setIsVisible(false);
    setTimeout(onSkip, 300);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${
        isVisible ? 'bg-protocol-bg/95' : 'bg-transparent pointer-events-none'
      }`}
    >
      <div
        className={`max-w-sm w-full transition-all duration-500 ${
          isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        <div className="card p-6">
          {/* Icon */}
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-protocol-accent/20 flex items-center justify-center">
            <MessageCircle className="w-6 h-6 text-protocol-accent" />
          </div>

          {/* Label */}
          <p className="text-xs text-center uppercase tracking-wider text-protocol-accent mb-4">
            An Unasked Question
          </p>

          {/* Question */}
          <h3 className="text-xl font-bold text-protocol-text text-center mb-2">
            {question.question}
          </h3>
          <p className="text-sm text-protocol-text-muted text-center mb-6">
            {question.subtext}
          </p>

          {/* Answer input */}
          <textarea
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            placeholder={question.placeholder}
            rows={3}
            className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted focus:outline-none focus:ring-2 focus:ring-protocol-accent resize-none mb-4"
          />

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleSkip}
              className="flex-1 py-3 rounded-lg border border-protocol-border text-protocol-text-muted hover:text-protocol-text transition-colors"
            >
              Not now
            </button>
            <button
              onClick={handleSubmit}
              disabled={!answer.trim()}
              className={`flex-1 py-3 rounded-lg font-medium transition-all ${
                answer.trim()
                  ? 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
                  : 'bg-protocol-surface text-protocol-text-muted cursor-not-allowed'
              }`}
            >
              Share
            </button>
          </div>

          <p className="text-xs text-protocol-text-muted text-center mt-4">
            Your answer stays private. It helps me understand you better.
          </p>
        </div>
      </div>
    </div>
  );
}
