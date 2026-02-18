/**
 * Focused Action Card
 * Shows ONE priority action to eliminate decision paralysis
 * "Do this. Then we'll show you what's next."
 *
 * Key UX improvements:
 * - Time-aware: Shows "Available Now" vs "Later Today"
 * - Context preview: Shows what you'll actually be doing before committing
 * - Single focus: One action at a time, clear next step
 */

import { useState } from 'react';
import { Play, ChevronDown, ChevronUp, Target, Sparkles, Clock, Zap, Eye, Sun, Sunset, Moon, Lock, Smartphone, Headphones, Check, Package, Timer, X, Vibrate, ExternalLink } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { DailyTask } from '../../types/task-bank';
import type { TodaysGoal } from '../../types/goals';

// Time periods for filtering
type TimePeriod = 'morning' | 'afternoon' | 'evening' | 'anytime';

function getCurrentPeriod(): TimePeriod {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'anytime'; // Late night - show everything
}

function getPeriodIcon(period: TimePeriod) {
  switch (period) {
    case 'morning': return <Sun className="w-4 h-4" />;
    case 'afternoon': return <Sun className="w-4 h-4" />;
    case 'evening': return <Sunset className="w-4 h-4" />;
    default: return <Moon className="w-4 h-4" />;
  }
}

function getPrerequisiteIcon(icon?: ActionPrerequisite['icon']) {
  switch (icon) {
    case 'privacy': return <Lock className="w-4 h-4" />;
    case 'device': return <Smartphone className="w-4 h-4" />;
    case 'headphones': return <Headphones className="w-4 h-4" />;
    case 'mirror': return <Eye className="w-4 h-4" />;
    case 'supplies': return <Package className="w-4 h-4" />;
    case 'time': return <Timer className="w-4 h-4" />;
    default: return <Check className="w-4 h-4" />;
  }
}

// Vibration pattern for Lovense integration
export type VibrationPattern =
  | 'off'              // No vibration
  | 'gentle_wave'      // Soft waves (warm up / cool down)
  | 'building'         // Gradually increasing
  | 'edge_tease'       // Teasing spikes
  | 'denial_pulse'     // Build and deny
  | 'constant_low'     // Steady low (background)
  | 'constant_medium'  // Steady medium
  | 'constant_high'    // Steady high (peaks)
  | 'heartbeat'        // Pulsing rhythm
  | 'staircase'        // Step increases
  | 'random_tease'     // Unpredictable
  | 'flutter_gentle';  // Light flutters

// Structured step with time estimate and optional vibration
interface ActionStep {
  label: string;
  durationMinutes?: number;
  vibration?: VibrationPattern;
  intensity?: number; // 0-20 for constant patterns
}

// Prerequisites needed before starting
interface ActionPrerequisite {
  item: string;
  icon?: 'privacy' | 'device' | 'headphones' | 'mirror' | 'supplies' | 'time';
}

// Reference link for tutorials/guides
interface ReferenceLink {
  title: string;
  url: string;
  source: string;
}

export interface PriorityAction {
  type: 'goal' | 'task' | 'session';
  id: string;
  title: string;
  description?: string;
  urgencyReason?: string; // "Streak at risk" / "Scheduled for now" / etc
  domain?: string;
  estimatedMinutes?: number;
  // Enhanced context for cognitive pre-loading
  steps?: ActionStep[]; // Numbered steps with time breakdowns
  prerequisites?: ActionPrerequisite[]; // What you'll need before starting
  whatYoullDo?: string[]; // Simple bullet points (fallback if no steps)
  bestTime?: TimePeriod; // When this is ideally done
  difficulty?: 1 | 2 | 3 | 4 | 5;
  isComplex?: boolean; // If true, always show full preview
  references?: ReferenceLink[]; // External tutorial/guide links
}

interface FocusedActionCardProps {
  priorityAction: PriorityAction | null;
  pendingCount: number; // Total other pending items
  onStartAction: () => void;
  onDismiss?: () => void; // "Not Now" - show next action or skip
  onShowAll: () => void;
  isExpanded: boolean;
  lovenseConnected?: boolean; // Show Lovense indicator when connected
  lovenseDeviceName?: string; // e.g. "Gush 2"
}

