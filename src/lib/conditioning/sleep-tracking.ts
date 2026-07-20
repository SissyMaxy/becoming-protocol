/**
 * Sleep conditioning tracking
 *
 * Disabled by the Protocol Contract. The legacy exports remain so older code
 * compiles, but they no longer record, correlate, or surface sleep playback as
 * a compliance signal.
 */

export type PlaybackEvent = 'started' | 'progress' | 'completed' | 'interrupted';

export interface SleepPlaybackData {
  event: PlaybackEvent;
  durationSeconds?: number;
  contentIds?: string[];
}

export interface SleepVerification {
  played: boolean;
  durationSeconds: number;
  completed: boolean;
  deepSleepCorrelation: 'positive' | 'neutral' | 'negative';
}

export async function recordSleepPlayback(
  _userId: string,
  _data: SleepPlaybackData,
): Promise<void> {
  return;
}

export async function correlateSleepQuality(
  _userId: string,
  _date: string,
): Promise<void> {
  return;
}

export async function verifySleepConditioning(
  _userId: string,
  _date: string,
): Promise<SleepVerification> {
  return {
    played: false,
    durationSeconds: 0,
    completed: false,
    deepSleepCorrelation: 'neutral',
  };
}

export async function buildSleepTrackingContext(_userId: string): Promise<string> {
  return '';
}
