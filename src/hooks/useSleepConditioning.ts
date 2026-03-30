/**
 * useSleepConditioning — Bridges sleep prescription API with the SleepContentPlayer.
 *
 * On mount (if evening hours and conditions met), fetches a sleep conditioning
 * prescription from the API. Provides start/end session methods that coordinate
 * the conditioning_sessions_v2 record and Lovense device activation.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { activateSessionDevice, deactivateSessionDevice } from '../lib/conditioning/session-device';

// ============================================
// TYPES
// ============================================

export interface SleepPrescriptionItem {
  id: string;
  title: string;
  mediaType: string;
  category: string;
  tier: number;
  intensity: number;
  durationMinutes: number | null;
  audioUrl: string | null;
  sessionContexts: string[];
}

export interface SleepPrescription {
  sessionId: string;
  tier: number;
  denialDay: number;
  streakDays: number;
  playlist: SleepPrescriptionItem[];
}

interface UseSleepConditioningReturn {
  prescription: SleepPrescription | null;
  isLoading: boolean;
  error: string | null;
  isActive: boolean;
  shouldOffer: boolean;
  startSleepSession: () => Promise<void>;
  endSleepSession: () => Promise<void>;
  fetchPrescription: () => Promise<SleepPrescription | null>;
}

// ============================================
// HELPERS
// ============================================

/** Returns true if current local hour is between 20:00 and 04:00 (evening/night window). */
function isEveningWindow(): boolean {
  const hour = new Date().getHours();
  return hour >= 20 || hour < 4;
}

// ============================================
// HOOK
// ============================================

export function useSleepConditioning(): UseSleepConditioningReturn {
  const { user } = useAuth();
  const [prescription, setPrescription] = useState<SleepPrescription | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const fetchedRef = useRef(false);

  // ============================================
  // FETCH PRESCRIPTION
  // ============================================

  const fetchPrescription = useCallback(async (): Promise<SleepPrescription | null> => {
    if (!user?.id) return null;

    setIsLoading(true);
    setError(null);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) {
        setError('No auth token');
        return null;
      }

      const res = await fetch('/api/conditioning/sleep-prescription', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body.error || `HTTP ${res.status}`;
        setError(msg);
        console.warn('[useSleepConditioning] Prescription fetch failed:', msg);
        return null;
      }

      const data: SleepPrescription = await res.json();
      setPrescription(data);
      return data;
    } catch (err: any) {
      const msg = err.message || 'Fetch failed';
      setError(msg);
      console.error('[useSleepConditioning] Exception:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // ============================================
  // AUTO-FETCH ON MOUNT (evening window only)
  // ============================================

  useEffect(() => {
    if (!user?.id || fetchedRef.current) return;
    if (!isEveningWindow()) return;

    fetchedRef.current = true;
    fetchPrescription();
  }, [user?.id, fetchPrescription]);

  // ============================================
  // START SESSION
  // ============================================

  const startSleepSession = useCallback(async () => {
    if (!prescription) return;

    setIsActive(true);

    // Activate Lovense with sleep:induction pattern (gentle_wave at intensity 3)
    try {
      await activateSessionDevice('sleep', 'induction');
    } catch (err) {
      // Device activation is best-effort; don't block session start
      console.warn('[useSleepConditioning] Device activation failed:', err);
    }
  }, [prescription]);

  // ============================================
  // END SESSION
  // ============================================

  const endSleepSession = useCallback(async () => {
    if (!prescription) return;

    setIsActive(false);

    // Deactivate Lovense
    try {
      await deactivateSessionDevice();
    } catch (err) {
      console.warn('[useSleepConditioning] Device deactivation failed:', err);
    }

    // Mark conditioning_sessions_v2 record as completed
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (token) {
        const sb = supabase;
        await sb
          .from('conditioning_sessions_v2')
          .update({
            completed: true,
            ended_at: new Date().toISOString(),
          })
          .eq('id', prescription.sessionId);
      }
    } catch (err) {
      console.error('[useSleepConditioning] Failed to complete session record:', err);
    }
  }, [prescription]);

  // ============================================
  // DERIVED STATE
  // ============================================

  const shouldOffer = isEveningWindow() && !!prescription && prescription.playlist.length > 0;

  return {
    prescription,
    isLoading,
    error,
    isActive,
    shouldOffer,
    startSleepSession,
    endSleepSession,
    fetchPrescription,
  };
}
