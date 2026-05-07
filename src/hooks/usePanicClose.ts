import { useEffect, useRef } from 'react';

const TAP_WINDOW_MS = 600;
const TAP_COUNT = 3;
const TOP_RIGHT_FRACTION = 0.18; // top 18% × right 18% of viewport

export interface PanicCloseOptions {
  enabled: boolean;
  onPanic: () => void;
}

export function usePanicClose({ enabled, onPanic }: PanicCloseOptions) {
  const taps = useRef<number[]>([]);
  const onPanicRef = useRef(onPanic);

  useEffect(() => {
    onPanicRef.current = onPanic;
  }, [onPanic]);

  useEffect(() => {
    if (!enabled) return;

    function handler(e: PointerEvent | MouseEvent) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const inTopRight =
        e.clientX >= w * (1 - TOP_RIGHT_FRACTION) &&
        e.clientY <= h * TOP_RIGHT_FRACTION;
      if (!inTopRight) {
        taps.current = [];
        return;
      }
      const now = Date.now();
      taps.current = taps.current.filter((t) => now - t <= TAP_WINDOW_MS);
      taps.current.push(now);
      if (taps.current.length >= TAP_COUNT) {
        taps.current = [];
        onPanicRef.current();
      }
    }

    window.addEventListener('pointerdown', handler);
    return () => window.removeEventListener('pointerdown', handler);
  }, [enabled]);
}
