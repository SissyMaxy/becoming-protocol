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

function calculateUIShift(totalDays: number, corruptionScore: number): UIShift {
  const progress = Math.min(totalDays / 365, 1); // 0-1 over a year
  const corruption = corruptionScore / 100; // 0-1

  return {
    // Background subtly shifts toward pink/purple
    bgHue: Math.round(progress * 20), // 0 -> 20 degrees toward pink
    bgSaturation: Math.round(progress * 5), // 0% -> 5% saturation

    // Accent color intensifies with corruption
    accentIntensity: 1 + corruption * 0.3, // 1.0 -> 1.3x

    // Font softens slightly
    fontWeight: Math.max(300, 400 - Math.round(progress * 100)), // 400 -> 300
    letterSpacing: progress * 0.02, // 0 -> 0.02em

    // Border radius increases (softer, more feminine)
    borderRadiusBoost: Math.round(progress * 4), // 0 -> 4px extra

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
  const fetchedRef = useRef(false);

  const totalDays = Math.max(1, progress?.totalDays ?? 1);

  // Fetch corruption score once per mount
  useEffect(() => {
    if (!user?.id || fetchedRef.current) return;
    fetchedRef.current = true;

    fetchCorruptionScore(user.id).then((score) => {
      corruptionRef.current = score;
    });
  }, [user?.id]);

  // Compute shift
  const shift = useMemo(
    () => calculateUIShift(totalDays, corruptionRef.current),
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
