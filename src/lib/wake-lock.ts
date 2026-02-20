/**
 * Screen Wake Lock Wrapper
 *
 * Prevents the phone screen from sleeping during sleep content playback.
 * Uses the Wake Lock API with feature detection and error handling.
 */

/** Request a screen wake lock. Returns null if unsupported or denied. */
export async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  try {
    if (!('wakeLock' in navigator)) return null;
    return await navigator.wakeLock.request('screen');
  } catch {
    // Permission denied or not supported in this context
    return null;
  }
}

/** Release an active wake lock sentinel. */
export async function releaseWakeLock(sentinel: WakeLockSentinel | null): Promise<void> {
  if (!sentinel) return;
  try {
    await sentinel.release();
  } catch {
    // Already released or invalid
  }
}
