/**
 * EveningConfessionGate — 8pm–11pm local window. Audio-required confession
 * of the day's feminine behaviors + slips. Whisper transcribes. On submit:
 * insert evening_confession_submissions row (status='confessed'), call the
 * evening-confession-prescribe edge function, which generates tomorrow's
 * feminization_prescriptions from the transcript and queues a morning
 * preview outreach.
 *
 * Implements the mommy_code_wishes entry: "Mama Makes You Ache All Night,
 * Baby Girl" (force_feminization / mommy_persona, medium, 2026-05-11).
 *
 * Hard floors (mirroring the post-2026-05-14 voice-gate pattern):
 *   - No typed bypass. Audio only.
 *   - Whisper is the sole authority; if transcription fails or the
 *     transcript is too short (< 80 chars ≈ 15s of talking), the gate
 *     doesn't open and tells her why.
 *   - One submission per user per local-date. Re-opens after midnight if
 *     yesterday was missed (status flips to 'missed' via end-of-window
 *     sweeper, separate from this component).
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const MIN_RECORD_SECONDS = 15;
const MIN_TRANSCRIPT_CHARS = 80;
const MAX_RECORD_SECONDS = 180;

const WINDOW_START_HOUR = 20; // 8pm local
const WINDOW_END_HOUR = 23;   // exclusive — open through 22:59

function localDateKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function currentHourLocal(): number {
  return new Date().getHours();
}

/**
 * Self-gating evening-confession ritual. Mounts unconditionally from App.tsx;
 * decides internally whether to render based on (a) the 20:00–22:59 local
 * window and (b) whether today's submission row already exists.
 */
