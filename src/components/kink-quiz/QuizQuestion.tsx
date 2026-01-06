/**
 * Quiz Question Component
 * Single question with animated answer options
 */

import { useState, useEffect } from 'react';
import { useBambiMode } from '../../context/BambiModeContext';
import { ANSWER_LABELS, type QuizAnswer, type KinkQuizQuestion } from '../../data/kink-quiz-data';

interface QuizQuestionProps {
  question: KinkQuizQuestion;
  currentAnswer?: QuizAnswer;
  onAnswer: (answer: QuizAnswer) => void;
  questionNumber: number;
}

const ANSWER_ORDER: QuizAnswer[] = ['never', 'tried', 'sometimes', 'regular', 'always'];

const ANSWER_COLORS: Record<QuizAnswer, { bg: string; bgBambi: string; border: string; borderBambi: string }> = {
  never: {
    bg: 'hover:bg-gray-800',
    bgBambi: 'hover:bg-gray-100',
    border: 'border-gray-700',
    borderBambi: 'border-gray-300',
  },
  tried: {
    bg: 'hover:bg-blue-900/30',
    bgBambi: 'hover:bg-blue-50',
    border: 'border-blue-800',
    borderBambi: 'border-blue-300',
  },
  sometimes: {
    bg: 'hover:bg-purple-900/30',
    bgBambi: 'hover:bg-purple-50',
    border: 'border-purple-800',
    borderBambi: 'border-purple-300',
  },
  regular: {
    bg: 'hover:bg-pink-900/30',
    bgBambi: 'hover:bg-pink-50',
    border: 'border-pink-800',
    borderBambi: 'border-pink-300',
  },
  always: {
    bg: 'hover:bg-amber-900/30',
    bgBambi: 'hover:bg-amber-50',
    border: 'border-amber-700',
    borderBambi: 'border-amber-300',
  },
};

const ANSWER_SELECTED: Record<QuizAnswer, { bg: string; bgBambi: string; text: string; textBambi: string }> = {
  never: {
    bg: 'bg-gray-700',
    bgBambi: 'bg-gray-200',
    text: 'text-white',
    textBambi: 'text-gray-700',
  },
  tried: {
    bg: 'bg-blue-600',
    bgBambi: 'bg-blue-500',
    text: 'text-white',
    textBambi: 'text-white',
  },
  sometimes: {
    bg: 'bg-purple-600',
    bgBambi: 'bg-purple-500',
    text: 'text-white',
    textBambi: 'text-white',
  },
  regular: {
    bg: 'bg-pink-600',
    bgBambi: 'bg-pink-500',
    text: 'text-white',
    textBambi: 'text-white',
  },
  always: {
    bg: 'bg-amber-500',
    bgBambi: 'bg-amber-500',
    text: 'text-white',
    textBambi: 'text-white',
  },
};

export function QuizQuestion({
  question,
  currentAnswer,
  onAnswer,
  questionNumber: _questionNumber,
}: QuizQuestionProps) {
  const { isBambiMode } = useBambiMode();
  const [isAnimating, setIsAnimating] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<QuizAnswer | undefined>(currentAnswer);

  // Reset animation state when question changes
  useEffect(() => {
    setIsAnimating(true);
    setSelectedAnswer(currentAnswer);
    const timer = setTimeout(() => setIsAnimating(false), 300);
    return () => clearTimeout(timer);
  }, [question.id, currentAnswer]);

  const handleSelect = (answer: QuizAnswer) => {
    setSelectedAnswer(answer);
    // Small delay for visual feedback before moving on
    setTimeout(() => {
      onAnswer(answer);
    }, 200);
  };

  const getCategoryLabel = () => {
    if (question.category === 'feminization') {
      return question.group === 'advanced' ? 'Medical' : 'Feminization';
    }
    return 'Sissification';
  };

  const getCategoryColor = () => {
    if (question.category === 'feminization') {
      return isBambiMode ? 'bg-pink-100 text-pink-600' : 'bg-pink-900/30 text-pink-400';
    }
    return isBambiMode ? 'bg-purple-100 text-purple-600' : 'bg-purple-900/30 text-purple-400';
  };

  return (
    <div
      className={`flex-1 flex flex-col p-6 transition-all duration-300 ${
        isAnimating ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
      }`}
    >
      {/* Category badge */}
      <div className="flex items-center justify-center gap-2 mb-6">
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getCategoryColor()}`}>
          {getCategoryLabel()}
        </span>
      </div>

      {/* Question card */}
      <div className={`rounded-2xl p-6 mb-8 ${
        isBambiMode ? 'bg-pink-50 border border-pink-200' : 'bg-protocol-surface border border-protocol-border'
      }`}>
        <p className={`text-lg font-medium text-center leading-relaxed ${
          isBambiMode ? 'text-pink-800' : 'text-protocol-text'
        }`}>
          {question.question}
        </p>
      </div>

      {/* Answer options */}
      <div className="space-y-3">
        {ANSWER_ORDER.map((answer, index) => {
          const isSelected = selectedAnswer === answer;
          const colors = ANSWER_COLORS[answer];
          const selectedColors = ANSWER_SELECTED[answer];

          return (
            <button
              key={answer}
              onClick={() => handleSelect(answer)}
              className={`w-full p-4 rounded-xl border-2 transition-all duration-200 text-left ${
                isSelected
                  ? `${isBambiMode ? selectedColors.bgBambi : selectedColors.bg} ${
                      isBambiMode ? selectedColors.textBambi : selectedColors.text
                    } border-transparent scale-[1.02]`
                  : `${isBambiMode ? colors.bgBambi : colors.bg} ${
                      isBambiMode ? colors.borderBambi : colors.border
                    } ${isBambiMode ? 'text-gray-700' : 'text-protocol-text'}`
              }`}
              style={{
                animationDelay: `${index * 50}ms`,
              }}
            >
              <div className="flex items-center gap-3">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  isSelected
                    ? 'border-white bg-white/20'
                    : isBambiMode ? 'border-gray-400' : 'border-gray-500'
                }`}>
                  {isSelected && (
                    <div className="w-2.5 h-2.5 rounded-full bg-white" />
                  )}
                </div>
                <span className="font-medium">{ANSWER_LABELS[answer]}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
