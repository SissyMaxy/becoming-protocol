/**
 * GinaSessionRecorder — floating record button + review UI for discreet
 * conversation capture. User presses record while participating in a real
 * conversation with Gina, stops when done. Audio uploads to the private
 * `gina-sessions` bucket; transcribe-gina-session transcribes + diarizes;
 * user taps "Gina = Speaker X" in the review modal; decipher-gina-session
 * extracts quotes/reactions and feeds the Handler.
 *
 * Mounted globally on Today + Handler chat. Pulses red when recording.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

type Status = 'idle' | 'recording' | 'uploading' | 'transcribing' | 'error';

interface Utterance { speaker: string; text: string; start_ms: number; end_ms: number; sentiment?: string | null }
interface PendingSession {
  id: string;
  recorded_at: string;
  duration_seconds: number | null;
  status: string;
  transcript_text: string | null;
  transcript_utterances: Utterance[] | null;
  speaker_ids: string[] | null;
  digest: string | null;
  extracted_quotes_count: number | null;
  extracted_reactions_count: number | null;
  error_message: string | null;
}

export function GinaSessionRecorder() {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingSession[]>([]);
  const [reviewing, setReviewing] = useState<PendingSession | null>(null);
  const [showPanel, setShowPanel] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadPending = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('gina_session_recordings')
      .select('id, recorded_at, duration_seconds, status, transcript_text, transcript_utterances, speaker_ids, digest, extracted_quotes_count, extracted_reactions_count, error_message')
      .eq('user_id', user.id)
      .in('status', ['transcribing', 'pending_review', 'deciphering', 'failed'])
      .order('recorded_at', { ascending: false })
      .limit(10);
    setPending((data || []) as PendingSession[]);
  }, [user?.id]);

  useEffect(() => { loadPending(); }, [loadPending]);
  useEffect(() => { const t = setInterval(loadPending, 15000); return () => clearInterval(t); }, [loadPending]);

  const startRecording = async () => {
    if (!user?.id) return;
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        await uploadAndTranscribe(chunksRef.current, recorder.mimeType || 'audio/webm');
      };
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsed(0);
      setStatus('recording');
      timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)), 500);
    } catch (err) {
      setErrorMsg((err as Error).message);
      setStatus('error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const uploadAndTranscribe = async (chunks: Blob[], mimeType: string) => {
    if (!user?.id) return;
    setStatus('uploading');
    try {
      const blob = new Blob(chunks, { type: mimeType });
      const duration = Math.floor((Date.now() - startedAtRef.current) / 1000);
      const ext = mimeType.includes('mp4') ? 'm4a' : 'webm';
      const sessionId = crypto.randomUUID();
      const path = `${user.id}/${sessionId}.${ext}`;

      // Insert row first so the edge function has a target
      await supabase.from('gina_session_recordings').insert({
        id: sessionId,
        user_id: user.id,
        storage_path: path,
        duration_seconds: duration,
        status: 'uploading',
      });

      const { error: upErr } = await supabase.storage
        .from('gina-sessions')
        .upload(path, blob, { contentType: mimeType, upsert: false });
      if (upErr) throw new Error(`upload failed: ${upErr.message}`);

      setStatus('transcribing');

      const { error: fnErr } = await supabase.functions.invoke('transcribe-gina-session', {
        body: { session_id: sessionId },
      });
      if (fnErr) throw new Error(`transcribe failed: ${fnErr.message}`);

      await loadPending();
      setStatus('idle');
      setShowPanel(true);
    } catch (err) {
      setErrorMsg((err as Error).message);
      setStatus('error');
    }
  };

  const assignSpeaker = async (session: PendingSession, ginaSpeaker: string) => {
    const { error } = await supabase.functions.invoke('decipher-gina-session', {
      body: { session_id: session.id, gina_speaker: ginaSpeaker },
    });
    if (error) {
      setErrorMsg(`decipher failed: ${error.message}`);
      return;
    }
    setReviewing(null);
    loadPending();
  };

  const fmtElapsed = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  const color = status === 'recording' ? '#f47272'
    : status === 'uploading' || status === 'transcribing' ? '#f4c272'
    : status === 'error' ? '#f47272'
    : '#f4a7c4';

  const pendingCount = pending.filter(p => p.status === 'pending_review').length;

  return (
    <>
      {/* Floating button */}
      <div style={{
        position: 'fixed', right: 20, bottom: 20, zIndex: 500,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8,
      }}>
        {pendingCount > 0 && status === 'idle' && !showPanel && (
          <button
            onClick={() => setShowPanel(true)}
            style={{
              padding: '6px 12px', borderRadius: 14, fontSize: 11, fontWeight: 600,
              background: '#7c3aed', color: '#fff', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(124,58,237,0.4)',
            }}
          >
            {pendingCount} session{pendingCount === 1 ? '' : 's'} ready to tag
          </button>
        )}

        <button
          onClick={status === 'recording' ? stopRecording : status === 'idle' ? startRecording : () => setShowPanel(true)}
          disabled={status === 'uploading' || status === 'transcribing'}
          title={status === 'recording' ? 'Stop recording' : 'Record Gina conversation'}
          style={{
            width: 56, height: 56, borderRadius: '50%', border: 'none',
            background: color,
            color: '#1a0a12', cursor: 'pointer',
            boxShadow: status === 'recording'
              ? '0 0 0 0 rgba(244,114,114,0.7), 0 6px 18px rgba(244,114,114,0.5)'
              : '0 4px 14px rgba(0,0,0,0.4)',
            animation: status === 'recording' ? 'gsrPulse 1.5s infinite' : undefined,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {status === 'recording' ? (
            <span style={{ width: 16, height: 16, background: '#1a0a12', borderRadius: 2 }} />
          ) : status === 'uploading' || status === 'transcribing' ? (
            <span style={{ fontSize: 10, fontWeight: 700 }}>{status === 'uploading' ? 'UP' : 'TX'}</span>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="#1a0a12">
              <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM19 11a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V21a1 1 0 0 0 2 0v-3.08A7 7 0 0 0 19 11z"/>
            </svg>
          )}
        </button>

        {status === 'recording' && (
          <div style={{ fontSize: 11, color: '#f47272', fontVariantNumeric: 'tabular-nums', fontFamily: 'ui-monospace, monospace' }}>
            ● REC {fmtElapsed(elapsed)}
          </div>
        )}
        {(status === 'uploading' || status === 'transcribing') && (
          <div style={{ fontSize: 10.5, color: '#8a8690' }}>
            {status === 'uploading' ? 'uploading…' : 'transcribing… (~30s)'}
          </div>
        )}
      </div>

      <style>{`@keyframes gsrPulse { 0% { box-shadow: 0 0 0 0 rgba(244,114,114,0.6), 0 6px 18px rgba(244,114,114,0.4); } 70% { box-shadow: 0 0 0 18px rgba(244,114,114,0), 0 6px 18px rgba(244,114,114,0.4); } 100% { box-shadow: 0 0 0 0 rgba(244,114,114,0), 0 6px 18px rgba(244,114,114,0.4); } }`}</style>

      {/* Error toast */}
      {errorMsg && (
        <div style={{
          position: 'fixed', bottom: 90, right: 20, zIndex: 501,
          background: '#2a0a0c', border: '1px solid #7a1f22', borderRadius: 8,
          padding: '10px 14px', maxWidth: 340, fontSize: 11.5, color: '#f47272',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <span>{errorMsg}</span>
            <button onClick={() => { setErrorMsg(null); setStatus('idle'); }} style={{ background: 'none', border: 'none', color: '#f47272', cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
          </div>
        </div>
      )}

      {/* Pending sessions panel */}
      {showPanel && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(5,3,10,0.94)', zIndex: 450,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, overflowY: 'auto',
        }}>
          <div style={{ maxWidth: 620, width: '100%', background: '#111116', border: '1px solid #2d1a4d', borderRadius: 12, padding: 22, color: '#e8e6e3', margin: '20px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#f4a7c4', fontWeight: 700 }}>Captured sessions</span>
              <button onClick={() => setShowPanel(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#8a8690', fontSize: 18, cursor: 'pointer', padding: 0 }}>×</button>
            </div>
            {pending.length === 0 && <div style={{ fontSize: 12, color: '#8a8690' }}>No sessions pending. Hit record when you're with Gina.</div>}
            {pending.map(p => (
              <SessionRow key={p.id} session={p} onOpenReview={() => setReviewing(p)} />
            ))}
          </div>
        </div>
      )}

      {/* Review modal */}
      {reviewing && (
        <SessionReviewModal
          session={reviewing}
          onAssign={assignSpeaker}
          onClose={() => setReviewing(null)}
        />
      )}
    </>
  );
}

function SessionRow({ session, onOpenReview }: { session: PendingSession; onOpenReview: () => void }) {
  const when = new Date(session.recorded_at);
  const label = session.status === 'pending_review' ? 'tag speakers'
    : session.status === 'transcribing' ? 'transcribing…'
    : session.status === 'deciphering' ? 'deciphering…'
    : session.status === 'failed' ? 'failed'
    : session.status;
  return (
    <div style={{
      background: '#0a0a0d', border: '1px solid #22222a', borderRadius: 8,
      padding: 12, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: '#e8e6e3' }}>
          {when.toLocaleDateString()} {when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {session.duration_seconds ? ` · ${Math.floor(session.duration_seconds / 60)}m ${session.duration_seconds % 60}s` : ''}
        </div>
        {session.status === 'failed' && session.error_message && (
          <div style={{ fontSize: 10.5, color: '#f47272', marginTop: 3 }}>{session.error_message}</div>
        )}
        {session.status === 'pending_review' && session.transcript_text && (
          <div style={{ fontSize: 10.5, color: '#8a8690', marginTop: 3, fontStyle: 'italic' }}>
            "{session.transcript_text.slice(0, 90)}…"
          </div>
        )}
      </div>
      {session.status === 'pending_review' ? (
        <button onClick={onOpenReview} style={{
          background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6,
          padding: '6px 12px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }}>{label}</button>
      ) : (
        <span style={{ fontSize: 11, color: session.status === 'failed' ? '#f47272' : '#c4b5fd' }}>{label}</span>
      )}
    </div>
  );
}

function SessionReviewModal({
  session,
  onAssign,
  onClose,
}: {
  session: PendingSession;
  onAssign: (s: PendingSession, ginaSpeaker: string) => void;
  onClose: () => void;
}) {
  const utterances = session.transcript_utterances || [];
  const speakers = session.speaker_ids || [];
  const samples: Record<string, string[]> = {};
  const counts: Record<string, number> = {};
  for (const sp of speakers) { samples[sp] = []; counts[sp] = 0; }
  for (const u of utterances) {
    counts[u.speaker] = (counts[u.speaker] || 0) + 1;
    if ((samples[u.speaker] || []).length < 3 && u.text && u.text.length > 10) {
      samples[u.speaker] = [...(samples[u.speaker] || []), u.text.slice(0, 140)];
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(5,3,10,0.96)', zIndex: 500,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, overflowY: 'auto',
    }}>
      <div style={{ maxWidth: 680, width: '100%', background: '#111116', border: '1px solid #7a1f4d', borderRadius: 12, padding: 22, color: '#e8e6e3', margin: '20px 0' }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#f4a7c4', fontWeight: 700, marginBottom: 6 }}>Tag speakers</div>
        <div style={{ fontSize: 12, color: '#8a8690', marginBottom: 16 }}>
          Which speaker is Gina? The Handler needs this to route her lines into the voice corpus and extract reactions.
        </div>

        {speakers.length === 0 && (
          <div style={{ fontSize: 12, color: '#f47272' }}>No speakers detected. This session may have been too short or too quiet.</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          {speakers.map(sp => (
            <div key={sp} style={{ background: '#0a0a0d', border: '1px solid #22222a', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#e8e6e3' }}>Speaker {sp}</span>
                <span style={{ fontSize: 10.5, color: '#8a8690' }}>{counts[sp]} utterance{counts[sp] === 1 ? '' : 's'}</span>
                <button onClick={() => onAssign(session, sp)} style={{
                  marginLeft: 'auto', background: '#7c3aed', color: '#fff', border: 'none',
                  borderRadius: 6, padding: '6px 12px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}>This is Gina</button>
              </div>
              {(samples[sp] || []).map((s, i) => (
                <div key={i} style={{ fontSize: 11.5, color: '#c8c4cc', fontStyle: 'italic', marginBottom: 3 }}>"{s}"</div>
              ))}
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid #22222a', paddingTop: 12, marginTop: 8 }}>
          <div style={{ fontSize: 10, color: '#6a656e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Full transcript</div>
          <div style={{ fontSize: 11, color: '#c8c4cc', maxHeight: 280, overflowY: 'auto', fontFamily: 'ui-monospace, monospace', background: '#0a0a0d', padding: 10, borderRadius: 6, border: '1px solid #22222a' }}>
            {utterances.map((u, i) => (
              <div key={i} style={{ marginBottom: 5 }}>
                <span style={{ color: '#f4a7c4', fontWeight: 700 }}>[{u.speaker}]</span>{' '}
                <span>{u.text}</span>
              </div>
            ))}
          </div>
        </div>

        <button onClick={onClose} style={{
          marginTop: 14, padding: '8px 16px', borderRadius: 6,
          background: 'none', border: '1px solid #22222a', color: '#8a8690', cursor: 'pointer', fontFamily: 'inherit',
        }}>Cancel</button>
      </div>
    </div>
  );
}
