/**
 * useProactiveOutreach — Client hook for Handler-initiated messages.
 *
 * Polls handler_outreach_queue every 60 seconds. When a pending message
 * is found with scheduled_for <= now, it returns it for the chat to display
 * as if the Handler initiated the conversation.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { getPendingOutreach, markDelivered } from '../lib/conditioning/proactive-outreach';
import type { OutreachMessage } from '../lib/conditioning/proactive-outreach';
import { useAuth } from '../context/AuthContext';

const POLL_INTERVAL_MS = 60_000;

interface UseProactiveOutreachReturn {
  /** The most recently delivered outreach message (null if none pending). */
  pendingMessage: OutreachMessage | null;
  /** Call this after displaying the message to acknowledge delivery. */
  acknowledge: () => void;
  /** Whether the hook is currently checking for messages. */
  isChecking: boolean;
}

export function useProactiveOutreach(): UseProactiveOutreachReturn {
  const { user } = useAuth();
  const [pendingMessage, setPendingMessage] = useState<OutreachMessage | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const checkForOutreach = useCallback(async () => {
    if (!user?.id) return;

    setIsChecking(true);
    try {
      const msg = await getPendingOutreach(user.id);
      if (msg && mountedRef.current) {
        setPendingMessage(msg);
      }
    } catch (err) {
      console.error('[useProactiveOutreach] Check error:', err);
    } finally {
      if (mountedRef.current) {
        setIsChecking(false);
      }
    }
  }, [user?.id]);

  const acknowledge = useCallback(async () => {
    if (!pendingMessage) return;

    try {
      await markDelivered(pendingMessage.id);
    } catch (err) {
      console.error('[useProactiveOutreach] Acknowledge error:', err);
    }

    setPendingMessage(null);
  }, [pendingMessage]);

  // Poll on mount and every 60s
  useEffect(() => {
    mountedRef.current = true;

    if (!user?.id) return;

    // Initial check
    checkForOutreach();

    // Set up polling
    intervalRef.current = setInterval(checkForOutreach, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [user?.id, checkForOutreach]);

  return { pendingMessage, acknowledge, isChecking };
}
