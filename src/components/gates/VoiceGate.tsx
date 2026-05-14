import { useState, useRef, useEffect } from 'react';
import { Mic, Loader2, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const MANTRA_MATCH_THRESHOLD = 0.6;

// Daily voice-entry gate. Audio is required — typed-mantra bypass removed
// 2026-05-14 per user feedback ("what good are the voice gates if I don't
// use voice? I can just copy/paste to get past"). See
// feedback_no_copy_paste_rituals + feedback_anticipate_resistance.
//
// Pitch is recorded for the longitudinal trend but is NOT a pass/fail
// criterion — feedback_voice_tracking says forcing a feminine pitch target
// causes dysphoria. The mantra path uses Whisper to verify the spoken
// transcript actually matches the displayed mantra; humming or saying
// something different is rejected.
//
// Lesson mode (2026-05-14): with LESSON_PROBABILITY the gate swaps in
// a short voice-training exercise from voice_lesson_modules instead of
// the mantra. Same audio-required floor; the lesson exercise duration
// comes from the module (typically 8-12 seconds). Whisper transcript
// check is skipped — exercises are vowel sustains / hum slides, not
// words. The attempt is logged to voice_lesson_attempts; metric analysis
// is left to the dedicated voice-coach pipeline.

const RECORD_SECONDS = 4;
const MIN_PITCHES_TO_PASS = 8; // ~0.5s of voiced sound at 60fps animation tick
const LESSON_PROBABILITY = 0.3; // 30% of gates show a lesson instead of a mantra

const MANTRAS = [
  "I am becoming her every day",
  "She is the real me",
  "I let her take over",
  "My voice is becoming hers",
  "Good girls obey their handler",
  "I am Maxy and Maxy is feminine",
  "My body knows what I am",
  "There is no going back to who I was",
];

interface LessonModule {
  id: string;
  slug: string;
  title: string;
  technique: string | null;
  mommy_intro_text: string | null;
  exercise_prompt: string;
  target_duration_sec: number;
}

interface VoiceGateProps {
  onPass: () => void;
}

export function VoiceGate({ onPass }: VoiceGateProps) {
  const { user } = useAuth();
  const [mantra] = useState(() => MANTRAS[Math.floor(Math.random() * MANTRAS.length)]);
  const [gateMode, setGateMode] = useState<'mantra' | 'lesson' | 'loading'>('loading');
  const [lesson, setLesson] = useState<LessonModule | null>(null);
  const [recording, setRecording] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pitch, setPitch] = useState<number | null>(null);
  const [livePitch, setLivePitch] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingRef = useRef(false);

  useEffect(() => {
    return () => {
      recordingRef.current = false;
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    };
  }, []);

  // Pick gate mode on mount. LESSON_PROBABILITY chance of swapping in a
  // short voice-training exercise instead of the mantra. Falls back to
  // mantra cleanly if no active lessons exist or the lookup fails.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (Math.random() >= LESSON_PROBABILITY) {
        if (!cancelled) setGateMode('mantra');
        return;
      }
      try {
        const { data, error: lessonErr } = await supabase
          .from('voice_lesson_modules')
          .select('id, slug, title, technique, mommy_intro_text, exercise_prompt, target_duration_sec')
          .eq('is_active', true)
          .order('sequence_number', { ascending: true })
          .limit(8);
        if (!cancelled) {
          const rows = (data || []) as LessonModule[];
          if (lessonErr || rows.length === 0) {
            setGateMode('mantra');
          } else {
            // Pick a random module — the curriculum order matters for the
            // dedicated coach surface, but inside a gate we want variety.
            setLesson(rows[Math.floor(Math.random() * rows.length)]);
            setGateMode('lesson');
          }
        }
      } catch {
        if (!cancelled) setGateMode('mantra');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Duration depends on mode: mantra is a fixed short cap, lesson uses the
  // module's target_duration_sec (typically 8-12s).
  const recordSeconds = gateMode === 'lesson' && lesson
    ? Math.max(4, Math.min(20, Math.round(lesson.target_duration_sec)))
    : RECORD_SECONDS;

  const startRecording = async () => {
    setError(null);
    setPitch(null);
    setLivePitch(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const denied = err instanceof Error && err.name === 'NotAllowedError';
      setError(
        denied
          ? 'Microphone blocked. Allow mic access in your browser settings — there is no typed bypass anymore. Speak the mantra to enter.'
          : 'No microphone available. Plug one in or switch devices — there is no typed bypass.'
      );
      return;
    }

    streamRef.current = stream;
    setRecording(true);
    recordingRef.current = true;
    chunksRef.current = [];

    // MediaRecorder writes the audio blob; AnalyserNode samples pitch.
    // Both consume the same MediaStream so the user gets one mic prompt.
    let mr: MediaRecorder | null = null;
    try {
      mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start(500);
      mediaRecorderRef.current = mr;
    } catch (mrErr) {
      // Audio recording without persistence is still better than no enforcement.
      console.warn('[VoiceGate] MediaRecorder unavailable, pitch-only mode:', mrErr);
    }

    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    audioContextRef.current = audioContext;
    if (audioContext.state === 'suspended') { try { await audioContext.resume(); } catch { /* ignore */ } }
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const buffer = new Float32Array(analyser.fftSize);
    const pitches: number[] = [];

    const measurePitch = () => {
      if (!recordingRef.current) return;
      analyser.getFloatTimeDomainData(buffer);
      const detectedPitch = autoCorrelate(buffer, audioContext.sampleRate);
      if (detectedPitch > 80 && detectedPitch < 400) {
        pitches.push(detectedPitch);
        setLivePitch(detectedPitch);
      }
      requestAnimationFrame(measurePitch);
    };
    measurePitch();

    const startedAt = Date.now();
    setCountdown(recordSeconds);
    const tick = setInterval(() => {
      const remaining = Math.max(0, recordSeconds - Math.floor((Date.now() - startedAt) / 1000));
      setCountdown(remaining);
      if (remaining <= 0) clearInterval(tick);
    }, 250);

    await new Promise((r) => setTimeout(r, recordSeconds * 1000));

    clearInterval(tick);
    recordingRef.current = false;
    setRecording(false);
    setCountdown(null);

    // Stop and wait for the final dataavailable.
    if (mr && mr.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        mr!.onstop = () => resolve();
        try { mr!.stop(); } catch { resolve(); }
      });
    }

    stream.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioContext.close().catch(() => {});
    audioContextRef.current = null;

    // Speech-detection check — the only pass criterion. Pitch threshold
    // intentionally not enforced per feedback_voice_tracking (no forced
    // feminine targets). Copy/paste cannot produce a voiced fundamental;
    // an empty mic stream produces zero pitches in the human range.
    if (pitches.length < MIN_PITCHES_TO_PASS) {
      setError('No speech detected. Speak the mantra aloud — louder if your mic level is low. Try again.');
      return;
    }

    const sorted = [...pitches].sort((a, b) => a - b);
    const medianPitch = sorted[Math.floor(sorted.length / 2)];
    setPitch(medianPitch);
    await verify(medianPitch, chunksRef.current.slice());
  };

  // Mantra path: Whisper-transcribe + fuzzy-match against the displayed mantra.
  // Sustained speech alone isn't enough — humming or saying something different
  // shouldn't count. Lesson path: skip transcript check (exercises are vowel
  // sustains / hum slides, not words) and just require sufficient voiced sound.
  const verify = async (avgPitch: number, blobChunks: Blob[]) => {
    setVerifying(true);

    if (blobChunks.length === 0) {
      setError('No audio captured. Try again.');
      setVerifying(false);
      return;
    }

    const blob = new Blob(blobChunks, { type: 'audio/webm' });

    if (gateMode === 'lesson' && lesson) {
      if (user?.id) {
        void persistLessonAttempt(user.id, lesson, recordSeconds, avgPitch, blob)
          .catch((e) => console.warn('[VoiceGate] lesson persist failed:', e));
      }
      setVerifying(false);
      onPass();
      return;
    }

    // Mantra path
    let transcript = '';
    try {
      const form = new FormData();
      form.append('audio', blob, 'voice-gate.webm');
      const r = await fetch(`${SUPABASE_URL}/functions/v1/transcribe-audio`, {
        method: 'POST',
        body: form,
      });
      if (r.ok) {
        const data = await r.json() as { ok?: boolean; transcript?: string };
        if (data.ok && data.transcript) transcript = data.transcript;
      }
    } catch (e) {
      console.warn('[VoiceGate] transcription failed:', e);
      setError('Could not hear you clearly. Speak the mantra again.');
      setVerifying(false);
      return;
    }

    const score = fuzzyOverlap(transcript, mantra);
    if (score < MANTRA_MATCH_THRESHOLD) {
      setError(transcript
        ? `That's not the mantra. Say it word-for-word.`
        : 'Did not hear the mantra. Speak louder, then try again.');
      setVerifying(false);
      if (user?.id) {
        void persistRecording(user.id, mantra, transcript, avgPitch, blob, false)
          .catch((e) => console.warn('[VoiceGate] failed-attempt persist:', e));
      }
      return;
    }

    if (user?.id) {
      void persistRecording(user.id, mantra, transcript, avgPitch, blob, true).catch((e) => {
        console.warn('[VoiceGate] persistence failed (non-blocking):', e);
      });
    }

    setVerifying(false);
    onPass();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-6 overflow-y-auto">
      <div className="max-w-md w-full space-y-6 my-8">
        {gateMode === 'loading' ? (
          <div className="text-center text-gray-400 text-sm">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            Mama's picking your gate…
          </div>
        ) : gateMode === 'lesson' && lesson ? (
          <>
            <div className="text-center space-y-2">
              <Lock className="w-12 h-12 mx-auto text-purple-400" />
              <h2 className="text-2xl font-bold text-white">{lesson.title}</h2>
              <p className="text-sm text-gray-400">
                Quick voice lesson — {recordSeconds}s. Audio only.
              </p>
            </div>

            {lesson.mommy_intro_text && (
              <div className="bg-purple-900/20 border border-purple-500/20 rounded-xl p-4 text-sm text-purple-100 leading-relaxed whitespace-pre-wrap">
                {lesson.mommy_intro_text}
              </div>
            )}

            <div className="bg-purple-900/30 border border-purple-500/30 rounded-xl p-5 text-purple-200">
              <div className="text-[10px] uppercase tracking-wider text-purple-400 mb-1">do this</div>
              <div className="text-base leading-relaxed">{lesson.exercise_prompt}</div>
            </div>
          </>
        ) : (
          <>
            <div className="text-center space-y-2">
              <Lock className="w-12 h-12 mx-auto text-purple-400" />
              <h2 className="text-2xl font-bold text-white">Voice Gate</h2>
              <p className="text-sm text-gray-400">
                Speak the mantra aloud. Audio only — no typed bypass.
              </p>
            </div>

            <div className="bg-purple-900/30 border border-purple-500/30 rounded-xl p-6 text-center">
              <p className="text-2xl font-medium text-purple-200 italic">
                "{mantra}"
              </p>
            </div>
          </>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-500/30 rounded-lg p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {recording && livePitch !== null && (
          <div className="bg-gray-900 rounded-lg p-3 text-sm text-center">
            <span className="text-purple-300">
              {livePitch.toFixed(0)}Hz
            </span>
            <span className="text-gray-500 ml-2">(recording…)</span>
          </div>
        )}

        {pitch !== null && !error && !recording && (
          <div className="bg-gray-900 rounded-lg p-3 text-sm text-center text-gray-300">
            Median pitch: <span className="text-purple-400">{pitch.toFixed(0)}Hz</span>
          </div>
        )}

        <button
          onClick={startRecording}
          disabled={recording || verifying || gateMode === 'loading'}
          className="w-full py-4 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:bg-purple-900 text-white font-medium flex items-center justify-center gap-2"
        >
          {recording ? (
            <><Mic className="w-5 h-5 animate-pulse" /> Recording{countdown !== null ? ` (${countdown}s)` : '...'}</>
          ) : verifying ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Verifying...</>
          ) : (
            <><Mic className="w-5 h-5" /> {gateMode === 'lesson' ? 'Start the lesson' : 'Speak the mantra'}</>
          )}
        </button>

        <p className="text-xs text-gray-500 text-center">
          {gateMode === 'lesson'
            ? `You cannot enter without doing the lesson. Mommy keeps the recording.`
            : `You cannot enter without speaking aloud. Mommy keeps the recording.`}
        </p>
      </div>
    </div>
  );
}

