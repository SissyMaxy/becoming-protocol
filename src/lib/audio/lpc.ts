/**
 * Linear-predictive coding (Burg's algorithm) + LPC polynomial root
 * extraction (Durand-Kerner) for formant frequency estimation.
 *
 * Why Burg over autocorrelation: Burg minimizes forward + backward
 * prediction error simultaneously, giving more stable LPC coefficients
 * for the short windows we use (25ms / 400 samples @ 16kHz).
 *
 * Why Durand-Kerner over Bairstow: simpler to code, converges reliably
 * for LPC polynomials of order 12-18, doesn't need careful deflation.
 *
 * For a 16kHz signal, LPC order ≈ 2 + sampleRate/1000 = 18 is the
 * textbook recommendation, but order 14 gives cleaner formant pairs
 * for adult speech (less spurious peaks). We use 14 as the default.
 */

/**
 * Burg's algorithm — returns LPC coefficients [1, a_1, a_2, ..., a_p]
 * such that x[n] ≈ -Σ a_k x[n-k]. The polynomial whose roots we want
 * is 1 + a_1 z^-1 + a_2 z^-2 + ... + a_p z^-p (i.e. these same coefficients).
 */
export function burgLpc(x: Float32Array, order: number): Float64Array {
  const n = x.length;
  const a = new Float64Array(order + 1);
  a[0] = 1;

  const f = new Float64Array(n);
  const b = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    f[i] = x[i];
    b[i] = x[i];
  }

  let Dk = 0;
  for (let j = 0; j < n; j++) Dk += 2 * f[j] * f[j];
  Dk -= f[0] * f[0] + b[n - 1] * b[n - 1];
  if (Dk <= 0) return a;

  const aTmp = new Float64Array(order + 1);
  for (let k = 0; k < order; k++) {
    // Reflection coefficient
    let mu = 0;
    for (let j = 0; j < n - k - 1; j++) mu += f[j + k + 1] * b[j];
    mu = (-2 * mu) / Dk;

    // Update polynomial: a_new[i] = a[i] + mu * conj(a[k+1-i])
    for (let i = 0; i <= k + 1; i++) {
      aTmp[i] = a[i] + mu * a[k + 1 - i];
    }
    for (let i = 0; i <= k + 1; i++) a[i] = aTmp[i];

    // Update forward + backward prediction errors
    for (let j = 0; j < n - k - 1; j++) {
      const fj = f[j + k + 1];
      const bj = b[j];
      f[j + k + 1] = fj + mu * bj;
      b[j] = bj + mu * fj;
    }

    Dk = (1 - mu * mu) * Dk - f[k + 1] * f[k + 1] - b[n - k - 2] * b[n - k - 2];
    if (Dk <= 0) break;
  }
  return a;
}

interface Complex {
  re: number;
  im: number;
}

function cAdd(a: Complex, b: Complex): Complex { return { re: a.re + b.re, im: a.im + b.im }; }
function cSub(a: Complex, b: Complex): Complex { return { re: a.re - b.re, im: a.im - b.im }; }
function cMul(a: Complex, b: Complex): Complex {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}
function cDiv(a: Complex, b: Complex): Complex {
  const denom = b.re * b.re + b.im * b.im;
  return {
    re: (a.re * b.re + a.im * b.im) / denom,
    im: (a.im * b.re - a.re * b.im) / denom,
  };
}

/**
 * Durand-Kerner root finding for a real-coefficient polynomial given as
 * [a_0, a_1, ..., a_p] meaning a_0 + a_1 x + ... + a_p x^p.
 * Returns p complex roots.
 *
 * Note: LPC convention puts coefficients in DECREASING power order
 * (a[0]=1 is the leading coefficient of z^p, etc.). The caller should
 * pass the LPC array as-is; we adapt by reversing internally.
 */
