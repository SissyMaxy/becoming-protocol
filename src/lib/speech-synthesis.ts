/**
 * Browser Speech Synthesis Wrapper
 *
 * Provides TTS for sleep content affirmations.
 * Handles async voice loading, feminine voice selection,
 * and utterance lifecycle management.
 */

export interface SpeechConfig {
  pitch: number;   // 0-2, default 1.1
  rate: number;    // 0.1-10, default 0.75
  volume: number;  // 0-1
  voiceName?: string | null;
}

/** Check if browser supports Speech Synthesis */
export function isSpeechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * Get available voices. Handles Chrome's async voice loading
 * by waiting for the voiceschanged event with a timeout.
 */
export function getVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!isSpeechAvailable()) {
      resolve([]);
      return;
    }

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices);
      return;
    }

    // Chrome loads voices asynchronously
    const timeout = setTimeout(() => {
      resolve(window.speechSynthesis.getVoices());
    }, 2000);

    window.speechSynthesis.addEventListener('voiceschanged', () => {
      clearTimeout(timeout);
      resolve(window.speechSynthesis.getVoices());
    }, { once: true });
  });
}

/** Known feminine voice name fragments (case-insensitive match) */
const FEMININE_VOICE_HINTS = [
  'female', 'woman', 'samantha', 'zira', 'hazel', 'susan',
  'karen', 'moira', 'tessa', 'fiona', 'victoria', 'allison',
  'ava', 'google uk english female', 'google us english',
  'microsoft zira', 'microsoft hazel',
];

/**
 * Select the best feminine English voice from available voices.
 * If a preferred voice name is provided, try to match it first.
 */
export function selectFeminineVoice(
  voices: SpeechSynthesisVoice[],
  preferred?: string | null,
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;

  // Try preferred voice first
  if (preferred) {
    const match = voices.find(v => v.name === preferred);
    if (match) return match;
  }

  // Filter to English voices
  const englishVoices = voices.filter(v => v.lang.startsWith('en'));
  const searchPool = englishVoices.length > 0 ? englishVoices : voices;

  // Score voices by feminine hints
  let bestVoice: SpeechSynthesisVoice | null = null;
  let bestScore = -1;

  for (const voice of searchPool) {
    const nameLower = voice.name.toLowerCase();
    let score = 0;

    for (const hint of FEMININE_VOICE_HINTS) {
      if (nameLower.includes(hint)) {
        score += 2;
      }
    }

    // Prefer local voices over remote
    if (!voice.localService) score -= 1;

    // Prefer en-US and en-GB
    if (voice.lang === 'en-US' || voice.lang === 'en-GB') score += 1;

    if (score > bestScore) {
      bestScore = score;
      bestVoice = voice;
    }
  }

  return bestVoice || searchPool[0] || null;
}

/**
 * Speak a single affirmation. Returns a promise that resolves
 * when the utterance finishes (or rejects on error/cancel).
 */
export function speakAffirmation(
  text: string,
  config: SpeechConfig,
  voice?: SpeechSynthesisVoice | null,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!isSpeechAvailable()) {
      resolve();
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = config.pitch;
    utterance.rate = config.rate;
    utterance.volume = config.volume;

    if (voice) {
      utterance.voice = voice;
    }

    utterance.onend = () => resolve();
    utterance.onerror = (event) => {
      // 'canceled' is expected when we stop playback
      if (event.error === 'canceled' || event.error === 'interrupted') {
        resolve();
      } else {
        reject(new Error(`Speech error: ${event.error}`));
      }
    };

    window.speechSynthesis.speak(utterance);
  });
}

/** Stop all current and queued speech */
export function stopSpeech(): void {
  if (isSpeechAvailable()) {
    window.speechSynthesis.cancel();
  }
}
