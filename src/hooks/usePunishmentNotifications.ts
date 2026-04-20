/**
 * usePunishmentNotifications
 *
 * Polls punishment_queue for new/overdue rows and fires browser notifications.
 * Tracks the last-notified id to avoid duplicates across sessions.
 */

import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { usePushNotifications } from './usePushNotifications';

const POLL_INTERVAL_MS = 60_000;
const LAST_SEEN_KEY = 'bp_punishment_last_seen_id';

export function usePunishmentNotifications(): void {
  const { user } = useAuth();
  const { notify } = usePushNotifications();
  const running = useRef(false);

  useEffect(() => {
    if (!user?.id) return;

    const lastSeen = (() => {
      try { return localStorage.getItem(LAST_SEEN_KEY) || ''; } catch { return ''; }
    })();

    const poll = async () => {
      if (running.current) return;
      running.current = true;
      try {
        // New queued punishments
        const { data: fresh } = await supabase
          .from('punishment_queue')
          .select('id, title, description, severity, due_by, created_at')
          .eq('user_id', user.id)
          .eq('status', 'queued')
          .order('created_at', { ascending: false })
          .limit(5);

        if (fresh && fresh.length > 0) {
          // Filter to rows newer than last-seen
          const unseenRows = (fresh as Array<Record<string, unknown>>).filter(p => {
            if (!lastSeen) return true;
            return (p.id as string) !== lastSeen;
          });

          // Find the first "new" row
          const mostRecent = unseenRows[0];
          if (mostRecent) {
            const mostRecentId = mostRecent.id as string;
            // Count all unseen
            const stopIdx = lastSeen ? unseenRows.findIndex(p => (p.id as string) === lastSeen) : unseenRows.length;
            const newCount = stopIdx === -1 ? unseenRows.length : stopIdx;

            if (newCount > 0) {
              if (newCount === 1) {
                notify(
                  `New punishment: ${mostRecent.title as string}`,
                  mostRecent.description as string,
                  { tag: `punishment-${mostRecentId}`, requireInteraction: true },
                );
              } else {
                notify(
                  `${newCount} new punishments queued`,
                  `Including: ${mostRecent.title as string}`,
                  { tag: `punishment-batch-${mostRecentId}`, requireInteraction: true },
                );
              }
              try { localStorage.setItem(LAST_SEEN_KEY, mostRecentId); } catch {}
            }
          }
        }

        // Overdue punishments — separate check, less noisy
        const overdueCutoff = new Date().toISOString();
        const { data: overdue, count } = await supabase
          .from('punishment_queue')
          .select('title', { count: 'exact', head: false })
          .eq('user_id', user.id)
          .eq('status', 'queued')
          .not('due_by', 'is', null)
          .lt('due_by', overdueCutoff)
          .limit(3);

        if ((count ?? 0) >= 2 && overdue) {
          notify(
            `${count} punishments OVERDUE`,
            `Dodging compounds. Execute them now.`,
            { tag: 'punishment-overdue', requireInteraction: false },
          );
        }
      } finally {
        running.current = false;
      }
    };

    void poll();
    const iv = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [user?.id, notify]);
}
