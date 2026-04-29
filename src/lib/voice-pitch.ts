/**
 * Voice pitch detection — YIN algorithm (de Cheveigné & Kawahara 2002).
 *
 * Resists the octave-error and subharmonic-locking failure modes of plain
 * peak-picking autocorrelation. Used for live pitch tracking during voice
 * practice and voice-journal recordings.
 */

/**
 * Estimate fundamental frequency in Hz from a time-domain audio buffer.
 * Returns -1 when the buffer is too quiet or too noisy to confidently pitch.
 */
export function estimatePitchHz(buffer: Float32Array, sampleRate: number): number {
  const MIN_HZ = 75;
  const MAX_HZ = 500;
  const YIN_THRESHOLD = 0.15;

  let rms = 0;
  for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 0.01) return -1;

  const tauMin = Math.max(2, Math.floor(sampleRate / MAX_HZ));
  const tauMax = Math.min(buffer.length >> 1, Math.floor(sampleRate / MIN_HZ));
  if (tauMax <= tauMin) return -1;

  const yinBuf = new Float32Array(tauMax + 1);
  yinBuf[0] = 1;
  let runningSum = 0;

  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < tauMax; i++) {
      const delta = buffer[i] - buffer[i + tau];
      sum += delta * delta;
    }
    runningSum += sum;
    yinBuf[tau] = runningSum > 0 ? (sum * tau) / runningSum : 1;
  }

  let tauEstimate = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (yinBuf[tau] < YIN_THRESHOLD) {
      while (tau + 1 <= tauMax && yinBuf[tau + 1] < yinBuf[tau]) tau++;
      tauEstimate = tau;
      break;
    }
  }
  if (tauEstimate === -1) return -1;

  const x0 = tauEstimate > 0 ? yinBuf[tauEstimate - 1] : yinBuf[tauEstimate];
  const x1 = yinBuf[tauEstimate];
  const x2 = tauEstimate < tauMax ? yinBuf[tauEstimate + 1] : yinBuf[tauEstimate];
  const denom = x0 + x2 - 2 * x1;
  const refinedTau = Math.abs(denom) < 1e-10 ? tauEstimate : tauEstimate + (x0 - x2) / (2 * denom);

  return sampleRate / refinedTau;
}
