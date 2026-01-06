/**
 * Kink Quiz View
 * Gamified quiz to assess user's readiness across vectors
 */

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, Play } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBambiMode } from '../../context/BambiModeContext';
import {
  getOrderedQuestions,
  TOTAL_QUESTIONS,
  type QuizAnswer,
  type KinkQuizQuestion,
} from '../../data/kink-quiz-data';
import {
  calculateAllVectorLevels,
  calculateQuizXP,
  initializeVectorStatesFromQuiz,
  saveQuizProgress,
  loadQuizProgress,
  markQuizCompleted,
  type QuizResponse,
  type QuizProgress,
} from '../../lib/kink-quiz';
import { QuizQuestion } from './QuizQuestion';
import { QuizProgressBar } from './QuizProgress';
import { QuizResults } from './QuizResults';

interface KinkQuizViewProps {
  onBack: () => void;
}

type QuizState = 'intro' | 'quiz' | 'results';

export function KinkQuizView({ onBack }: KinkQuizViewProps) {
  const { user } = useAuth();
  const { isBambiMode } = useBambiMode();

  const [state, setState] = useState<QuizState>('intro');
  const [questions] = useState<KinkQuizQuestion[]>(() => getOrderedQuestions());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [responses, setResponses] = useState<QuizResponse[]>([]);
  const [xpEarned, setXpEarned] = useState(0);
  const [showMilestone, setShowMilestone] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Load saved progress on mount
  useEffect(() => {
    async function loadProgress() {
      if (!user?.id) {
        setIsLoading(false);
        return;
      }

      const saved = await loadQuizProgress(user.id);
      if (saved && saved.responses.length > 0) {
        setResponses(saved.responses);
        setCurrentIndex(saved.currentIndex);
        // Don't auto-resume, let user choose
      }
      setIsLoading(false);
    }
    loadProgress();
  }, [user?.id]);

  // Save progress periodically
  const saveProgress = useCallback(async () => {
    if (!user?.id || responses.length === 0) return;

    const progress: QuizProgress = {
      responses,
      currentIndex,
      startedAt: new Date().toISOString(),
    };
    await saveQuizProgress(user.id, progress);
  }, [user?.id, responses, currentIndex]);

  // Auto-save every 10 questions
  useEffect(() => {
    if (currentIndex > 0 && currentIndex % 10 === 0) {
      saveProgress();
    }
  }, [currentIndex, saveProgress]);

  // Handle answer selection
  const handleAnswer = (answer: QuizAnswer) => {
    const question = questions[currentIndex];
    const newResponses = [
      ...responses.filter(r => r.questionId !== question.id),
      { questionId: question.id, answer },
    ];
    setResponses(newResponses);

    // Check for milestone celebration
    const nextIndex = currentIndex + 1;
    if (nextIndex === 25 || nextIndex === 50 || nextIndex === 75 || nextIndex === 100) {
      setShowMilestone(true);
      setTimeout(() => setShowMilestone(false), 2000);
    }

    // Move to next question or finish
    if (nextIndex >= questions.length) {
      handleComplete(newResponses);
    } else {
      setCurrentIndex(nextIndex);
    }
  };

  // Go back to previous question
  const handleBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  // Start quiz
  const handleStart = (resume: boolean = false) => {
    if (!resume) {
      setResponses([]);
      setCurrentIndex(0);
    }
    setState('quiz');
  };

  // Complete quiz
  const handleComplete = async (finalResponses: QuizResponse[]) => {
    if (!user?.id) return;

    setIsSaving(true);

    try {
      // Calculate results
      const levels = calculateAllVectorLevels(finalResponses);
      const xp = calculateQuizXP(finalResponses);
      setXpEarned(xp);

      // Initialize vector states
      await initializeVectorStatesFromQuiz(user.id, levels);

      // Mark quiz completed
      await markQuizCompleted(user.id, xp);

      setState('results');
    } catch (error) {
      console.error('Failed to save quiz results:', error);
      // Still show results even if save failed
      setState('results');
    } finally {
      setIsSaving(false);
    }
  };

  // Retake quiz
  const handleRetake = () => {
    setResponses([]);
    setCurrentIndex(0);
    setXpEarned(0);
    setState('intro');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-protocol-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  // Intro screen
  if (state === 'intro') {
    const hasProgress = responses.length > 0;

    return (
      <div className="min-h-screen pb-24">
        {/* Header */}
        <div className={`sticky top-0 z-10 p-4 border-b ${
          isBambiMode ? 'bg-white border-pink-200' : 'bg-protocol-bg border-protocol-border'
        }`}>
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className={`p-2 rounded-full ${
                isBambiMode ? 'hover:bg-pink-100 text-pink-600' : 'hover:bg-protocol-surface text-protocol-text'
              }`}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h1 className={`text-xl font-semibold ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}>
              Readiness Quiz
            </h1>
          </div>
        </div>

        <div className="p-6 max-w-md mx-auto space-y-8">
          {/* Hero */}
          <div className="text-center space-y-4 pt-8">
            <div className={`w-20 h-20 mx-auto rounded-2xl flex items-center justify-center ${
              isBambiMode ? 'bg-pink-100' : 'bg-protocol-surface'
            }`}>
              <span className="text-4xl">✨</span>
            </div>
            <h2 className={`text-2xl font-bold ${
              isBambiMode ? 'text-pink-700' : 'text-protocol-text'
            }`}>
              Discover Your Journey
            </h2>
            <p className={`text-sm ${
              isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
            }`}>
              Answer {TOTAL_QUESTIONS} questions to assess where you are across different
              areas of your feminization and sissification journey.
            </p>
          </div>

          {/* Stats */}
          <div className={`grid grid-cols-3 gap-4 p-4 rounded-xl ${
            isBambiMode ? 'bg-pink-50' : 'bg-protocol-surface'
          }`}>
            <div className="text-center">
              <p className={`text-2xl font-bold ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}>
                {TOTAL_QUESTIONS}
              </p>
              <p className={`text-xs ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}>
                Questions
              </p>
            </div>
            <div className="text-center">
              <p className={`text-2xl font-bold ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}>
                5-8
              </p>
              <p className={`text-xs ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}>
                Minutes
              </p>
            </div>
            <div className="text-center">
              <p className={`text-2xl font-bold ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text'
              }`}>
                45
              </p>
              <p className={`text-xs ${
                isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
              }`}>
                Vectors
              </p>
            </div>
          </div>

          {/* Info */}
          <div className={`p-4 rounded-xl border ${
            isBambiMode ? 'bg-pink-50 border-pink-200' : 'bg-protocol-surface border-protocol-border'
          }`}>
            <p className={`text-sm ${
              isBambiMode ? 'text-pink-600' : 'text-protocol-text'
            }`}>
              Your answers will set initial levels for your progress vectors.
              Be honest - there are no wrong answers, only your truth.
            </p>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={() => handleStart(false)}
              className={`w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 ${
                isBambiMode
                  ? 'bg-pink-500 text-white hover:bg-pink-600'
                  : 'bg-protocol-accent text-white hover:bg-protocol-accent/90'
              }`}
            >
              <Play className="w-5 h-5" />
              Start Quiz
            </button>

            {hasProgress && (
              <button
                onClick={() => handleStart(true)}
                className={`w-full py-4 rounded-xl font-semibold border ${
                  isBambiMode
                    ? 'border-pink-300 text-pink-600 hover:bg-pink-50'
                    : 'border-protocol-border text-protocol-text hover:bg-protocol-surface'
                }`}
              >
                Resume ({responses.length}/{TOTAL_QUESTIONS})
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Results screen
  if (state === 'results') {
    return (
      <QuizResults
        responses={responses}
        xpEarned={xpEarned}
        onRetake={handleRetake}
        onDone={onBack}
      />
    );
  }

  // Quiz screen
  const currentQuestion = questions[currentIndex];
  const currentResponse = responses.find(r => r.questionId === currentQuestion.id);

  return (
    <div className="min-h-screen pb-24 flex flex-col">
      {/* Progress Header */}
      <QuizProgressBar
        current={currentIndex + 1}
        total={questions.length}
        showMilestone={showMilestone}
      />

      {/* Question */}
      <div className="flex-1 flex flex-col">
        <QuizQuestion
          question={currentQuestion}
          currentAnswer={currentResponse?.answer}
          onAnswer={handleAnswer}
          questionNumber={currentIndex + 1}
        />

        {/* Navigation */}
        <div className="p-4 flex justify-between items-center">
          <button
            onClick={handleBack}
            disabled={currentIndex === 0}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              currentIndex === 0
                ? 'opacity-50 cursor-not-allowed'
                : isBambiMode
                  ? 'text-pink-600 hover:bg-pink-100'
                  : 'text-protocol-text-muted hover:bg-protocol-surface'
            }`}
          >
            Back
          </button>

          <p className={`text-sm ${
            isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
          }`}>
            {currentIndex + 1} of {questions.length}
          </p>

          {currentResponse && currentIndex < questions.length - 1 && (
            <button
              onClick={() => setCurrentIndex(currentIndex + 1)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                isBambiMode
                  ? 'text-pink-600 hover:bg-pink-100'
                  : 'text-protocol-accent hover:bg-protocol-surface'
              }`}
            >
              Skip
            </button>
          )}
        </div>
      </div>

      {/* Saving indicator */}
      {isSaving && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className={`p-6 rounded-xl ${
            isBambiMode ? 'bg-white' : 'bg-protocol-surface'
          }`}>
            <div className="flex items-center gap-3">
              <div className="animate-spin w-5 h-5 border-2 border-protocol-accent border-t-transparent rounded-full" />
              <span className={isBambiMode ? 'text-pink-600' : 'text-protocol-text'}>
                Calculating your results...
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
