/**
 * useBinauralBeat — Client-side binaural beat mixing via Web Audio API.
 *
 * Overlays a binaural beat (stereo-panned oscillators) on top of any
 * HTMLAudioElement. Left ear gets base frequency (200 Hz), right ear gets
 * base + beat frequency (e.g. 206 Hz for 6 Hz theta).
 *
 * AudioContext is created lazily on first play (browser autoplay policy).
 * Oscillators are cleaned up on stop/unmount.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

// ============================================
// FREQUENCY PRESETS
// ============================================

export type BinauralPreset = 'alpha' | 'theta' | 'delta';

export const BINAURAL_PRESETS: Record<BinauralPreset, number> = {
  alpha: 10,  // 10 Hz — relaxed focus
  theta: 6,   // 6 Hz — deep trance / meditation
  delta: 2,   // 2 Hz — deep sleep
};

const BASE_FREQUENCY = 200; // Hz — carrier tone
const DEFAULT_GAIN = 0.15;  // 15% volume

// ============================================
// HOOK
// ============================================

export interface UseBinauralBeatReturn {
  isActive: boolean;
  frequency: number;
  toggle: () => void;
  start: (audioElement: HTMLAudioElement) => void;
  stop: () => void;
}

export function useBinauralBeat(
  beatFrequency: number = BINAURAL_PRESETS.theta,
): UseBinauralBeatReturn {
  const [isActive, setIsActive] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const leftOscRef = useRef<OscillatorNode | null>(null);
  const rightOscRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const connectedElementRef = useRef<HTMLAudioElement | null>(null);

  const stopOscillators = useCallback(() => {
    try { leftOscRef.current?.stop(); } catch { /* already stopped */ }
    try { rightOscRef.current?.stop(); } catch { /* already stopped */ }
    leftOscRef.current = null;
    rightOscRef.current = null;
  }, []);

  const stop = useCallback(() => {
    stopOscillators();
    setIsActive(false);
  }, [stopOscillators]);

  const start = useCallback((audioElement: HTMLAudioElement) => {
    // Create AudioContext on first user gesture (browser policy)
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    const ctx = audioContextRef.current;

    // Resume if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    // Connect the audio element to the AudioContext once
    if (connectedElementRef.current !== audioElement) {
      try {
        sourceRef.current = ctx.createMediaElementSource(audioElement);
        sourceRef.current.connect(ctx.destination);
        connectedElementRef.current = audioElement;
      } catch {
        // Element may already be connected — that's fine
      }
    }

    // Stop existing oscillators before creating new ones
    stopOscillators();

    // Create oscillators
    const leftOsc = ctx.createOscillator();
    const rightOsc = ctx.createOscillator();
    leftOsc.type = 'sine';
    rightOsc.type = 'sine';
    leftOsc.frequency.value = BASE_FREQUENCY;
    rightOsc.frequency.value = BASE_FREQUENCY + beatFrequency;

    // Gain control
    const oscGain = ctx.createGain();
    oscGain.gain.value = DEFAULT_GAIN;
    gainRef.current = oscGain;

    // Stereo panning — left ear / right ear
    const leftPanner = ctx.createStereoPanner();
    leftPanner.pan.value = -1;
    const rightPanner = ctx.createStereoPanner();
    rightPanner.pan.value = 1;

    // Route: osc -> panner -> gain -> destination
    leftOsc.connect(leftPanner).connect(oscGain);
    rightOsc.connect(rightPanner).connect(oscGain);
    oscGain.connect(ctx.destination);

    leftOsc.start();
    rightOsc.start();

    leftOscRef.current = leftOsc;
    rightOscRef.current = rightOsc;

    setIsActive(true);
  }, [beatFrequency, stopOscillators]);

  const toggle = useCallback(() => {
    if (isActive) {
      stop();
    } else if (connectedElementRef.current) {
      start(connectedElementRef.current);
    }
  }, [isActive, start, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopOscillators();
      // Close AudioContext
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [stopOscillators]);

  return {
    isActive,
    frequency: beatFrequency,
    toggle,
    start,
    stop,
  };
}
