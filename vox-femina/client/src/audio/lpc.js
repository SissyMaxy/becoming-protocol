/**
 * LPC (Linear Predictive Coding) — Formant estimation for voice analysis
 *
 * Pipeline:
 *   1. Pre-emphasis filter (boost high frequencies)
 *   2. Hamming window (reduce spectral leakage)
 *   3. Autocorrelation
 *   4. Levinson-Durbin recursion → LPC coefficients
 *   5. Evaluate LPC filter frequency response → smooth spectral envelope
 *   6. Peak-pick on the envelope → formant frequencies
 *
 * Uses the spectral evaluation approach rather than polynomial root finding,
 * which is simpler and robust enough for voice training purposes.
 */

/**
 * Apply pre-emphasis high-pass filter to boost high frequencies.
 * y[n] = x[n] - coeff * x[n-1]
 *
 * @param {Float32Array} samples — input signal
 * @param {number} [coeff=0.97] — pre-emphasis coefficient
 * @returns {Float32Array} — filtered signal
 */
export function preEmphasis(samples, coeff = 0.97) {
  const out = new Float32Array(samples.length);
  out[0] = samples[0];
  for (let i = 1; i < samples.length; i++) {
    out[i] = samples[i] - coeff * samples[i - 1];
  }
  return out;
}

/**
 * Apply Hamming window to samples.
 * w[n] = 0.54 - 0.46 * cos(2π * n / (N-1))
 *
 * @param {Float32Array} samples — input signal
 * @returns {Float32Array} — windowed signal
 */
export function hammingWindow(samples) {
  const N = samples.length;
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (N - 1));
    out[i] = samples[i] * w;
  }
  return out;
}

/**
 * Compute autocorrelation of a signal for lags 0..order.
 *
 * @param {Float32Array} samples — input signal
 * @param {number} order — max lag (LPC order)
 * @returns {Float64Array} — autocorrelation values R[0]..R[order]
 */
export function autocorrelation(samples, order) {
  const R = new Float64Array(order + 1);
  const N = samples.length;

  for (let lag = 0; lag <= order; lag++) {
    let sum = 0;
    for (let i = 0; i < N - lag; i++) {
      sum += samples[i] * samples[i + lag];
    }
    R[lag] = sum;
  }

  return R;
}

/**
 * Levinson-Durbin recursion to solve for LPC coefficients.
 *
 * Given autocorrelation R[0..order], produces LPC coefficients a[1..order]
 * such that the all-pole model 1/A(z) approximates the signal's spectrum.
 *
 * @param {Float64Array} R — autocorrelation values R[0]..R[order]
 * @param {number} order — LPC order
 * @returns {{ coefficients: Float64Array, error: number }}
 *   coefficients: a[0..order] where a[0]=1 (the "1" in 1 + a1*z^-1 + ...)
 *   error: prediction error energy
 */
export function levinsonDurbin(R, order) {
  const a = new Float64Array(order + 1);
  const aPrev = new Float64Array(order + 1);
  a[0] = 1.0;

  let E = R[0]; // Prediction error

  if (E === 0) {
    return { coefficients: a, error: 0 };
  }

  for (let i = 1; i <= order; i++) {
    // Compute reflection coefficient
    let lambda = 0;
    for (let j = 1; j < i; j++) {
      lambda += aPrev[j] * R[i - j];
    }
    lambda = (R[i] - lambda) / E;

    // Update coefficients
    a[i] = lambda;
    for (let j = 1; j < i; j++) {
      a[j] = aPrev[j] - lambda * aPrev[i - j];
    }

    // Update error
    E = E * (1 - lambda * lambda);

    // Guard against numerical instability
    if (E <= 0) {
      E = 1e-10;
    }

    // Copy for next iteration
    for (let j = 0; j <= i; j++) {
      aPrev[j] = a[j];
    }
  }

  return { coefficients: a, error: E };
}

/**
 * Evaluate the LPC filter's frequency response (magnitude spectrum).
 *
 * H(f) = 1 / |A(e^(j*2π*f/fs))|
 *
 * where A(z) = 1 - a[1]*z^-1 - a[2]*z^-2 - ... - a[p]*z^-p
 *
 * Note: Levinson-Durbin convention has a[0]=1 and the filter is:
 *   A(z) = a[0] - a[1]*z^-1 - a[2]*z^-2 - ...
 * But we store the "negated" form from the recursion, so we compute:
 *   A(e^jw) = sum_{k=0}^{p} a[k] * e^{-jwk}
 *
 * @param {Float64Array} coefficients — LPC coefficients from levinsonDurbin
 * @param {number} numPoints — number of frequency points to evaluate
 * @param {number} sampleRate — audio sample rate
 * @returns {{ magnitudes: Float64Array, frequencies: Float64Array }}
 */
export function lpcSpectrum(coefficients, numPoints, sampleRate) {
  const magnitudes = new Float64Array(numPoints);
  const frequencies = new Float64Array(numPoints);
  const order = coefficients.length - 1;

  for (let i = 0; i < numPoints; i++) {
    const freq = (i / numPoints) * (sampleRate / 2);
    frequencies[i] = freq;

    const omega = (2 * Math.PI * freq) / sampleRate;

    // Evaluate A(e^{jω}) = Σ a[k] * e^{-jωk}
    let realPart = 0;
    let imagPart = 0;

    for (let k = 0; k <= order; k++) {
      realPart += coefficients[k] * Math.cos(-omega * k);
      imagPart += coefficients[k] * Math.sin(-omega * k);
    }

    // |A(e^{jω})|² = real² + imag²
    const magSq = realPart * realPart + imagPart * imagPart;

    // H(f) = 1 / |A(e^{jω})|, in dB
    magnitudes[i] = magSq > 0 ? -10 * Math.log10(magSq) : 0;
  }

  return { magnitudes, frequencies };
}