export function FocusedActionCard({
  priorityAction,
  pendingCount,
  onStartAction,
  onDismiss,
  onShowAll,
  isExpanded,
  lovenseConnected,
  lovenseDeviceName,
}: FocusedActionCardProps) {
  const { isBambiMode } = useBambiMode();
  const [showPreview, setShowPreview] = useState(false);
  const currentPeriod = getCurrentPeriod();

  // Check if this action has vibration-enabled steps
  const hasVibration = priorityAction?.steps?.some(s => s.vibration && s.vibration !== 'off');

  // Check if this action is appropriate for current time
  const isAvailableNow = !priorityAction?.bestTime ||
    priorityAction.bestTime === 'anytime' ||
    priorityAction.bestTime === currentPeriod;

  if (!priorityAction) {
    return (
      <div className={`mx-4 p-6 rounded-2xl text-center ${
        isBambiMode
          ? 'bg-gradient-to-br from-pink-50 to-white border border-pink-100'
          : 'bg-protocol-surface border border-protocol-border'
      }`}>
        <Sparkles className={`w-8 h-8 mx-auto mb-3 ${
          isBambiMode ? 'text-pink-400' : 'text-protocol-accent'
        }`} />
        <p className={`font-medium ${
          isBambiMode ? 'text-pink-700' : 'text-protocol-text'
        }`}>
          All caught up!
        </p>
        <p className={`text-sm mt-1 ${
          isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
        }`}>
          Nothing urgent right now
        </p>
      </div>
    );
  }

  const getIcon = () => {
    switch (priorityAction.type) {
      case 'goal': return <Target className="w-5 h-5" />;
      case 'session': return <Clock className="w-5 h-5" />;
      default: return <Zap className="w-5 h-5" />;
    }
  };

  return (
    <div className="mx-4 space-y-3">
      {/* Main Focus Card */}
      <div className={`p-5 rounded-2xl ${
        isBambiMode
          ? 'bg-gradient-to-br from-pink-100 to-pink-50 border-2 border-pink-300 shadow-lg shadow-pink-100'
          : 'bg-gradient-to-br from-protocol-accent/20 to-protocol-surface border-2 border-protocol-accent/50'
      }`}>
        {/* Top badges row */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {/* Urgency badge */}
          {priorityAction.urgencyReason && (
            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
              isBambiMode
                ? 'bg-pink-200 text-pink-700'
                : 'bg-protocol-accent/30 text-protocol-accent'
            }`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              {priorityAction.urgencyReason}
            </div>
          )}

          {/* Lovense connected indicator */}
          {lovenseConnected && (
            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
              hasVibration
                ? 'bg-purple-200 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
                : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
            }`}>
              <Vibrate className={`w-3.5 h-3.5 ${hasVibration ? 'animate-pulse' : ''}`} />
              {lovenseDeviceName || 'Lovense'}
              {hasVibration && ' ready'}
            </div>
          )}
        </div>

        {/* Action title */}
        <div className="flex items-start gap-3 mb-4">
          <div className={`p-2 rounded-xl ${
            isBambiMode ? 'bg-pink-200 text-pink-600' : 'bg-protocol-accent/20 text-protocol-accent'
          }`}>
            {getIcon()}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`font-bold text-lg leading-tight ${
              isBambiMode ? 'text-pink-800' : 'text-protocol-text'
            }`}>
              {priorityAction.title}
            </h3>
            {priorityAction.description && (
              <p className={`text-sm mt-1 ${
                isBambiMode ? 'text-pink-600' : 'text-protocol-text-muted'
              }`}>
                {priorityAction.description}
              </p>
            )}
          </div>
        </div>

        {/* Domain + time estimate + difficulty */}
        <div className="flex items-center flex-wrap gap-2 mb-4">
          {priorityAction.domain && (
            <span className={`text-xs px-2 py-1 rounded-lg ${
              isBambiMode ? 'bg-pink-100 text-pink-600' : 'bg-protocol-surface text-protocol-text-muted'
            }`}>
              {priorityAction.domain}
            </span>
          )}
          {priorityAction.estimatedMinutes && (
            <span className={`text-xs px-2 py-1 rounded-lg ${
              isBambiMode ? 'bg-pink-50 text-pink-500' : 'bg-protocol-surface/50 text-protocol-text-muted'
            }`}>
              <Clock className="w-3 h-3 inline mr-1" />
              {priorityAction.estimatedMinutes} min
            </span>
          )}
          {priorityAction.difficulty && (
            <span className={`text-xs px-2 py-1 rounded-lg ${
              isBambiMode ? 'bg-pink-50 text-pink-500' : 'bg-protocol-surface/50 text-protocol-text-muted'
            }`}>
              {'★'.repeat(priorityAction.difficulty)}{'☆'.repeat(5 - priorityAction.difficulty)}
            </span>
          )}
          {/* Time availability indicator */}
          {priorityAction.bestTime && priorityAction.bestTime !== 'anytime' && (
            <span className={`text-xs px-2 py-1 rounded-lg flex items-center gap-1 ${
              isAvailableNow
                ? isBambiMode ? 'bg-green-100 text-green-600' : 'bg-green-900/30 text-green-400'
                : isBambiMode ? 'bg-gray-100 text-gray-500' : 'bg-gray-800 text-gray-400'
            }`}>
              {getPeriodIcon(priorityAction.bestTime)}
              {isAvailableNow ? 'Good time' : `Best: ${priorityAction.bestTime}`}
            </span>
          )}
        </div>

        {/* Preview toggle - shows what you'll actually do */}
        {(priorityAction.steps || priorityAction.whatYoullDo || priorityAction.prerequisites) && (
          <button
            onClick={() => setShowPreview(!showPreview)}
            className={`w-full mb-3 py-2 px-3 rounded-lg text-sm flex items-center justify-between transition-colors ${
              isBambiMode
                ? 'bg-pink-50 hover:bg-pink-100 text-pink-600'
                : 'bg-protocol-surface hover:bg-protocol-border/50 text-protocol-text-muted'
            }`}
          >
            <span className="flex items-center gap-2">
              <Eye className="w-4 h-4" />
              {priorityAction.isComplex ? 'See full breakdown' : 'What you\'ll do'}
            </span>
            <ChevronDown className={`w-4 h-4 transition-transform ${showPreview ? 'rotate-180' : ''}`} />
          </button>
        )}

        {/* Rich preview content - Cognitive Pre-Loading */}
        {showPreview && (
          <div className={`mb-4 rounded-xl overflow-hidden ${
            isBambiMode
              ? 'bg-pink-50/70 border border-pink-200'
              : 'bg-protocol-surface border border-protocol-border'
          }`}>
            {/* Structured steps with time breakdown */}
            {priorityAction.steps && priorityAction.steps.length > 0 && (
              <div className="p-4">
                <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}>
                  What you'll do:
                </p>
                <div className="space-y-2">
                  {priorityAction.steps.map((step, i) => (
                    <div key={i} className={`flex items-start gap-3 ${
                      isBambiMode ? 'text-pink-700' : 'text-protocol-text'
                    }`}>
                      <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        isBambiMode
                          ? 'bg-pink-200 text-pink-600'
                          : 'bg-protocol-accent/20 text-protocol-accent'
                      }`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm">{step.label}</span>
                        <span className={`ml-2 text-xs ${
                          isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
                        }`}>
                          {step.durationMinutes && `(${step.durationMinutes} min)`}
                        </span>
                        {/* Vibration indicator */}
                        {step.vibration && step.vibration !== 'off' && (
                          <span className={`ml-2 inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${
                            isBambiMode
                              ? 'bg-pink-100 text-pink-500'
                              : 'bg-purple-900/30 text-purple-400'
                          }`}>
                            <Vibrate className="w-3 h-3" />
                            {step.intensity && step.intensity > 10 ? 'high' : step.intensity && step.intensity > 5 ? 'med' : 'low'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Simple bullet points fallback */}
            {!priorityAction.steps && priorityAction.whatYoullDo && (
              <div className="p-4">
                <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}>
                  What you'll do:
                </p>
                <ul className="space-y-1.5">
                  {priorityAction.whatYoullDo.map((item, i) => (
                    <li key={i} className={`flex items-start gap-2 text-sm ${
                      isBambiMode ? 'text-pink-700' : 'text-protocol-text-muted'
                    }`}>
                      <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        isBambiMode ? 'bg-pink-400' : 'bg-protocol-accent'
                      }`} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Prerequisites section */}
            {priorityAction.prerequisites && priorityAction.prerequisites.length > 0 && (
              <div className={`p-4 border-t ${
                isBambiMode ? 'border-pink-200 bg-pink-100/50' : 'border-protocol-border bg-protocol-bg/50'
              }`}>
                <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${
                  isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'
                }`}>
                  You'll need:
                </p>
                <div className="flex flex-wrap gap-2">
                  {priorityAction.prerequisites.map((prereq, i) => (
                    <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${
                      isBambiMode
                        ? 'bg-white/80 text-pink-700 border border-pink-200'
                        : 'bg-protocol-surface text-protocol-text-muted border border-protocol-border'
                    }`}>
                      {getPrerequisiteIcon(prereq.icon)}
                      <span>{prereq.item}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reference tutorials/guides section */}
            {priorityAction.references && priorityAction.references.length > 0 && (
              <div className={`p-4 border-t ${
                isBambiMode ? 'border-pink-200 bg-purple-50/50' : 'border-protocol-border bg-purple-900/10'
              }`}>
                <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${
                  isBambiMode ? 'text-purple-500' : 'text-purple-400'
                }`}>
                  Visual guides & tutorials:
                </p>
                <div className="space-y-2">
                  {priorityAction.references.map((ref, i) => (
                    <a
                      key={i}
                      href={ref.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                        isBambiMode
                          ? 'bg-white/80 text-purple-700 border border-purple-200 hover:bg-purple-50 hover:border-purple-300'
                          : 'bg-protocol-surface text-purple-300 border border-purple-800/30 hover:bg-purple-900/20 hover:border-purple-600/50'
                      }`}
                    >
                      <ExternalLink className="w-4 h-4 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{ref.title}</span>
                        <span className={`ml-2 text-xs ${
                          isBambiMode ? 'text-purple-400' : 'text-purple-500'
                        }`}>
                          {ref.source}
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action buttons: I'm Ready / Not Now */}
        <div className="flex gap-3">
          {/* Primary: I'm Ready - Start */}
          <button
            onClick={onStartAction}
            className={`flex-1 py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
              isAvailableNow
                ? isBambiMode
                  ? 'bg-pink-500 hover:bg-pink-600 text-white shadow-lg shadow-pink-200'
                  : 'bg-protocol-accent hover:bg-protocol-accent-bright text-white'
                : isBambiMode
                  ? 'bg-pink-400 hover:bg-pink-500 text-white'
                  : 'bg-protocol-accent/70 hover:bg-protocol-accent text-white'
            }`}
          >
            <Play className="w-5 h-5" />
            {isAvailableNow ? "I'm Ready" : 'Start Anyway'}
          </button>

          {/* Secondary: Not Now */}
          {onDismiss && (
            <div className="text-center">
              <button
                onClick={onDismiss}
                className={`px-5 py-4 rounded-xl font-medium text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                  isBambiMode
                    ? 'bg-pink-100 hover:bg-pink-200 text-pink-600'
                    : 'bg-protocol-surface hover:bg-protocol-border text-protocol-text-muted'
                }`}
              >
                <X className="w-4 h-4" />
                Not Now
              </button>
              <p className={`text-xs mt-1 ${
                isBambiMode ? 'text-pink-400' : 'text-gray-500'
              }`}>
                Shows next item
              </p>
            </div>
          )}
        </div>

        {/* "Better later" hint if not ideal time */}
        {!isAvailableNow && (
          <p className={`text-xs text-center mt-2 ${
            isBambiMode ? 'text-gray-500' : 'text-gray-400'
          }`}>
            This is usually a {priorityAction.bestTime} activity
          </p>
        )}
      </div>

      {/* Show more toggle */}
      {pendingCount > 0 && (
        <button
          onClick={onShowAll}
          className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
            isBambiMode
              ? 'bg-pink-50 hover:bg-pink-100 text-pink-600'
              : 'bg-protocol-surface hover:bg-protocol-border/50 text-protocol-text-muted'
          }`}
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-4 h-4" />
              Hide {pendingCount} other items
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              See {pendingCount} other items
            </>
          )}
        </button>
      )}
    </div>
  );
}

/**
 * Get detailed, actionable steps for goals based on domain
 * Returns specific instructions with time estimates
 */
function getGoalSteps(goalName: string, domain: string | null): SessionData {
  const name = goalName.toLowerCase();

  // === VOICE TRAINING ===
  if (domain === 'voice' || name.includes('voice') || name.includes('speech') || name.includes('speak')) {
    // Build task-specific references based on what the task is about
    const voiceRefs: ReferenceLink[] = [];

    if (name.includes('pitch')) {
      voiceRefs.push({ title: 'Pitch & Resonance Isolation (Follow-Along Video)', url: 'https://www.reneeyoxon.com/blog/pitch-reso-isolation-for-trans-voice', source: 'Renee Yoxon' });
      voiceRefs.push({ title: 'Pitch vs Resonance: What\'s the Difference?', url: 'https://www.reneeyoxon.com/blog/pitch-vs-resonance-what-s-the-difference', source: 'Renee Yoxon' });
    }
    if (name.includes('resonance') || name.includes('bright')) {
      voiceRefs.push({ title: 'Let Me Prove You Can Modify Your Resonance', url: 'https://www.reneeyoxon.com/blog/let-me-prove-to-you-that-you-can-modify-your-resonance', source: 'Renee Yoxon' });
      voiceRefs.push({ title: 'Pitch & Resonance Isolation (Follow-Along)', url: 'https://www.reneeyoxon.com/blog/pitch-reso-isolation-for-trans-voice', source: 'Renee Yoxon' });
    }
    if (name.includes('larynx') || name.includes('throat')) {
      voiceRefs.push({ title: 'Help! I Can\'t Lift My Larynx (Exercise)', url: 'https://www.reneeyoxon.com/blog/voice-feminizing-exercise-help-i-can-t-lift-my-larynx', source: 'Renee Yoxon' });
    }
    if (name.includes('hum') || name.includes('warm')) {
      voiceRefs.push({ title: 'Three Daily Voice Feminization Exercises', url: 'https://www.reneeyoxon.com/blog/three-daily-voice-feminization-exercises', source: 'Renee Yoxon' });
    }
    if (name.includes('read') || name.includes('sentence') || name.includes('phrase')) {
      voiceRefs.push({ title: 'Finding Your Feminine Voice: Beyond Pitch', url: 'https://www.reneeyoxon.com/blog/finding-your-feminine-voice-beyond-pitch-and-resonance', source: 'Renee Yoxon' });
    }
    if (name.includes('private') || name.includes('covert') || name.includes('quiet')) {
      voiceRefs.push({ title: 'How to Practice When You\'re Not Out', url: 'https://www.reneeyoxon.com/blog/covert-voice-practice', source: 'Renee Yoxon' });
    }

    // Always include general voice training as fallback
    if (voiceRefs.length === 0) {
      voiceRefs.push({ title: 'Three Daily Voice Feminization Exercises', url: 'https://www.reneeyoxon.com/blog/three-daily-voice-feminization-exercises', source: 'Renee Yoxon' });
      voiceRefs.push({ title: 'TransVoiceLessons YouTube', url: 'https://www.youtube.com/@TransVoiceLessons', source: 'YouTube' });
    }

    return {
      estimatedMinutes: 15,
      steps: [
        { label: 'Relax jaw and neck - gentle head rolls, open mouth wide 3x', durationMinutes: 2 },
        { label: 'Hum at your target pitch for 30 seconds, feel the vibration', durationMinutes: 1 },
        { label: 'Say "mmm-hmm" sliding up to target pitch, repeat 10x', durationMinutes: 2 },
        { label: 'Read 5 sentences aloud at target pitch (use phone recording)', durationMinutes: 4 },
        { label: 'Practice conversation phrases: "Hi, how are you?", "Thanks so much!"', durationMinutes: 3 },
        { label: 'Listen back to recording, note one thing to improve', durationMinutes: 2 },
        { label: 'Write down progress in notes app', durationMinutes: 1 },
      ],
      prerequisites: [
        { item: 'Private space to speak aloud', icon: 'privacy' },
        { item: 'Phone for recording', icon: 'device' },
        { item: 'Water nearby', icon: 'supplies' },
      ],
      references: voiceRefs,
    };
  }

  // === SKINCARE / BEAUTY ===
  if (domain === 'skincare' || name.includes('skin') || name.includes('glow') || name.includes('beauty')) {
    return {
      estimatedMinutes: 12,
      steps: [
        { label: 'Wash hands thoroughly with soap', durationMinutes: 1 },
        { label: 'Wet face with lukewarm water, apply cleanser in circles', durationMinutes: 2 },
        { label: 'Rinse cleanser, pat face dry with clean towel', durationMinutes: 1 },
        { label: 'Apply toner to cotton pad, sweep across face and neck', durationMinutes: 1 },
        { label: 'Warm 2-3 drops of serum between palms, press into skin', durationMinutes: 2 },
        { label: 'Take pea-sized moisturizer, dot on forehead, cheeks, chin, nose', durationMinutes: 2 },
        { label: 'Massage moisturizer in upward strokes, include neck', durationMinutes: 2 },
        { label: 'If morning: apply SPF generously as final step', durationMinutes: 1 },
      ],
      prerequisites: [
        { item: 'Cleanser, toner, serum, moisturizer', icon: 'supplies' },
        { item: 'Clean towel', icon: 'supplies' },
        { item: 'Mirror with good lighting', icon: 'mirror' },
      ],
    };
  }

  // === MOVEMENT / FEMININE PRESENCE ===
  if (domain === 'movement' || name.includes('movement') || name.includes('posture') ||
      name.includes('feminine') || name.includes('presence') || name.includes('body') ||
      name.includes('walk') || name.includes('gesture')) {
    // Build task-specific references based on what the task is about
    const movementRefs: ReferenceLink[] = [];

    if (name.includes('walk')) {
      movementRefs.push({ title: 'How to Walk Like a Woman (MTF Tips)', url: 'https://feminizationsecrets.com/transgender-crossdressing-walk-like-woman/', source: 'Feminization Secrets' });
      movementRefs.push({ title: '5 MTF Movement Mistakes to Avoid', url: 'https://feminizationsecrets.com/male-to-female-movement-mistakes/', source: 'Feminization Secrets' });
    }
    if (name.includes('hip') || name.includes('sway')) {
      movementRefs.push({ title: 'Samba Secrets for Feminine Hip Movements', url: 'https://feminizationsecrets.com/move-hips-booty/', source: 'Feminization Secrets' });
      movementRefs.push({ title: 'How to Walk Like a Woman', url: 'https://feminizationsecrets.com/transgender-crossdressing-walk-like-woman/', source: 'Feminization Secrets' });
    }
    if (name.includes('posture') || name.includes('stand') || name.includes('tall')) {
      movementRefs.push({ title: 'Posture Tips for Feminine Presentation', url: 'https://www.transvitae.com/posture-exercises-feminine-presentation-transgender/', source: 'TransVitae' });
      movementRefs.push({ title: '5 MTF Movement Mistakes to Avoid', url: 'https://feminizationsecrets.com/male-to-female-movement-mistakes/', source: 'Feminization Secrets' });
    }
    if (name.includes('sit') || name.includes('knee') || name.includes('cross')) {
      movementRefs.push({ title: 'Top 7 Tips for Feminine Body Movements', url: 'https://feminizationsecrets.com/feminizing-body-movements/', source: 'Feminization Secrets' });
      movementRefs.push({ title: 'Body Language Dos and Don\'ts', url: 'https://feminizationsecrets.com/transgender-crossdressing-body-language-do-dont/', source: 'Feminization Secrets' });
    }
    if (name.includes('gesture') || name.includes('hand') || name.includes('arm')) {
      movementRefs.push({ title: 'Body Language Dos and Don\'ts', url: 'https://feminizationsecrets.com/transgender-crossdressing-body-language-do-dont/', source: 'Feminization Secrets' });
      movementRefs.push({ title: '27 Body Language Mistakes to Avoid', url: 'https://feminizationsecrets.com/transgender-crossdressing-body-language-mistakes/', source: 'Feminization Secrets' });
    }
    if (name.includes('presence') || name.includes('feminine') || name.includes('embody')) {
      movementRefs.push({ title: 'Top 7 Tips for Feminine Body Movements', url: 'https://feminizationsecrets.com/feminizing-body-movements/', source: 'Feminization Secrets' });
      movementRefs.push({ title: '6 Lessons from Cis Women', url: 'https://feminizationsecrets.com/crossdressing-mtf-transgender-femininity-tip/', source: 'Feminization Secrets' });
    }

    // Always include general movement as fallback
    if (movementRefs.length === 0) {
      movementRefs.push({ title: 'Top 7 Tips for Feminine Body Movements', url: 'https://feminizationsecrets.com/feminizing-body-movements/', source: 'Feminization Secrets' });
      movementRefs.push({ title: '5 MTF Movement Mistakes to Avoid', url: 'https://feminizationsecrets.com/male-to-female-movement-mistakes/', source: 'Feminization Secrets' });
    }

    return {
      estimatedMinutes: 15,
      steps: [
        { label: 'Stand tall: feet hip-width, shoulders back, chin parallel to floor', durationMinutes: 1 },
        { label: 'Body scan: relax jaw, drop shoulders, soften hands, unlock knees', durationMinutes: 2 },
        { label: 'Walk across room 5x: lead with hips, feet in straighter line', durationMinutes: 3 },
        { label: 'Practice sitting: cross legs at ankle, hands rest softly on thigh', durationMinutes: 2 },
        { label: 'Hand gestures: practice open palms, soft wrists, graceful reach', durationMinutes: 2 },
        { label: 'Head tilt exercise: slight tilt when "listening", practice in mirror', durationMinutes: 2 },
        { label: 'Put it together: walk to chair, sit, have imaginary conversation', durationMinutes: 2 },
        { label: 'Record yourself on phone, watch back, note improvements', durationMinutes: 1 },
      ],
      prerequisites: [
        { item: 'Full-length mirror', icon: 'mirror' },
        { item: 'Space to walk 6-8 steps', icon: 'privacy' },
        { item: 'Phone for video (optional)', icon: 'device' },
      ],
      references: movementRefs,
    };
  }

  // === STYLE / OUTFIT / FASHION ===
  if (domain === 'style' || name.includes('style') || name.includes('outfit') ||
      name.includes('fashion') || name.includes('dress') || name.includes('look')) {
    return {
      estimatedMinutes: 20,
      steps: [
        { label: 'Pick 3 outfit pieces that work together (top, bottom, layer)', durationMinutes: 3 },
        { label: 'Put on base layers first (underwear, shapewear if using)', durationMinutes: 2 },
        { label: 'Dress bottom-up: bottoms, top, layer', durationMinutes: 4 },
        { label: 'Check fit in mirror: adjust tucking, rolling sleeves, etc.', durationMinutes: 2 },
        { label: 'Add 1-2 accessories (jewelry, belt, scarf)', durationMinutes: 2 },
        { label: 'Take 3 photos: front, side, full body', durationMinutes: 3 },
        { label: 'Rate outfit 1-10, note what works and what to change', durationMinutes: 2 },
        { label: 'Change back, hang/fold clothes properly', durationMinutes: 2 },
      ],
      prerequisites: [
        { item: 'Outfit pieces selected', icon: 'supplies' },
        { item: 'Full-length mirror', icon: 'mirror' },
        { item: 'Private dressing space', icon: 'privacy' },
        { item: 'Phone for photos', icon: 'device' },
      ],
    };
  }

  // === MAKEUP ===
  if (name.includes('makeup') || name.includes('cosmetic') || name.includes('glam')) {
    return {
      estimatedMinutes: 25,
      steps: [
        { label: 'Start with clean, moisturized face (wait 5 min after moisturizer)', durationMinutes: 1 },
        { label: 'Apply primer to T-zone, let it set 1 minute', durationMinutes: 2 },
        { label: 'Foundation: dot on forehead, cheeks, chin, blend outward with sponge', durationMinutes: 4 },
        { label: 'Concealer under eyes in triangle shape, blend gently', durationMinutes: 2 },
        { label: 'Set with powder on T-zone only', durationMinutes: 1 },
        { label: 'Eyebrows: fill sparse areas with light strokes', durationMinutes: 3 },
        { label: 'Eyeshadow: light shade all over, medium in crease, dark in corner', durationMinutes: 4 },
        { label: 'Eyeliner: start thin at inner corner, thicken toward outer', durationMinutes: 3 },
        { label: 'Mascara: wiggle wand at base, pull through to tips', durationMinutes: 2 },
        { label: 'Lips: line edges, fill in with lipstick, blot once', durationMinutes: 2 },
        { label: 'Take photos of final look', durationMinutes: 1 },
      ],
      prerequisites: [
        { item: 'Makeup products ready', icon: 'supplies' },
        { item: 'Good lighting + mirror', icon: 'mirror' },
        { item: 'Makeup remover for after', icon: 'supplies' },
        { item: 'Private space', icon: 'privacy' },
      ],
    };
  }

  // === SOCIAL / CONFIDENCE ===
  if (domain === 'social' || name.includes('social') || name.includes('confident') ||
      name.includes('interact') || name.includes('public')) {
    return {
      estimatedMinutes: 15,
      steps: [
        { label: 'Write 3 things you like about yourself today', durationMinutes: 2 },
        { label: 'Practice introduction: "Hi, I\'m [name]" with smile, 5 times', durationMinutes: 2 },
        { label: 'Record video of yourself talking about your day (1 min)', durationMinutes: 2 },
        { label: 'Practice maintaining eye contact with your reflection', durationMinutes: 2 },
        { label: 'Run through common scenarios: ordering coffee, small talk, etc.', durationMinutes: 4 },
        { label: 'Power pose for 2 minutes (hands on hips, stand tall)', durationMinutes: 2 },
        { label: 'Set one small social goal for today or tomorrow', durationMinutes: 1 },
      ],
      prerequisites: [
        { item: 'Mirror', icon: 'mirror' },
        { item: 'Phone for recording', icon: 'device' },
        { item: 'Quiet space', icon: 'privacy' },
      ],
    };
  }

  // === MINDSET / MENTAL ===
  if (domain === 'mindset' || name.includes('mindset') || name.includes('mental') ||
      name.includes('affirm') || name.includes('journal') || name.includes('reflect')) {
    return {
      estimatedMinutes: 12,
      steps: [
        { label: 'Sit comfortably, take 5 deep breaths (4 count in, 6 count out)', durationMinutes: 2 },
        { label: 'Write: "I am grateful for..." (list 3 things)', durationMinutes: 2 },
        { label: 'Write: "Today I will..." (set 1 intention)', durationMinutes: 1 },
        { label: 'Read affirmations aloud 3x each, looking in mirror if possible', durationMinutes: 3 },
        { label: 'Close eyes, visualize yourself as you want to be for 2 minutes', durationMinutes: 2 },
        { label: 'Write: "One thing I\'m proud of recently..."', durationMinutes: 1 },
        { label: 'End with 3 more deep breaths, set your intention', durationMinutes: 1 },
      ],
      prerequisites: [
        { item: 'Journal or notes app', icon: 'device' },
        { item: 'Quiet, comfortable space', icon: 'privacy' },
        { item: 'List of your affirmations', icon: 'supplies' },
      ],
    };
  }

  // === HYPNO / CONDITIONING (if in goals) ===
  if (name.includes('hypno') || name.includes('trance') || name.includes('listen') ||
      name.includes('conditioning') || name.includes('program')) {
    return {
      estimatedMinutes: 25,
      steps: [
        { label: 'Use bathroom, get water - no interruptions needed', durationMinutes: 2, vibration: 'off' },
        { label: 'Lie down or recline comfortably, headphones on', durationMinutes: 1, vibration: 'off' },
        { label: 'Take 10 slow breaths, relax each body part from toes up', durationMinutes: 2, vibration: 'heartbeat', intensity: 2 },
        { label: 'Start audio, let your eyes close when ready', durationMinutes: 1, vibration: 'gentle_wave', intensity: 3 },
        { label: 'Listen fully, don\'t try to analyze or resist', durationMinutes: 15, vibration: 'constant_low', intensity: 5 },
        { label: 'When audio ends, stay still, wiggle fingers and toes', durationMinutes: 2, vibration: 'flutter_gentle', intensity: 2 },
        { label: 'Slowly sit up, drink water, note any feelings', durationMinutes: 2, vibration: 'off' },
      ],
      prerequisites: [
        { item: 'Headphones required', icon: 'headphones' },
        { item: '25 uninterrupted minutes', icon: 'time' },
        { item: 'Comfortable lying position', icon: 'privacy' },
        { item: 'Water nearby', icon: 'supplies' },
      ],
    };
  }

  // === EDGE / AROUSAL TRAINING (if in goals) ===
  if (name.includes('edge') || name.includes('arousal') || name.includes('tease') ||
      name.includes('denial') || name.includes('control')) {
    return {
      estimatedMinutes: 20,
      steps: [
        { label: 'Set timer for 20 min - you will NOT finish early', durationMinutes: 1, vibration: 'off' },
        { label: 'Get comfortable, start with slow breathing', durationMinutes: 2, vibration: 'gentle_wave', intensity: 4 },
        { label: 'Begin light stimulation, stay below 50% arousal', durationMinutes: 3, vibration: 'flutter_gentle', intensity: 6 },
        { label: 'Build slowly to 70%, then pause completely for 30 sec', durationMinutes: 4, vibration: 'building', intensity: 10 },
        { label: 'Resume, build to 80%, pause again - repeat 3 times', durationMinutes: 6, vibration: 'edge_tease' },
        { label: 'Final edge: go to 90%, hold for 10 seconds, then stop', durationMinutes: 2, vibration: 'staircase' },
        { label: 'Cool down: hands off, breathe deeply, let arousal drop', durationMinutes: 2, vibration: 'gentle_wave', intensity: 3 },
      ],
      prerequisites: [
        { item: 'Full privacy for 20 min', icon: 'privacy' },
        { item: 'Timer set', icon: 'time' },
        { item: 'Lovense/toy if using', icon: 'device' },
      ],
    };
  }

  // === DEFAULT / GENERIC ===
  // Even the default should be actionable
  return {
    estimatedMinutes: 10,
    steps: [
      { label: 'Read through your goal description carefully', durationMinutes: 1 },
      { label: 'Set a timer for your practice session', durationMinutes: 1 },
      { label: 'Focus on one specific aspect to improve today', durationMinutes: 2 },
      { label: 'Practice actively for 5 minutes minimum', durationMinutes: 5 },
      { label: 'Note one thing you did well and one to improve', durationMinutes: 1 },
    ],
    prerequisites: [
      { item: 'Quiet space', icon: 'privacy' },
      { item: 'Timer', icon: 'time' },
    ],
  };
}

/**
 * Get detailed steps for tasks based on domain and instruction
 */
function getTaskSteps(instruction: string, domain: string): SessionData {
  const inst = instruction.toLowerCase();

  // Check if task instruction matches any session patterns first
  const sessionMatch = getSessionDataIfMatches(instruction);
  if (sessionMatch) {
    return sessionMatch;
  }

  // Domain-specific task breakdowns
  if (domain === 'voice' || inst.includes('voice') || inst.includes('speak')) {
    // Build task-specific references
    const voiceRefs: ReferenceLink[] = [];
    if (inst.includes('pitch')) {
      voiceRefs.push({ title: 'Pitch & Resonance Isolation (Video)', url: 'https://www.reneeyoxon.com/blog/pitch-reso-isolation-for-trans-voice', source: 'Renee Yoxon' });
    } else if (inst.includes('resonance')) {
      voiceRefs.push({ title: 'Prove You Can Modify Resonance', url: 'https://www.reneeyoxon.com/blog/let-me-prove-to-you-that-you-can-modify-your-resonance', source: 'Renee Yoxon' });
    } else if (inst.includes('hum') || inst.includes('warm')) {
      voiceRefs.push({ title: 'Three Daily Voice Exercises', url: 'https://www.reneeyoxon.com/blog/three-daily-voice-feminization-exercises', source: 'Renee Yoxon' });
    } else {
      voiceRefs.push({ title: 'Three Daily Voice Exercises', url: 'https://www.reneeyoxon.com/blog/three-daily-voice-feminization-exercises', source: 'Renee Yoxon' });
      voiceRefs.push({ title: 'TransVoiceLessons YouTube', url: 'https://www.youtube.com/@TransVoiceLessons', source: 'YouTube' });
    }

    return {
      estimatedMinutes: 10,
      steps: [
        { label: 'Find a private space where you can speak freely', durationMinutes: 1 },
        { label: 'Warm up: hum gently for 30 seconds', durationMinutes: 1 },
        { label: `Complete task: ${instruction}`, durationMinutes: 6 },
        { label: 'Record yourself if practicing speech/reading', durationMinutes: 1 },
        { label: 'Note any observations about your progress', durationMinutes: 1 },
      ],
      prerequisites: [
        { item: 'Private space to speak', icon: 'privacy' },
        { item: 'Phone for recording', icon: 'device' },
      ],
      references: voiceRefs,
    };
  }

  if (domain === 'skincare' || inst.includes('skin') || inst.includes('face') || inst.includes('moistur')) {
    return {
      estimatedMinutes: 8,
      steps: [
        { label: 'Wash and dry hands', durationMinutes: 1 },
        { label: `Complete task: ${instruction}`, durationMinutes: 5 },
        { label: 'Check results in mirror', durationMinutes: 1 },
        { label: 'Clean up and put products away', durationMinutes: 1 },
      ],
      prerequisites: [
        { item: 'Products needed for task', icon: 'supplies' },
        { item: 'Mirror', icon: 'mirror' },
      ],
    };
  }

  if (domain === 'movement' || inst.includes('posture') || inst.includes('walk') || inst.includes('stretch')) {
    // Build task-specific references
    const movementRefs: ReferenceLink[] = [];
    if (inst.includes('walk')) {
      movementRefs.push({ title: 'How to Walk Like a Woman', url: 'https://feminizationsecrets.com/transgender-crossdressing-walk-like-woman/', source: 'Feminization Secrets' });
    } else if (inst.includes('hip') || inst.includes('sway')) {
      movementRefs.push({ title: 'Samba Secrets for Hip Movements', url: 'https://feminizationsecrets.com/move-hips-booty/', source: 'Feminization Secrets' });
    } else if (inst.includes('sit') || inst.includes('knee')) {
      movementRefs.push({ title: 'Top 7 Tips for Feminine Movements', url: 'https://feminizationsecrets.com/feminizing-body-movements/', source: 'Feminization Secrets' });
    } else if (inst.includes('gesture') || inst.includes('hand')) {
      movementRefs.push({ title: 'Body Language Dos and Don\'ts', url: 'https://feminizationsecrets.com/transgender-crossdressing-body-language-do-dont/', source: 'Feminization Secrets' });
    } else if (inst.includes('posture') || inst.includes('stand')) {
      movementRefs.push({ title: 'Posture Tips for Feminine Look', url: 'https://www.transvitae.com/posture-exercises-feminine-presentation-transgender/', source: 'TransVitae' });
    } else {
      movementRefs.push({ title: '5 MTF Movement Mistakes to Avoid', url: 'https://feminizationsecrets.com/male-to-female-movement-mistakes/', source: 'Feminization Secrets' });
    }

    return {
      estimatedMinutes: 10,
      steps: [
        { label: 'Clear space to move around', durationMinutes: 1 },
        { label: 'Quick 1-minute stretch to loosen up', durationMinutes: 1 },
        { label: `Complete task: ${instruction}`, durationMinutes: 6 },
        { label: 'Check form in mirror', durationMinutes: 1 },
        { label: 'Note what felt natural vs. needs work', durationMinutes: 1 },
      ],
      prerequisites: [
        { item: 'Space to move', icon: 'privacy' },
        { item: 'Mirror (ideally full-length)', icon: 'mirror' },
      ],
      references: movementRefs,
    };
  }

  if (domain === 'style' || inst.includes('outfit') || inst.includes('wear') || inst.includes('dress')) {
    return {
      estimatedMinutes: 12,
      steps: [
        { label: 'Gather items you\'ll need', durationMinutes: 2 },
        { label: `Complete task: ${instruction}`, durationMinutes: 7 },
        { label: 'Take photos for reference', durationMinutes: 2 },
        { label: 'Put things back properly', durationMinutes: 1 },
      ],
      prerequisites: [
        { item: 'Items for the task', icon: 'supplies' },
        { item: 'Private space', icon: 'privacy' },
        { item: 'Mirror', icon: 'mirror' },
      ],
    };
  }

  if (domain === 'mindset' || inst.includes('affirm') || inst.includes('journal') || inst.includes('reflect')) {
    return {
      estimatedMinutes: 8,
      steps: [
        { label: 'Find quiet, comfortable spot', durationMinutes: 1 },
        { label: 'Take 3 deep breaths to center yourself', durationMinutes: 1 },
        { label: `Complete task: ${instruction}`, durationMinutes: 5 },
        { label: 'Close with intention-setting', durationMinutes: 1 },
      ],
      prerequisites: [
        { item: 'Journal or notes app', icon: 'device' },
        { item: 'Quiet space', icon: 'privacy' },
      ],
    };
  }

  // Default task breakdown - still actionable
  return {
    estimatedMinutes: 8,
    steps: [
      { label: 'Read the task instruction fully', durationMinutes: 1 },
      { label: 'Gather anything you need', durationMinutes: 1 },
      { label: `Complete: ${instruction}`, durationMinutes: 5 },
      { label: 'Mark complete when done', durationMinutes: 1 },
    ],
    prerequisites: [
      { item: 'Focus time', icon: 'time' },
    ],
  };
}

function getBestTimeForDomain(domain: string | null | undefined): TimePeriod {
  // Suggest best times for different activity types
  const timeMap: Record<string, TimePeriod> = {
    'skincare': 'morning', // Morning/evening routine
    'voice': 'morning', // Best when fresh
    'movement': 'anytime',
    'style': 'morning', // Getting dressed
    'social': 'afternoon', // When people are around
    'mindset': 'evening', // Reflection time
  };

  return domain && timeMap[domain] || 'anytime';
}

/**
 * Get structured session data based on session type/title
 * Provides detailed steps and prerequisites for cognitive pre-loading
 */
interface SessionData {
  estimatedMinutes: number;
  steps: ActionStep[];
  prerequisites: ActionPrerequisite[];
  references?: ReferenceLink[];
}

function getSessionData(sessionTitle: string): SessionData {
  const title = sessionTitle.toLowerCase();

  // === AROUSAL & EDGE TRAINING ===

  // Edge training sessions
  if (title.includes('edge') || title.includes('edging')) {
    return {
      estimatedMinutes: 30,
      steps: [
        { label: 'Set up Lovense or toy', durationMinutes: 2, vibration: 'off' },
        { label: 'Watch clip #1 while edging', durationMinutes: 10, vibration: 'building', intensity: 12 },
        { label: 'Build to 80%, then pause', durationMinutes: 5, vibration: 'edge_tease' },
        { label: 'Watch clip #2, edge again', durationMinutes: 8, vibration: 'staircase' },
        { label: 'Cool down without release', durationMinutes: 3, vibration: 'gentle_wave', intensity: 5 },
        { label: 'Log session in app', durationMinutes: 2, vibration: 'off' },
      ],
      prerequisites: [
        { item: 'Privacy for 30 min', icon: 'privacy' },
        { item: 'Lovense charged', icon: 'device' },
        { item: 'Headphones', icon: 'headphones' },
      ],
    };
  }

  // Denial reinforcement
  if (title.includes('denial') || title.includes('chastity') || title.includes('lockup')) {
    return {
      estimatedMinutes: 15,
      steps: [
        { label: 'Review your denial streak', durationMinutes: 2, vibration: 'off' },
        { label: 'Read denial affirmations', durationMinutes: 3, vibration: 'flutter_gentle', intensity: 3 },
        { label: 'Light teasing (no edge)', durationMinutes: 5, vibration: 'denial_pulse' },
        { label: 'Lock up or secure', durationMinutes: 3, vibration: 'off' },
        { label: 'Journal your feelings', durationMinutes: 2, vibration: 'off' },
      ],
      prerequisites: [
        { item: 'Private space', icon: 'privacy' },
        { item: 'Cage/device if using', icon: 'supplies' },
      ],
    };
  }

  // Gooning / extended sessions
  if (title.includes('goon') || title.includes('extended') || title.includes('marathon')) {
    return {
      estimatedMinutes: 60,
      steps: [
        { label: 'Set up comfortable space', durationMinutes: 5, vibration: 'off' },
        { label: 'Start with light stimulation', durationMinutes: 10, vibration: 'gentle_wave', intensity: 6 },
        { label: 'Enter gooning headspace', durationMinutes: 15, vibration: 'building', intensity: 10 },
        { label: 'Maintain plateau state', durationMinutes: 20, vibration: 'constant_medium', intensity: 12 },
        { label: 'Gradual cool down', durationMinutes: 8, vibration: 'gentle_wave', intensity: 4 },
        { label: 'Hydrate and recover', durationMinutes: 2, vibration: 'off' },
      ],
      prerequisites: [
        { item: 'Full hour of privacy', icon: 'time' },
        { item: 'Water bottle nearby', icon: 'supplies' },
        { item: 'Comfortable setup', icon: 'privacy' },
        { item: 'Headphones', icon: 'headphones' },
      ],
    };
  }

  // Sissygasm training
  if (title.includes('sissygasm') || title.includes('hands-free') || title.includes('prostate')) {
    return {
      estimatedMinutes: 45,
      steps: [
        { label: 'Relaxation and breathing', durationMinutes: 5, vibration: 'heartbeat', intensity: 3 },
        { label: 'Prepare and insert toy', durationMinutes: 5, vibration: 'off' },
        { label: 'Find comfortable position', durationMinutes: 3, vibration: 'flutter_gentle', intensity: 4 },
        { label: 'Focus on internal sensations', durationMinutes: 15, vibration: 'gentle_wave', intensity: 8 },
        { label: 'Build without touching', durationMinutes: 12, vibration: 'building', intensity: 14 },
        { label: 'Cool down and clean up', durationMinutes: 5, vibration: 'off' },
      ],
      prerequisites: [
        { item: '45 min privacy', icon: 'time' },
        { item: 'Toy and lube ready', icon: 'supplies' },
        { item: 'Relaxed mindset', icon: 'privacy' },
        { item: 'Audio/video if using', icon: 'headphones' },
      ],
    };
  }

  // Orgasm practice (when allowed)
  if (title.includes('release') || title.includes('reward') || title.includes('orgasm')) {
    return {
      estimatedMinutes: 20,
      steps: [
        { label: 'Confirm release is earned', durationMinutes: 1, vibration: 'off' },
        { label: 'Set the mood', durationMinutes: 3, vibration: 'flutter_gentle', intensity: 5 },
        { label: 'Build slowly with intention', durationMinutes: 10, vibration: 'staircase' },
        { label: 'Release with gratitude', durationMinutes: 3, vibration: 'constant_high', intensity: 18 },
        { label: 'Rest and reflect', durationMinutes: 3, vibration: 'off' },
      ],
      prerequisites: [
        { item: 'Release permission confirmed', icon: 'time' },
        { item: 'Private space', icon: 'privacy' },
      ],
    };
  }

  // === HYPNO & CONDITIONING ===

  // Hypno sessions
  if (title.includes('hypno') || title.includes('trance') || title.includes('conditioning')) {
    return {
      estimatedMinutes: 25,
      steps: [
        { label: 'Find comfortable position', durationMinutes: 2, vibration: 'off' },
        { label: 'Deep breathing to relax', durationMinutes: 3, vibration: 'heartbeat', intensity: 2 },
        { label: 'Enter trance with induction', durationMinutes: 5, vibration: 'gentle_wave', intensity: 4 },
        { label: 'Listen to main content', durationMinutes: 10, vibration: 'constant_low', intensity: 5 },
        { label: 'Slowly return to awareness', durationMinutes: 3, vibration: 'flutter_gentle', intensity: 2 },
        { label: 'Journal any insights', durationMinutes: 2, vibration: 'off' },
      ],
      prerequisites: [
        { item: 'Private space', icon: 'privacy' },
        { item: 'Headphones required', icon: 'headphones' },
        { item: '25 uninterrupted minutes', icon: 'time' },
      ],
    };
  }

  // Bambi Sleep specific
  if (title.includes('bambi') || title.includes('bimbo')) {
    return {
      estimatedMinutes: 40,
      steps: [
        { label: 'Put on uniform/outfit', durationMinutes: 5, vibration: 'off' },
        { label: 'Get into Bambi headspace', durationMinutes: 3, vibration: 'flutter_gentle', intensity: 3 },
        { label: 'Induction and deepening', durationMinutes: 7, vibration: 'gentle_wave', intensity: 6 },
        { label: 'Main training content', durationMinutes: 15, vibration: 'constant_low', intensity: 7 },
        { label: 'Reinforcement loops', durationMinutes: 5, vibration: 'heartbeat', intensity: 8 },
        { label: 'Wake up and ground', durationMinutes: 5, vibration: 'off' },
      ],
      prerequisites: [
        { item: 'Bambi outfit ready', icon: 'supplies' },
        { item: 'Headphones required', icon: 'headphones' },
        { item: '40 min privacy', icon: 'time' },
        { item: 'Comfortable position', icon: 'privacy' },
      ],
    };
  }

  // Subliminal listening
  if (title.includes('subliminal') || title.includes('ambient')) {
    return {
      estimatedMinutes: 30,
      steps: [
        { label: 'Start subliminal audio', durationMinutes: 1, vibration: 'off' },
        { label: 'Do light activity while listening', durationMinutes: 25, vibration: 'constant_low', intensity: 3 },
        { label: 'End session mindfully', durationMinutes: 2, vibration: 'flutter_gentle', intensity: 2 },
        { label: 'Note any feelings', durationMinutes: 2, vibration: 'off' },
      ],
      prerequisites: [
        { item: 'Headphones or speakers', icon: 'headphones' },
        { item: '30 min available', icon: 'time' },
      ],
    };
  }

  // Sissy affirmations
  if (title.includes('sissy') && (title.includes('affirm') || title.includes('mantra'))) {
    return {
      estimatedMinutes: 10,
      steps: [
        { label: 'Stand before mirror', durationMinutes: 1, vibration: 'off' },
        { label: 'Read affirmations aloud', durationMinutes: 4, vibration: 'heartbeat', intensity: 4 },
        { label: 'Repeat key mantras 10x', durationMinutes: 3, vibration: 'constant_low', intensity: 5 },
        { label: 'Visualize your ideal self', durationMinutes: 2, vibration: 'gentle_wave', intensity: 6 },
      ],
      prerequisites: [
        { item: 'Mirror access', icon: 'mirror' },
        { item: 'Privacy to speak', icon: 'privacy' },
      ],
    };
  }

  // JOI sessions
  if (title.includes('joi') || title.includes('instruction')) {
    return {
      estimatedMinutes: 20,
      steps: [
        { label: 'Start JOI video/audio', durationMinutes: 1, vibration: 'off' },
        { label: 'Follow instructions exactly', durationMinutes: 15, vibration: 'random_tease' },
        { label: 'Obey the ending command', durationMinutes: 2, vibration: 'edge_tease' },
        { label: 'Cool down or clean up', durationMinutes: 2, vibration: 'off' },
      ],
      prerequisites: [
        { item: 'Privacy', icon: 'privacy' },
        { item: 'Headphones', icon: 'headphones' },
        { item: 'Supplies as directed', icon: 'supplies' },
      ],
    };
  }

  // === FEMINIZATION & PRESENTATION ===

  // Voice practice
  if (title.includes('voice') || title.includes('speaking') || title.includes('pitch')) {
    return {
      estimatedMinutes: 15,
      steps: [
        { label: 'Warm up with humming', durationMinutes: 2 },
        { label: 'Practice target pitch', durationMinutes: 4 },
        { label: 'Read practice sentences', durationMinutes: 4 },
        { label: 'Record and compare', durationMinutes: 3 },
        { label: 'Note progress', durationMinutes: 2 },
      ],
      prerequisites: [
        { item: 'Private space to speak', icon: 'privacy' },
        { item: 'Recording app ready', icon: 'device' },
      ],
    };
  }

  // Movement/posture practice
  if (title.includes('movement') || title.includes('posture') || title.includes('walk')) {
    return {
      estimatedMinutes: 15,
      steps: [
        { label: 'Stretch and warm up', durationMinutes: 3 },
        { label: 'Practice hip-forward walk', durationMinutes: 4 },
        { label: 'Work on sitting posture', durationMinutes: 3 },
        { label: 'Practice gestures', durationMinutes: 3 },
        { label: 'Check in mirror', durationMinutes: 2 },
      ],
      prerequisites: [
        { item: 'Space to move around', icon: 'privacy' },
        { item: 'Full-length mirror', icon: 'mirror' },
        { item: 'Heels (optional)', icon: 'supplies' },
      ],
    };
  }

  // Makeup practice
  if (title.includes('makeup') || title.includes('cosmetic')) {
    return {
      estimatedMinutes: 25,
      steps: [
        { label: 'Cleanse and prep face', durationMinutes: 3 },
        { label: 'Apply base/foundation', durationMinutes: 5 },
        { label: 'Eye makeup', durationMinutes: 8 },
        { label: 'Lips and finishing', durationMinutes: 4 },
        { label: 'Take photos', durationMinutes: 2 },
        { label: 'Remove and moisturize', durationMinutes: 3 },
      ],
      prerequisites: [
        { item: 'Makeup supplies', icon: 'supplies' },
        { item: 'Good lighting', icon: 'mirror' },
        { item: 'Private space', icon: 'privacy' },
        { item: 'Makeup remover ready', icon: 'supplies' },
      ],
    };
  }

  // Outfit/dressing practice
  if (title.includes('outfit') || title.includes('dress') || title.includes('style')) {
    return {
      estimatedMinutes: 20,
      steps: [
        { label: 'Select outfit pieces', durationMinutes: 3 },
        { label: 'Put on base layers', durationMinutes: 3 },
        { label: 'Complete the look', durationMinutes: 5 },
        { label: 'Accessories and details', durationMinutes: 4 },
        { label: 'Photo session', durationMinutes: 3 },
        { label: 'Change back and store', durationMinutes: 2 },
      ],
      prerequisites: [
        { item: 'Outfit ready', icon: 'supplies' },
        { item: 'Full mirror', icon: 'mirror' },
        { item: 'Privacy', icon: 'privacy' },
      ],
    };
  }

  // Skincare routine
  if (title.includes('skincare') || title.includes('skin care') || title.includes('facial')) {
    return {
      estimatedMinutes: 15,
      steps: [
        { label: 'Remove any makeup', durationMinutes: 2 },
        { label: 'Cleanse face', durationMinutes: 2 },
        { label: 'Apply toner', durationMinutes: 1 },
        { label: 'Serum application', durationMinutes: 2 },
        { label: 'Moisturizer', durationMinutes: 2 },
        { label: 'SPF (if morning)', durationMinutes: 1 },
        { label: 'Enjoy soft skin moment', durationMinutes: 5 },
      ],
      prerequisites: [
        { item: 'Skincare products', icon: 'supplies' },
        { item: 'Clean towel', icon: 'supplies' },
      ],
    };
  }

  // Body hair removal
  if (title.includes('shav') || title.includes('hair removal') || title.includes('smooth')) {
    return {
      estimatedMinutes: 30,
      steps: [
        { label: 'Warm shower to soften', durationMinutes: 5 },
        { label: 'Apply shaving cream', durationMinutes: 2 },
        { label: 'Shave with the grain first', durationMinutes: 10 },
        { label: 'Second pass against grain', durationMinutes: 8 },
        { label: 'Rinse and check', durationMinutes: 3 },
        { label: 'Moisturize entire body', durationMinutes: 2 },
      ],
      prerequisites: [
        { item: 'Fresh razor', icon: 'supplies' },
        { item: 'Shaving cream', icon: 'supplies' },
        { item: 'Moisturizer', icon: 'supplies' },
        { item: '30 min in bathroom', icon: 'privacy' },
      ],
    };
  }

  // === MINDSET & MENTAL ===

  // Meditation/mindfulness
  if (title.includes('meditat') || title.includes('mindful') || title.includes('breath')) {
    return {
      estimatedMinutes: 10,
      steps: [
        { label: 'Find quiet, comfortable spot', durationMinutes: 1, vibration: 'off' },
        { label: 'Set timer and close eyes', durationMinutes: 1, vibration: 'heartbeat', intensity: 2 },
        { label: 'Focus on breath', durationMinutes: 7, vibration: 'gentle_wave', intensity: 3 },
        { label: 'Gently return to awareness', durationMinutes: 1, vibration: 'off' },
      ],
      prerequisites: [
        { item: 'Quiet space', icon: 'privacy' },
        { item: '10 uninterrupted minutes', icon: 'time' },
      ],
    };
  }

  // Journaling
  if (title.includes('journal') || title.includes('writing') || title.includes('reflect')) {
    return {
      estimatedMinutes: 15,
      steps: [
        { label: 'Open journal or app', durationMinutes: 1, vibration: 'off' },
        { label: 'Free write feelings', durationMinutes: 5, vibration: 'constant_low', intensity: 2 },
        { label: 'Answer prompt questions', durationMinutes: 5, vibration: 'constant_low', intensity: 3 },
        { label: 'Set intention for tomorrow', durationMinutes: 2, vibration: 'heartbeat', intensity: 4 },
        { label: 'Read back and reflect', durationMinutes: 2, vibration: 'off' },
      ],
      prerequisites: [
        { item: 'Journal or device', icon: 'device' },
        { item: 'Quiet moment', icon: 'privacy' },
      ],
    };
  }

  // Affirmations
  if (title.includes('affirm') || title.includes('mantra') || title.includes('positive')) {
    return {
      estimatedMinutes: 10,
      steps: [
        { label: 'Stand before mirror', durationMinutes: 1, vibration: 'off' },
        { label: 'Eye contact with self', durationMinutes: 1, vibration: 'flutter_gentle', intensity: 2 },
        { label: 'Speak affirmations aloud', durationMinutes: 5, vibration: 'heartbeat', intensity: 5 },
        { label: 'Feel the words land', durationMinutes: 2, vibration: 'gentle_wave', intensity: 6 },
        { label: 'Close with gratitude', durationMinutes: 1, vibration: 'off' },
      ],
      prerequisites: [
        { item: 'Mirror access', icon: 'mirror' },
        { item: 'Privacy to speak', icon: 'privacy' },
      ],
    };
  }

  // Visualization
  if (title.includes('visual') || title.includes('imagine') || title.includes('manifest')) {
    return {
      estimatedMinutes: 10,
      steps: [
        { label: 'Get comfortable, close eyes', durationMinutes: 1, vibration: 'off' },
        { label: 'Relax body with breaths', durationMinutes: 2, vibration: 'heartbeat', intensity: 3 },
        { label: 'Visualize your ideal self', durationMinutes: 5, vibration: 'gentle_wave', intensity: 5 },
        { label: 'Feel the emotions fully', durationMinutes: 2, vibration: 'building', intensity: 7 },
      ],
      prerequisites: [
        { item: 'Quiet space', icon: 'privacy' },
        { item: 'Comfortable position', icon: 'time' },
      ],
    };
  }

  // === TASK & CHORE SESSIONS ===

  // Cleaning in uniform
  if (title.includes('clean') || title.includes('chore') || title.includes('maid')) {
    return {
      estimatedMinutes: 30,
      steps: [
        { label: 'Put on maid/sissy outfit', durationMinutes: 5 },
        { label: 'Set cleaning playlist', durationMinutes: 1 },
        { label: 'Clean assigned area', durationMinutes: 20 },
        { label: 'Inspect your work', durationMinutes: 2 },
        { label: 'Change and store outfit', durationMinutes: 2 },
      ],
      prerequisites: [
        { item: 'Maid outfit (optional)', icon: 'supplies' },
        { item: 'Cleaning supplies', icon: 'supplies' },
        { item: 'Privacy window', icon: 'privacy' },
      ],
    };
  }

  // Workout/exercise
  if (title.includes('workout') || title.includes('exercise') || title.includes('fitness')) {
    return {
      estimatedMinutes: 30,
      steps: [
        { label: 'Put on workout clothes', durationMinutes: 2 },
        { label: 'Warm up stretches', durationMinutes: 5 },
        { label: 'Main workout routine', durationMinutes: 18 },
        { label: 'Cool down', durationMinutes: 3 },
        { label: 'Shower and refresh', durationMinutes: 2 },
      ],
      prerequisites: [
        { item: 'Workout space', icon: 'privacy' },
        { item: 'Water bottle', icon: 'supplies' },
        { item: 'Comfortable clothes', icon: 'supplies' },
      ],
    };
  }

  // Yoga/stretching
  if (title.includes('yoga') || title.includes('stretch') || title.includes('flex')) {
    return {
      estimatedMinutes: 20,
      steps: [
        { label: 'Set up mat/space', durationMinutes: 2 },
        { label: 'Centering breaths', durationMinutes: 2 },
        { label: 'Flow through poses', durationMinutes: 12 },
        { label: 'Final relaxation', durationMinutes: 3 },
        { label: 'Set intention', durationMinutes: 1 },
      ],
      prerequisites: [
        { item: 'Yoga mat or soft floor', icon: 'supplies' },
        { item: 'Quiet space', icon: 'privacy' },
        { item: 'Comfortable clothes', icon: 'supplies' },
      ],
    };
  }

  // === SOCIAL & EXPOSURE ===

  // Online interaction
  if (title.includes('chat') || title.includes('online') || title.includes('social')) {
    return {
      estimatedMinutes: 15,
      steps: [
        { label: 'Open platform/app', durationMinutes: 1 },
        { label: 'Check messages/replies', durationMinutes: 3 },
        { label: 'Engage authentically', durationMinutes: 8 },
        { label: 'Post if comfortable', durationMinutes: 2 },
        { label: 'Log off mindfully', durationMinutes: 1 },
      ],
      prerequisites: [
        { item: 'Device ready', icon: 'device' },
        { item: 'Private browsing', icon: 'privacy' },
      ],
    };
  }

  // Photo session
  if (title.includes('photo') || title.includes('selfie') || title.includes('picture')) {
    return {
      estimatedMinutes: 15,
      steps: [
        { label: 'Set up lighting', durationMinutes: 2 },
        { label: 'Check outfit/makeup', durationMinutes: 2 },
        { label: 'Take multiple angles', durationMinutes: 7 },
        { label: 'Review and select best', durationMinutes: 3 },
        { label: 'Save securely', durationMinutes: 1 },
      ],
      prerequisites: [
        { item: 'Good lighting', icon: 'mirror' },
        { item: 'Phone/camera', icon: 'device' },
        { item: 'Privacy', icon: 'privacy' },
      ],
    };
  }

  // Default/generic session
  return {
    estimatedMinutes: 15,
    steps: [
      { label: 'Find a comfortable space', durationMinutes: 2 },
      { label: 'Set your intention', durationMinutes: 1 },
      { label: 'Follow session prompts', durationMinutes: 9 },
      { label: 'Reflect on experience', durationMinutes: 3 },
    ],
    prerequisites: [
      { item: 'Private space', icon: 'privacy' },
      { item: '15 minutes available', icon: 'time' },
    ],
  };
}

/**
 * Check if a goal/task title matches any session type
 * Returns session data with vibration if it matches, null otherwise
 */
function getSessionDataIfMatches(title: string): SessionData | null {
  const t = title.toLowerCase();

  // Check if it matches any known session type patterns
  const sessionKeywords = [
    'edge', 'edging', 'denial', 'chastity', 'lockup',
    'goon', 'extended', 'marathon', 'sissygasm', 'hands-free', 'prostate',
    'release', 'reward', 'orgasm', 'hypno', 'trance', 'conditioning',
    'bambi', 'bimbo', 'subliminal', 'ambient', 'joi', 'instruction',
    'meditat', 'mindful', 'breath', 'journal', 'affirm', 'mantra',
    'visual', 'imagine', 'manifest'
  ];

  // Check if any keyword matches
  const hasMatch = sessionKeywords.some(kw => t.includes(kw));

  if (hasMatch) {
    return getSessionData(title);
  }

  return null;
}

/**
 * Priority scoring logic
 * Returns the single most important action
 * Now includes context for preview
 */
export function getPriorityAction(
  goals: TodaysGoal[],
  tasks: DailyTask[],
  streakAtRisk: boolean,
  scheduledSession?: { title: string; time: Date } | null,
  dismissedIds: string[] = []
): PriorityAction | null {
  const currentPeriod = getCurrentPeriod();
  // Filter out dismissed actions
  const pendingGoals = goals.filter(g => !g.completedToday && !dismissedIds.includes(g.goalId));
  const pendingTasks = tasks.filter(t => t.status === 'pending' && !dismissedIds.includes(t.id));

  // Sort by time appropriateness - prefer actions for current time period
  function sortByTimeAppropriate<T extends { bestTime: TimePeriod }>(items: T[]): T[] {
    return [...items].sort((a, b) => {
      const aMatch = a.bestTime === 'anytime' || a.bestTime === currentPeriod ? 0 : 1;
      const bMatch = b.bestTime === 'anytime' || b.bestTime === currentPeriod ? 0 : 1;
      return aMatch - bMatch;
    });
  }

  // Priority 1: Scheduled session happening now (within 30 min)
  if (scheduledSession && !dismissedIds.includes('scheduled-session')) {
    const now = new Date();
    const sessionTime = new Date(scheduledSession.time);
    const minutesUntil = (sessionTime.getTime() - now.getTime()) / (1000 * 60);

    if (minutesUntil <= 30 && minutesUntil >= -15) {
      // Get session-specific steps and prerequisites
      const sessionData = getSessionData(scheduledSession.title);

      return {
        type: 'session',
        id: 'scheduled-session',
        title: scheduledSession.title,
        urgencyReason: minutesUntil <= 0 ? 'Happening now' : `Starts in ${Math.round(minutesUntil)} min`,
        estimatedMinutes: sessionData.estimatedMinutes,
        steps: sessionData.steps,
        prerequisites: sessionData.prerequisites,
        bestTime: 'anytime',
        isComplex: true,
      };
    }
  }

  // Priority 2: Streak-risk goal (if any goal incomplete and streak at risk)
  if (streakAtRisk && pendingGoals.length > 0) {
    const goal = pendingGoals[0];
    const bestTime = getBestTimeForDomain(goal.goalDomain);
    // Get detailed steps - session-specific if it matches, otherwise goal-specific
    const sessionData = getSessionDataIfMatches(goal.goalName);
    const goalData = sessionData || getGoalSteps(goal.goalName, goal.goalDomain);
    return {
      type: 'goal',
      id: goal.goalId,
      title: goal.goalName,
      description: goal.goalDescription || undefined,
      urgencyReason: 'Streak at risk!',
      domain: goal.goalDomain || undefined,
      estimatedMinutes: goalData.estimatedMinutes,
      steps: goalData.steps,
      prerequisites: goalData.prerequisites,
      references: goalData.references,
      bestTime,
      isComplex: true, // Always show preview since we now have detailed steps
    };
  }

  // Priority 3: First pending goal - prefer ones matching current time
  if (pendingGoals.length > 0) {
    // Find the best goal for current time period
    const goalsWithTime = pendingGoals.map(g => ({
      goal: g,
      bestTime: getBestTimeForDomain(g.goalDomain),
    }));

    // Sort to prefer goals appropriate for current time
    const sorted = sortByTimeAppropriate(goalsWithTime);
    const best = sorted[0];
    const goal = best.goal;
    // Get detailed steps - session-specific if it matches, otherwise goal-specific
    const sessionData = getSessionDataIfMatches(goal.goalName);
    const goalData = sessionData || getGoalSteps(goal.goalName, goal.goalDomain);

    return {
      type: 'goal',
      id: goal.goalId,
      title: goal.goalName,
      description: goal.goalDescription || undefined,
      domain: goal.goalDomain || undefined,
      estimatedMinutes: goalData.estimatedMinutes,
      steps: goalData.steps,
      prerequisites: goalData.prerequisites,
      references: goalData.references,
      bestTime: best.bestTime,
      isComplex: true, // Always show preview since we now have detailed steps
    };
  }

  // Priority 4: First pending task - prefer ones matching current time
  if (pendingTasks.length > 0) {
    // Find the best task for current time period
    const tasksWithTime = pendingTasks.map(t => ({
      task: t,
      bestTime: getBestTimeForDomain(t.task.domain),
    }));

    // Sort to prefer tasks appropriate for current time
    const sorted = sortByTimeAppropriate(tasksWithTime);
    const best = sorted[0];
    const task = best.task;
    // Get detailed steps - always use task-specific breakdown
    const taskData = getTaskSteps(task.task.instruction, task.task.domain);

    return {
      type: 'task',
      id: task.id,
      title: task.enhancedInstruction || task.task.instruction,
      description: task.enhancedSubtext || task.task.subtext,
      domain: task.task.domain,
      estimatedMinutes: taskData.estimatedMinutes,
      steps: taskData.steps,
      prerequisites: taskData.prerequisites,
      references: taskData.references,
      bestTime: best.bestTime,
      difficulty: task.task.intensity,
      isComplex: true, // Always show preview since we now have detailed steps
    };
  }

  return null;
}
