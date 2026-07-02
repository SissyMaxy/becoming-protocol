/**
 * SelfEchoPlayer — the two-track "echo chamber" composite, layered client-side.
 *
 * The self-echo composite is NOT a single rendered mp3 (ffmpeg is unavailable on
 * Vercel serverless — see src/lib/conditioning/elevenlabs.ts). Both tracks play
 * layered here, in the browser, via the Web Audio API:
 *
 *   - Mommy render  → full gain, plays once, drives the session length.
 *   - Her own clip  → looped underneath (schedule.loops times) at ~-9dB with a
 *                     gentle fade in/out on every loop, so it sits as a bed the
 *                     Mommy words float over.
 *
 * This is a REAL layered composite — both tracks actually sound at once. The
 * loop/gain/fade math is the pure module src/lib/audio/self-echo-mix.ts, which
 * is unit-tested; this component only wires those numbers into Web Audio nodes.
 *
 * In-flow surface (Mommy presses, doesn't block): no fixed-inset takeover, it
 * renders inside the FocusMode task card like the plain audio player.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSignedAssetUrl } from '../../lib/storage/signed-url';
import { computeLoopSchedule } from '../../lib/audio/self-echo-mix';

interface SelfEchoPlayerProps {
  ownVoicePath: string;
  mommyRenderPath: string;
  loopCount: number;
  /** Snapshotted own-voice duration; only a hint — the decoded buffer wins. */
  ownDurationS?: number | null;
  accent: string;
  border: string;
  /** Fired once the Mommy track finishes (or the user marks complete). */
  onComplete: () => void;
}

type Phase = 'idle' | 'loading' | 'playing' | 'error';

async function fetchAudioBuffer(
  ctx: AudioContext,
  bucket: string,
  path: string,
): Promise<AudioBuffer> {
  const signed = await getSignedAssetUrl(bucket, path, 7200);
  if (!signed) throw new Error('sign_failed');
  const res = await fetch(signed);
  if (!res.ok) throw new Error(`fetch_${res.status}`);
  const bytes = await res.arrayBuffer();
  // decodeAudioData handles mp3 (Mommy render) and webm/opus (her clip).
  return await ctx.decodeAudioData(bytes);
}

export function SelfEchoPlayer({
  ownVoicePath,
  mommyRenderPath,
  loopCount,
  ownDurationS,
  accent,
  border,
  onComplete,
}: SelfEchoPlayerProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0); // 0..1 over the Mommy track

  const ctxRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  const mommyDurationRef = useRef<number>(0);
  const completedRef = useRef(false);

  const teardown = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    for (const src of sourcesRef.current) {
      try { src.stop(); } catch { /* already stopped */ }
    }
    sourcesRef.current = [];
    const ctx = ctxRef.current;
    if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {});
    ctxRef.current = null;
  }, []);

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    teardown();
    onComplete();
  }, [teardown, onComplete]);

  // Cleanup on unmount — never leak an AudioContext or leave the bed sounding.
  useEffect(() => teardown, [teardown]);

  const begin = useCallback(async () => {
    if (phase === 'loading' || phase === 'playing') return;
    setMessage(null);
    setPhase('loading');
    completedRef.current = false;

    // AudioContext must be created on the user gesture (autoplay policy).
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch { /* ignore */ } }

    try {
      const [mommyBuf, ownBuf] = await Promise.all([
        fetchAudioBuffer(ctx, 'audio', mommyRenderPath),
        fetchAudioBuffer(ctx, 'audio', ownVoicePath),
      ]);

      const ownDur = ownBuf.duration > 0 ? ownBuf.duration : (ownDurationS ?? 0);
      const schedule = computeLoopSchedule(ownDur, loopCount, mommyBuf.duration);
      mommyDurationRef.current = mommyBuf.duration;

      const startAt = ctx.currentTime + 0.15; // small lead so both tracks align
      startedAtRef.current = startAt;

      // ── Mommy track: full gain, plays once, ends the session.
      const mommySrc = ctx.createBufferSource();
      mommySrc.buffer = mommyBuf;
      mommySrc.connect(ctx.destination);
      mommySrc.onended = () => finish();
      mommySrc.start(startAt);
      sourcesRef.current.push(mommySrc);

      // ── Her own voice: looped bed under the Mommy track. One bed gain node at
      // the -9dB floor; each loop gets its own fade-envelope gain feeding it.
      const bedGain = ctx.createGain();
      bedGain.gain.value = schedule.gainLinear;
      bedGain.connect(ctx.destination);

      for (const offset of schedule.starts) {
        const loopStart = startAt + offset;
        const loopSrc = ctx.createBufferSource();
        loopSrc.buffer = ownBuf;

        const loopGain = ctx.createGain();
        const fadeIn = schedule.fadeInS;
        const fadeOut = schedule.fadeOutS;
        const clipEnd = loopStart + ownBuf.duration;
        // Fade in from silence → unity, hold, fade out → silence.
        loopGain.gain.setValueAtTime(0.0001, loopStart);
        loopGain.gain.linearRampToValueAtTime(1, loopStart + fadeIn);
        loopGain.gain.setValueAtTime(1, Math.max(loopStart + fadeIn, clipEnd - fadeOut));
        loopGain.gain.linearRampToValueAtTime(0.0001, clipEnd);

        loopSrc.connect(loopGain).connect(bedGain);
        loopSrc.start(loopStart);
        sourcesRef.current.push(loopSrc);
      }

      setPhase('playing');
      setProgress(0);
      progressTimerRef.current = setInterval(() => {
        const c = ctxRef.current;
        const total = mommyDurationRef.current;
        if (!c || total <= 0) return;
        const elapsed = c.currentTime - startedAtRef.current;
        setProgress(Math.max(0, Math.min(1, elapsed / total)));
      }, 250);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      teardown();
      setMessage(msg);
      setPhase('error');
    }
  }, [phase, mommyRenderPath, ownVoicePath, loopCount, ownDurationS, finish, teardown]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {phase === 'idle' && (
        <button
          onClick={begin}
          style={{
            width: '100%', padding: '14px',
            background: border, color: '#fff',
            border: 'none', borderRadius: 7,
            fontSize: 13, fontWeight: 700, letterSpacing: '0.04em',
            textTransform: 'uppercase', fontFamily: 'inherit', cursor: 'pointer',
          }}
        >
          Sit with me and listen
        </button>
      )}

      {phase === 'loading' && (
        <div style={{ padding: 14, textAlign: 'center', color: accent, fontSize: 12 }}>
          Bringing your voice up under Mama's…
        </div>
      )}

      {phase === 'playing' && (
        <>
          <div style={{ height: 6, borderRadius: 3, background: '#22222a', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%', width: `${Math.round(progress * 100)}%`,
                background: accent, transition: 'width 0.25s linear',
              }}
            />
          </div>
          <div style={{ textAlign: 'center', color: accent, fontSize: 11 }}>
            Your own voice, looping under Mama. Stay where you are.
          </div>
          <button
            onClick={finish}
            style={{
              padding: '8px', background: 'transparent', color: accent,
              border: `1px solid ${border}`, borderRadius: 6,
              fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            mark complete
          </button>
        </>
      )}

      {phase === 'error' && (
        <>
          <div style={{ padding: 12, color: '#fca5a5', fontSize: 11, background: '#1a0a0a', borderRadius: 6 }}>
            Couldn't start the echo: {message}
          </div>
          <button
            onClick={begin}
            style={{
              padding: '10px', background: 'transparent', color: accent,
              border: `1px solid ${border}`, borderRadius: 6,
              fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            try again
          </button>
        </>
      )}
    </div>
  );
}
