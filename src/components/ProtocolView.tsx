import { useState, useCallback } from 'react';
import { useProtocol } from '../context/ProtocolContext';
import { useBambiMode } from '../context/BambiModeContext';
import { useRewardOptional } from '../context/RewardContext';
import { POINT_VALUES } from '../types/rewards';
import { ProtocolTask, TimeBlock } from '../types';
import { getDomainInfo, TIME_BLOCK_CONFIG, INTENSITY_CONFIG } from '../data/constants';
import {
  groupTasksByTimeBlock,
  formatDate,
  getCurrentTimeBlock
} from '../lib/protocol';
import {
  Clock,
  Sunrise,
  Sun,
  Moon,
  ChevronDown,
  ChevronRight,
  Mic,
  Activity,
  Sparkles,
  Shirt,
  Users,
  Brain,
  Heart,
  X,
  Eye,
  Hand,
  Wind,
  Headphones,
  Lightbulb,
  Music,
  MapPin,
  ListChecks,
  Target
} from 'lucide-react';
import { AddEvidenceButton } from './EvidenceCapture';
import { ModeIndicator, ModeBadge } from './ModeIndicator';
import { StreakWarning, StreakMilestone } from './StreakWarning';
import { LevelUpModal, PhaseUpModal } from './LevelUpModal';
import { PrescriptionNote } from './PrescriptionNote';
import { BlackBoxReveal, UnaskedQuestion, NameQuestionModal } from './BlackBoxReveal';
import { SkipConfirmModal } from './SkipConfirmModal';
import { StatsBar } from './StatsBar';
import { ProgressRing } from './ProgressRing';
import { JournalGate } from './JournalGate';
import { UnusedInvestmentsPreview } from './UnusedInvestmentsPreview';
import { EveningJournal } from './EveningJournal';
import { ImmersiveTaskModal } from './ImmersiveTaskModal';

const timeBlockIcons = {
  morning: Sunrise,
  day: Sun,
  evening: Moon
};

const domainIcons: Record<string, React.ElementType> = {
  voice: Mic,
  movement: Activity,
  skincare: Sparkles,
  style: Shirt,
  social: Users,
  mindset: Brain,
  body: Heart
};

interface TaskItemProps {
  task: ProtocolTask;
  onToggle: () => void;
  onSkip: () => void;
  onViewDetails: () => void;
  isSkipped?: boolean;
  isBambi?: boolean;
}

