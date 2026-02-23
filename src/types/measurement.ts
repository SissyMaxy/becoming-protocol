/**
 * Measurement types — monthly body measurements with
 * delta tracking, photo integration, and prompt logic.
 */

import type { BodyMeasurement } from './exercise';

// ============================================
// PHOTO TYPE
// ============================================

export interface MeasurementPhoto {
  id: string;
  userId: string;
  measurementId: string | null;
  photoUrl: string;
  photoType: 'front' | 'side' | 'back';
  notes: string | null;
  takenAt: string;
}

// ============================================
// DELTA COMPUTATION
// ============================================

export interface MeasurementDelta {
  field: string;
  label: string;
  current: number;
  previous: number;
  delta: number;
  direction: 'up' | 'down' | 'same';
  /** Whether this direction is favorable for feminization goals */
  isGood: boolean;
}

interface FieldConfig {
  field: keyof BodyMeasurement;
  label: string;
  /** true = "up is good" (e.g., hips growing), false = "down is good" (e.g., waist shrinking) */
  upIsGood: boolean;
}

const DELTA_FIELDS: FieldConfig[] = [
  { field: 'hipsInches', label: 'Hips', upIsGood: true },
  { field: 'waistInches', label: 'Waist', upIsGood: false },
  { field: 'thighLeftInches', label: 'L Thigh', upIsGood: true },
  { field: 'thighRightInches', label: 'R Thigh', upIsGood: true },
  { field: 'shouldersInches', label: 'Shoulders', upIsGood: false },
  { field: 'weightLbs', label: 'Weight', upIsGood: false },
];

export function computeDeltas(
  current: Partial<Record<string, number | null>>,
  previous: BodyMeasurement,
): MeasurementDelta[] {
  const deltas: MeasurementDelta[] = [];

  for (const cfg of DELTA_FIELDS) {
    const curVal = current[cfg.field] as number | null | undefined;
    const prevVal = previous[cfg.field] as number | null;
    if (curVal == null || prevVal == null) continue;

    const delta = Math.round((curVal - prevVal) * 100) / 100;
    const direction: MeasurementDelta['direction'] =
      delta > 0 ? 'up' : delta < 0 ? 'down' : 'same';
    const isGood =
      direction === 'same' ? true :
      cfg.upIsGood ? direction === 'up' :
      direction === 'down';

    deltas.push({
      field: cfg.field,
      label: cfg.label,
      current: curVal,
      previous: prevVal,
      delta,
      direction,
      isGood,
    });
  }

  return deltas;
}

/** Should we prompt for a new measurement? True if >28 days since last or no measurements. */
export function shouldPromptMeasurement(latest: BodyMeasurement | null): boolean {
  if (!latest) return true;
  const daysSince = Math.floor(
    (Date.now() - new Date(latest.measuredAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  return daysSince > 28;
}
