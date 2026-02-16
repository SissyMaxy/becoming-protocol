import { useRef, useEffect } from 'react';
import { VocalWeightAnalyzer } from '../audio/VocalWeightAnalyzer';

const GRAPH_SECONDS = 20;

/**
 * LightnessGraph — Rolling canvas visualization of lightness score over time.
 * Similar to PitchGraph but for vocal weight lightness (0-100).
 *
 * @param {{ lightnessHistory: Array<{lightness: number|null, time: number}> }} props
 */
export function LightnessGraph({ lightnessHistory }) {
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

    // Target zone (light range: 50-70)
    const targetTop = scoreToY(70, h);
    const targetBottom = scoreToY(50, h);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
    ctx.fillRect(0, targetTop, w, targetBottom - targetTop);

    // Target borders
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, targetTop);
    ctx.lineTo(w, targetTop);
    ctx.moveTo(0, targetBottom);
    ctx.lineTo(w, targetBottom);
    ctx.stroke();
    ctx.setLineDash([]);

    // Target labels
    ctx.fillStyle = 'rgba(16, 185, 129, 0.5)';
    ctx.font = '10px system-ui';
    ctx.fillText('70', 4, targetTop - 4);
    ctx.fillText('50', 4, targetBottom + 12);

    // Grid lines and category zones
    const zones = [
      { y: 30, label: 'Heavy', color: '#6366f1' },
      { y: 50, label: 'Moderate', color: '#f59e0b' },
      { y: 70, label: 'Light', color: '#10b981' },
    ];

    for (const zone of zones) {
      const y = scoreToY(zone.y, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();

      ctx.fillStyle = `${zone.color}40`;
      ctx.font = '9px system-ui';
      ctx.fillText(zone.label, w - 55, y - 3);
    }

    // Plot lightness data
    if (lightnessHistory.length < 2) return;

    const now = Date.now();
    const windowStart = now - GRAPH_SECONDS * 1000;
    const visible = lightnessHistory.filter(p => p.time >= windowStart);
    if (visible.length < 2) return;

    // Draw filled area under curve
    ctx.beginPath();
    let started = false;
    let firstX = 0;
    for (const point of visible) {
      if (point.lightness === null) {
        if (started) {
          // Close the fill area
          ctx.lineTo(((point.time - windowStart) / (GRAPH_SECONDS * 1000)) * w, h);
          ctx.lineTo(firstX, h);
          ctx.closePath();
          ctx.fillStyle = 'rgba(16, 185, 129, 0.06)';
          ctx.fill();
          started = false;
          ctx.beginPath();
        }
        continue;
      }

      const x = ((point.time - windowStart) / (GRAPH_SECONDS * 1000)) * w;
      const y = scoreToY(point.lightness, h);

      if (!started) {
        firstX = x;
        ctx.moveTo(x, h);
        ctx.lineTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    if (started) {
      const lastPoint = visible[visible.length - 1];
      const lastX = ((lastPoint.time - windowStart) / (GRAPH_SECONDS * 1000)) * w;
      ctx.lineTo(lastX, h);
      ctx.lineTo(firstX, h);
      ctx.closePath();
      ctx.fillStyle = 'rgba(16, 185, 129, 0.06)';
      ctx.fill();
    }

    // Draw line
    ctx.beginPath();
    ctx.strokeStyle = '#e0e0e8';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    started = false;
    for (const point of visible) {
      if (point.lightness === null) {
        started = false;
        continue;
      }

      const x = ((point.time - windowStart) / (GRAPH_SECONDS * 1000)) * w;
      const y = scoreToY(point.lightness, h);

      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Draw colored dots
    for (const point of visible) {
      if (point.lightness === null) continue;

      const x = ((point.time - windowStart) / (GRAPH_SECONDS * 1000)) * w;
      const y = scoreToY(point.lightness, h);

      const info = VocalWeightAnalyzer.getWeightInfo(point.lightness);
      ctx.beginPath();
      ctx.fillStyle = info.color;
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [lightnessHistory]);

  return (
    <div className="w-full rounded-xl border border-gray-800 overflow-hidden bg-[#0a0a10]">
      <canvas
        ref={canvasRef}
        className="w-full"
        style={{ height: '200px' }}
      />
    </div>
  );
}

/**
 * Map lightness score (0-100) to Y coordinate.
 * Higher score = higher on screen = lower Y value.
 */
function scoreToY(score, height) {
  const clamped = Math.max(0, Math.min(100, score));
  return height * (1 - clamped / 100);
}
