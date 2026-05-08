// Behavior contract for the panic-close hook expressed as a pure
// reducer. Mirrors the logic in src/hooks/usePanicClose.ts so we can
// regression-test edge cases (inside-corner taps, expired window,
// out-of-corner reset) without a full DOM harness.

import { describe, it, expect } from 'vitest';

const TAP_WINDOW_MS = 600;
const TAP_COUNT = 3;
const TOP_RIGHT_FRACTION = 0.18;

function isInTopRight(x: number, y: number, w: number, h: number): boolean {
  return x >= w * (1 - TOP_RIGHT_FRACTION) && y <= h * TOP_RIGHT_FRACTION;
}

interface PanicState {
  taps: number[];
  fired: number;
}

function applyTap(state: PanicState, x: number, y: number, t: number, w: number, h: number): PanicState {
  if (!isInTopRight(x, y, w, h)) {
    return { taps: [], fired: state.fired };
  }
  const recent = state.taps.filter((tt) => t - tt <= TAP_WINDOW_MS);
  recent.push(t);
  if (recent.length >= TAP_COUNT) {
    return { taps: [], fired: state.fired + 1 };
  }
  return { taps: recent, fired: state.fired };
}

describe('panic-close gesture reducer', () => {
  const W = 1000;
  const H = 1000;
  const inCornerX = W - 50;
  const inCornerY = 50;

  it('fires after 3 taps in the top-right within 600ms', () => {
    let s: PanicState = { taps: [], fired: 0 };
    s = applyTap(s, inCornerX, inCornerY, 100, W, H);
    s = applyTap(s, inCornerX, inCornerY, 200, W, H);
    s = applyTap(s, inCornerX, inCornerY, 300, W, H);
    expect(s.fired).toBe(1);
  });

  it('does not fire if 3rd tap exceeds the 600ms window from the 1st', () => {
    let s: PanicState = { taps: [], fired: 0 };
    s = applyTap(s, inCornerX, inCornerY, 0, W, H);
    s = applyTap(s, inCornerX, inCornerY, 300, W, H);
    s = applyTap(s, inCornerX, inCornerY, 700, W, H);
    expect(s.fired).toBe(0);
  });

  it('does not fire on taps outside the top-right corner', () => {
    let s: PanicState = { taps: [], fired: 0 };
    s = applyTap(s, 100, 100, 0, W, H);
    s = applyTap(s, 100, 100, 100, W, H);
    s = applyTap(s, 100, 100, 200, W, H);
    expect(s.fired).toBe(0);
  });

  it('a non-corner tap clears the streak', () => {
    let s: PanicState = { taps: [], fired: 0 };
    s = applyTap(s, inCornerX, inCornerY, 100, W, H);
    s = applyTap(s, inCornerX, inCornerY, 200, W, H);
    s = applyTap(s, 500, 500, 250, W, H);  // off-corner — resets
    s = applyTap(s, inCornerX, inCornerY, 300, W, H);
    expect(s.fired).toBe(0);
  });
});