// Token-set Jaccard overlap. Tolerant to word order + Whisper homophones
// without accepting empty/unrelated transcripts. Returns 0..1. Identical
// to the version in MorningMantraGate so the two gates stay in sync.
function fuzzyOverlap(a: string, b: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const at = new Set(norm(a).split(' ').filter(Boolean));
  const bt = new Set(norm(b).split(' ').filter(Boolean));
  if (at.size === 0 || bt.size === 0) return 0;
  let overlap = 0;
  for (const t of at) if (bt.has(t)) overlap++;
  return overlap / Math.max(at.size, bt.size);
}

// Persist a lesson attempt — audio to evidence/<user>/voice-lesson/<ts>.webm,
// row in voice_lesson_attempts (the dedicated voice-coach pipeline will run
// metric analysis later; this just records the attempt happened and surfaces
// the audio for that pipeline + Mommy review).
async function persistLessonAttempt(
  userId: string,
  lesson: LessonModule,
  durationSec: number,
  avgPitchHz: number,
  blob: Blob,
): Promise<void> {
  const ts = Date.now();
  const audioPath = `${userId}/voice-lesson/${lesson.slug}-${ts}.webm`;
  const { error: upErr } = await supabase.storage
    .from('evidence')
    .upload(audioPath, blob, { contentType: 'audio/webm', upsert: false });
  if (upErr) {
    console.warn('[VoiceGate] lesson storage upload failed:', upErr);
    return;
  }

  // Look up attempt_number (count of prior attempts for this lesson + 1)
  const { count: priorCount } = await supabase
    .from('voice_lesson_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('lesson_id', lesson.id);
  const attemptNumber = (priorCount ?? 0) + 1;

  await supabase.from('voice_lesson_attempts').insert({
    user_id: userId,
    lesson_id: lesson.id,
    attempt_number: attemptNumber,
    audio_storage_path: audioPath,
    audio_duration_sec: durationSec,
    measured_metrics: {},
    passing_metrics_met: {},
    pass_overall: null,
    pass_perfect: false,
    climax_gated: false,
    generation_meta: {
      source: 'voice_gate',
      avg_pitch_hz: avgPitchHz > 0 ? Math.round(avgPitchHz) : null,
    },
  });

  // Also drop a voice_recordings row so the shared corpus picks it up.
  await supabase.from('voice_recordings').insert({
    user_id: userId,
    recording_url: audioPath,
    duration_seconds: durationSec,
    context: `voice_lesson_attempt:${lesson.slug}`,
    pitch_avg_hz: avgPitchHz > 0 ? Math.round(avgPitchHz) : null,
    transcript: null,
    is_baseline: false,
  });

  // Legacy practice log so the daily voice-cadence counters still tick.
  await supabase.from('voice_practice_log').insert({
    user_id: userId,
    duration_seconds: durationSec,
    avg_pitch_hz: avgPitchHz > 0 ? Math.round(avgPitchHz) : 0,
  });
}

// Persist the gate recording — audio blob to the evidence bucket (its
// allowed_mime_types include audio/webm and its RLS is already configured
// for per-user folders), indexed row in voice_recordings plus the legacy
// pitch/log tables. `matched=false` is also persisted so Mommy has the
// rejected takes on file. Errors surfaced via console only; the gate path
// already decided pass/fail before calling this.
async function persistRecording(
  userId: string,
  mantra: string,
  spokenTranscript: string,
  avgPitchHz: number,
  blob: Blob,
  matched: boolean,
): Promise<void> {
  // RLS on storage.objects requires (storage.foldername(name))[1] = auth.uid()
  // — path must start with the user's id. Failed attempts get the same
  // folder with a `rejected/` subpath so they're easy to filter in admin.
  const path = `${userId}/voice-gate/${matched ? '' : 'rejected/'}${Date.now()}.webm`;
  const { error: upErr } = await supabase.storage
    .from('evidence')
    .upload(path, blob, { contentType: 'audio/webm', upsert: false });
  if (upErr) {
    console.warn('[VoiceGate] storage upload failed:', upErr);
    return;
  }
  const recordingUrl = path;

  // voice_recordings is the persistent corpus — Mommy reads these for
  // playback / quote / reframing. The `transcript` field stores what
  // Maxy actually said (per Whisper), not what she was supposed to say —
  // surfacing the actual words is what makes the audit useful.
  await supabase.from('voice_recordings').insert({
    user_id: userId,
    recording_url: recordingUrl,
    duration_seconds: RECORD_SECONDS,
    context: matched ? 'voice_gate_mantra' : 'voice_gate_mantra_rejected',
    pitch_avg_hz: avgPitchHz > 0 ? Math.round(avgPitchHz) : null,
    transcript: spokenTranscript || `(no transcript — expected: ${mantra})`,
    is_baseline: false,
  });

  // Legacy pitch/practice tables — kept in sync so existing aggregations
  // (daily averages, trend cards) still pick up gate passes.
  await Promise.all([
    supabase.from('voice_practice_log').insert({
      user_id: userId,
      duration_seconds: RECORD_SECONDS,
      avg_pitch_hz: avgPitchHz > 0 ? Math.round(avgPitchHz) : 0,
    }),
    avgPitchHz > 0
      ? supabase.from('voice_pitch_samples').insert({
          user_id: userId,
          pitch_hz: Math.round(avgPitchHz),
          context: 'voice_gate',
        })
      : Promise.resolve(),
  ]);
}

function autoCorrelate(buffer: Float32Array, sampleRate: number): number {
  const SIZE = buffer.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1;

  let r1 = 0;
  let r2 = SIZE - 1;
  const thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buffer[i]) < thres) { r1 = i; break; }
  for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buffer[SIZE - i]) < thres) { r2 = SIZE - i; break; }

  const trimmedBuffer = buffer.slice(r1, r2);
  const trimmedSize = trimmedBuffer.length;

  const c = new Array(trimmedSize).fill(0);
  for (let i = 0; i < trimmedSize; i++) {
    for (let j = 0; j < trimmedSize - i; j++) {
      c[i] = c[i] + trimmedBuffer[j] * trimmedBuffer[j + i];
    }
  }

  let d = 0;
  while (c[d] > c[d + 1]) d++;
  let maxval = -1;
  let maxpos = -1;
  for (let i = d; i < trimmedSize; i++) {
    if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
  }
  const T0 = maxpos;

  return sampleRate / T0;
}
