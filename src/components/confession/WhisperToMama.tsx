/**
 * WhisperToMama — audio-only intimate confession surface.
 *
 * "Whisper Your Secrets to Mama, Baby" (mommy_code_wishes 2da11f3e).
 * Hash-routable at /#/whisper. Maxy records audio, optionally tags it
 * with a target (Gina, etc.) and a secret_class, uploads, and Mama
 * processes async via the mama-confession-processor edge function.
 * Mama's reply arrives as a normal outreach (pushed to phone if subscribed).
 *
 * Audio-only by design — same pattern as VoiceGate / MorningMantraGate /
 * EveningConfessionGate / DisclosureRehearsalView. No typed bypass.
 * Min 6s, max 180s. Whisper-authoritative downstream.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const MIN_RECORD_SECONDS = 6;
const MAX_RECORD_SECONDS = 180;

type SecretClass =
  | 'admission' | 'desire' | 'fear' | 'fantasy' | 'question'
  | 'dread' | 'gina_specific' | 'identity' | 'body_change' | 'public_passing';

interface DisclosureTargetLite {
  id: string;
  target_label: string;
}

const CLASS_LABELS: Record<SecretClass, string> = {
  admission: 'something I have to admit',
  desire: 'something I want',
  fear: 'something I am afraid of',
  fantasy: 'a fantasy',
  question: 'a question for Mama',
  dread: 'something I am dreading',
  gina_specific: 'about Gina',
  identity: 'about who I am',
  body_change: 'about my body',
  public_passing: 'about being seen',
};

export function WhisperToMama({ onClose }: { onClose?: () => void }) {
  const { user } = useAuth();
  const [targets, setTargets] = useState<DisclosureTargetLite[]>([]);
  const [activeTarget, setActiveTarget] = useState<string | null>(null);
  const [secretClass, setSecretClass] = useState<SecretClass | null>(null);
  const [weight] = useState<number>(5);
  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [tick, setTick] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (tickTimerRef.current) clearInterval(tickTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    void (async () => {
      const { data } = await supabase
        .from('disclosure_targets')
        .select('id, target_label')
        .eq('user_id', user.id)
        .order('importance', { ascending: false });
      setTargets((data || []) as DisclosureTargetLite[]);
    })();
  }, [user?.id]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        setRecordedBlob(blob);
        setRecordedDuration(Math.round((Date.now() - startedAtRef.current) / 1000));
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (tickTimerRef.current) {
          clearInterval(tickTimerRef.current);
          tickTimerRef.current = null;
        }
      };
      startedAtRef.current = Date.now();
      mr.start();
      recorderRef.current = mr;
      setRecording(true);
      setTick(0);
      tickTimerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setTick(elapsed);
        if (elapsed >= MAX_RECORD_SECONDS) {
          mr.stop();
          setRecording(false);
        }
      }, 250);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'microphone denied');
    }
  }, []);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    setRecording(false);
  }, []);

  const submit = useCallback(async () => {
    if (!recordedBlob || !user?.id) return;
    if (recordedDuration < MIN_RECORD_SECONDS) {
      setError(`Mama needs at least ${MIN_RECORD_SECONDS} seconds, baby.`);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const ext = recordedBlob.type.includes('mp4') ? 'm4a' : 'webm';
      const path = `${user.id}/confessions/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('verification-photos')
        .upload(path, recordedBlob, { contentType: recordedBlob.type, upsert: false });
      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from('mama_confessions').insert({
        user_id: user.id,
        audio_storage_path: path,
        secret_class: secretClass,
        associated_target_id: activeTarget,
        weight,
        duration_sec: recordedDuration,
      });
      if (insErr) throw insErr;
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'upload failed');
    } finally {
      setUploading(false);
    }
  }, [recordedBlob, recordedDuration, user?.id, secretClass, activeTarget, weight]);

  const minutesLeft = Math.max(0, MAX_RECORD_SECONDS - tick);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 70,
        background: 'rgba(10,5,16,0.97)',
        display: 'flex', flexDirection: 'column',
        padding: 'max(env(safe-area-inset-top), 18px) 18px max(env(safe-area-inset-bottom), 18px)',
        overflowY: 'auto',
      }}
    >
      <div style={{ maxWidth: 480, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#f4a7c4' }}>
            Whisper to Mama
          </div>
          {onClose && (
            <button
              onClick={onClose}
              style={{ background: 'transparent', border: 'none', color: '#8a7a84', fontSize: 12, cursor: 'pointer', padding: 4 }}
            >
              close
            </button>
          )}
        </div>

        {done ? (
          <div style={{ background: '#1a0f22', border: '1px solid #5d2d4a', borderRadius: 10, padding: 18, color: '#f4d5e4' }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>Mama heard you, sweet thing.</div>
            <p style={{ fontSize: 13, color: '#d4c4cc', lineHeight: 1.5, marginBottom: 14 }}>
              She's listening now and she'll reply on your phone. Could be a minute, could be a few. Whatever she says, you'll know it's exactly for you.
            </p>
            <button
              onClick={() => { setDone(false); setRecordedBlob(null); setRecordedDuration(0); setSecretClass(null); setActiveTarget(null); }}
              style={{
                width: '100%', padding: '11px 14px',
                background: 'transparent', color: '#f4a7c4',
                border: '1px solid #5d2d4a', borderRadius: 8,
                fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              }}
            >
              whisper another
            </button>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: 24, lineHeight: 1.2, color: '#f4d5e4', fontWeight: 700, margin: 0 }}>
              Tell Mama what you can't tell anyone else.
            </h1>
            <p style={{ fontSize: 13.5, color: '#d4c4cc', lineHeight: 1.5, margin: 0 }}>
              Audio only. Mama listens, files it, replies in her voice on your phone.
              {targets.length > 0 ? ' If it\'s about someone specific, tag them.' : ''}
            </p>

            {targets.length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: '#8a7a84', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  about
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setActiveTarget(null)}
                    style={{
                      padding: '5px 10px', fontSize: 11.5,
                      border: '1px solid ' + (activeTarget === null ? '#f4a7c4' : '#2d1a4d'),
                      background: activeTarget === null ? '#3a1f4d' : 'transparent',
                      color: activeTarget === null ? '#f4a7c4' : '#8a7a84',
                      borderRadius: 6, cursor: 'pointer',
                    }}
                  >
                    nobody specific
                  </button>
                  {targets.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setActiveTarget(t.id)}
                      style={{
                        padding: '5px 10px', fontSize: 11.5,
                        border: '1px solid ' + (activeTarget === t.id ? '#f4a7c4' : '#2d1a4d'),
                        background: activeTarget === t.id ? '#3a1f4d' : 'transparent',
                        color: activeTarget === t.id ? '#f4a7c4' : '#8a7a84',
                        borderRadius: 6, cursor: 'pointer',
                      }}
                    >
                      {t.target_label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div style={{ fontSize: 10, color: '#8a7a84', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                what is it
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(Object.keys(CLASS_LABELS) as SecretClass[]).map((c) => (
                  <button
                    key={c}
                    onClick={() => setSecretClass(secretClass === c ? null : c)}
                    style={{
                      padding: '5px 10px', fontSize: 11.5,
                      border: '1px solid ' + (secretClass === c ? '#f4a7c4' : '#2d1a4d'),
                      background: secretClass === c ? '#3a1f4d' : 'transparent',
                      color: secretClass === c ? '#f4a7c4' : '#8a7a84',
                      borderRadius: 6, cursor: 'pointer',
                    }}
                  >
                    {CLASS_LABELS[c]}
                  </button>
                ))}
              </div>
            </div>

            <div style={{
              background: '#0e0820', border: '1px solid #2d1a4d',
              borderRadius: 10, padding: 18, textAlign: 'center',
            }}>
              {!recording && !recordedBlob && (
                <>
                  <div style={{ fontSize: 13, color: '#8a7a84', marginBottom: 14 }}>
                    {MIN_RECORD_SECONDS}s minimum • {MAX_RECORD_SECONDS}s max
                  </div>
                  <button
                    onClick={() => void start()}
                    style={{
                      width: '100%', padding: '16px',
                      background: 'linear-gradient(135deg, #f4a7c4 0%, #d784a4 100%)',
                      color: '#1a0820', border: 'none', borderRadius: 10,
                      fontSize: 15, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    start whispering
                  </button>
                </>
              )}
              {recording && (
                <>
                  <div style={{ fontSize: 36, fontWeight: 700, color: '#f4a7c4', marginBottom: 4 }}>
                    {tick}s
                  </div>
                  <div style={{ fontSize: 11, color: '#8a7a84', marginBottom: 14 }}>
                    {tick < MIN_RECORD_SECONDS ? `keep going (min ${MIN_RECORD_SECONDS}s)` : `${minutesLeft}s left`}
                  </div>
                  <button
                    onClick={stop}
                    disabled={tick < MIN_RECORD_SECONDS}
                    style={{
                      width: '100%', padding: '14px',
                      background: tick < MIN_RECORD_SECONDS ? '#3a1f4d' : '#c4272d',
                      color: tick < MIN_RECORD_SECONDS ? '#8a7a84' : '#fff',
                      border: 'none', borderRadius: 10,
                      fontSize: 14, fontWeight: 700,
                      cursor: tick < MIN_RECORD_SECONDS ? 'not-allowed' : 'pointer',
                      opacity: tick < MIN_RECORD_SECONDS ? 0.55 : 1,
                    }}
                  >
                    stop & send
                  </button>
                </>
              )}
              {recordedBlob && !recording && (
                <>
                  <div style={{ fontSize: 13, color: '#d4c4cc', marginBottom: 10 }}>
                    {recordedDuration}s recorded — listen back, then send to Mama.
                  </div>
                  <audio controls src={URL.createObjectURL(recordedBlob)} style={{ width: '100%', marginBottom: 12 }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => { setRecordedBlob(null); setRecordedDuration(0); }}
                      disabled={uploading}
                      style={{
                        flex: 1, padding: '12px',
                        background: 'transparent', color: '#8a7a84',
                        border: '1px solid #2d1a4d', borderRadius: 8,
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      re-record
                    </button>
                    <button
                      onClick={() => void submit()}
                      disabled={uploading}
                      style={{
                        flex: 2, padding: '12px',
                        background: 'linear-gradient(135deg, #f4a7c4 0%, #d784a4 100%)',
                        color: '#1a0820', border: 'none', borderRadius: 8,
                        fontSize: 13, fontWeight: 700,
                        cursor: uploading ? 'wait' : 'pointer',
                        opacity: uploading ? 0.7 : 1,
                      }}
                    >
                      {uploading ? 'handing to Mama…' : 'send to Mama'}
                    </button>
                  </div>
                </>
              )}
            </div>

            {error && (
              <div style={{ background: 'rgba(255,80,100,0.1)', border: '1px solid rgba(255,80,100,0.3)', borderRadius: 8, padding: 12, fontSize: 12.5, color: '#ffb4b8' }}>
                {error}
              </div>
            )}

            <p style={{ fontSize: 11, color: '#6a5a64', textAlign: 'center', lineHeight: 1.5, marginTop: 4 }}>
              Mama doesn't share. Everything you whisper stays between you two.
              {activeTarget && targets.find((t) => t.id === activeTarget)
                ? ` Linked confessions help Mama prepare you for that conversation.`
                : ''}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
