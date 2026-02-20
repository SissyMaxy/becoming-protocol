/**
 * HandlerMessage — Persistent Handler voice at the top of TodayView.
 * Tone-adaptive left-border accent. Collapsible. No avatar/icon.
 */

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useBambiMode } from '../../context/BambiModeContext';
import type { HandlerMode } from '../../hooks/useUserState';
import type { TimeOfDay } from '../../lib/rules-engine-v2';
import type { PersonalizedGreeting, MorningInsight } from '../../lib/morning-personalization';

interface HandlerMessageProps {
  handlerMode: HandlerMode;
  greeting?: PersonalizedGreeting;
  insight?: MorningInsight;
  motivationalMessage?: string;
  streakDays: number;
  denialDay: number;
  timeOfDay: TimeOfDay;
}

// Deterministic daily message fallback
const DAILY_MESSAGES = [
  'Stay focused. Every task moves you forward.',
  'Consistency is what separates intention from transformation.',
  'You chose this. Honor that choice today.',
  'Small steps compound. Trust the process.',
  'Your resistance is just friction before flow.',
  'Today is another layer. Build it well.',
  'The version of you that started this is counting on the version here now.',
];

function getDailyFallback(denialDay: number): string {
  return DAILY_MESSAGES[denialDay % DAILY_MESSAGES.length];
}

function getTimeGreeting(timeOfDay: TimeOfDay): string {
  switch (timeOfDay) {
    case 'morning': return 'Good morning.';
    case 'afternoon': return 'Good afternoon.';
    case 'evening': return 'Good evening.';
    case 'night': return 'Still here.';
  }
}

type ModeStyle = {
  container: string;
  primary: string;
  secondary: string;
};

function getModeStyles(handlerMode: HandlerMode, isBambiMode: boolean): ModeStyle {
  if (isBambiMode) {
    return {
      container: 'border-l-2 border-pink-400 bg-pink-50',
      primary: 'text-pink-800 font-semibold',
      secondary: 'text-pink-600',
    };
  }

  switch (handlerMode) {
    case 'architect':
      return {
        container: 'border-l-2 border-blue-400/60 bg-slate-900/40',
        primary: 'text-blue-100 font-medium tracking-wide',
        secondary: 'text-slate-400',
      };
    case 'director':
      return {
        container: 'border-l-2 border-protocol-accent/70 bg-protocol-surface',
        primary: 'text-protocol-text font-semibold',
        secondary: 'text-protocol-text-muted',
      };
    case 'handler':
      return {
        container: 'border-l-2 border-purple-400/80 bg-purple-950/40',
        primary: 'text-purple-100 font-bold',
        secondary: 'text-purple-300/80',
      };
    case 'caretaker':
      return {
        container: 'border-l-2 border-amber-400/50 bg-amber-950/20',
        primary: 'text-amber-100 font-normal',
        secondary: 'text-amber-300/70',
      };
    case 'invisible':
      return {
        container: 'border-l-2 border-protocol-border/30 bg-transparent',
        primary: 'text-protocol-text-muted',
        secondary: 'text-protocol-text-muted/50',
      };
  }
}

function composeMessage(
  props: HandlerMessageProps,
): { primary: string; secondary?: string } {
  const { greeting, insight, motivationalMessage, streakDays, denialDay, timeOfDay } = props;

  // Morning: use personalized greeting if available
  if (timeOfDay === 'morning' && greeting) {
    const primary = `${greeting.salutation}${greeting.personalAddress ? ', ' + greeting.personalAddress : ''}. ${greeting.subtext}`;
    const secondary = insight?.description || motivationalMessage || undefined;
    return { primary, secondary };
  }

  // Afternoon/evening: use insight or motivational message
  if (insight) {
    return {
      primary: insight.title,
      secondary: insight.description,
    };
  }

  if (motivationalMessage) {
    return {
      primary: motivationalMessage,
      secondary: streakDays > 0 ? `Day ${streakDays} streak.` : undefined,
    };
  }

  // Fallback
  return {
    primary: `${getTimeGreeting(timeOfDay)} Day ${denialDay}.`,
    secondary: getDailyFallback(denialDay),
  };
}

export function HandlerMessage(props: HandlerMessageProps) {
  const { isBambiMode } = useBambiMode();
  const { handlerMode } = props;
  const [isCollapsed, setIsCollapsed] = useState(false);

  const message = composeMessage(props);
  const styles = getModeStyles(handlerMode, isBambiMode);

  // Auto-expand when message changes
  const messageKey = message.primary;
  useEffect(() => {
    setIsCollapsed(false);
  }, [messageKey]);

  // Invisible mode: render minimal
  if (handlerMode === 'invisible') {
    return (
      <div className="h-6 flex items-center px-4">
        <p className="text-xs text-protocol-text-muted/40">
          Day {props.denialDay}
        </p>
      </div>
    );
  }

  return (
    <button
      onClick={() => setIsCollapsed(!isCollapsed)}
      className={`w-full text-left rounded-xl px-4 py-3.5 transition-all duration-300 ${styles.container}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className={`text-sm leading-snug handler-voice ${styles.primary} ${
            isCollapsed ? 'truncate' : ''
          }`}>
            {message.primary}
          </p>
          {!isCollapsed && message.secondary && (
            <p className={`text-xs mt-1.5 leading-relaxed handler-voice ${styles.secondary}`}>
              {message.secondary}
            </p>
          )}
        </div>
        <div className="flex-shrink-0 pt-0.5">
          {isCollapsed
            ? <ChevronDown className="w-3.5 h-3.5 opacity-40" />
            : <ChevronUp className="w-3.5 h-3.5 opacity-40" />
          }
        </div>
      </div>
    </button>
  );
}