export function EveningConfessionGate() {
  const { user } = useAuth();
  const [shouldRender, setShouldRender] = useState<boolean>(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState<boolean | null>(null);
  const [hour, setHour] = useState<number>(currentHourLocal());

  // Re-check the hour every minute so the gate auto-opens at 20:00 and
  // auto-closes at 23:00 without a page refresh.
  useEffect(() => {
    const t = setInterval(() => setHour(currentHourLocal()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Check submission status when the user lands AND when the window opens.
  useEffect(() => {
    if (!user?.id) return;
    if (hour < WINDOW_START_HOUR || hour >= WINDOW_END_HOUR) {
      setShouldRender(false);
      return;
    }
    void (async () => {
      const { data } = await supabase
        .from('evening_confession_submissions')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('submission_date', localDateKey())
        .maybeSingle();
      const done = Boolean(data && (data as { status: string }).status !== 'pending');
      setAlreadySubmitted(done);
      setShouldRender(!done);
    })();
  }, [user?.id, hour]);

  const handleDismiss = useCallback(() => {
    setAlreadySubmitted(true);
    setShouldRender(false);
  }, []);

  if (!shouldRender || alreadySubmitted) return null;

  return <EveningConfessionGateInner onPass={handleDismiss} />;
}

interface EveningConfessionGateProps {
  onPass: () => void;
}

function EveningConfessionGateInner({ onPass }: EveningConfessionGateProps) {
  const { user } = useAuth();

  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [audioOk, setAudioOk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prescriptionSummary, setPrescriptionSummary] = useState<string | null>(null);
  const [step, setStep] = useState<'confess' | 'done'>('confess');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastBlobRef = useRef<Blob | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
        mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setTranscript('');
    setAudioOk(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start(1000);
      setRecording(true);
      setRecordSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordSeconds(s => {
          const next = s + 1;
          if (next >= MAX_RECORD_SECONDS) void stopRecording();
          return next;
        });
      }, 1000);
    } catch {
      setError('Mic access blocked. Allow microphone — there is no typed bypass.');
      setRecording(false);
    }
    // stopRecording is declared below; intentional cycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopRecording = useCallback(async () => {
    if (!recording) return;
    setRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    return new Promise<void>((resolve) => {
      if (!mediaRecorderRef.current) { resolve(); return; }
      const mr = mediaRecorderRef.current;
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        lastBlobRef.current = blob;
        if (blob.size === 0) {
          setError('No audio captured. Try again.');
          resolve();
          return;
        }

        // Whisper transcribe — sole authority for "did she actually speak."
        try {
          const form = new FormData();
          form.append('audio', blob, 'evening-confession.webm');
          const r = await fetch(`${SUPABASE_URL}/functions/v1/transcribe-audio`, {
            method: 'POST',
            body: form,
          });
          if (r.ok) {
            const data = await r.json() as { ok?: boolean; transcript?: string };
            if (data.ok && data.transcript) {
              const t = data.transcript.trim();
              setTranscript(t);
              if (t.length >= MIN_TRANSCRIPT_CHARS) {
                setAudioOk(true);
                setError(null);
              } else {
                setAudioOk(false);
                setError(`Too short — tell me more, baby. Mama needs at least ${MIN_TRANSCRIPT_CHARS} characters of voice. You gave me ${t.length}.`);
              }
            } else {
              setError('Could not hear you clearly. Try again.');
            }
          } else {
            setError('Transcription failed. Try again.');
          }
        } catch {
          setError('Could not reach the transcriber. Try again.');
        }
        try {
          mr.stream.getTracks().forEach(t => t.stop());
        } catch { /* ignore */ }
        resolve();
      };
      try { mr.stop(); } catch { resolve(); }
    });
  }, [recording]);

  const canSubmit = audioOk && !submitting && !recording && recordSeconds >= MIN_RECORD_SECONDS;

  const submit = useCallback(async () => {
    if (!user?.id || !canSubmit || !lastBlobRef.current) return;
    setSubmitting(true);
    setError(null);

    try {
      // 1. Upload audio
      const ts = Date.now();
      const path = `${user.id}/evening-confession/${localDateKey()}-${ts}.webm`;
      const { error: upErr } = await supabase.storage
        .from('evidence')
        .upload(path, lastBlobRef.current, { contentType: 'audio/webm', upsert: false });
      if (upErr) {
        setError('Upload failed: ' + upErr.message);
        setSubmitting(false);
        return;
      }

      // 2. Insert submission row (status='confessed')
      const { data: row, error: insErr } = await supabase
        .from('evening_confession_submissions')
        .insert({
          user_id: user.id,
          submission_date: localDateKey(),
          audio_storage_path: path,
          audio_duration_seconds: recordSeconds,
          transcript: transcript.slice(0, 10000),
          whisper_ok: true,
          status: 'confessed',
        })
        .select('id')
        .single();

      if (insErr) {
        // Most likely cause: unique constraint hit — already submitted today.
        setError(insErr.message.includes('duplicate') || insErr.message.includes('unique')
          ? 'You already confessed tonight. Tomorrow.'
          : insErr.message);
        setSubmitting(false);
        return;
      }

      // 3. Kick the prescription generator (fire-and-forget; the gate
      //    dismisses on success regardless of whether prescriptions finish
      //    before she leaves the screen).
      const submissionId = (row as { id: string }).id;
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/evening-confession-prescribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ submission_id: submissionId }),
        });
        if (r.ok) {
          const data = await r.json() as { ok?: boolean; prescriptions_count?: number; summary?: string };
          if (data.ok && data.prescriptions_count) {
            setPrescriptionSummary(data.summary ?? `${data.prescriptions_count} prescriptions for tomorrow.`);
          }
        }
      } catch (e) {
        console.warn('[EveningConfession] prescription kick failed (non-fatal):', e);
      }

      setStep('done');
      setSubmitting(false);

      // Auto-dismiss after a beat so she sees the confirmation.
      setTimeout(() => onPass(), 4000);
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
    }
  }, [user?.id, canSubmit, recordSeconds, transcript, onPass]);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(5,3,10,0.98)', zIndex: 900,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{ maxWidth: 620, width: '100%', background: '#111116', border: '1px solid #7a1f4d', borderRadius: 14, padding: 28 }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#f4a7c4', fontWeight: 700, marginBottom: 4 }}>
          Evening confession · compulsory
        </div>
        <div style={{ fontSize: 10.5, color: '#8a8690', marginBottom: 14 }}>
          {step === 'done' ? 'Done. Mama will use this.' : '8–11pm window · voice only · no typed bypass'}
        </div>

        {step === 'confess' && (
          <>
            <div style={{ fontSize: 13, color: '#e8e6e3', lineHeight: 1.6, marginBottom: 14 }}>
              Tell Mama about your day, baby. What you did that was feminine. What slipped. What you almost did the old way and didn't. What you felt becoming. Mama will use it to write tomorrow's prescriptions.
            </div>

            <div style={{
              fontSize: 12, color: '#c4b5fd', background: '#050507',
              border: '1px solid #2d1a4d', borderRadius: 8,
              padding: '12px 14px', marginBottom: 16, lineHeight: 1.55,
            }}>
              Speak at least {MIN_RECORD_SECONDS}s. Whisper transcribes — say whatever you need to say, but say it out loud. Mama needs your voice, not your fingers.
            </div>

            {!recording && !audioOk && (
              <button
                onClick={startRecording}
                disabled={submitting}
                style={{
                  width: '100%', padding: '14px 14px', borderRadius: 7, border: 'none',
                  background: '#7c3aed', color: '#fff',
                  fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                  marginBottom: 10,
                }}
              >
                ● start confessing
              </button>
            )}

            {recording && (
              <div style={{
                background: '#2a0a14', border: '1px solid #7a1f22', borderRadius: 8, padding: 14, marginBottom: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: '#f47272' }}>● recording</span>
                  <span style={{ fontSize: 11, color: '#8a8690' }}>{recordSeconds}s</span>
                  <span style={{ fontSize: 10, color: recordSeconds >= MIN_RECORD_SECONDS ? '#5fc88f' : '#8a8690', marginLeft: 'auto' }}>
                    {recordSeconds >= MIN_RECORD_SECONDS ? '✓ enough · keep going or stop' : `${MIN_RECORD_SECONDS - recordSeconds}s more for the minimum`}
                  </span>
                </div>
                <button
                  onClick={stopRecording}
                  style={{
                    marginTop: 4, padding: '8px 14px', borderRadius: 5, border: '1px solid #7a1f22',
                    background: 'transparent', color: '#f4a7c4',
                    fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  stop recording
                </button>
              </div>
            )}

            {transcript && !recording && (
              <div style={{
                background: '#050507', border: '1px solid #22222a', borderRadius: 8,
                padding: 12, marginBottom: 10,
              }}>
                <div style={{ fontSize: 10, color: '#8a8690', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  Whisper heard ({transcript.length} chars)
                </div>
                <div style={{
                  fontSize: 12, color: '#c4b5fd', lineHeight: 1.5,
                  maxHeight: 140, overflowY: 'auto',
                }}>
                  {transcript}
                </div>
              </div>
            )}

            {error && (
              <div style={{
                fontSize: 12, color: '#f47272', background: '#2a0a14',
                border: '1px solid #7a1f22', borderRadius: 6, padding: 10, marginBottom: 10,
              }}>
                {error}
              </div>
            )}

            <button
              onClick={submit}
              disabled={!canSubmit}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 7, border: 'none',
                background: canSubmit ? '#7c3aed' : '#22222a',
                color: canSubmit ? '#fff' : '#6a656e',
                fontWeight: 700, fontSize: 13,
                cursor: canSubmit ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
              }}
            >
              {submitting ? 'submitting…' : canSubmit ? 'give it to Mama' : audioOk ? 'submit' : 'record at least 15s first'}
            </button>
          </>
        )}

        {step === 'done' && (
          <>
            <div style={{
              background: '#0a2a18', border: '1px solid #5fc88f', borderRadius: 8,
              padding: 16, marginBottom: 12,
            }}>
              <div style={{ fontSize: 14, color: '#5fc88f', fontWeight: 600, marginBottom: 6 }}>
                ✓ Mama has it.
              </div>
              <div style={{ fontSize: 12, color: '#9fd9b3', lineHeight: 1.55 }}>
                {prescriptionSummary
                  ? prescriptionSummary
                  : "Tomorrow's prescriptions are being written. They'll be waiting when you open the app."}
              </div>
            </div>
            <div style={{ fontSize: 11, color: '#8a8690', textAlign: 'center' }}>
              Closing in a moment…
            </div>
          </>
        )}
      </div>
    </div>
  );
}
