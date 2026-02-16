import { useRef, useEffect } from 'react';
import { IntonationTracker } from '../audio/IntonationTracker';

const GRAPH_SECONDS = 10; // 10-second rolling window for contour visibility
const PITCH_MIN = 80;     // Bottom of display range (Hz)
const PITCH_MAX = 350;    // Top of display range (Hz)

/**
 * IntonationContour — Signature "seismograph" visualization.
 *
 * Draws the user's live pitch contour as a flowing melodic line.
 * Phrase boundaries appear as gaps. Line color reflects variability:
 * flat/monotone sections are muted, melodic sections are vivid.
 *
 * @param {{ pitchHistory: Array<{pitch: number|null, time: number}>, phraseHistory: Array }} props
 */
export function IntonationContour({ pitchHistory, phraseHistory }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#0a0a10';
    ctx.fillRect(0, 0, w, h);

    // Feminine target zone (180-250 Hz)
    const targetTop = pitchToY(250, h);
    const targetBottom = pitchToY(180, h);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.06)';
    ctx.fillRect(0, targetTop, w, targetBottom - targetTop);

    // Target zone borders
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, targetTop);
    ctx.lineTo(w, targetTop);
    ctx.moveTo(0, targetBottom);
    ctx.lineTo(w, targetBottom);
    ctx.stroke();
    ctx.setLineDash([]);

    // Range labels
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '9px system-ui';
    ctx.fillText('250 Hz', 4, targetTop - 3);
    ctx.fillText('180 Hz', 4, targetBottom + 10);

    // Horizontal reference lines
    const refLines = [100, 150, 200, 250, 300];
    for (const hz of refLines) {
      const y = pitchToY(hz, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Plot pitch contour
    if (pitchHistory.length < 2) return;

    const now = Date.now();
    const windowStart = now - GRAPH_SECONDS * 1000;
    const visible = pitchHistory.filter(p => p.time >= windowStart);
    if (visible.length < 2) return;

    // Build phrase lookup for coloring
    const phraseRanges = (phraseHistory || []).map(p => ({
      start: p.startTime,
      end: p.endTime,
      variabilityScore: p.variabilityScore,
    }));

    // Draw the contour line with per-segment coloring
    let prevPoint = null;

    for (let i = 0; i < visible.length; i++) {
      const point = visible[i];
      const x = ((point.time - windowStart) / (GRAPH_SECONDS * 1000)) * w;

      if (point.pitch === null) {
        // Silence — draw any accumulated segment and reset
        if (prevPoint !== null) {
          prevPoint = null;
        }
        continue;
      }

      const y = pitchToY(point.pitch, h);

      if (prevPoint === null) {
        // Start of a new voiced segment
        prevPoint = { x, y, time: point.time };
        continue;
      }

      // Check for gap (phrase boundary)
      if (point.time - prevPoint.time > 200) {
        prevPoint = null;
        prevPoint = { x, y, time: point.time };
        continue;
      }

      // Draw segment between prevPoint and current point
      const segColor = getSegmentColor(point.time, phraseRanges);
      ctx.beginPath();
      ctx.strokeStyle = segColor;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.moveTo(prevPoint.x, prevPoint.y);
      ctx.lineTo(x, y);
      ctx.stroke();

      // Subtle glow for melodic segments
      const variability = getSegmentVariability(point.time, phraseRanges);
      if (variability !== null && variability > 50) {
        ctx.beginPath();
        ctx.strokeStyle = segColor.replace(')', ', 0.15)').replace('rgb(', 'rgba(');
        ctx.lineWidth = 6;
        ctx.moveTo(prevPoint.x, prevPoint.y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }

      prevPoint = { x, y, time: point.time };
    }

    // Draw a "now" cursor at the right edge
    if (prevPoint && visible[visible.length - 1].pitch !== null) {
      ctx.beginPath();
      ctx.fillStyle = '#e0e0e8';
      ctx.arc(prevPoint.x, prevPoint.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [pitchHistory, phraseHistory]);

  return (
    <div className="w-full rounded-xl border border-gray-800 overflow-hidden bg-[#0a0a10]">
      <canvas
        ref={canvasRef}
        className="w-full"
        style={{ height: '180px' }}
      />
    </div>
  );
}

/**
 * Map pitch (Hz) to canvas Y coordinate.
 * Higher pitch = higher on screen = lower Y value.
 */
function pitchToY(hz, height) {
  const clamped = Math.max(PITCH_MIN, Math.min(PITCH_MAX, hz));
  const normalized = (clamped - PITCH_MIN) / (PITCH_MAX - PITCH_MIN);
  return height * (1 - normalized);
}

/**
 * Get the color for a segment based on its phrase's variability score.
 */
function getSegmentColor(time, phraseRanges) {
  for (const pr of phraseRanges) {
    if (time >= pr.start && time <= pr.end) {
      const info = IntonationTracker.getVariabilityInfo(pr.variabilityScore);
      return info.color;
    }
  }
  // Default color for segments not yet assigned to a phrase
  return '#a0a0b0';
}

/**
 * Get variability score for a time point.
 */
function getSegmentVariability(time, phraseRanges) {
  for (const pr of phraseRanges) {
    if (time >= pr.start && time <= pr.end) {
      return pr.variabilityScore;
    }
  }
  return null;
}
