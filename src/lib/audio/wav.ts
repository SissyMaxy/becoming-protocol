/**
 * Minimal WAV codec — only the subset the voice analyzer cares about:
 * PCM, mono, 16-bit or 32-bit float. The browser-side recorder converts
 * MediaRecorder webm into a 16kHz mono 16-bit PCM WAV before upload,
 * and the server reads that buffer directly. No external dependencies.
 */

export interface WavData {
  sampleRate: number;
  samples: Float32Array;
}

/** Decode a minimal WAV (PCM 16-bit or float 32-bit, mono) from a Buffer/Uint8Array. */
export function decodeWav(input: Uint8Array | ArrayBuffer): WavData {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

  // Header: "RIFF" .... "WAVE"
  if (view.getUint32(0, false) !== 0x52494646) throw new Error('Not a RIFF file');
  if (view.getUint32(8, false) !== 0x57415645) throw new Error('Not a WAVE file');

  let offset = 12;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let numChannels = 0;
  let audioFormat = 0;
  let dataOffset = -1;
  let dataLength = 0;

  while (offset + 8 <= u8.byteLength) {
    const chunkId = view.getUint32(offset, false);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === 0x666d7420 /* "fmt " */) {
      audioFormat = view.getUint16(offset + 8, true);
      numChannels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    } else if (chunkId === 0x64617461 /* "data" */) {
      dataOffset = offset + 8;
      dataLength = chunkSize;
      break;
    }
    offset += 8 + chunkSize + (chunkSize & 1);
  }
  if (dataOffset < 0) throw new Error('WAV missing data chunk');
  if (numChannels !== 1) throw new Error(`WAV must be mono, got ${numChannels} channels`);

  const samples = new Float32Array(dataLength / (bitsPerSample / 8));
  if (audioFormat === 1 && bitsPerSample === 16) {
    for (let i = 0; i < samples.length; i++) {
      samples[i] = view.getInt16(dataOffset + i * 2, true) / 32768;
    }
  } else if (audioFormat === 3 && bitsPerSample === 32) {
    for (let i = 0; i < samples.length; i++) {
      samples[i] = view.getFloat32(dataOffset + i * 4, true);
    }
  } else if (audioFormat === 1 && bitsPerSample === 32) {
    for (let i = 0; i < samples.length; i++) {
      samples[i] = view.getInt32(dataOffset + i * 4, true) / 2147483648;
    }
  } else {
    throw new Error(`Unsupported WAV format ${audioFormat}/${bitsPerSample}bit`);
  }

  return { sampleRate, samples };
}

/** Encode mono float samples as 16-bit PCM WAV. Returns the byte buffer. */
export function encodeWav16(samples: Float32Array, sampleRate: number): Uint8Array {
  const byteLength = 44 + samples.length * 2;
  const out = new Uint8Array(byteLength);
  const view = new DataView(out.buffer);

  // RIFF header
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, byteLength - 8, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"
  // fmt chunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true); // PCM subchunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  // data chunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, samples.length * 2, true);

  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return out;
}

/**
 * Resample a Float32Array using linear interpolation. Adequate for
 * speech analysis (we're not preserving audiophile bandwidth here).
 */
export function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcF = i * ratio;
    const srcI = Math.floor(srcF);
    const frac = srcF - srcI;
    const a = input[srcI] ?? 0;
    const b = input[srcI + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}
