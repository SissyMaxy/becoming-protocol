// ============================================
// Cam Recording — MediaRecorder Wrapper
// Captures stream, extracts highlights for vault
// ============================================

import type { SessionHighlight } from '../../types/cam';

// ============================================
// Recording Manager
// ============================================

export interface RecordingState {
  isRecording: boolean;
  startedAt: number | null;
  chunks: Blob[];
  mediaRecorder: MediaRecorder | null;
  durationSeconds: number;
}

export function createRecordingState(): RecordingState {
  return {
    isRecording: false,
    startedAt: null,
    chunks: [],
    mediaRecorder: null,
    durationSeconds: 0,
  };
}

export async function startRecording(
  stream: MediaStream,
  onDataAvailable?: (chunk: Blob) => void
): Promise<RecordingState> {
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : MediaRecorder.isTypeSupported('video/webm')
      ? 'video/webm'
      : 'video/mp4';

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 2_500_000, // 2.5 Mbps
  });

  const chunks: Blob[] = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      chunks.push(e.data);
      onDataAvailable?.(e.data);
    }
  };

  recorder.start(10_000); // Chunk every 10 seconds

  return {
    isRecording: true,
    startedAt: Date.now(),
    chunks,
    mediaRecorder: recorder,
    durationSeconds: 0,
  };
}

export function stopRecording(state: RecordingState): Promise<Blob> {
  return new Promise((resolve) => {
    if (!state.mediaRecorder || state.mediaRecorder.state === 'inactive') {
      resolve(new Blob(state.chunks, { type: 'video/webm' }));
      return;
    }

    state.mediaRecorder.onstop = () => {
      const blob = new Blob(state.chunks, { type: state.mediaRecorder?.mimeType || 'video/webm' });
      state.isRecording = false;
      state.durationSeconds = state.startedAt
        ? Math.round((Date.now() - state.startedAt) / 1000)
        : 0;
      resolve(blob);
    };

    state.mediaRecorder.stop();
  });
}

// ============================================
// Highlight Extraction
// ============================================

export interface HighlightClip {
  highlight: SessionHighlight;
  startMs: number;
  endMs: number;
}

export function calculateHighlightTimings(
  highlights: SessionHighlight[],
  sessionStartMs: number
): HighlightClip[] {
  return highlights.map(h => ({
    highlight: h,
    startMs: sessionStartMs + (h.timestampSeconds * 1000),
    endMs: sessionStartMs + ((h.timestampSeconds + h.durationSeconds) * 1000),
  }));
}

// Note: Actual clip extraction from video blobs requires server-side
// processing (ffmpeg). The client marks highlights with timestamps;
// the vault pipeline extracts clips post-session.

export function buildHighlightMetadata(
  clip: HighlightClip,
  sessionId: string
): Record<string, unknown> {
  return {
    source: 'cam_session',
    sessionId,
    highlightType: clip.highlight.type,
    description: clip.highlight.description,
    timestampSeconds: clip.highlight.timestampSeconds,
    durationSeconds: clip.highlight.durationSeconds,
  };
}

// ============================================
// Recording URL (for upload)
// ============================================

export function createRecordingUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

export function revokeRecordingUrl(url: string): void {
  URL.revokeObjectURL(url);
}
