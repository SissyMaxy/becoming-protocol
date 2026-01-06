// HistoryLayer.tsx
// Layer 2: Feminine journey history, milestones, experiences

import { useState, useEffect } from 'react';
import { Clock, Sparkles, Award, TrendingUp } from 'lucide-react';
import { useProfile } from '../../../hooks/useProfile';
import { LayerNav } from '../IntakeFlow';

interface HistoryLayerProps {
  onComplete: () => void;
  onBack: () => void;
}

export function HistoryLayer({ onComplete, onBack }: HistoryLayerProps) {
  const { profile, updateHistory } = useProfile();
  const history = profile?.history;

  // Local state
  const [journeyStartDate, setJourneyStartDate] = useState(history?.journeyStartDate || '');
  const [firstFeminineMemory, setFirstFeminineMemory] = useState(history?.firstFeminineMemory || '');
  const [keyMilestones, setKeyMilestones] = useState<string[]>(history?.keyMilestones || []);
  const [newMilestone, setNewMilestone] = useState('');
  const [previousAttempts, setPreviousAttempts] = useState(history?.previousAttempts?.toString() || '');
  const [longestStreak, setLongestStreak] = useState(history?.longestStreak?.toString() || '');
  const [whatBrokeStreaks, setWhatBrokeStreaks] = useState(history?.whatBrokeStreaks || '');
  const [currentFeminineLevel, setCurrentFeminineLevel] = useState(history?.currentFeminineLevel || 5);
  const [desiredFeminineLevel, setDesiredFeminineLevel] = useState(history?.desiredFeminineLevel || 8);
  const [biggestAchievement, setBiggestAchievement] = useState(history?.biggestAchievement || '');

  // Sync with loaded data
  useEffect(() => {
    if (history) {
      setJourneyStartDate(history.journeyStartDate || '');
      setFirstFeminineMemory(history.firstFeminineMemory || '');
      setKeyMilestones(history.keyMilestones || []);
      setPreviousAttempts(history.previousAttempts?.toString() || '');
      setLongestStreak(history.longestStreak?.toString() || '');
      setWhatBrokeStreaks(history.whatBrokeStreaks || '');
      setCurrentFeminineLevel(history.currentFeminineLevel || 5);
      setDesiredFeminineLevel(history.desiredFeminineLevel || 8);
      setBiggestAchievement(history.biggestAchievement || '');
    }
  }, [history]);

  const addMilestone = () => {
    if (newMilestone.trim()) {
      setKeyMilestones([...keyMilestones, newMilestone.trim()]);
      setNewMilestone('');
    }
  };

  const removeMilestone = (index: number) => {
    setKeyMilestones(keyMilestones.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    await updateHistory({
      journeyStartDate: journeyStartDate || undefined,
      firstFeminineMemory: firstFeminineMemory || undefined,
      keyMilestones: keyMilestones.length > 0 ? keyMilestones : undefined,
      previousAttempts: previousAttempts || undefined,
      longestStreak: longestStreak ? parseInt(longestStreak) : undefined,
      whatBrokeStreaks: whatBrokeStreaks || undefined,
      currentFeminineLevel,
      desiredFeminineLevel,
      biggestAchievement: biggestAchievement || undefined,
    });
    onComplete();
  };

  return (
    <div className="px-4 max-w-md mx-auto">
      {/* Section: Timeline */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-medium text-protocol-text">Your Timeline</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-protocol-text-muted mb-1">
              When did your feminine journey begin?
            </label>
            <input
              type="text"
              value={journeyStartDate}
              onChange={(e) => setJourneyStartDate(e.target.value)}
              placeholder="e.g., 2020, or 'childhood', 'teenage years'"
              className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted/50 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs text-protocol-text-muted mb-1">
              Your first feminine memory or experience
            </label>
            <textarea
              value={firstFeminineMemory}
              onChange={(e) => setFirstFeminineMemory(e.target.value)}
              placeholder="What's your earliest memory of feeling drawn to femininity?"
              rows={3}
              className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted/50 focus:outline-none focus:border-purple-500 resize-none"
            />
          </div>
        </div>
      </div>

      {/* Section: Milestones */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Award className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-medium text-protocol-text">Key Milestones</h3>
        </div>

        <div className="space-y-3">
          <p className="text-xs text-protocol-text-muted">
            What are the significant moments in your feminine journey?
          </p>

          {/* Existing milestones */}
          {keyMilestones.map((milestone, index) => (
            <div
              key={index}
              className="flex items-center gap-2 bg-protocol-surface rounded-lg p-3 border border-protocol-border"
            >
              <Sparkles className="w-4 h-4 text-purple-400 flex-shrink-0" />
              <span className="text-sm text-protocol-text flex-1">{milestone}</span>
              <button
                onClick={() => removeMilestone(index)}
                className="text-protocol-text-muted hover:text-red-400 text-xs"
              >
                Remove
              </button>
            </div>
          ))}

          {/* Add new milestone */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newMilestone}
              onChange={(e) => setNewMilestone(e.target.value)}
              placeholder="Add a milestone..."
              onKeyDown={(e) => e.key === 'Enter' && addMilestone()}
              className="flex-1 px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted/50 focus:outline-none focus:border-purple-500"
            />
            <button
              onClick={addMilestone}
              disabled={!newMilestone.trim()}
              className="px-4 py-3 rounded-lg bg-purple-500 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>

          <div>
            <label className="block text-xs text-protocol-text-muted mb-1">
              Your biggest feminine achievement so far
            </label>
            <textarea
              value={biggestAchievement}
              onChange={(e) => setBiggestAchievement(e.target.value)}
              placeholder="What are you most proud of in your journey?"
              rows={2}
              className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted/50 focus:outline-none focus:border-purple-500 resize-none"
            />
          </div>
        </div>
      </div>

      {/* Section: Previous Attempts */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-medium text-protocol-text">Previous Attempts</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-protocol-text-muted mb-1">
              Have you tried feminization protocols/programs before?
            </label>
            <textarea
              value={previousAttempts}
              onChange={(e) => setPreviousAttempts(e.target.value)}
              placeholder="What have you tried? What worked? What didn't?"
              rows={3}
              className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted/50 focus:outline-none focus:border-purple-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-protocol-text-muted mb-1">
                Longest streak (days)
              </label>
              <input
                type="number"
                value={longestStreak}
                onChange={(e) => setLongestStreak(e.target.value)}
                placeholder="0"
                min="0"
                className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted/50 focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs text-protocol-text-muted mb-1">
                What broke your streaks?
              </label>
              <input
                type="text"
                value={whatBrokeStreaks}
                onChange={(e) => setWhatBrokeStreaks(e.target.value)}
                placeholder="Common reasons"
                className="w-full px-4 py-3 rounded-lg bg-protocol-surface border border-protocol-border text-protocol-text placeholder:text-protocol-text-muted/50 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Section: Current vs Desired */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-medium text-protocol-text">Femininity Level</h3>
        </div>

        <div className="space-y-6">
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs text-protocol-text-muted">
                Current femininity level
              </label>
              <span className="text-sm font-medium text-purple-400">{currentFeminineLevel}/10</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={currentFeminineLevel}
              onChange={(e) => setCurrentFeminineLevel(parseInt(e.target.value))}
              className="w-full accent-purple-500"
            />
            <div className="flex justify-between text-[10px] text-protocol-text-muted mt-1">
              <span>Just curious</span>
              <span>Fully feminine</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-2">
              <label className="text-xs text-protocol-text-muted">
                Desired femininity level
              </label>
              <span className="text-sm font-medium text-pink-400">{desiredFeminineLevel}/10</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={desiredFeminineLevel}
              onChange={(e) => setDesiredFeminineLevel(parseInt(e.target.value))}
              className="w-full accent-pink-500"
            />
            <div className="flex justify-between text-[10px] text-protocol-text-muted mt-1">
              <span>Just curious</span>
              <span>Fully feminine</span>
            </div>
          </div>

          {desiredFeminineLevel > currentFeminineLevel && (
            <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg p-3 border border-purple-500/20">
              <p className="text-xs text-protocol-text">
                You want to increase your femininity by{' '}
                <span className="font-medium text-pink-400">
                  {desiredFeminineLevel - currentFeminineLevel} levels
                </span>
                . I will guide you there.
              </p>
            </div>
          )}
        </div>
      </div>

      <LayerNav
        onNext={handleSave}
        onBack={onBack}
        nextLabel="Save & Continue"
      />
    </div>
  );
}
