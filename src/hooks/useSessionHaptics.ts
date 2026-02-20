/**
 * useSessionHaptics — Maps session phase transitions to Lovense haptic patterns.
 * Watches phase/recovery/edge state and triggers appropriate patterns.
 */

import { useEffect, useRef } from 'react';
import { smartPlayPattern, smartStop, smartVibrate } from '../lib/lovense';
import { HAPTIC_PHASE_PATTERNS } from '../components/session/session-types';
import type { ImmersiveSessionState } from '../components/session/session-types';

/**
 * Derive the haptic phase key from session state.
 * Returns the key into HAPTIC_PHASE_PATTERNS, or null if no haptic should play.
 */
function getHapticKey(state: ImmersiveSessionState | null): string | null {
  if (!state) return null;

  if (state.phase === 'prep') return 'prep';
  if (state.phase === 'cooldown') return 'cooldown';
  if (state.activeAuction) return 'auction';

  if (state.phase === 'active') {
    if (state.isRecovering) return 'recovery';

    // Building intensity escalates based on progress
    const progress = state.edgeCount / state.config.targetEdges;
    if (progress < 0.3) return 'building_low';
    if (progress < 0.7) return 'building_mid';
    return 'building_high';
  }

  return null;
}

export function useSessionHaptics(state: ImmersiveSessionState | null) {
  const prevKeyRef = useRef<string | null>(null);
  const prevEdgeCountRef = useRef<number>(0);

  // Phase-based pattern changes
  useEffect(() => {
    const key = getHapticKey(state);
    if (key === prevKeyRef.current) return;
    prevKeyRef.current = key;

    if (!key) {
      // Session ended or no state — stop haptics
      smartStop('edge_session').catch(() => {});
      return;
    }

    const pattern = HAPTIC_PHASE_PATTERNS[key];
    if (pattern === null || pattern === undefined) {
      // Null pattern = stop (prep, auction)
      smartStop('edge_session').catch(() => {});
    } else {
      smartPlayPattern(pattern, 'edge_session', state?.id).catch(() => {});
    }
  }, [
    state?.phase,
    state?.isRecovering,
    state?.activeAuction,
    // Re-derive when edge count crosses progress thresholds
    state ? Math.floor((state.edgeCount / state.config.targetEdges) * 3) : 0,
    state?.id,
  ]);

  // Edge tap pulse — fire on each new edge
  useEffect(() => {
    if (!state || state.edgeCount <= prevEdgeCountRef.current) {
      prevEdgeCountRef.current = state?.edgeCount ?? 0;
      return;
    }
    prevEdgeCountRef.current = state.edgeCount;

    // Strong pulse on edge tap
    const pulsePattern = HAPTIC_PHASE_PATTERNS['edge_tap'];
    if (pulsePattern) {
      smartPlayPattern(pulsePattern, 'edge_session', state.id).catch(() => {});
      // Resume phase pattern after pulse (500ms)
      setTimeout(() => {
        const key = getHapticKey(state);
        const pattern = key ? HAPTIC_PHASE_PATTERNS[key] : null;
        if (pattern) {
          smartPlayPattern(pattern, 'edge_session', state.id).catch(() => {});
        }
      }, 500);
    } else {
      // Fallback: direct vibrate pulse
      smartVibrate(15, 0.5, 'edge_session', state.id).catch(() => {});
    }
  }, [state?.edgeCount, state?.id]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      smartStop('edge_session').catch(() => {});
    };
  }, []);
}
