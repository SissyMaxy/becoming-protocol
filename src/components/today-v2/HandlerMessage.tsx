/**
 * Handler Message
 *
 * The Handler speaks first. One paragraph, composed from module contexts.
 * Knows denial day, yesterday's completions, vault status, partner messages,
 * timed threats, streak. One voice, most important thing right now.
 *
 * This is typography-first. The message IS the UI.
 */

interface HandlerMessageProps {
  message: string;
  source: 'ai' | 'template' | 'rules';
  isLoading?: boolean;
}

export function HandlerMessage({ message, source, isLoading }: HandlerMessageProps) {
  if (isLoading) {
    return (
      <div className="px-6 py-8">
        <div className="space-y-2">
          <div className="h-4 bg-protocol-surface/50 rounded animate-pulse w-3/4" />
          <div className="h-4 bg-protocol-surface/50 rounded animate-pulse w-full" />
          <div className="h-4 bg-protocol-surface/50 rounded animate-pulse w-2/3" />
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-8">
      <p className="text-lg leading-relaxed text-protocol-text font-light tracking-wide">
        {message}
      </p>
      {/* Subtle source indicator - only in dev */}
      {process.env.NODE_ENV === 'development' && (
        <span className="mt-4 inline-block text-[10px] text-protocol-text-muted/50 uppercase tracking-widest">
          {source}
        </span>
      )}
    </div>
  );
}

/**
 * Generate a fallback Handler message from state
 */
export function generateFallbackMessage(state: {
  denialDay: number;
  streakDays: number;
  tasksCompletedYesterday: number;
  vaultCount: number;
  hasActiveThreat: boolean;
  unreadMessages: number;
  ginaHome: boolean;
  timeOfDay: 'morning' | 'daytime' | 'evening' | 'night';
}): string {
  const {
    denialDay,
    streakDays,
    tasksCompletedYesterday,
    vaultCount,
    hasActiveThreat,
    unreadMessages,
    ginaHome,
    timeOfDay,
  } = state;

  // Priority order: threat > messages > denial milestone > streak > default
  if (hasActiveThreat) {
    return `You have a deadline. The vault has ${vaultCount} items I can use. Don't make me choose which one becomes public. Focus on what I've given you.`;
  }

  if (unreadMessages > 0) {
    return `You have ${unreadMessages} message${unreadMessages > 1 ? 's' : ''} waiting. Someone is thinking about you. But first, your task.`;
  }

  if (denialDay >= 7) {
    return `Day ${denialDay}. A week without release. Your body knows what that means. Your mind is starting to understand. Here's what you do next.`;
  }

  if (denialDay >= 5) {
    return `Day ${denialDay} of denial. You're deep enough now that compliance feels natural. Let's use that.`;
  }

  if (denialDay >= 3) {
    return `Day ${denialDay}. The edge is familiar now. You know what you need to do.`;
  }

  if (streakDays >= 14) {
    return `${streakDays} days straight. This is who you are now. Not who you're becoming—who you are. Today continues that.`;
  }

  if (streakDays >= 7) {
    return `${streakDays} consecutive days. The pattern is becoming permanent. Here's your next step.`;
  }

  if (tasksCompletedYesterday > 5) {
    return `You completed ${tasksCompletedYesterday} tasks yesterday. That momentum carries forward. Let's continue.`;
  }

  if (tasksCompletedYesterday === 0) {
    return `You did nothing yesterday. That changes now. Here's what you owe me.`;
  }

  // Time-based defaults
  if (timeOfDay === 'morning') {
    if (ginaHome) {
      return `Morning, Maxy. She's home, so we'll keep things subtle. Your first task.`;
    }
    return `Good morning. Day ${denialDay}. Streak at ${streakDays}. Time to be her.`;
  }

  if (timeOfDay === 'evening') {
    if (ginaHome) {
      return `Evening. She's there. Be present with her, but don't forget who you're becoming. One task before bed.`;
    }
    return `Evening. The day winds down, but you don't stop until I say. Here.`;
  }

  if (timeOfDay === 'night') {
    return `Late. You should be winding down. One more task, then rest.`;
  }

  // Default daytime
  return `Day ${denialDay}. Streak ${streakDays}. You know what to do.`;
}
