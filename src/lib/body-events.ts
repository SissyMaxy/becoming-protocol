/**
 * Body domain cross-system event emitter.
 * Fire-and-forget pattern — events log and optionally notify other domains.
 */

export type BodyEvent =
  | { type: 'workout_completed'; templateId: string; durationMin: number; sessionType: string }
  | { type: 'protein_target_hit'; grams: number; date: string }
  | { type: 'measurement_logged'; measurementId: string }
  | { type: 'streak_milestone'; weeks: number };

/**
 * Emit a body domain event. Currently logs to console.
 * Future: persist to body_events table for handler context consumption.
 */
export function emitBodyEvent(userId: string, event: BodyEvent): void {
  console.log(`[BodyEvent] user=${userId} ${event.type}`, event);

  // Dispatch CustomEvent for any in-app listeners
  window.dispatchEvent(new CustomEvent('body-event', {
    detail: { userId, ...event },
  }));
}
