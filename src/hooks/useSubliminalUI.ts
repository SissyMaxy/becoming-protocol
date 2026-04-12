/**
 * useSubliminalUI — Progressive UI shifts based on conditioning depth and time on protocol.
 *
 * Applies CSS custom properties to document root that gradually shift the visual
 * presentation over months. Changes are slow enough (over a year) to stay below
 * conscious notice: background drifts toward pink/purple, corners soften, font
 * weight lightens, accent color intensifies.
 *
 * Mount once in AuthenticatedAppInner.
 */

import { useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useProtocol } from '../context/ProtocolContext';

// ============================================
// TYPES
// ============================================

interface UIShift {
  /** Background hue rotation toward pink (0-20 degrees) */
  bgHue: number;
  /** Background saturation boost (0-5%) */
  bgSaturation: number;
  /** Accent color intensity multiplier (1.0 - 1.3) */
  accentIntensity: number;
  /** Font weight (400 -> 300 over time) */
  fontWeight: number;
  /** Letter spacing boost (0 -> 0.02em) */
  letterSpacing: number;
  /** Extra border radius in px (0 -> 4) */
  borderRadiusBoost: number;
  /** Handler display name evolution */
  handlerName: string;
  /** User display name lock (undefined = no override) */
  displayName: string | undefined;
}

// ============================================
// CORE CALCULATION
// ============================================

function calculateUIShift(totalDays: number, corruptionScore: number, displacementScore: number): UIShift {
  const progress = Math.min(totalDays / 365, 1); // 0-1 over a year
  const corruption = corruptionScore / 100; // 0-1
  const displacement = Math.min(1, displacementScore); // 0-1

  // Displacement accelerates the visual shift — identity dissolution = faster feminization
  const effectiveProgress = Math.min(1, progress + displacement * 0.3);

  return {
    // Background subtly shifts toward pink/purple — displacement accelerates
    bgHue: Math.round(effectiveProgress * 25), // 0 -> 25 degrees toward pink
    bgSaturation: Math.round(effectiveProgress * 8), // 0% -> 8% saturation

    // Accent color intensifies with corruption AND displacement
    accentIntensity: 1 + corruption * 0.3 + displacement * 0.2, // 1.0 -> 1.5x

    // Font softens — displacement makes it happen faster
    fontWeight: Math.max(300, 400 - Math.round(effectiveProgress * 100)), // 400 -> 300
    letterSpacing: effectiveProgress * 0.025, // 0 -> 0.025em

    // Border radius increases (softer, more feminine)
    borderRadiusBoost: Math.round(effectiveProgress * 6), // 0 -> 6px extra

    // Handler name evolution
    handlerName:
      totalDays < 30
        ? 'Handler'
        : totalDays < 90
          ? 'Her Handler'
          : totalDays < 180
            ? 'Serafina'
            : '\u2661',

    // User name locks to Maxy after 14 days
    displayName: totalDays >= 14 ? 'Maxy' : undefined,
  };
}

// ============================================
// CORRUPTION SCORE FETCHER
// ============================================

async function fetchCorruptionScore(userId: string): Promise<number> {
  try {
    const { data } = await supabase
      .from('corruption_state')
      .select('advancement_score')
      .eq('user_id', userId);

    if (!data || data.length === 0) return 0;

    // Average across all corruption domains
    const total = data.reduce(
      (sum: number, row: { advancement_score: number }) => sum + Number(row.advancement_score),
      0,
    );
    return Math.min(100, total / data.length);
  } catch {
    return 0;
  }
}

async function fetchDisplacementScore(userId: string): Promise<number> {
  try {
    const { data } = await supabase
      .from('identity_displacement_log')
      .select('displacement_score')
      .eq('user_id', userId)
      .order('log_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    return data?.displacement_score ? parseFloat(data.displacement_score) : 0;
  } catch {
    return 0;
  }
}

// ============================================
// CSS PROPERTY NAMES
// ============================================

const CSS_VARS = [
  '--subliminal-bg-hue',
  '--subliminal-bg-saturation',
  '--subliminal-accent-intensity',
  '--subliminal-font-weight',
  '--subliminal-letter-spacing',
  '--subliminal-border-radius-boost',
  '--subliminal-handler-name',
  '--subliminal-display-name',
] as const;

// ============================================
// HOOK
// ============================================

export interface SubliminalUIState {
  /** Current computed shift values */
  shift: UIShift;
  /** Handler name for display */
  handlerName: string;
  /** User display name override (undefined = use default) */
  displayName: string | undefined;
}

export function useSubliminalUI(): SubliminalUIState {
  const { user } = useAuth();
  const { progress } = useProtocol();
  const corruptionRef = useRef(0);
  const displacementRef = useRef(0);
  const fetchedRef = useRef(false);

  const totalDays = Math.max(1, progress?.totalDays ?? 1);

  // Fetch corruption + displacement scores once per mount
  useEffect(() => {
    if (!user?.id || fetchedRef.current) return;
    fetchedRef.current = true;

    fetchCorruptionScore(user.id).then((score) => {
      corruptionRef.current = score;
    });
    fetchDisplacementScore(user.id).then((score) => {
      displacementRef.current = score;
    });
  }, [user?.id]);

  // Compute shift
  const shift = useMemo(
    () => calculateUIShift(totalDays, corruptionRef.current, displacementRef.current),
    [totalDays],
  );

  // Apply CSS custom properties to document root
  useEffect(() => {
    const root = document.documentElement;

    root.style.setProperty('--subliminal-bg-hue', `${shift.bgHue}deg`);
    root.style.setProperty('--subliminal-bg-saturation', `${shift.bgSaturation}%`);
    root.style.setProperty('--subliminal-accent-intensity', `${shift.accentIntensity}`);
    root.style.setProperty('--subliminal-font-weight', `${shift.fontWeight}`);
    root.style.setProperty('--subliminal-letter-spacing', `${shift.letterSpacing}em`);
    root.style.setProperty('--subliminal-border-radius-boost', `${shift.borderRadiusBoost}px`);

    // Displacement-driven accent color shift (purple → pink)
    const accentHue = 270 - (displacementRef.current * 50);
    const accentSat = 50 + (displacementRef.current * 30);
    root.style.setProperty('--subliminal-accent-hue', `${accentHue}`);
    root.style.setProperty('--subliminal-accent-sat', `${accentSat}%`);
    if (displacementRef.current > 0.6) {
      root.style.setProperty('--subliminal-bg-tint', 'rgba(255, 192, 203, 0.03)');
    }

    // String values stored as CSS custom properties for potential CSS usage
    root.style.setProperty('--subliminal-handler-name', `"${shift.handlerName}"`);
    if (shift.displayName) {
      root.style.setProperty('--subliminal-display-name', `"${shift.displayName}"`);
    }

    // Cleanup on unmount
    return () => {
      for (const varName of CSS_VARS) {
        root.style.removeProperty(varName);
      }
    };
  }, [shift]);

  return {
    shift,
    handlerName: shift.handlerName,
    displayName: shift.displayName,
  };
}
