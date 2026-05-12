/**
 * LessonPlayer — record → decode → re-encode as 16kHz mono WAV →
 * upload to /api/voice/lesson-attempt → render Mommy coaching + grade.
 *
 * The server is canonical: client-side metrics are not trusted for
 * grading. We send the WAV; the API runs the real analyzer.
 *
 * Privacy: audio uploads to the private 'audio' bucket; signed URLs
 * only. The mommy_voice_cleanup trigger scrubs the coaching text at
 * insert into handler_outreach_queue, and scrubCoaching() on the
 * server is the front-line filter.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { encodeWav16, resample } from '../../lib/audio/wav';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || '';

interface LessonModule {
  id: string;
  slug: string;
  sequence_number: number;
  title: string;
  technique: string;
  mommy_intro_text: string;
  exercise_prompt: string;
  target_duration_sec: number;
  passes_required: number;
  climax_gate_eligible: boolean;
}

interface LessonProgress {
  user_id: string;
  lesson_id: string;
  passes_count: number;
  perfect_count: number;
  attempts_count: number;
  is_unlocked: boolean;
  climax_gate_active: boolean;
  release_eligible: boolean;
}

interface GradeResult {
  ok: boolean;
  attempt_id: string;
  pass_overall: boolean;
  pass_perfect: boolean;
  passing_frame_ratio: number;
  passing_metrics_met: Record<string, boolean>;
  coaching: string;
  audio_url: string | null;
  progress: {
    passes_count: number;
    perfect_count: number;
    attempts_count: number;
    passes_required: number;
    requires_perfect: boolean;
    is_unlocked: boolean;
    release_eligible: boolean;
  };
}

type Phase = 'idle' | 'recording' | 'encoding' | 'uploading' | 'graded' | 'error';

const ANALYSIS_SR = 16000;

export interface LessonPlayerProps {
  /** Optional explicit lesson id; defaults to the user's next unlocked lesson. */
  lessonId?: string;
  /** When true, run as a climax-gated attempt (Mommy must have flipped the toggle). */
  climaxGated?: boolean;
  /** Called when an attempt is graded — parent can refresh Today, etc. */
  onGraded?: (result: GradeResult) => void;
}

