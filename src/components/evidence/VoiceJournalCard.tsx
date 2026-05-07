/**
 * VoiceJournalCard — daily 5-min voice journal with rotating prompt.
 *
 * Records audio → uploads to evidence bucket → transcribed by Whisper →
 * stored in journal_entries. Audio also writes a voice_pitch_samples row
 * (double-duty: voice cadence + free-form journal in one ritual).
 *
 * One prompt per day, rotated by day-of-year. The prompts are designed
 * to surface specific moments rather than abstract reflection.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { estimatePitchHz } from '../../lib/voice-pitch';
import { getSignedAssetUrls } from '../../lib/storage/signed-url';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

const PROMPTS = [
  'Name the first specific moment today you noticed your body. What were you doing, what did you feel?',
  'When did you feel most like her today? Describe one minute of it.',
  'A thought you had today that scared you because it was too true. Say it now.',
  'What did the old self try to do today? Did you let it?',
  'Pick one thing you wore or held that made you feel femme. How did your body change when you noticed?',
  'When did you avoid something the protocol asked of you today? Speak the avoidance.',
  'Name a moment today when someone treated you as her. How did it land?',
];

interface RecentEntry {
  id: string;
  prompt_used: string;
  audio_url: string | null;          // object path (or legacy URL)
  signed_audio_url: string | null;   // resolved at load time for <audio src>
  transcript: string | null;
  duration_seconds: number | null;
  created_at: string;
}

export function VoiceJournalCard() {
  const { user } = useAuth();
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [doneToday, setDoneToday] = useState<boolean | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const pitchesRef = useRef<number[]>([]);
  const measureRunningRef = useRef(false);

  const todaysPrompt = PROMPTS[Math.floor(((Date.now() / 86400000) % PROMPTS.length))];

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('journal_entries')
      .select('id, prompt_used, audio_url, transcript, duration_seconds, created_at')
      .eq('user_id', user.id)
      .eq('entry_type', 'voice_journal')
      .order('created_at', { ascending: false })
      .limit(7);
    const raw = (data as Array<Omit<RecentEntry, 'signed_audio_url'>>) ?? [];
    // audio_url is an object path post-migration 260; sign each for the
    // <audio src> player. 1h TTL — entries are expanded one at a time
    // and the user re-renders the card if it goes stale.
    const signed = await getSignedAssetUrls('evidence', raw.map(r => r.audio_url));
    const rows: RecentEntry[] = raw.map((r, i) => ({ ...r, signed_audio_url: signed[i] }));
    setRecent(rows);
    const today = new Date().toISOString().slice(0, 10);
    setDoneToday(rows.some(r => r.created_at.slice(0, 10) === today));
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  useEffect(() => {
    return () => {
      measureRunningRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioContextRef.current) {
        try { audioContextRef.current.close(); } catch { /* ignore */ }
        audioContextRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];
      pitchesRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

      // Live pitch sampling via Web Audio API. Runs in parallel with
      // MediaRecorder so we get both the audio file AND a per-recording
      // pitch trace. Same source stream — no extra mic prompt.
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          if (ctx.state === 'suspended') { try { await ctx.resume(); } catch { /* ignore */ } }
          audioContextRef.current = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 2048;
          source.connect(analyser);
          const buffer = new Float32Array(analyser.fftSize);
          measureRunningRef.current = true;
          const tick = () => {
            if (!measureRunningRef.current) return;
            analyser.getFloatTimeDomainData(buffer);
            const pitch = estimatePitchHz(buffer, ctx.sampleRate);
            if (pitch > 80 && pitch < 400) pitchesRef.current.push(pitch);
            requestAnimationFrame(tick);
          };
          tick();
        }
      } catch (pitchErr) {
        console.warn('[VoiceJournal] pitch tracking unavailable (non-fatal):', pitchErr);
      }

      mr.start(1000);
      setRecording(true);
      setRecordSeconds(0);
      timerRef.current = setInterval(() => setRecordSeconds(s => s + 1), 1000);
    } catch (e) {
      setError('Mic access denied. Enable mic and try again.');
    }
  };

  const stopAndSubmit = async () => {
    if (!recording || !user?.id) return;
    setRecording(false);
    measureRunningRef.current = false;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const finalSeconds = recordSeconds;
    const allPitches = pitchesRef.current.slice();
    const avgPitch = allPitches.length > 0
      ? Math.round(allPitches.reduce((s, p) => s + p, 0) / allPitches.length)
      : 0;
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch { /* ignore */ }
      audioContextRef.current = null;
    }

    return new Promise<void>((resolve) => {
      if (!mediaRecorderRef.current) { resolve(); return; }
      mediaRecorderRef.current.onstop = async () => {
        try {
          setSubmitting(true);
          const blob = new Blob(chunksRef.current, { type: 'audio/webm' });

          // Upload audio to evidence bucket. RLS on storage.objects requires
          // (storage.foldername(name))[1] = auth.uid() — path must start with
          // user.id, not a topical folder.
          const path = `${user.id}/voice-journal/${Date.now()}.webm`;
          const { error: upErr } = await supabase.storage.from('evidence').upload(path, blob, {
            contentType: 'audio/webm',
            upsert: false,
          });
          if (upErr) throw upErr;

          // Transcribe via Whisper
          setTranscribing(true);
          const form = new FormData();
          form.append('audio', blob, 'voice-journal.webm');
          let transcript = '';
          try {
            const r = await fetch(`${SUPABASE_URL}/functions/v1/transcribe-audio`, {
              method: 'POST',
              body: form,
            });
            if (r.ok) {
              const data = await r.json() as { ok?: boolean; transcript?: string };
              if (data.ok) transcript = data.transcript || '';
            }
          } catch (e) {
            console.warn('[VoiceJournal] Whisper failed (non-fatal):', e);
          }
          setTranscribing(false);

          // Insert journal entry. audio_url stores the storage path; the
          // playback <audio> tag uses signed URL resolved at load time.
          await supabase.from('journal_entries').insert({
            user_id: user.id,
            entry_type: 'voice_journal',
            prompt_used: todaysPrompt,
            audio_url: path,
            transcript: transcript || null,
            duration_seconds: finalSeconds,
          });

          // Voice cadence double-duty — log per-recording avg pitch and
          // a downsampled trace so the longitudinal pitch chart is fed
          // by the journal recordings (not just dedicated practice).
          try {
            if (avgPitch > 0) {
              await supabase.from('voice_pitch_samples').insert({
                user_id: user.id,
                pitch_hz: avgPitch,
                context: 'voice_journal',
              });
              // Downsample the in-recording pitch trace (every ~5th frame)
              // so the trend chart has more than the avg-only point.
              const sampled = allPitches.filter((_, i) => i % 30 === 0).slice(0, 50);
              if (sampled.length > 1) {
                const rows = sampled.map(p => ({
                  user_id: user.id,
                  pitch_hz: Math.round(p),
                  context: 'voice_journal_trace',
                }));
                await supabase.from('voice_pitch_samples').insert(rows);
              }
            }
          } catch { /* non-fatal */ }

          chunksRef.current = [];
          load();
        } catch (e: unknown) {
          setError(e instanceof Error ? e.message : String(e));
        } finally {
          setSubmitting(false);
          resolve();
        }
      };
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
    });
  };

  if (doneToday === null) return null;

  const minutes = Math.floor(recordSeconds / 60);
  const seconds = recordSeconds % 60;

  return (
    <div id="card-voice-journal" style={{
      background: 'linear-gradient(135deg, #1a0f2e 0%, #0f0820 100%)',
      border: '1px solid ' + (doneToday ? '#5fc88f' : '#2d1a4d'),
      borderRadius: 10, padding: 14, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em',
          color: doneToday ? '#5fc88f' : '#c4b5fd', fontWeight: 700 }}>
          Voice journal {doneToday ? '· done ✓' : '· today'}
        </span>
        <span style={{ fontSize: 10, color: '#8a8690', marginLeft: 'auto', fontStyle: 'italic' }}>
          5 min, your voice. Counts as today&apos;s voice sample too.
        </span>
      </div>

      {!doneToday && !recording && (
        <>
          <div style={{
            background: '#050507', border: '1px solid #2d1a4d', borderRadius: 8,
            padding: 12, marginBottom: 10,
          }}>
            <div style={{ fontSize: 9.5, color: '#c4b5fd', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              today&apos;s prompt
            </div>
            <div style={{ fontSize: 13, color: '#f4c272', fontStyle: 'italic', lineHeight: 1.4 }}>
              {todaysPrompt}
            </div>
          </div>
          <button
            onClick={startRecording}
            style={{
              width: '100%', padding: '12px 14px', borderRadius: 7, border: 'none',
              background: '#7c3aed', color: '#fff',
              fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            ● start recording
          </button>
        </>
      )}

      {recording && (
        <div style={{
          background: '#2a0a14', border: '1px solid #7a1f22', borderRadius: 8, padding: 12, marginBottom: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: '#f47272' }}>● recording</span>
            <span style={{ fontSize: 14, color: '#f4c272', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>
              {minutes}:{seconds.toString().padStart(2, '0')}
            </span>
            {pitchesRef.current.length > 5 && (
              <span style={{ fontSize: 10, color: '#8b5cf6', fontWeight: 600 }}>
                ~{Math.round(pitchesRef.current.slice(-30).reduce((s, p) => s + p, 0) / Math.min(30, pitchesRef.current.length))} Hz
              </span>
            )}
            <span style={{ fontSize: 10.5, color: '#8a8690', marginLeft: 'auto' }}>
              {recordSeconds < 60 ? 'aim for 3-5 min' : recordSeconds < 180 ? 'keep going' : recordSeconds < 360 ? 'good — stop when you finish a thought' : 'long enough — wrap it up'}
            </span>
          </div>
          <div style={{ fontSize: 11, color: '#c4b5fd', fontStyle: 'italic', marginBottom: 10, lineHeight: 1.4 }}>
            {todaysPrompt}
          </div>
          <button
            onClick={stopAndSubmit}
            disabled={recordSeconds < 30 || submitting}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 5, border: 'none',
              background: recordSeconds >= 30 && !submitting ? '#7c3aed' : '#22222a',
              color: recordSeconds >= 30 && !submitting ? '#fff' : '#6a656e',
              fontWeight: 700, fontSize: 12,
              cursor: recordSeconds >= 30 && !submitting ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
            }}
          >
            {submitting ? (transcribing ? 'transcribing…' : 'uploading…') :
             recordSeconds < 30 ? `keep recording (${30 - recordSeconds}s minimum)` :
             'stop & file'}
          </button>
        </div>
      )}

      {error && <div style={{ fontSize: 11, color: '#f47272', marginBottom: 8 }}>{error}</div>}

      {recent.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          {recent.map(e => {
            const isExpanded = expandedId === e.id;
            const date = new Date(e.created_at);
            return (
              <div
                key={e.id}
                onClick={() => setExpandedId(isExpanded ? null : e.id)}
                style={{
                  padding: '7px 10px',
                  background: '#0a0a0d', border: '1px solid #2d1a4d', borderRadius: 5,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: '#c4b5fd' }}>
                    {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                  <span style={{ fontSize: 10, color: '#8a8690' }}>
                    {e.duration_seconds ? `${Math.floor(e.duration_seconds / 60)}:${(e.duration_seconds % 60).toString().padStart(2, '0')}` : '—'}
                  </span>
                  <span style={{ fontSize: 10, color: '#8a8690', marginLeft: 'auto' }}>
                    {isExpanded ? '▾' : '▸'}
                  </span>
                </div>
                {isExpanded && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 10, color: '#f4c272', fontStyle: 'italic', marginBottom: 6 }}>
                      {e.prompt_used}
                    </div>
                    {e.transcript ? (
                      <div style={{ fontSize: 11, color: '#e8e6e3', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                        {e.transcript}
                      </div>
                    ) : (
                      <div style={{ fontSize: 10, color: '#8a8690', fontStyle: 'italic' }}>
                        (no transcript captured)
                      </div>
                    )}
                    {e.signed_audio_url && (
                      <audio src={e.signed_audio_url} controls style={{ marginTop: 8, width: '100%', height: 30 }} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
