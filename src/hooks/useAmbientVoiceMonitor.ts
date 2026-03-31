/**
 * useAmbientVoiceMonitor — P10.3
 *
 * Passive pitch tracking throughout the day when app is in foreground.
 * Every 5 minutes, captures 10 seconds of audio, runs pitch detection,
 * and records the Hz value to voice_pitch_samples with context='ambient'.
 *
 * Privacy: never records audio content, only numeric Hz value.
 * Opt-out via user_state.ambient_voice_enabled flag.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { recordPitchSample } from '../lib/voice/pitch-tracker';

const SAMPLE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const CAPTURE_DURATION_MS = 10 * 1000;     // 10 seconds
const MIN_VOICE_HZ = 80;
const MAX_VOICE_HZ = 400;

interface UseAmbientVoiceMonitorReturn {
  isActive: boolean;
  lastPitchHz: number | null;
  sampleCount: number;
  error: string | null;
}

/**
 * Autocorrelation-based pitch detection.
 * Returns fundamental frequency in Hz, or null if no voice detected.
 */
function detectPitch(audioBuffer: Float32Array, sampleRate: number): number | null {
  const SIZE = audioBuffer.length;
  const MAX_SAMPLES = Math.floor(SIZE / 2);

  // Check for silence — skip if RMS is too low
  let rms = 0;
  for (let i = 0; i < SIZE; i++) {
    rms += audioBuffer[i] * audioBuffer[i];
  }
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return null; // Silence threshold

  let bestOffset = -1;
  let bestCorrelation = 0;
  let foundGoodCorrelation = false;

  for (let offset = 50; offset < MAX_SAMPLES; offset++) {
    let correlation = 0;
    for (let i = 0; i < MAX_SAMPLES; i++) {
      correlation += Math.abs(audioBuffer[i] - audioBuffer[i + offset]);
    }
    correlation = 1 - correlation / MAX_SAMPLES;

    if (correlation > 0.9 && correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestOffset = offset;
      foundGoodCorrelation = true;
    }
  }

  if (!foundGoodCorrelation || bestOffset === -1) return null;

  const frequency = sampleRate / bestOffset;
  // Only return if in voice range
  return frequency >= MIN_VOICE_HZ && frequency <= MAX_VOICE_HZ ? frequency : null;
}

export function useAmbientVoiceMonitor(): UseAmbientVoiceMonitorReturn {
  const { user } = useAuth();
  const [isActive, setIsActive] = useState(false);
  const [lastPitchHz, setLastPitchHz] = useState<number | null>(null);
  const [sampleCount, setSampleCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const enabledRef = useRef(true);
  const activeCapture = useRef(false);

  // Check if ambient monitoring is enabled in user_state
  useEffect(() => {
    if (!user) return;

    const checkEnabled = async () => {
      const { data } = await supabase
        .from('user_state')
        .select('ambient_voice_enabled')
        .eq('user_id', user.id)
        .maybeSingle();

      // Default to enabled if column doesn't exist or is null
      const enabled = data?.ambient_voice_enabled !== false;
      enabledRef.current = enabled;

      if (!enabled) {
        cleanup();
      }
    };

    checkEnabled();
  }, [user]);

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    setIsActive(false);
  }, []);

  // Capture and analyze a single sample
  const captureSample = useCallback(async () => {
    if (!user || !enabledRef.current || activeCapture.current) return;
    if (document.hidden) return; // Only when app is visible

    activeCapture.current = true;

    try {
      // Get or reuse microphone stream
      if (!streamRef.current || !streamRef.current.active) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      }

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(streamRef.current);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 4096;
      source.connect(analyser);

      // Wait for capture duration
      await new Promise((resolve) => setTimeout(resolve, CAPTURE_DURATION_MS));

      // Get time-domain data
      const buffer = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(buffer);

      // Clean up audio context
      source.disconnect();
      await audioContext.close();

      // Detect pitch
      const pitchHz = detectPitch(buffer, audioContext.sampleRate);

      if (pitchHz != null) {
        const rounded = Math.round(pitchHz * 10) / 10;
        setLastPitchHz(rounded);
        setSampleCount((c) => c + 1);

        // Record to database
        await recordPitchSample(user.id, rounded, 'ambient');
      }
    } catch (err) {
      // Microphone access denied or unavailable — disable silently
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError('microphone_denied');
        cleanup();
        return;
      }
      console.error('[ambient-voice] capture error:', err);
    } finally {
      activeCapture.current = false;
    }
  }, [user, cleanup]);

  // Start/stop monitoring based on user and enabled state
  useEffect(() => {
    if (!user || !enabledRef.current) return;

    // Check for Web Audio API support
    if (typeof AudioContext === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('unsupported');
      return;
    }

    setIsActive(true);

    // Take first sample after a short delay (don't sample on mount)
    const initialDelay = setTimeout(() => {
      captureSample();
    }, 30_000); // 30 seconds after mount

    // Then sample every 5 minutes
    intervalRef.current = setInterval(captureSample, SAMPLE_INTERVAL_MS);

    // Pause when tab is hidden, resume when visible
    const handleVisibility = () => {
      if (document.hidden) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } else {
        if (!intervalRef.current && enabledRef.current) {
          intervalRef.current = setInterval(captureSample, SAMPLE_INTERVAL_MS);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearTimeout(initialDelay);
      cleanup();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user, captureSample, cleanup]);

  return {
    isActive,
    lastPitchHz,
    sampleCount,
    error,
  };
}