function TaskItem({ task, onToggle, onSkip, onViewDetails, isSkipped, isBambi = false }: TaskItemProps) {
  const hasRichContent = task.sensory || task.ambiance || task.instructions || task.imageUrl;
  const domainInfo = getDomainInfo(task.domain);
  const DomainIcon = domainIcons[task.domain] || Sparkles;

  // Collect sensory indicators
  const sensoryIndicators = [
    { key: 'think', icon: Brain, has: !!task.sensory?.think },
    { key: 'feel', icon: Hand, has: !!task.sensory?.feel },
    { key: 'see', icon: Eye, has: !!task.sensory?.see },
    { key: 'smell', icon: Wind, has: !!task.sensory?.smell },
    { key: 'listen', icon: Headphones, has: !!task.sensory?.listen },
  ].filter(s => s.has);

  // Collect ambiance indicators
  const ambianceIndicators = [
    { key: 'lighting', icon: Lightbulb, value: task.ambiance?.lighting },
    { key: 'music', icon: Music, value: task.ambiance?.music },
    { key: 'environment', icon: MapPin, value: task.ambiance?.environment },
  ].filter(a => a.value);

  const stepCount = task.instructions?.steps?.length || 0;
  const hasGoal = !!task.instructions?.goal;

  // Bambi mode styling
  const cardClass = isBambi
    ? task.completed
      ? 'bg-pink-100 border-2 border-pink-300 rounded-2xl'
      : isSkipped
        ? 'bg-amber-50 border-2 border-amber-200 rounded-2xl'
        : 'bg-white border-2 border-pink-200 rounded-2xl hover:border-pink-300 hover:shadow-[0_4px_20px_rgba(255,105,180,0.3)]'
    : task.completed
      ? 'bg-protocol-success/10 border-protocol-success/30'
      : isSkipped
        ? 'bg-amber-500/5 border-amber-500/30'
        : 'bg-protocol-surface border-protocol-border';

  return (
    <div
      className={`w-full p-4 border text-left transition-all duration-200 ${
        isBambi ? 'rounded-2xl' : 'rounded-lg'
      } ${cardClass}`}
    >
      <div className="flex items-start gap-3">
        {/* Radio button style toggle - hearts in Bambi mode */}
        <button
          onClick={onToggle}
          disabled={isSkipped}
          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all mt-0.5 ${
            isBambi
              ? task.completed
                ? 'bg-gradient-to-r from-pink-400 to-pink-600 border-pink-400 shadow-bambi'
                : isSkipped
                  ? 'bg-amber-100 border-amber-300 cursor-not-allowed'
                  : 'border-pink-300 hover:border-pink-500 hover:bg-pink-50'
              : task.completed
                ? 'bg-protocol-success border-protocol-success'
                : isSkipped
                  ? 'bg-amber-500/20 border-amber-500/50 cursor-not-allowed'
                  : 'border-protocol-border hover:border-protocol-text-muted'
          }`}
        >
          {/* Heart in Bambi mode, dot in normal mode */}
          {task.completed && (
            isBambi
              ? <Heart className="w-3 h-3 text-white fill-white" />
              : <div className="w-2.5 h-2.5 rounded-full bg-white" />
          )}
          {isSkipped && <X className={`w-3 h-3 ${isBambi ? 'text-amber-500' : 'text-amber-400'}`} />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <button
            onClick={!isSkipped ? onToggle : undefined}
            className={`w-full text-left ${isSkipped ? 'cursor-default' : ''}`}
          >
            {/* Top row: domain badge, duration, skipped status */}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
                  isBambi ? 'font-medium' : ''
                }`}
                style={{
                  backgroundColor: isSkipped
                    ? 'rgba(245, 158, 11, 0.2)'
                    : isBambi
                      ? '#FFBCD9'
                      : `${domainInfo.color}20`,
                  color: isSkipped
                    ? '#f59e0b'
                    : isBambi
                      ? '#DB0A7B'
                      : domainInfo.color
                }}
              >
                <DomainIcon className="w-3 h-3" />
                {domainInfo.label}
              </span>
              {task.duration && (
                <span className={`inline-flex items-center gap-1 text-xs ${
                  isBambi ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}>
                  <Clock className="w-3 h-3" />
                  {task.duration}m
                </span>
              )}
              {stepCount > 0 && (
                <span className={`inline-flex items-center gap-1 text-xs ${
                  isBambi ? 'text-pink-400' : 'text-protocol-text-muted'
                }`}>
                  <ListChecks className="w-3 h-3" />
                  {stepCount} steps
                </span>
              )}
              {isSkipped && (
                <span className={`text-xs ${isBambi ? 'text-amber-500' : 'text-amber-400'}`}>
                  {isBambi ? 'Disobeyed' : 'Skipped'}
                </span>
              )}
            </div>

            {/* Task title */}
            <p
              className={`font-medium ${
                task.completed
                  ? isBambi ? 'text-pink-400 line-through' : 'text-protocol-text-muted line-through'
                  : isSkipped
                    ? isBambi ? 'text-pink-300 line-through' : 'text-protocol-text-muted line-through'
                    : isBambi ? 'text-pink-800' : 'text-protocol-text'
              }`}
            >
              {task.title}
            </p>

            {/* Task description */}
            {task.description && (
              <p className={`text-xs mt-1 ${
                isBambi ? 'text-pink-500' : 'text-protocol-text-muted'
              }`}>
                {task.description}
              </p>
            )}
          </button>

          {/* Enhanced content preview - only show if not skipped and has rich content */}
          {hasRichContent && !isSkipped && !task.completed && (
            <div className="mt-3 space-y-2">
              {/* Quick steps preview - show first 2-3 steps */}
              {task.instructions?.steps && task.instructions.steps.length > 0 && (
                <div className={`p-2.5 rounded-lg ${
                  isBambi
                    ? 'bg-pink-50 border border-pink-200'
                    : 'bg-protocol-surface-light border border-protocol-border'
                }`}>
                  <p className={`text-[10px] uppercase tracking-wide font-semibold mb-1.5 ${
                    isBambi ? 'text-pink-500' : 'text-protocol-accent'
                  }`}>
                    How to do it:
                  </p>
                  <ol className="space-y-1">
                    {task.instructions.steps.slice(0, 3).map((step, idx) => (
                      <li key={idx} className={`text-xs flex gap-2 ${
                        isBambi ? 'text-pink-700' : 'text-protocol-text'
                      }`}>
                        <span className={`font-semibold flex-shrink-0 ${
                          isBambi ? 'text-pink-500' : 'text-protocol-accent'
                        }`}>{idx + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                    {task.instructions.steps.length > 3 && (
                      <li className={`text-xs italic ${
                        isBambi ? 'text-pink-400' : 'text-protocol-text-muted'
                      }`}>
                        +{task.instructions.steps.length - 3} more steps...
                      </li>
                    )}
                  </ol>
                </div>
              )}

              {/* Goal - shown smaller now */}
              {hasGoal && (
                <div className={`flex items-start gap-2 ${
                  isBambi ? 'text-pink-600' : 'text-emerald-500'
                }`}>
                  <Target className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <p className={`text-xs italic ${
                    isBambi ? 'text-pink-600' : 'text-emerald-500'
                  }`}>
                    {task.instructions?.goal}
                  </p>
                </div>
              )}

              {/* Sensory & Ambiance indicators row */}
              {(sensoryIndicators.length > 0 || ambianceIndicators.length > 0) && (
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Sensory indicators */}
                  {sensoryIndicators.length > 0 && (
                    <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${
                      isBambi
                        ? 'bg-fuchsia-100 border border-fuchsia-200'
                        : 'bg-violet-500/10 border border-violet-500/20'
                    }`}>
                      <span className={`text-[10px] uppercase tracking-wide font-medium mr-1 ${
                        isBambi ? 'text-fuchsia-600' : 'text-violet-400'
                      }`}>
                        Sensory
                      </span>
                      {sensoryIndicators.map(({ key, icon: Icon }) => (
                        <Icon
                          key={key}
                          className={`w-3 h-3 ${
                            isBambi ? 'text-fuchsia-500' : 'text-violet-400'
                          }`}
                        />
                      ))}
                    </div>
                  )}

                  {/* Ambiance indicators */}
                  {ambianceIndicators.length > 0 && (
                    <div className={`flex items-center gap-1 px-2 py-1 rounded-full ${
                      isBambi
                        ? 'bg-rose-100 border border-rose-200'
                        : 'bg-orange-500/10 border border-orange-500/20'
                    }`}>
                      <span className={`text-[10px] uppercase tracking-wide font-medium mr-1 ${
                        isBambi ? 'text-rose-600' : 'text-orange-400'
                      }`}>
                        Setup
                      </span>
                      {ambianceIndicators.map(({ key, icon: Icon }) => (
                        <Icon
                          key={key}
                          className={`w-3 h-3 ${
                            isBambi ? 'text-rose-500' : 'text-orange-400'
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Affirmation preview */}
              {task.affirmation && (
                <p className={`text-xs italic pl-2 border-l-2 ${
                  isBambi
                    ? 'text-pink-500 border-pink-300'
                    : 'text-protocol-text-muted border-protocol-accent/50'
                }`}>
                  "{task.affirmation}"
                </p>
              )}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-start gap-1 flex-shrink-0">
          {/* Skip button (only show if not completed and not skipped) */}
          {!task.completed && !isSkipped && (
            <button
              onClick={e => {
                e.stopPropagation();
                onSkip();
              }}
              className={`p-2 rounded-lg transition-colors ${
                isBambi
                  ? 'text-pink-300 hover:text-pink-500 hover:bg-pink-100'
                  : 'text-protocol-text-muted hover:text-amber-400 hover:bg-amber-500/10'
              }`}
              title={isBambi ? 'Disobey' : 'Skip this task'}
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* View details button (show if has rich content) */}
          {hasRichContent && !isSkipped && (
            <button
              onClick={e => {
                e.stopPropagation();
                onViewDetails();
              }}
              className={`p-2 rounded-lg transition-colors ${
                isBambi
                  ? 'text-pink-400 hover:text-pink-600 hover:bg-pink-100'
                  : 'text-protocol-accent hover:text-protocol-accent-soft hover:bg-protocol-accent/10'
              }`}
              title="View task details"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}

          {/* Evidence button (only show if not skipped) */}
          {!isSkipped && (
            <div onClick={e => e.stopPropagation()}>
              <AddEvidenceButton domain={task.domain} taskId={task.id} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface TimeBlockSectionProps {
  timeBlock: TimeBlock;
  tasks: ProtocolTask[];
  onToggleTask: (taskId: string) => void;
  onSkipTask: (task: ProtocolTask) => void;
  onViewTaskDetails: (task: ProtocolTask) => void;
  skippedTaskIds: Set<string>;
  isCurrentBlock: boolean;
  defaultExpanded?: boolean;
  isBambi?: boolean;
}

function TimeBlockSection({
  timeBlock,
  tasks,
  onToggleTask,
  onSkipTask,
  onViewTaskDetails,
  skippedTaskIds,
  isCurrentBlock,
  defaultExpanded = true,
  isBambi = false
}: TimeBlockSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const config = TIME_BLOCK_CONFIG[timeBlock];
  const Icon = timeBlockIcons[timeBlock];

  const completedCount = tasks.filter(t => t.completed).length;
  const skippedCount = tasks.filter(t => skippedTaskIds.has(t.id)).length;
  const isAllComplete = completedCount + skippedCount === tasks.length && tasks.length > 0;

  return (
    <div className="space-y-3">
      {/* Section header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full flex items-center justify-between p-3 transition-colors ${
          isBambi
            ? 'rounded-2xl bg-white/80 hover:bg-white border-2 border-pink-200'
            : 'rounded-lg bg-protocol-surface-light hover:bg-protocol-border/30'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-lg ${
              isBambi
                ? isCurrentBlock
                  ? 'bg-pink-200 text-pink-600'
                  : 'bg-pink-100 text-pink-400'
                : isCurrentBlock
                  ? 'bg-protocol-accent/20 text-protocol-accent'
                  : 'bg-protocol-surface text-protocol-text-muted'
            }`}
          >
            <Icon className="w-5 h-5" />
          </div>
          <div className="text-left">
            <p className={`font-medium flex items-center gap-2 ${
              isBambi ? 'text-pink-800' : 'text-protocol-text'
            }`}>
              {config.label}
              {isCurrentBlock && (
                <span className={`px-2 py-0.5 text-xs rounded-full ${
                  isBambi
                    ? 'bg-pink-200 text-pink-600'
                    : 'bg-protocol-accent/20 text-protocol-accent'
                }`}>
                  Now
                </span>
              )}
            </p>
            <p className={`text-xs ${isBambi ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
              {config.timeRange}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`text-sm font-medium ${
              isAllComplete
                ? isBambi ? 'text-pink-500' : 'text-protocol-success'
                : isBambi ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}
          >
            {completedCount}/{tasks.length}
            {skippedCount > 0 && (
              <span className={`ml-1 ${isBambi ? 'text-amber-500' : 'text-amber-400'}`}>
                ({skippedCount} {isBambi ? 'disobeyed' : 'skipped'})
              </span>
            )}
          </span>
          {isExpanded ? (
            <ChevronDown className={`w-5 h-5 ${isBambi ? 'text-pink-400' : 'text-protocol-text-muted'}`} />
          ) : (
            <ChevronRight className={`w-5 h-5 ${isBambi ? 'text-pink-400' : 'text-protocol-text-muted'}`} />
          )}
        </div>
      </button>

      {/* Tasks */}
      {isExpanded && (
        <div className="space-y-2 pl-2">
          {tasks.map(task => (
            <TaskItem
              key={task.id}
              task={task}
              onToggle={() => onToggleTask(task.id)}
              onSkip={() => onSkipTask(task)}
              onViewDetails={() => onViewTaskDetails(task)}
              isSkipped={skippedTaskIds.has(task.id)}
              isBambi={isBambi}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ProtocolView() {
  const {
    currentEntry,
    toggleTask,
    progress,
    prescription,
    analytics,
    aiMode,
    levelUpEvent,
    phaseUpEvent,
    streakMilestone,
    reinforcementEvent,
    unaskedQuestion,
    nameQuestion,
    investmentSummary,
    investments,
    userName,
    dismissLevelUp,
    dismissPhaseUp,
    dismissStreakMilestone,
    dismissReinforcement,
    dismissUnaskedQuestion,
    answerUnaskedQuestion,
    dismissNameQuestion,
    updateUserName
  } = useProtocol();

  const { isBambiMode, getGreeting, language, triggerHearts } = useBambiMode();
  const rewardContext = useRewardOptional();

  // Skip task state
  const [skippedTaskIds, setSkippedTaskIds] = useState<Set<string>>(new Set());
  const [taskToSkip, setTaskToSkip] = useState<ProtocolTask | null>(null);

  // Journal modal state
  const [showJournal, setShowJournal] = useState(false);

  // Immersive task modal state
  const [selectedTask, setSelectedTask] = useState<ProtocolTask | null>(null);

  // Handle skip task
  const handleSkipTask = (task: ProtocolTask) => {
    setTaskToSkip(task);
  };

  const handleSkipCancel = async () => {
    // Award skip resistance points when user decides NOT to skip
    if (rewardContext) {
      try {
        await rewardContext.addPoints(
          POINT_VALUES.skip_resistance_base,
          'skip_resistance',
          taskToSkip?.id,
          { taskId: taskToSkip?.id, taskTitle: taskToSkip?.title }
        );
      } catch (error) {
        console.error('Failed to award skip resistance points:', error);
      }
    }
    setTaskToSkip(null);
  };

  const handleSkipConfirm = () => {
    if (taskToSkip) {
      setSkippedTaskIds(prev => new Set([...prev, taskToSkip.id]));
    }
    setTaskToSkip(null);
  };

  // Handle task toggle with reward points
  const handleToggleWithReward = useCallback(async (taskId: string, wasCompleted: boolean) => {
    // Toggle the task first
    await toggleTask(taskId);

    // Award points only when completing (not uncompleting)
    if (!wasCompleted && rewardContext) {
      try {
        await rewardContext.addPoints(
          POINT_VALUES.task_complete,
          'task_complete',
          taskId,
          { taskId }
        );
      } catch (error) {
        console.error('Failed to award task points:', error);
      }
    }
  }, [toggleTask, rewardContext]);

  // Handle completing a task from the journal gate
  const handleCompleteTaskFromGate = (taskId: string) => {
    const task = currentEntry?.tasks.find(t => t.id === taskId);
    handleToggleWithReward(taskId, task?.completed ?? false);
  };

  // Handle skipping a task from the journal gate
  const handleSkipTaskFromGate = (task: ProtocolTask) => {
    setTaskToSkip(task);
  };

  // Handle viewing task details
  const handleViewTaskDetails = (task: ProtocolTask) => {
    setSelectedTask(task);
  };

  // Handle completing task from immersive modal
  const handleCompleteFromModal = () => {
    if (selectedTask) {
      handleToggleWithReward(selectedTask.id, selectedTask.completed);
    }
  };

  // Navigate to investments (handled by parent via tab change)
  const handleViewInvestments = () => {
    // This would ideally trigger a tab change to Progress > Investments
    // For now, we could emit a custom event or use a callback
    window.dispatchEvent(new CustomEvent('navigate-to-investments'));
  };

  if (!currentEntry) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-protocol-text-muted">No protocol for today</p>
      </div>
    );
  }

  const tasksByBlock = groupTasksByTimeBlock(currentEntry.tasks);
  const currentBlock = getCurrentTimeBlock();
  const intensityConfig = INTENSITY_CONFIG[currentEntry.intensity];

  // Calculate completion stats
  const completedTasks = currentEntry.tasks.filter(t => t.completed);
  const completedCount = completedTasks.length;
  const skippedCount = skippedTaskIds.size;
  const totalTasks = currentEntry.tasks.length;

  // Get streak status from analytics
  const streakStatus = analytics?.streakStatus || 'stable';
  const yesterdayCompletion = analytics?.yesterdayCompletion || 100;

  // Check if all tasks are addressed (completed or skipped) - used for future journal gate logic
  const _allTasksAddressed = currentEntry.tasks.every(
    t => t.completed || skippedTaskIds.has(t.id)
  );
  void _allTasksAddressed; // Suppress unused variable warning

  // Check if journal is done (would need to check entry.journal)
  const hasJournaled = currentEntry.journal !== undefined;

  return (
    <div className="space-y-6 pb-24">
      {/* Event Modals */}
      {levelUpEvent && (
        <LevelUpModal
          domain={levelUpEvent.domain}
          fromLevel={levelUpEvent.fromLevel}
          toLevel={levelUpEvent.toLevel}
          onDismiss={dismissLevelUp}
        />
      )}

      {phaseUpEvent && (
        <PhaseUpModal
          fromPhase={phaseUpEvent.fromPhase}
          toPhase={phaseUpEvent.toPhase}
          phaseName={phaseUpEvent.phaseName}
          onDismiss={dismissPhaseUp}
        />
      )}

      {streakMilestone && (
        <StreakMilestone
          streak={streakMilestone}
          onDismiss={dismissStreakMilestone}
        />
      )}

      {/* Black Box Reinforcement */}
      {reinforcementEvent && (
        <BlackBoxReveal
          type={reinforcementEvent.type}
          content={reinforcementEvent.content}
          onDismiss={dismissReinforcement}
        />
      )}

      {/* Unasked Question */}
      {unaskedQuestion?.shouldShow && (
        <UnaskedQuestion
          onAnswer={answerUnaskedQuestion}
          onSkip={dismissUnaskedQuestion}
        />
      )}

      {/* Name Question (day 3-5 for nameless users) */}
      {nameQuestion?.shouldShow && (
        <NameQuestionModal
          onSubmitName={updateUserName}
          onSkip={dismissNameQuestion}
        />
      )}

      {/* Journal Modal */}
      {showJournal && (
        <div className="fixed inset-0 z-50 bg-protocol-bg overflow-y-auto">
          <div className="min-h-screen">
            <div className="sticky top-0 bg-protocol-bg/95 backdrop-blur-lg border-b border-protocol-border z-10">
              <div className="max-w-lg mx-auto px-4 py-4">
                <button
                  onClick={() => setShowJournal(false)}
                  className="text-protocol-text-muted hover:text-protocol-text transition-colors"
                >
                  &larr; Back to Today
                </button>
              </div>
            </div>
            <div className="max-w-lg mx-auto px-4 py-6">
              <EveningJournal />
            </div>
          </div>
        </div>
      )}

      {/* Greeting */}
      <div className="text-center pt-2">
        <h1 className={`text-2xl font-bold ${isBambiMode ? 'text-pink-700' : 'text-protocol-text'}`}>
          {getGreeting()}{userName ? `, ${userName}` : ''}
        </h1>
        <p className={`text-sm mt-1 ${isBambiMode ? 'text-pink-500' : 'text-protocol-text-muted'}`}>
          {formatDate(currentEntry.date)}
        </p>
        {/* Bambi mode mantra */}
        {isBambiMode && (
          <p className="text-xs text-pink-400 mt-2 italic animate-pulse-soft">
            {language.ai.encouragement[Math.floor(Math.random() * language.ai.encouragement.length)]}
          </p>
        )}
      </div>

      {/* Stats Bar */}
      <StatsBar
        streak={progress.overallStreak}
        totalInvested={investmentSummary?.totalInvested || 0}
        phase={progress.phase.currentPhase}
        daysInPhase={progress.phase.daysInPhase}
        phaseName={progress.phase.phaseName}
        onStreakTap={() => {/* Could show streak details modal */}}
        onInvestedTap={handleViewInvestments}
        onPhaseTap={() => {/* Could show phase details */}}
      />

      {/* Progress Ring */}
      <div className="flex flex-col items-center py-4">
        <ProgressRing
          completed={completedCount}
          total={totalTasks}
          size={140}
          strokeWidth={10}
        />
        <div className="flex items-center gap-2 mt-3">
          <ModeBadge mode={aiMode} />
          <span
            className="px-3 py-1 rounded-full text-sm font-medium"
            style={{
              backgroundColor: `${intensityConfig.color}20`,
              color: intensityConfig.color
            }}
          >
            {intensityConfig.label}
          </span>
        </div>
      </div>

      {/* Streak Warning */}
      {streakStatus !== 'stable' && (
        <StreakWarning
          streak={progress.overallStreak}
          status={streakStatus}
          yesterdayCompletion={yesterdayCompletion}
        />
      )}

      {/* AI Prescription Note */}
      {prescription && (
        <PrescriptionNote
          note={prescription.note}
          warnings={prescription.warnings}
          celebrations={prescription.celebrations}
        />
      )}

      {/* AI Mode Indicator (expandable) */}
      {prescription && (
        <ModeIndicator
          mode={aiMode}
          reasoning={prescription.reasoning}
        />
      )}

      {/* Time blocks - Morning and Day only */}
      <div className="space-y-6">
        {(['morning', 'day'] as TimeBlock[]).map(block => (
          <TimeBlockSection
            key={block}
            timeBlock={block}
            tasks={tasksByBlock[block]}
            onToggleTask={(taskId) => {
              const task = tasksByBlock[block].find(t => t.id === taskId);
              handleToggleWithReward(taskId, task?.completed ?? false);
              // Trigger hearts when completing a task in Bambi mode
              if (isBambiMode && task && !task.completed) {
                triggerHearts();
              }
            }}
            onSkipTask={handleSkipTask}
            onViewTaskDetails={handleViewTaskDetails}
            skippedTaskIds={skippedTaskIds}
            isCurrentBlock={block === currentBlock}
            defaultExpanded={block === currentBlock || block === 'morning'}
            isBambi={isBambiMode}
          />
        ))}

        {/* Evening Section with integrated Journal Gate */}
        <div className="space-y-3">
          {/* Evening tasks */}
          <TimeBlockSection
            timeBlock="evening"
            tasks={tasksByBlock.evening}
            onToggleTask={(taskId) => {
              const task = tasksByBlock.evening.find(t => t.id === taskId);
              handleToggleWithReward(taskId, task?.completed ?? false);
              if (isBambiMode && task && !task.completed) {
                triggerHearts();
              }
            }}
            onSkipTask={handleSkipTask}
            onViewTaskDetails={handleViewTaskDetails}
            skippedTaskIds={skippedTaskIds}
            isCurrentBlock={currentBlock === 'evening'}
            defaultExpanded={currentBlock === 'evening'}
            isBambi={isBambiMode}
          />

          {/* Journal Gate - Final evening item */}
          <div className="pl-2">
            <JournalGate
              tasks={currentEntry.tasks}
              completedCount={completedCount}
              skippedCount={skippedCount}
              hasJournaled={hasJournaled}
              onCompleteTask={handleCompleteTaskFromGate}
              onSkipTask={handleSkipTaskFromGate}
              onOpenJournal={() => setShowJournal(true)}
            />
          </div>
        </div>
      </div>

      {/* Unused Investments Preview */}
      {investments && investments.length > 0 && (
        <UnusedInvestmentsPreview
          investments={investments}
          onViewAll={handleViewInvestments}
        />
      )}

      {/* Skip Confirmation Modal */}
      {taskToSkip && (
        <SkipConfirmModal
          taskTitle={taskToSkip.title}
          taskDomain={taskToSkip.domain}
          taskId={taskToSkip.id}
          streak={progress.overallStreak}
          partnerName="Gina"
          totalInvested={investmentSummary?.totalInvested}
          userName={userName}
          onCancel={handleSkipCancel}
          onConfirm={handleSkipConfirm}
        />
      )}

      {/* Immersive Task Detail Modal */}
      {selectedTask && (
        <ImmersiveTaskModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onComplete={handleCompleteFromModal}
          isCompleted={selectedTask.completed}
        />
      )}
    </div>
  );
}
