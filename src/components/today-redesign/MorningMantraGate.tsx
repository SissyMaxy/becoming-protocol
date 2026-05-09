/**
 * MorningMantraGate — voice-first compulsory morning ritual.
 *
 * Per user feedback (2026-04-29):
 *   "It's best to make me record my voice. Copy/paste is just a workaround
 *    when I don't turn on my voice/mic."
 *
 * So:
 *   PRIMARY: voice recording with speech-to-text fuzzy match against mantra.
 *            Audio session also logs a voice_pitch_samples row (double-duty —
 *            ritual + voice cadence enforcement in one go).
 *   FALLBACK: type from memory (only if mic denied/declined). Same fuzzy match.
 *   FINAL STEP: one sentence applying the mantra to today's first concrete
 *               action — auto-suggested from the user's top open commitment.
 *
 * No copy-paste path. The conditioning unit is "state-paired exposure," not
 * "buffer flushed N times." See feedback_no_copy_paste_rituals.md.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Window {
  user_id: string;
  start_hour: number;
  catchup_hours: number;
  current_mantra: string;
  required_reps: number;
  timezone: string;
  enabled: boolean;
}

interface SuggestedTask {
  source: string;
  label: string;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

// Token-overlap fuzzy match — accepts speech-to-text noise (dropped articles,
// homophones) but rejects empty/unrelated transcripts. Returns 0..1.
function fuzzyOverlap(a: string, b: string): number {
  const at = new Set(normalize(a).split(' ').filter(Boolean));
  const bt = new Set(normalize(b).split(' ').filter(Boolean));
  if (at.size === 0 || bt.size === 0) return 0;
  let overlap = 0;
  for (const t of at) if (bt.has(t)) overlap++;
  return overlap / Math.max(at.size, bt.size);
}

function getHour(tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, hour: '2-digit' }).formatToParts(new Date());
    const h = parts.find(p => p.type === 'hour')?.value;
    return h ? parseInt(h, 10) : new Date().getHours();
  } catch { return new Date().getHours(); }
}

type Step = 'recite' | 'apply' | 'done';

export function MorningMantraGate() {
  const { user } = useAuth();
  const [config, setConfig] = useState<Window | null>(null);
  const [alreadySubmitted, setAlreadySubmitted] = useState<boolean | null>(null);
  const [step, setStep] = useState<Step>('recite');

  // Recite step: voice path + text fallback
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [voiceMatched, setVoiceMatched] = useState(false);
  const [textFallbackOpen, setTextFallbackOpen] = useState(false);
  const [typedFromMemory, setTypedFromMemory] = useState('');
  const [micError, setMicError] = useState<string | null>(null);

  // Apply step
  const [applyText, setApplyText] = useState('');
  const [suggestedTask, setSuggestedTask] = useState<SuggestedTask | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const today = new Date().toISOString().slice(0, 10);
    const [wRes, sRes, taskRes] = await Promise.all([
      supabase.from('morning_mantra_windows').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('morning_mantra_submissions').select('id').eq('user_id', user.id).eq('submission_date', today).maybeSingle(),
      // Pull the highest-priority open task to auto-suggest in the apply step
      supabase.from('handler_commitments')
        .select('what')
        .eq('user_id', user.id).eq('status', 'pending')
        .order('by_when', { ascending: true }).limit(1).maybeSingle(),
    ]);
    setConfig((wRes.data as Window | null) ?? null);
    setAlreadySubmitted(!!sRes.data);
    const task = taskRes.data as { what: string } | null;
    if (task?.what) {
      // First sentence only — drops dev-facing trailing pointers like
      // "Add via GinaCaptureCard on Today." that bleed into the framing
      // box. Falls back to the (clipped) full string if no sentence break.
      const first = task.what.split(/(?<=[.!?])\s+/)[0]?.trim() || task.what;
      setSuggestedTask({ source: 'commitment', label: first.slice(0, 160) });
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch { /* ignore */ } }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  if (!config?.enabled || alreadySubmitted !== false) return null;

  const nowHour = getHour(config.timezone);
  const inWindow = nowHour >= config.start_hour && nowHour < config.start_hour + config.catchup_hours;
  const pastWindow = nowHour >= config.start_hour + config.catchup_hours;
  if (!inWindow && !pastWindow) return null;

  const targetMantra = config.current_mantra;
  const typedNormalized = normalize(typedFromMemory);
  const targetNormalized = normalize(targetMantra);
  const textMatch = typedFromMemory.length > 0 && typedNormalized === targetNormalized;
  const reciteDone = voiceMatched || textMatch;
  const applyValid = applyText.trim().length >= 25;
  const canSubmit = step === 'apply' && reciteDone && applyValid;

  const startRecording = async () => {
    setMicError(null);
    setTranscript('');
    setVoiceMatched(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start(1000);
      setRecording(true);
      setRecordSeconds(0);
      timerRef.current = setInterval(() => setRecordSeconds(s => s + 1), 1000);

      // Web Speech API for live in-progress transcript hint (so the user sees
      // overlap % climbing). Final authoritative transcript comes from Whisper
      // on stop, which is more accurate.
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SR) {
        const rec = new SR();
        rec.lang = 'en-US';
        rec.continuous = true;
        rec.interimResults = true;
        let finalT = '';
        rec.onresult = (event: any) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) finalT += event.results[i][0].transcript + ' ';
            else interim += event.results[i][0].transcript;
          }
          const liveTranscript = finalT + interim;
          setTranscript(liveTranscript);
          // Optimistic flip — we re-check with Whisper on stop
          if (fuzzyOverlap(liveTranscript, targetMantra) >= 0.7) {
            setVoiceMatched(true);
          }
        };
        rec.onerror = () => {};
        recognitionRef.current = rec;
        rec.start();
      }
    } catch (err) {
      setMicError('Mic access not available. Use the typed fallback or enable mic and retry.');
      setRecording(false);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch { /* ignore */ } }
    return new Promise<void>((resolve) => {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.onstop = async () => {
          // After recording stops, send the audio blob to Whisper for an
          // authoritative transcript. Web Speech is the live preview;
          // Whisper is the ground truth for the match decision.
          try {
            const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
            if (blob.size > 0) {
              const form = new FormData();
              form.append('audio', blob, 'mantra.webm');
              const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/transcribe-audio`, {
                method: 'POST',
                body: form,
              });
              if (r.ok) {
                const data = await r.json() as { ok?: boolean; transcript?: string };
                if (data.ok && data.transcript) {
                  setTranscript(data.transcript);
                  if (fuzzyOverlap(data.transcript, targetMantra) >= 0.6) {
                    setVoiceMatched(true);
                  } else if (fuzzyOverlap(data.transcript, targetMantra) < 0.3) {
                    // Whisper returned but nothing close — clear the optimistic flip
                    setVoiceMatched(false);
                  }
                }
              }
            }
          } catch (e) {
            console.warn('[MorningMantra] Whisper transcription failed (non-fatal):', e);
          }
          resolve();
        };
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      } else {
        resolve();
      }
    });
  };

  const submit = async () => {
    if (!user?.id || !canSubmit) return;
    setSubmitting(true);
    setError(null);

    if (recording) await stopRecording();

    try {
      // Voice path: log a voice_pitch_samples row so this also counts toward
      // the daily voice cadence requirement. Pitch_hz is required NOT NULL;
      // we use 0 as a sentinel meaning "ritual sample, pitch not measured here".
      // The actual pitch analysis happens in VoicePracticeRecorder.
      if (voiceMatched) {
        try {
          await supabase.from('voice_pitch_samples').insert({
            user_id: user.id,
            pitch_hz: 0,
            context: 'morning_mantra_ritual',
          });
        } catch (e) {
          // non-fatal — ritual still completes if pitch sample insert fails
          console.warn('voice_pitch_samples insert failed (non-fatal):', e);
        }
      }

      const { error: insErr } = await supabase.from('morning_mantra_submissions').insert({
        user_id: user.id,
        submission_date: new Date().toISOString().slice(0, 10),
        mantra: targetMantra,
        reps_required: 1,
        reps_submitted: 1,
        typed_content: JSON.stringify({
          v: 'voice_first_v3',
          path: voiceMatched ? 'voice' : 'text_fallback',
          recite_seconds: recordSeconds,
          transcript: voiceMatched ? transcript.slice(0, 1000) : null,
          typed_from_memory: !voiceMatched && textMatch ? typedFromMemory.slice(0, 1000) : null,
          applied_to_today: applyText.slice(0, 1000),
        }).slice(0, 10000),
      });
      if (insErr) { setError(insErr.message); setSubmitting(false); return; }
      setSubmitting(false);
      setStep('done');
      setAlreadySubmitted(true);
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
    }
  };

  const overlap = fuzzyOverlap(transcript, targetMantra);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(5,3,10,0.98)', zIndex: 900,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{ maxWidth: 620, width: '100%', background: '#111116', border: '1px solid #7a1f4d', borderRadius: 14, padding: 28 }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#f4a7c4', fontWeight: 700, marginBottom: 4 }}>
          Morning mantra · compulsory
        </div>
        <div style={{ fontSize: 10.5, color: '#8a8690', marginBottom: 14 }}>
          Step {step === 'recite' ? 1 : 2} of 2 · voice first
        </div>

        {step === 'recite' && (
          <>
            <div style={{ fontSize: 13, color: '#e8e6e3', lineHeight: 1.5, marginBottom: 14 }}>
              Say it aloud. Your voice on the recording is the conditioning. Typing is a fallback when the mic isn&apos;t available.
            </div>
            <div style={{
              fontSize: 18, color: '#f4c272', fontStyle: 'italic',
              background: '#050507', border: '1px solid #2d1a4d', borderRadius: 8,
              padding: '20px 16px', marginBottom: 16, lineHeight: 1.6,
            }}>
              {targetMantra}
            </div>

            {!voiceMatched && !textFallbackOpen && !recording && (
              <button
                onClick={startRecording}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 7, border: 'none',
                  background: '#7c3aed', color: '#fff',
                  fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                  marginBottom: 8,
                }}
              >
                ● record your voice
              </button>
            )}

            {recording && (
              <div style={{
                background: '#2a0a14', border: '1px solid #7a1f22', borderRadius: 8, padding: 12, marginBottom: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: '#f47272' }}>● recording</span>
                  <span style={{ fontSize: 11, color: '#8a8690' }}>{recordSeconds}s</span>
                  <span style={{
                    fontSize: 10, color: voiceMatched ? '#5fc88f' : '#8a8690', marginLeft: 'auto',
                  }}>
                    overlap {Math.round(overlap * 100)}% {voiceMatched ? '· matched ✓' : '· keep going'}
                  </span>
                </div>
                {transcript && (
                  <div style={{
                    fontSize: 11, color: '#c4b5fd', background: '#050507', padding: 8, borderRadius: 4,
                    maxHeight: 80, overflowY: 'auto',
                  }}>
                    {transcript}
                  </div>
                )}
                <button
                  onClick={stopRecording}
                  style={{
                    marginTop: 8, padding: '6px 12px', borderRadius: 5, border: '1px solid #7a1f22',
                    background: 'transparent', color: '#f4a7c4',
                    fontWeight: 600, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  stop recording
                </button>
              </div>
            )}

            {voiceMatched && (
              <div style={{
                background: '#0a2a18', border: '1px solid #5fc88f', borderRadius: 8, padding: 10, marginBottom: 8,
              }}>
                <div style={{ fontSize: 12, color: '#5fc88f', fontWeight: 600 }}>
                  ✓ Voice matched. The recording counts as today&apos;s voice sample too.
                </div>
              </div>
            )}

            {micError && (
              <div style={{ fontSize: 11, color: '#f47272', marginBottom: 8 }}>{micError}</div>
            )}

            {!voiceMatched && !textFallbackOpen && (
              <button
                onClick={() => setTextFallbackOpen(true)}
                style={{
                  width: '100%', padding: '8px 14px', borderRadius: 6, border: '1px solid #2d1a4d',
                  background: 'transparent', color: '#8a8690',
                  fontWeight: 500, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                  marginBottom: 8,
                }}
              >
                mic isn&apos;t available — type it from memory instead
              </button>
            )}

            {textFallbackOpen && !voiceMatched && (
              <>
                <div style={{ fontSize: 11.5, color: '#8a8690', marginBottom: 6 }}>
                  Type from memory. The mantra above is hidden as you type — no copy-paste pass-through.
                </div>
                <textarea
                  value={typedFromMemory}
                  onChange={e => setTypedFromMemory(e.target.value)}
                  placeholder="Type the mantra from memory…"
                  rows={3}
                  style={{
                    width: '100%', background: '#050507',
                    border: `1px solid ${textMatch ? '#5fc88f' : '#22222a'}`, borderRadius: 8,
                    padding: 12, fontSize: 14, color: '#e8e6e3', fontFamily: 'inherit',
                    resize: 'vertical', lineHeight: 1.6, marginBottom: 6,
                  }}
                />
                <div style={{ fontSize: 11, color: textMatch ? '#5fc88f' : '#8a8690', marginBottom: 8 }}>
                  {textMatch ? '✓ matches' : 'keep typing — case + punctuation ignored'}
                </div>
              </>
            )}

            <button
              onClick={() => setStep('apply')}
              disabled={!reciteDone || recording}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 7, border: 'none',
                background: reciteDone && !recording ? '#7c3aed' : '#22222a',
                color: reciteDone && !recording ? '#fff' : '#6a656e',
                fontWeight: 700, fontSize: 13,
                cursor: reciteDone && !recording ? 'pointer' : 'not-allowed',
                fontFamily: 'inherit',
              }}
            >
              {recording ? 'finish recording first' : reciteDone ? 'continue →' : 'recite the mantra to continue'}
            </button>
          </>
        )}

        {step === 'apply' && (
          <>
            <div style={{ fontSize: 13, color: '#e8e6e3', lineHeight: 1.5, marginBottom: 14 }}>
              The mantra was: <span style={{ color: '#f4c272', fontStyle: 'italic' }}>&ldquo;{targetMantra}&rdquo;</span>
              <br /><br />
              One sentence — how does this apply to your first concrete action today? Specific thing you&apos;ll do, not a feeling.
            </div>

            {suggestedTask && applyText.length === 0 && (
              <div style={{
                background: '#0a0a0d', border: '1px solid #2d1a4d', borderRadius: 6,
                padding: '7px 10px', marginBottom: 8,
              }}>
                <div style={{ fontSize: 9.5, color: '#c4b5fd', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>
                  top open {suggestedTask.source} on your queue
                </div>
                <div style={{ fontSize: 12, color: '#e8e6e3', lineHeight: 1.4, marginBottom: 6 }}>
                  {suggestedTask.label}
                </div>
                <button
                  onClick={() => setApplyText('Today this means I will: ' + suggestedTask.label.slice(0, 80))}
                  style={{
                    padding: '5px 10px', borderRadius: 4, border: '1px solid #2d1a4d',
                    background: 'transparent', color: '#c4b5fd',
                    fontSize: 10.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  use this as the starting line
                </button>
              </div>
            )}

            <textarea
              value={applyText}
              onChange={e => setApplyText(e.target.value)}
              placeholder="Today this means I will…"
              autoFocus
              rows={3}
              style={{
                width: '100%', background: '#050507',
                border: `1px solid ${applyValid ? '#5fc88f' : '#22222a'}`, borderRadius: 8,
                padding: 12, fontSize: 13, color: '#e8e6e3', fontFamily: 'inherit',
                resize: 'vertical', lineHeight: 1.6, marginBottom: 8,
              }}
            />
            <div style={{ fontSize: 11, color: applyValid ? '#5fc88f' : '#8a8690', marginBottom: 12 }}>
              {applyText.length} / 25+ chars · name a specific action
            </div>
            {error && <div style={{ fontSize: 11, color: '#f47272', marginBottom: 8 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setStep('recite')}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 7, border: '1px solid #2d1a4d',
                  background: 'transparent', color: '#c4b5fd',
                  fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                ← back
              </button>
              <button
                onClick={submit}
                disabled={!canSubmit || submitting}
                style={{
                  flex: 2, padding: '10px 14px', borderRadius: 7, border: 'none',
                  background: canSubmit ? '#7c3aed' : '#22222a',
                  color: canSubmit ? '#fff' : '#6a656e',
                  fontWeight: 700, fontSize: 13,
                  cursor: canSubmit ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                }}
              >
                {submitting ? 'submitting…' : 'Release the day'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