/**
 * Find formant frequencies by peak-picking on the LPC magnitude spectrum.
 *
 * Formants are the peaks in the LPC spectral envelope. We find local maxima
 * that fall within expected formant frequency ranges.
 *
 * @param {Float64Array} magnitudes — LPC magnitude spectrum (dB)
 * @param {Float64Array} frequencies — corresponding frequency values
 * @param {number} sampleRate — audio sample rate
 * @returns {{ f1: number|null, f2: number|null, f3: number|null, peaks: Array<{freq: number, mag: number}> }}
 */
export function findFormants(magnitudes, frequencies, _sampleRate) {
  // Find all local maxima
  const peaks = [];
  for (let i = 1; i < magnitudes.length - 1; i++) {
    if (magnitudes[i] > magnitudes[i - 1] && magnitudes[i] > magnitudes[i + 1]) {
      // Require peak to be at least 3 dB above neighbors (significant peak)
      const minNeighbor = Math.min(magnitudes[i - 1], magnitudes[i + 1]);
      if (magnitudes[i] - minNeighbor >= 2) {
        peaks.push({ freq: frequencies[i], mag: magnitudes[i] });
      }
    }
  }

  // Sort peaks by frequency
  peaks.sort((a, b) => a.freq - b.freq);

  // Expected formant ranges
  const F1_RANGE = [200, 1000];
  const F2_RANGE = [800, 2800];
  const F3_RANGE = [1800, 3500];

  // Select the strongest peak in each range
  // For overlapping ranges, assign greedily from F1 upward
  let f1 = null;
  let f2 = null;
  let f3 = null;

  const usedPeaks = new Set();

  // Find F1: strongest peak in [200, 1000]
  let bestF1 = null;
  for (let i = 0; i < peaks.length; i++) {
    if (peaks[i].freq >= F1_RANGE[0] && peaks[i].freq <= F1_RANGE[1]) {
      if (bestF1 === null || peaks[i].mag > bestF1.mag) {
        bestF1 = { ...peaks[i], idx: i };
      }
    }
  }
  if (bestF1) {
    f1 = bestF1.freq;
    usedPeaks.add(bestF1.idx);
  }

  // Find F2: strongest peak in [800, 2800] that's above F1
  let bestF2 = null;
  for (let i = 0; i < peaks.length; i++) {
    if (usedPeaks.has(i)) continue;
    if (peaks[i].freq >= F2_RANGE[0] && peaks[i].freq <= F2_RANGE[1]) {
      if (f1 !== null && peaks[i].freq <= f1) continue; // Must be above F1
      if (bestF2 === null || peaks[i].mag > bestF2.mag) {
        bestF2 = { ...peaks[i], idx: i };
      }
    }
  }
  if (bestF2) {
    f2 = bestF2.freq;
    usedPeaks.add(bestF2.idx);
  }

  // Find F3: strongest peak in [1800, 3500] that's above F2
  let bestF3 = null;
  for (let i = 0; i < peaks.length; i++) {
    if (usedPeaks.has(i)) continue;
    if (peaks[i].freq >= F3_RANGE[0] && peaks[i].freq <= F3_RANGE[1]) {
      if (f2 !== null && peaks[i].freq <= f2) continue; // Must be above F2
      if (bestF3 === null || peaks[i].mag > bestF3.mag) {
        bestF3 = { ...peaks[i], idx: i };
      }
    }
  }
  if (bestF3) {
    f3 = bestF3.freq;
  }

  return { f1, f2, f3, peaks };
}

/**
 * Full LPC analysis pipeline: pre-emphasis → window → autocorrelation →
 * Levinson-Durbin → spectral evaluation → formant extraction.
 *
 * @param {Float32Array} samples — raw time-domain audio samples
 * @param {number} sampleRate — audio sample rate
 * @param {number} [order] — LPC order (default: sampleRate/1000 + 2)
 * @returns {{ f1: number|null, f2: number|null, f3: number|null, coefficients: Float64Array, error: number }}
 */
export function analyzeLPC(samples, sampleRate, order) {
  if (!order) {
    order = Math.round(sampleRate / 1000) + 2; // ~46 for 44100, but cap it
    order = Math.min(order, 16); // Cap at 16 — higher orders can be unstable
  }

  // Step 1: Pre-emphasis
  const emphasized = preEmphasis(samples, 0.97);

  // Step 2: Hamming window
  const windowed = hammingWindow(emphasized);

  // Step 3: Autocorrelation
  const R = autocorrelation(windowed, order);

  // Guard: if R[0] is essentially zero, signal is silence
  if (R[0] < 1e-10) {
    return { f1: null, f2: null, f3: null, coefficients: new Float64Array(0), error: 0 };
  }

  // Step 4: Levinson-Durbin
  const { coefficients, error } = levinsonDurbin(R, order);

  // Step 5: Evaluate LPC spectrum (512 points covers 0 to Nyquist)
  const numPoints = 512;
  const { magnitudes, frequencies } = lpcSpectrum(coefficients, numPoints, sampleRate);

  // Step 6: Find formants
  const { f1, f2, f3 } = findFormants(magnitudes, frequencies, sampleRate);

  return { f1, f2, f3, coefficients, error };
}