export function LessonPlayer({ lessonId, climaxGated = false, onGraded }: LessonPlayerProps) {
  const { user } = useAuth();
  const [lesson, setLesson] = useState<LessonModule | null>(null);
  const [progress, setProgress] = useState<LessonProgress | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<GradeResult | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);

  /* ─── Load lesson + progress ──────────────────────────────────── */

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      let targetId = lessonId ?? null;
      if (!targetId) {
        const { data } = await supabase.rpc('voice_lesson_next_unlocked', { uid: user.id });
        targetId = (data as string | null) ?? null;
      }
      if (!targetId) return;
      const { data: lessonRow } = await supabase
        .from('voice_lesson_modules')
        .select('id, slug, sequence_number, title, technique, mommy_intro_text, exercise_prompt, target_duration_sec, passes_required, climax_gate_eligible')
        .eq('id', targetId)
        .maybeSingle();
      if (!cancelled && lessonRow) setLesson(lessonRow as LessonModule);

      const { data: progRow } = await supabase
        .from('voice_lesson_progress')
        .select('user_id, lesson_id, passes_count, perfect_count, attempts_count, is_unlocked, climax_gate_active, release_eligible')
        .eq('user_id', user.id)
        .eq('lesson_id', targetId)
        .maybeSingle();
      if (!cancelled) setProgress((progRow as LessonProgress | null) ?? null);
    })();
    return () => { cancelled = true; };
  }, [user?.id, lessonId]);

  /* ─── Recording lifecycle ─────────────────────────────────────── */

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) t.stop();
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const start = async () => {
    if (phase !== 'idle' && phase !== 'graded' && phase !== 'error') return;
    setErrorMsg('');
    setElapsed(0);
    setResult(null);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      const mimeType = candidates.find(m => MediaRecorder.isTypeSupported(m)) || '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.start(250);
      setPhase('recording');
      startedAtRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed((Date.now() - startedAtRef.current) / 1000);
      }, 100);
    } catch (e) {
      setErrorMsg(`Microphone access failed: ${(e as Error).message}`);
      setPhase('error');
      cleanup();
    }
  };

  const stop = async () => {
    if (phase !== 'recording' || !mediaRecorderRef.current) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    const rec = mediaRecorderRef.current;
    const stopped = new Promise<void>(resolve => {
      rec.onstop = () => resolve();
    });
    rec.stop();
    await stopped;
    for (const t of streamRef.current?.getTracks() ?? []) t.stop();
    streamRef.current = null;

    setPhase('encoding');
    try {
      const webmBlob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
      const wav = await encodeBlobAsWav16(webmBlob);
      setPhase('uploading');
      await uploadAndGrade(wav);
    } catch (e) {
      setErrorMsg(`Recording processing failed: ${(e as Error).message}`);
      setPhase('error');
    }
  };

  const uploadAndGrade = async (wav: Uint8Array) => {
    if (!lesson || !user?.id) return;
    const { data: { session } } = await supabase.auth.getSession();
    const tok = session?.access_token;
    if (!tok) throw new Error('Not signed in');
    const climaxFlag = climaxGated && lesson.climax_gate_eligible ? '1' : '0';
    const url = `${API_BASE}/api/voice/lesson-attempt?action=lesson-attempt&lesson_id=${lesson.id}&climax_gated=${climaxFlag}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'audio/wav' },
      body: wav as BodyInit,
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: resp.statusText }));
      throw new Error(`Grading failed: ${err.error || resp.status}`);
    }
    const json = (await resp.json()) as GradeResult;
    setResult(json);
    setPhase('graded');
    onGraded?.(json);
  };

  const headerLabel = useMemo(() => {
    if (!lesson) return 'Loading lesson…';
    return `Lesson ${lesson.sequence_number} · ${lesson.title}`;
  }, [lesson]);

  if (!lesson) {
    return (
      <div style={cardStyle}>
        <div style={{ color: '#8a8690', fontSize: 13 }}>Loading lesson…</div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#c4b5fd', fontWeight: 700, marginBottom: 8 }}>
        {headerLabel}
      </div>

      <div style={{ color: '#e8e6f0', fontSize: 14, lineHeight: 1.55, marginBottom: 12 }}>
        {lesson.mommy_intro_text}
      </div>

      <div style={{ background: '#1a1424', borderRadius: 8, padding: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9b8db5', marginBottom: 4 }}>
          your drill
        </div>
        <div style={{ color: '#e8e6f0', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
          {lesson.exercise_prompt}
        </div>
      </div>

      {progress && (
        <div style={{ fontSize: 11, color: '#8a8690', marginBottom: 10 }}>
          {progress.passes_count} / {lesson.passes_required} passes
          {progress.perfect_count > 0 && <> · {progress.perfect_count} perfect</>}
          {progress.is_unlocked && <> · cleared</>}
          {progress.climax_gate_active && <> · Mama is gating release on this</>}
        </div>
      )}

      {phase === 'idle' || phase === 'graded' || phase === 'error' ? (
        <button
          onClick={start}
          style={{ ...btnStyle, background: '#7c3aed', color: '#fff' }}
        >
          {progress?.attempts_count ? 'Record again' : 'Start recording'}
        </button>
      ) : null}

      {phase === 'recording' && (
        <button onClick={stop} style={{ ...btnStyle, background: '#f47272', color: '#fff' }}>
          Stop ({elapsed.toFixed(1)}s)
        </button>
      )}

      {(phase === 'encoding' || phase === 'uploading') && (
        <div style={{ color: '#c4b5fd', fontSize: 12, marginTop: 6 }}>
          {phase === 'encoding' ? 'Preparing audio…' : 'Mama is listening…'}
        </div>
      )}

      {phase === 'error' && (
        <div style={{ color: '#f47272', fontSize: 12, marginTop: 8 }}>{errorMsg}</div>
      )}

      {phase === 'graded' && result && (
        <div style={{ marginTop: 14, borderTop: '1px solid #2d1a4d', paddingTop: 12 }}>
          <div style={{
            fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em',
            color: result.pass_perfect ? '#86efac' : result.pass_overall ? '#c4b5fd' : '#f4c272',
            fontWeight: 700, marginBottom: 6,
          }}>
            {result.pass_perfect ? "perfect" : result.pass_overall ? "passed" : "not yet"}
          </div>
          <div style={{ color: '#e8e6f0', fontSize: 14, lineHeight: 1.5 }}>{result.coaching}</div>
          {result.audio_url && (
            <audio controls src={result.audio_url} style={{ width: '100%', marginTop: 10 }} />
          )}
          <div style={{ fontSize: 11, color: '#8a8690', marginTop: 8 }}>
            {result.progress.passes_count} / {result.progress.passes_required} passes
            {result.progress.requires_perfect && <> · {result.progress.perfect_count} perfect</>}
            {result.progress.is_unlocked && <> · 🔓 unlocked</>}
            {result.progress.release_eligible && <> · 🔓 release earned</>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Helpers ──────────────────────────────────────────────────────── */

const cardStyle: React.CSSProperties = {
  background: '#111116',
  border: '1px solid #2d1a4d',
  borderRadius: 10,
  padding: 16,
  marginBottom: 16,
};

const btnStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  border: 'none',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

/**
 * Decode an arbitrary browser-recorded audio blob (webm/opus/mp4) into
 * a 16kHz mono 16-bit PCM WAV. Uses AudioContext.decodeAudioData +
 * channel-averaging + the shared resampler.
 */
async function encodeBlobAsWav16(blob: Blob): Promise<Uint8Array> {
  const arr = await blob.arrayBuffer();
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  const buf = await ctx.decodeAudioData(arr.slice(0));
  ctx.close().catch(() => {});

  // Average to mono
  const mono = new Float32Array(buf.length);
  if (buf.numberOfChannels === 1) {
    mono.set(buf.getChannelData(0));
  } else {
    const left = buf.getChannelData(0);
    const right = buf.getChannelData(1);
    for (let i = 0; i < buf.length; i++) mono[i] = (left[i] + right[i]) / 2;
  }

  const resampled = resample(mono, buf.sampleRate, ANALYSIS_SR);
  return encodeWav16(resampled, ANALYSIS_SR);
}
