/**
 * Handler Directive Component
 *
 * Displays Handler decisions and blocks UI for required actions.
 * At higher authority levels, this becomes more prominent.
 */

import { useState, useEffect } from 'react';
import { Crown, Clock, CheckCircle, AlertTriangle, Lock, Zap } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import { useHandlerAuthority } from '../../hooks/useHandlerAuthority';

interface HandlerDirectiveProps {
  onSessionStart?: (sessionId: string, type: string) => void;
}

export function HandlerDirective({ onSessionStart }: HandlerDirectiveProps) {
  const { isBambiMode } = useBambiMode();
  const {
    level,
    levelName,
    pendingTasks,
    requiredInterventions,
    imminentSession,
    todaysDecisions,
    applyTodaysDecisions,
    completeTask,
    completeIntervention,
    startSession,
    isHandlerControlled,
    hasBlockingInterventions,
  } = useHandlerAuthority();

  const [isApplyingDecisions, setIsApplyingDecisions] = useState(false);
  const [showDecisions, setShowDecisions] = useState(false);

  // Apply today's decisions on mount if Handler is in control
  useEffect(() => {
    if (isHandlerControlled && !todaysDecisions && !isApplyingDecisions) {
      setIsApplyingDecisions(true);
      applyTodaysDecisions().then((decisions) => {
        setIsApplyingDecisions(false);
        if (decisions) {
          setShowDecisions(true);
        }
      });
    }
  }, [isHandlerControlled, todaysDecisions, isApplyingDecisions, applyTodaysDecisions]);

  // Required intervention blocker (full screen)
  if (hasBlockingInterventions) {
    const intervention = requiredInterventions[0];
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
        <div
          className={`w-full max-w-md rounded-2xl p-6 ${
            isBambiMode ? 'bg-pink-900' : 'bg-protocol-surface'
          }`}
        >
          <div className="flex items-center gap-3 mb-4">
            <div
              className={`p-3 rounded-full ${
                isBambiMode ? 'bg-pink-500/20' : 'bg-purple-500/20'
              }`}
            >
              <Lock className={isBambiMode ? 'text-pink-400' : 'text-purple-400'} />
            </div>
            <div>
              <h2
                className={`text-xl font-bold ${
                  isBambiMode ? 'text-pink-100' : 'text-protocol-text'
                }`}
              >
                Handler Requires Your Attention
              </h2>
              <p
                className={`text-sm ${
                  isBambiMode ? 'text-pink-300' : 'text-protocol-text-muted'
                }`}
              >
                You cannot proceed until this is complete
              </p>
            </div>
          </div>

          <div
            className={`p-4 rounded-xl mb-6 ${
              isBambiMode ? 'bg-pink-800' : 'bg-protocol-bg'
            }`}
          >
            <p
              className={`text-lg ${
                isBambiMode ? 'text-pink-100' : 'text-protocol-text'
              }`}
            >
              {intervention.content}
            </p>
          </div>

          <button
            onClick={() => completeIntervention(intervention.id)}
            className={`w-full py-4 rounded-xl font-semibold text-lg transition-all ${
              isBambiMode
                ? 'bg-pink-500 text-white hover:bg-pink-400'
                : 'bg-purple-500 text-white hover:bg-purple-400'
            }`}
          >
            {intervention.requiredAction === 'acknowledge'
              ? 'I Understand'
              : intervention.requiredAction === 'complete'
              ? 'I Have Done This'
              : 'Submit'}
          </button>
        </div>
      </div>
    );
  }

  // Imminent session prompt
  if (imminentSession) {
    const sessionTime = new Date(imminentSession.scheduledFor);
    const now = new Date();
    const diffMinutes = Math.round((sessionTime.getTime() - now.getTime()) / 60000);
    const isPast = diffMinutes < 0;

    return (
      <div
        className={`p-4 rounded-xl border-2 ${
          isPast
            ? 'border-red-500 bg-red-500/10'
            : isBambiMode
            ? 'border-pink-500 bg-pink-500/10'
            : 'border-purple-500 bg-purple-500/10'
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className={isPast ? 'text-red-400' : 'text-purple-400'} />
            <span
              className={`font-semibold ${
                isPast
                  ? 'text-red-300'
                  : isBambiMode
                  ? 'text-pink-300'
                  : 'text-protocol-text'
              }`}
            >
              {isPast ? 'Session Overdue' : 'Session Scheduled'}
            </span>
          </div>
          <span
            className={`text-sm ${
              isPast ? 'text-red-400' : 'text-protocol-text-muted'
            }`}
          >
            {isPast
              ? `${Math.abs(diffMinutes)} min overdue`
              : diffMinutes === 0
              ? 'Now'
              : `in ${diffMinutes} min`}
          </span>
        </div>

        <p
          className={`mb-4 ${
            isBambiMode ? 'text-pink-200' : 'text-protocol-text'
          }`}
        >
          Handler has scheduled a{' '}
          <span className="font-semibold">{imminentSession.duration}-minute</span>{' '}
          <span className="font-semibold">{imminentSession.type}</span> session.
          {imminentSession.isRequired && ' This is not optional.'}
        </p>

        <button
          onClick={() => {
            startSession(imminentSession.id);
            onSessionStart?.(imminentSession.id, imminentSession.type);
          }}
          className={`w-full py-3 rounded-xl font-semibold transition-all ${
            isPast
              ? 'bg-red-500 text-white hover:bg-red-400'
              : isBambiMode
              ? 'bg-pink-500 text-white hover:bg-pink-400'
              : 'bg-purple-500 text-white hover:bg-purple-400'
          }`}
        >
          Begin Session
        </button>
      </div>
    );
  }

  // Handler decisions announcement
  if (showDecisions && todaysDecisions) {
    return (
      <div
        className={`p-4 rounded-xl mb-4 ${
          isBambiMode ? 'bg-pink-900/50 border border-pink-500/30' : 'bg-protocol-surface border border-protocol-border'
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Crown className={isBambiMode ? 'text-pink-400' : 'text-amber-400'} />
            <span
              className={`font-semibold ${
                isBambiMode ? 'text-pink-300' : 'text-protocol-text'
              }`}
            >
              Handler Decisions
            </span>
          </div>
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              isBambiMode ? 'bg-pink-500/20 text-pink-300' : 'bg-amber-500/20 text-amber-400'
            }`}
          >
            Level {level}: {levelName}
          </span>
        </div>

        <p
          className={`mb-3 ${
            isBambiMode ? 'text-pink-200' : 'text-protocol-text'
          }`}
        >
          {todaysDecisions.message}
        </p>

        <button
          onClick={() => setShowDecisions(false)}
          className={`text-sm ${
            isBambiMode ? 'text-pink-400 hover:text-pink-300' : 'text-protocol-text-muted hover:text-protocol-text'
          }`}
        >
          Understood
        </button>
      </div>
    );
  }

  // Pending tasks display
  if (pendingTasks.length > 0 && isHandlerControlled) {
    const requiredTasks = pendingTasks.filter(t => t.isRequired);
    const overdueTasks = pendingTasks.filter(
      t => t.deadline && new Date(t.deadline) < new Date()
    );

    return (
      <div
        className={`p-4 rounded-xl ${
          overdueTasks.length > 0
            ? 'bg-red-500/10 border border-red-500/30'
            : isBambiMode
            ? 'bg-pink-900/30 border border-pink-500/20'
            : 'bg-protocol-surface border border-protocol-border'
        }`}
      >
        <div className="flex items-center gap-2 mb-3">
          {overdueTasks.length > 0 ? (
            <AlertTriangle className="text-red-400" />
          ) : (
            <Clock className={isBambiMode ? 'text-pink-400' : 'text-purple-400'} />
          )}
          <span
            className={`font-semibold ${
              overdueTasks.length > 0
                ? 'text-red-300'
                : isBambiMode
                ? 'text-pink-300'
                : 'text-protocol-text'
            }`}
          >
            {overdueTasks.length > 0
              ? `${overdueTasks.length} Overdue Task${overdueTasks.length > 1 ? 's' : ''}`
              : `${requiredTasks.length} Assigned Task${requiredTasks.length > 1 ? 's' : ''}`}
          </span>
        </div>

        <div className="space-y-2">
          {pendingTasks.slice(0, 3).map(task => (
            <div
              key={task.id}
              className={`flex items-center justify-between p-2 rounded-lg ${
                task.deadline && new Date(task.deadline) < new Date()
                  ? 'bg-red-500/20'
                  : isBambiMode
                  ? 'bg-pink-800/30'
                  : 'bg-protocol-bg'
              }`}
            >
              <span
                className={`text-sm ${
                  isBambiMode ? 'text-pink-200' : 'text-protocol-text'
                }`}
              >
                {task.task}
              </span>
              <button
                onClick={() => completeTask(task.id)}
                className={`p-1 rounded-full transition-colors ${
                  isBambiMode
                    ? 'hover:bg-pink-500/30 text-pink-400'
                    : 'hover:bg-purple-500/30 text-purple-400'
                }`}
              >
                <CheckCircle className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>

        {pendingTasks.length > 3 && (
          <p
            className={`text-sm mt-2 ${
              isBambiMode ? 'text-pink-400' : 'text-protocol-text-muted'
            }`}
          >
            +{pendingTasks.length - 3} more
          </p>
        )}
      </div>
    );
  }

  // Minimal display for lower authority levels
  if (level >= 3) {
    return (
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-full text-sm ${
          isBambiMode ? 'bg-pink-900/30 text-pink-300' : 'bg-protocol-surface text-protocol-text-muted'
        }`}
      >
        <Crown className="w-4 h-4" />
        <span>Handler: {levelName}</span>
      </div>
    );
  }

  return null;
}
