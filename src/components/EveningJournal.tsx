import { useState, useEffect } from 'react';
import { useProtocol } from '../context/ProtocolContext';
import { JournalEntry } from '../types';
import { formatDate, calculateCompletionPercentage } from '../lib/protocol';
import {
  Moon,
  Sparkles,
  CloudRain,
  Lightbulb,
  Save,
  Check,
  Star,
  SkipForward,
  Heart,
  Crown,
  Stethoscope,
} from 'lucide-react';
import { JournalSkipModal } from './SkipConfirmModal';
import { useLanguageTracking } from '../hooks/useLanguageTracking';
import { useCorruption } from '../hooks/useCorruption';
import { useAuth } from '../context/AuthContext';
import { handleTherapistConcern } from '../lib/corruption-crisis';

interface AlignmentSliderProps {
  value: number;
  onChange: (value: number) => void;
}

function AlignmentSlider({ value, onChange }: AlignmentSliderProps) {
  const labels = [
    'Disconnected',
    'Struggling',
    'Off',
    'Uncertain',
    'Neutral',
    'Okay',
    'Good',
    'Aligned',
    'Flowing',
    'Radiant'
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <span className="text-sm text-protocol-text-muted">
          How aligned did you feel today?
        </span>
        <span className="text-lg font-semibold text-protocol-accent">
          {value}/10
        </span>
      </div>

      {/* Star rating display */}
      <div className="flex justify-center gap-1">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
          <button
            key={num}
            onClick={() => onChange(num)}
            className="p-1 transition-transform hover:scale-110"
          >
            <Star
              className={`w-6 h-6 ${
                num <= value
                  ? 'fill-protocol-accent text-protocol-accent'
                  : 'text-protocol-border'
              }`}
            />
          </button>
        ))}
      </div>

      {/* Label */}
      <p className="text-center text-sm font-medium text-protocol-text">
        {labels[value - 1] || 'Select a rating'}
      </p>

      {/* Slider */}
      <input
        type="range"
        min="1"
        max="10"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-2 bg-protocol-surface-light rounded-full appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none
          [&::-webkit-slider-thumb]:w-5
          [&::-webkit-slider-thumb]:h-5
          [&::-webkit-slider-thumb]:bg-protocol-accent
          [&::-webkit-slider-thumb]:rounded-full
          [&::-webkit-slider-thumb]:cursor-pointer
          [&::-webkit-slider-thumb]:shadow-lg
          [&::-webkit-slider-thumb]:transition-transform
          [&::-webkit-slider-thumb]:hover:scale-110"
      />
    </div>
  );
}

interface JournalTextAreaProps {
  icon: React.ReactNode;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  accentColor?: string;
}

function JournalTextArea({
  icon,
  label,
  placeholder,
  value,
  onChange,
  accentColor = '#a855f7'
}: JournalTextAreaProps) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-medium text-protocol-text">
        <span style={{ color: accentColor }}>{icon}</span>
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full px-4 py-3 bg-protocol-surface border border-protocol-border rounded-lg
          text-protocol-text placeholder:text-protocol-text-muted/50
          focus:outline-none focus:border-protocol-accent focus:ring-1 focus:ring-protocol-accent
          resize-none transition-colors"
      />
    </div>
  );
}