export function polyRootsLpc(lpc: Float64Array, maxIter = 80, tol = 1e-9): Complex[] {
  const p = lpc.length - 1;
  // Reverse so that index i corresponds to coefficient of x^i.
  // LPC a[0..p] in z^-i form: z^p polynomial is z^p + a_1 z^(p-1) + ... + a_p.
  // We want to find roots of P(z) = sum_{i=0..p} a[i] z^(p-i).
  // Equivalently: coefficient of x^i (ascending) = a[p - i].
  const c: number[] = new Array(p + 1);
  for (let i = 0; i <= p; i++) c[i] = lpc[p - i];

  // Initial guesses: roots of unity scaled by 0.4
  const roots: Complex[] = new Array(p);
  for (let i = 0; i < p; i++) {
    const angle = (2 * Math.PI * i) / p + 0.4;
    roots[i] = { re: 0.4 * Math.cos(angle), im: 0.4 * Math.sin(angle) };
  }

  for (let iter = 0; iter < maxIter; iter++) {
    let maxDelta = 0;
    for (let i = 0; i < p; i++) {
      // Evaluate polynomial at roots[i]
      let pi: Complex = { re: c[p], im: 0 };
      for (let k = p - 1; k >= 0; k--) {
        pi = cAdd(cMul(pi, roots[i]), { re: c[k], im: 0 });
      }
      // Denominator: product of (roots[i] - roots[j]) for j != i
      let denom: Complex = { re: 1, im: 0 };
      for (let j = 0; j < p; j++) {
        if (j === i) continue;
        denom = cMul(denom, cSub(roots[i], roots[j]));
      }
      const step = cDiv(pi, denom);
      roots[i] = cSub(roots[i], step);
      const delta = Math.abs(step.re) + Math.abs(step.im);
      if (delta > maxDelta) maxDelta = delta;
    }
    if (maxDelta < tol) break;
  }
  return roots;
}

export interface FormantPick {
  frequencyHz: number;
  bandwidthHz: number;
}

/**
 * Convert a single root z = r·exp(jθ) into (frequency, bandwidth).
 *   frequency = θ · (Fs / 2π)
 *   bandwidth = -ln(|z|) · (Fs / π)
 * Discards roots that don't represent formants (bandwidth too wide,
 * frequency too low, or negative imaginary — only keep one of each
 * conjugate pair).
 */
export function rootsToFormants(roots: Complex[], sampleRate: number): FormantPick[] {
  const picks: FormantPick[] = [];
  for (const r of roots) {
    if (r.im <= 0) continue; // only positive-imag pairs
    const radius = Math.sqrt(r.re * r.re + r.im * r.im);
    if (radius >= 0.999 || radius < 0.5) continue;
    const angle = Math.atan2(r.im, r.re);
    const freq = (angle * sampleRate) / (2 * Math.PI);
    const bw = (-Math.log(radius) * sampleRate) / Math.PI;
    if (freq < 90 || freq > 5500) continue;
    if (bw > 600) continue; // too wide to be a real formant
    picks.push({ frequencyHz: freq, bandwidthHz: bw });
  }
  picks.sort((a, b) => a.frequencyHz - b.frequencyHz);
  return picks;
}

/**
 * Apply pre-emphasis (high-pass: y[n] = x[n] - α x[n-1], α=0.97).
 * Boosts higher formants relative to the spectral tilt of glottal source.
 */
export function preEmphasize(x: Float32Array, alpha = 0.97): Float32Array {
  const out = new Float32Array(x.length);
  out[0] = x[0];
  for (let i = 1; i < x.length; i++) out[i] = x[i] - alpha * x[i - 1];
  return out;
}

/** Hamming window in-place. */
export function hammingWindow(x: Float32Array): Float32Array {
  const n = x.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = x[i] * (0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  return out;
}

/**
 * Extract formants F1/F2/F3 for a single short frame (~25ms).
 * Returns nulls when LPC fails or no formants survive the filters.
 */
export function frameFormants(
  frame: Float32Array,
  sampleRate: number,
  order = 14,
): { f1: number | null; f2: number | null; f3: number | null } {
  const pre = preEmphasize(frame);
  const windowed = hammingWindow(pre);
  const lpc = burgLpc(windowed, order);
  const roots = polyRootsLpc(lpc);
  const formants = rootsToFormants(roots, sampleRate);
  return {
    f1: formants[0]?.frequencyHz ?? null,
    f2: formants[1]?.frequencyHz ?? null,
    f3: formants[2]?.frequencyHz ?? null,
  };
}
