/**
 * useEngagementTracker — Tracks app session duration and activity.
 *
 * Records when the app is open, how long, and updates user_state.updated_at
 * every 60s so the Handler can compute "time since last active."
 *
 * Brief opens (< 30s) are flagged as non-compliance indicators.
 * The Handler sees: "App opened 3 times today, total 12 minutes active.
 * Last active 45 min ago."
 */

import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const HEARTBEAT_INTERVAL_MS = 60_000; // 60 seconds
const BRIEF_SESSION_THRESHOLD_MS = 30_000; // 30 seconds

export function useEngagementTracker(): void {
  const { user } = useAuth();
  const sessionStartRef = useRef<number>(Date.now());
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    const userId = user.id;
    sessionStartRef.current = Date.now();

    // Fire-and-forget: record session start via user_state update
    supabase
      .from('user_state')
      .update({ updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .then(() => {});

    // Heartbeat: update user_state.updated_at every 60s
    heartbeatRef.current = setInterval(() => {
      supabase
        .from('user_state')
        .update({ updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .then(() => {});
    }, HEARTBEAT_INTERVAL_MS);

    // Visibility change handler: detect when app goes to background
    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        // App went to background — record session end
        const duration = Date.now() - sessionStartRef.current;

        // If session was < 30s, flag as brief open
        if (duration < BRIEF_SESSION_THRESHOLD_MS) {
          supabase
            .from('handler_interventions')
            .insert({
              user_id: userId,
              intervention_type: 'brief_app_session',
              details: {
                duration_ms: duration,
                duration_seconds: Math.round(duration / 1000),
                reason: `App open for ${Math.round(duration / 1000)}s — likely dismissed notification without engaging.`,
              },
            })
            .then(() => {});
        }
      } else if (document.visibilityState === 'visible') {
        // App came back to foreground — reset session timer
        sessionStartRef.current = Date.now();

        // Update last active
        supabase
          .from('user_state')
          .update({ updated_at: new Date().toISOString() })
          .eq('user_id', userId)
          .then(() => {});
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup
    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      // Final update on unmount
      const duration = Date.now() - sessionStartRef.current;
      if (duration < BRIEF_SESSION_THRESHOLD_MS) {
        supabase
          .from('handler_interventions')
          .insert({
            user_id: userId,
            intervention_type: 'brief_app_session',
            details: {
              duration_ms: duration,
              duration_seconds: Math.round(duration / 1000),
              reason: `App session ended after ${Math.round(duration / 1000)}s.`,
            },
          })
          .then(() => {});
      }
    };
  }, [user?.id]);
}
