/**
 * PMV (Porn Music Video) Generator — Stub
 *
 * PMV generation requires ffmpeg for video editing, which is not available
 * in Vercel serverless environments. This module exports the interface
 * so it can be implemented later with a dedicated media processing service
 * (e.g. a separate worker, AWS Lambda with ffmpeg layer, or Runway/Replicate API).
 */

// ============================================
// TYPES
// ============================================

export type PMVStyle =
  | 'hypnotic'       // slow cuts, spiral overlays, subliminal text
  | 'rapid_fire'     // fast cuts synced to beat drops
  | 'sissy_caption'  // captioned clips with identity reinforcement
  | 'edging'         // build-and-deny rhythm, teasing pace
  | 'worship';       // slow, reverent, focused on target

export interface PMVRequest {
  userId: string;
  style: PMVStyle;
  durationSeconds?: number;
  musicTrackUrl?: string;
  contentIds?: string[];       // specific content_curriculum items to include
  captionTheme?: string;       // e.g. "bimbo", "sissy", "slut", "good girl"
  triggerPhrases?: string[];   // phrases to flash as subliminals
}

export interface PMVResult {
  status: 'ready' | 'processing' | 'unavailable';
  videoUrl?: string;
  durationSeconds?: number;
  reason?: string;
}

// ============================================
// GENERATOR (STUB)
// ============================================

/**
 * Generate a personalized PMV.
 *
 * Currently returns unavailable — ffmpeg is not present in Vercel serverless.
 * When a media processing backend is available, implement against the
 * PMVRequest/PMVResult interfaces above.
 */
export async function generatePersonalizedPMV(
  userId: string,
  style: PMVStyle
): Promise<PMVResult> {
  // Suppress unused parameter warnings while keeping the signature stable
  void userId;
  void style;

  return {
    status: 'unavailable',
    reason:
      'PMV generation requires ffmpeg which is not available in Vercel serverless. ' +
      'Use a dedicated media processing service.',
  };
}