export function EveningJournal() {
  const { currentEntry, saveJournal } = useProtocol();
  const { trackSubmission } = useLanguageTracking();
  const { logEvent, snapshot: corruptionSnapshot } = useCorruption();
  const { user } = useAuth();
  const [alignment, setAlignment] = useState(5);
  const [euphoria, setEuphoria] = useState('');
  const [dysphoria, setDysphoria] = useState('');
  const [insights, setInsights] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [isSkipped, setIsSkipped] = useState(false);

  // Gina context check-in state
  const [ginaNotices, setGinaNotices] = useState('');
  const [sharedSpace, setSharedSpace] = useState('');

  // Therapist check-in state
  const [hadTherapy, setHadTherapy] = useState<boolean | null>(null);
  const [therapyNotes, setTherapyNotes] = useState('');

  // Load existing journal if present
  useEffect(() => {
    if (currentEntry?.journal) {
      setAlignment(currentEntry.journal.alignmentScore);
      setEuphoria(currentEntry.journal.euphoriaNote);
      setDysphoria(currentEntry.journal.dysphoriaNote);
      setInsights(currentEntry.journal.insights);
      setIsSaved(true);
    }
  }, [currentEntry]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Track identity language in journal text
      const allText = [euphoria, dysphoria, insights].join(' ');
      if (allText.trim()) {
        trackSubmission(allText);
      }

      const journal: JournalEntry = {
        alignmentScore: alignment,
        euphoriaNote: euphoria,
        dysphoriaNote: dysphoria,
        insights
      };
      await saveJournal(journal);

      // Log Gina context data as corruption milestones (fire-and-forget)
      const ginaLevel = corruptionSnapshot?.levels.gina ?? 0;
      if (ginaNotices.trim()) {
        logEvent('gina', 'milestone', ginaLevel, {
          gina_notices: ginaNotices,
          gina_questions_logged: true,
        }).catch(() => {});
      }
      if (sharedSpace.trim()) {
        logEvent('gina', 'milestone', ginaLevel, {
          shared_space_activities: 1,
          shared_space_description: sharedSpace,
        }).catch(() => {});
      }

      // Log therapist check-in data (fire-and-forget)
      if (hadTherapy === true) {
        const therapistLevel = corruptionSnapshot?.levels.therapist ?? 0;
        logEvent('therapist', 'milestone', therapistLevel, {
          therapy_session: true,
          therapy_notes: therapyNotes,
        }).catch(() => {});

        // If notes contain concern keywords, flag it
        const concernKeywords = ['concern', 'worried', 'alarming', 'unhealthy', 'problem', 'flag'];
        const hasConcern = concernKeywords.some(k =>
          therapyNotes.toLowerCase().includes(k)
        );
        if (hasConcern && user?.id) {
          handleTherapistConcern(user.id, therapyNotes).catch(() => {});
        }
      }

      setIsSaved(true);
    } catch (error) {
      console.error('Failed to save journal:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Mark as unsaved when content changes
  useEffect(() => {
    setIsSaved(false);
  }, [alignment, euphoria, dysphoria, insights, ginaNotices, sharedSpace, hadTherapy, therapyNotes]);

  // Handle journal skip
  const handleSkipClick = () => {
    setShowSkipModal(true);
  };

  const handleSkipCancel = () => {
    setShowSkipModal(false);
  };

  const handleSkipConfirm = () => {
    setShowSkipModal(false);
    setIsSkipped(true);
  };

  if (!currentEntry) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center space-y-4">
        <Moon className="w-12 h-12 text-protocol-text-muted" />
        <p className="text-protocol-text-muted">
          Start your day first to unlock the evening journal
        </p>
      </div>
    );
  }

  const completionPercentage = calculateCompletionPercentage(currentEntry.tasks);

  return (
    <div className="space-y-8 pb-24">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="w-14 h-14 mx-auto bg-protocol-surface rounded-full flex items-center justify-center border border-protocol-border">
          <Moon className="w-7 h-7 text-protocol-accent" />
        </div>
        <h2 className="text-xl font-semibold text-protocol-text">
          Evening Reflection
        </h2>
        <p className="text-sm text-protocol-text-muted">
          {formatDate(currentEntry.date)}
        </p>
      </div>

      {/* Day summary */}
      <div className="card p-4 space-y-3">
        <p className="text-sm text-protocol-text-muted text-center">
          Today's completion
        </p>
        <div className="flex items-center justify-center gap-4">
          <div className="text-3xl font-bold text-gradient">
            {completionPercentage}%
          </div>
        </div>
        <div className="h-2 bg-protocol-surface-light rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-protocol-accent to-protocol-accent-soft rounded-full"
            style={{ width: `${completionPercentage}%` }}
          />
        </div>
        <p className="text-xs text-protocol-text-muted text-center">
          {currentEntry.tasks.filter(t => t.completed).length} of{' '}
          {currentEntry.tasks.length} tasks completed
        </p>
      </div>

      {/* Alignment slider */}
      <div className="card p-6">
        <AlignmentSlider value={alignment} onChange={setAlignment} />
      </div>

      {/* Journal sections */}
      <div className="space-y-6">
        <JournalTextArea
          icon={<Sparkles className="w-4 h-4" />}
          label="Euphoria moments"
          placeholder="What made you feel connected to your feminine self today?"
          value={euphoria}
          onChange={setEuphoria}
          accentColor="#22c55e"
        />

        <JournalTextArea
          icon={<CloudRain className="w-4 h-4" />}
          label="Dysphoria notes"
          placeholder="What challenges or difficult feelings came up?"
          value={dysphoria}
          onChange={setDysphoria}
          accentColor="#f59e0b"
        />

        <JournalTextArea
          icon={<Lightbulb className="w-4 h-4" />}
          label="Insights & learnings"
          placeholder="What did you learn about yourself today?"
          value={insights}
          onChange={setInsights}
          accentColor="#a855f7"
        />
      </div>

      {/* Home & Relationship check-in */}
      <div className="space-y-4">
        <p className="text-xs text-protocol-text-muted uppercase tracking-wider px-1">
          Home & Relationship
        </p>
        <JournalTextArea
          icon={<Heart className="w-4 h-4" />}
          label="Anything Gina noticed today?"
          placeholder="Did she comment on anything, ask questions, or seem curious?"
          value={ginaNotices}
          onChange={setGinaNotices}
          accentColor="#f59e0b"
        />
        <JournalTextArea
          icon={<Crown className="w-4 h-4" />}
          label="Protocol in shared space?"
          placeholder="Any moments where protocol life overlapped with home life?"
          value={sharedSpace}
          onChange={setSharedSpace}
          accentColor="#ec4899"
        />
      </div>

      {/* Wellbeing check-in */}
      <div className="space-y-4">
        <p className="text-xs text-protocol-text-muted uppercase tracking-wider px-1">
          Wellbeing
        </p>
        <div className="card p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-protocol-text">
            <Stethoscope className="w-4 h-4 text-blue-400" />
            Therapy today?
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setHadTherapy(true)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                hadTherapy === true
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'bg-protocol-surface border border-protocol-border text-protocol-text-muted hover:border-protocol-accent/30'
              }`}
            >
              Yes
            </button>
            <button
              onClick={() => setHadTherapy(false)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                hadTherapy === false
                  ? 'bg-protocol-surface-light text-protocol-text border border-protocol-border'
                  : 'bg-protocol-surface border border-protocol-border text-protocol-text-muted hover:border-protocol-accent/30'
              }`}
            >
              No
            </button>
          </div>
          {hadTherapy === true && (
            <JournalTextArea
              icon={<Lightbulb className="w-4 h-4" />}
              label="How did it go?"
              placeholder="Any insights, concerns, or breakthroughs?"
              value={therapyNotes}
              onChange={setTherapyNotes}
              accentColor="#3b82f6"
            />
          )}
        </div>
      </div>

      {/* Save button */}
      {!isSkipped ? (
        <>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`w-full py-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-all duration-200 ${
              isSaved
                ? 'bg-protocol-success/20 text-protocol-success border border-protocol-success/30'
                : 'bg-protocol-accent hover:bg-protocol-accent-soft text-white'
            }`}
          >
            {isSaving ? (
              <span className="animate-pulse">Saving...</span>
            ) : isSaved ? (
              <>
                <Check className="w-5 h-5" />
                Saved
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Save Reflection
              </>
            )}
          </button>

          {/* Skip option */}
          {!isSaved && (
            <button
              onClick={handleSkipClick}
              className="w-full mt-4 py-3 text-sm text-protocol-text-muted hover:text-amber-400 transition-colors flex items-center justify-center gap-2"
            >
              <SkipForward className="w-4 h-4" />
              Skip tonight's reflection
            </button>
          )}
        </>
      ) : (
        <div className="text-center py-8 space-y-3">
          <div className="w-14 h-14 mx-auto bg-amber-500/20 rounded-full flex items-center justify-center">
            <SkipForward className="w-7 h-7 text-amber-400" />
          </div>
          <p className="text-amber-400 font-medium">Reflection skipped</p>
          <p className="text-sm text-protocol-text-muted">
            This has been noted. Tomorrow is a new opportunity.
          </p>
        </div>
      )}

      {/* Skip Modal */}
      {showSkipModal && (
        <JournalSkipModal
          onCancel={handleSkipCancel}
          onConfirm={handleSkipConfirm}
        />
      )}
    </div>
  );
}
