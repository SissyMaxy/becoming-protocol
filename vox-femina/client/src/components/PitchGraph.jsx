import { useRef, useEffect } from 'react';

const GRAPH_SECONDS = 15;
const TARGET_MIN_HZ = 180;
const TARGET_MAX_HZ = 250;
const MIN_HZ = 50;
const MAX_HZ = 400;

/**
 * PitchGraph — Rolling Canvas pitch visualization
 * @param {{ pitchHistory: Array<{pitch: number | null, time: number}>, targetMin: number, targetMax: number }} props
 */
export function PitchGraph({ pitchHistory, targetMin = TARGET_MIN_HZ, targetMax = TARGET_MAX_HZ }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
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

    // Target range band
    const targetTopY = hzToY(targetMax, h);
    const targetBottomY = hzToY(targetMin, h);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
    ctx.fillRect(0, targetTopY, w, targetBottomY - targetTopY);

    // Target range borders
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, targetTopY);
    ctx.lineTo(w, targetTopY);
    ctx.moveTo(0, targetBottomY);
    ctx.lineTo(w, targetBottomY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Target labels
    ctx.fillStyle = 'rgba(16, 185, 129, 0.5)';
    ctx.font = '10px system-ui';
    ctx.fillText(`${targetMax} Hz`, 4, targetTopY - 4);
    ctx.fillText(`${targetMin} Hz`, 4, targetBottomY + 12);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 0.5;
    for (let hz = 100; hz <= 350; hz += 50) {
      const y = hzToY(hz, h);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '9px system-ui';
      ctx.fillText(`${hz}`, w - 28, y - 3);
    }

    // Plot pitch data
    if (pitchHistory.length < 2) return;

    const now = Date.now();
    const windowStart = now - GRAPH_SECONDS * 1000;

    // Filter to visible window
    const visible = pitchHistory.filter(p => p.time >= windowStart);
    if (visible.length < 2) return;

    // Draw pitch line
    ctx.beginPath();
    ctx.strokeStyle = '#e0e0e8';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    let started = false;
    for (const point of visible) {
      if (point.pitch === null) {
        started = false;
        continue;
      }

      const x = ((point.time - windowStart) / (GRAPH_SECONDS * 1000)) * w;
      const y = hzToY(point.pitch, h);

      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Draw colored dots for range
    for (const point of visible) {
      if (point.pitch === null) continue;

      const x = ((point.time - windowStart) / (GRAPH_SECONDS * 1000)) * w;
      const y = hzToY(point.pitch, h);

      let dotColor = '#6366f1'; // masculine
      if (point.pitch >= 250) dotColor = '#ec4899';
      else if (point.pitch >= 180) dotColor = '#10b981';
      else if (point.pitch >= 150) dotColor = '#f59e0b';

      ctx.beginPath();
      ctx.fillStyle = dotColor;
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [pitchHistory, targetMin, targetMax]);

  return (
    <div className="w-full rounded-xl border border-gray-800 overflow-hidden bg-[#0a0a10]">
      <canvas
        ref={canvasRef}
        className="w-full"
        style={{ height: '240px' }}
      />
    </div>
  );
}

function hzToY(hz, height) {
  // Map Hz to Y position (higher Hz = higher on screen = lower Y)
  const normalized = (hz - MIN_HZ) / (MAX_HZ - MIN_HZ);
  return height * (1 - normalized);
}
