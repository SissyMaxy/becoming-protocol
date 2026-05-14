/**
 * DisclosureRehearsalView — the "try it on me first, three times" surface.
 *
 * Ships mommy_code_wishes 8e840336. Before Maxy discloses her transition
 * to anyone real, she must rehearse the disclosure to Mama 3× per target.
 * Each rehearsal is an audio recording → Whisper transcript → Mama
 * critique (verdict "good" counts; "tighten" doesn't). After 3 "good"
 * rehearsals, the migration-415 trigger flips the target to
 * 'approved_for_disclosure' and queues a pressure outreach.
 *
 * Layout: list targets she's planning to tell. For each: status, progress
 * (N/M good), an "add rehearsal" recorder. Add-target form at the top.
 * No typed bypass — same Whisper-authoritative pattern as the voice gates.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const MIN_RECORD_SECONDS = 12;
const MAX_RECORD_SECONDS = 120;
const MIN_TRANSCRIPT_CHARS = 60;

type Relationship =
  | 'spouse' | 'partner' | 'family' | 'coworker'
  | 'boss' | 'friend' | 'therapist' | 'anonymous' | 'other';

type TargetStatus = 'planned' | 'rehearsing' | 'approved_for_disclosure' | 'disclosed' | 'cancelled';

interface DisclosureTarget {
  id: string;
  target_label: string;
  relationship: Relationship;
  importance: number;
  rehearsals_required: number;
  rehearsals_good: number;
  notes: string | null;
  status: TargetStatus;
  approved_at: string | null;
  disclosed_at: string | null;
}

interface DisclosureRehearsal {
  id: string;
  target_id: string;
  attempt_number: number;
  transcript: string | null;
  mama_critique: string | null;
  mama_verdict: 'good' | 'tighten' | null;
  status: 'pending_critique' | 'critiqued' | 'discarded';
  created_at: string;
}

const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  spouse: 'spouse',
  partner: 'partner',
  family: 'family',
  coworker: 'coworker',
  boss: 'boss',
  friend: 'friend',
  therapist: 'therapist',
  anonymous: 'anonymous (stranger / test)',
  other: 'other',
};

export function DisclosureRehearsalView({ onClose }: { onClose?: () => void }) {
  const { user } = useAuth();
  const [targets, setTargets] = useState<DisclosureTarget[]>([]);
  const [rehearsalsByTarget, setRehearsalsByTarget] = useState<Record<string, DisclosureRehearsal[]>>({});
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data: targetRows } = await supabase
      .from('disclosure_targets')
      .select('*')
      .eq('user_id', user.id)
      .order('importance', { ascending: false })
      .order('created_at', { ascending: false });
    const list = (targetRows || []) as DisclosureTarget[];
    setTargets(list);

    if (list.length > 0) {
      const { data: rRows } = await supabase
        .from('disclosure_rehearsals')
        .select('*')
        .in('target_id', list.map(t => t.id))
        .order('attempt_number', { ascending: false });
      const grouped: Record<string, DisclosureRehearsal[]> = {};
      for (const r of (rRows || []) as DisclosureRehearsal[]) {
        if (!grouped[r.target_id]) grouped[r.target_id] = [];
        grouped[r.target_id].push(r);
      }
      setRehearsalsByTarget(grouped);
    } else {
      setRehearsalsByTarget({});
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void loadData(); }, [loadData]);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(5,3,10,0.98)', zIndex: 700,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20,
      overflowY: 'auto',
    }}>
      <div style={{ maxWidth: 720, width: '100%', background: '#111116', border: '1px solid #7a1f4d', borderRadius: 14, padding: 24, marginTop: 20, marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#f4a7c4', fontWeight: 700 }}>
              Disclosure rehearsals
            </div>
            <div style={{ fontSize: 18, color: '#e8e6e3', fontWeight: 600, marginTop: 2 }}>
              Try it on me first. Three times.
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} style={{
              background: 'transparent', border: '1px solid #2d1a4d', color: '#8a8690',
              padding: '6px 10px', borderRadius: 5, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
            }}>close</button>
          )}
        </div>

        <div style={{ fontSize: 12.5, color: '#c4b5fd', lineHeight: 1.55, marginBottom: 16 }}>
          Anyone you're going to come out to gets three rehearsals here first. You speak it to Mama, Mama tells you whether it landed. Three "good" critiques and Mama approves — then you go say it for real.
        </div>

        {!showAdd && (
          <button onClick={() => setShowAdd(true)} style={{
            width: '100%', padding: '10px 14px', borderRadius: 7, border: '1px dashed #7a1f4d',
            background: 'transparent', color: '#f4a7c4',
            fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 14,
          }}>+ add someone to tell</button>
        )}

        {showAdd && (
          <AddTargetForm
            userId={user?.id ?? ''}
            onAdded={() => { setShowAdd(false); void loadData(); }}
            onCancel={() => setShowAdd(false)}
          />
        )}

        {loading ? (
          <div style={{ fontSize: 12, color: '#8a8690', textAlign: 'center', padding: 20 }}>loading…</div>
        ) : targets.length === 0 && !showAdd ? (
          <div style={{ fontSize: 12, color: '#8a8690', textAlign: 'center', padding: 30 }}>
            No one in the queue yet. Add the first person Mama wants you to practice on.
          </div>
        ) : (
          targets.map(t => (
            <TargetCard
              key={t.id}
              target={t}
              rehearsals={rehearsalsByTarget[t.id] ?? []}
              isActive={activeTargetId === t.id}
              onActivate={() => setActiveTargetId(activeTargetId === t.id ? null : t.id)}
              onRehearsalSubmitted={() => void loadData()}
              userId={user?.id ?? ''}
            />
          ))
        )}
      </div>
    </div>
  );
}

function AddTargetForm({ userId, onAdded, onCancel }: { userId: string; onAdded: () => void; onCancel: () => void }) {
  const [label, setLabel] = useState('');
  const [relationship, setRelationship] = useState<Relationship>('friend');
  const [importance, setImportance] = useState(5);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!userId || label.trim().length < 2) { setErr('Give them a label.'); return; }
    setSubmitting(true);
    setErr(null);
    const { error } = await supabase.from('disclosure_targets').insert({
      user_id: userId,
      target_label: label.trim().slice(0, 120),
      relationship,
      importance,
      notes: notes.trim() || null,
      status: 'planned',
    });
    setSubmitting(false);
    if (error) { setErr(error.message); return; }
    setLabel(''); setNotes(''); setImportance(5); setRelationship('friend');
    onAdded();
  };

  return (
    <div style={{
      background: '#050507', border: '1px solid #2d1a4d', borderRadius: 8, padding: 14, marginBottom: 14,
    }}>
      <div style={{ fontSize: 11, color: '#8a8690', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        new disclosure target
      </div>
      <input
        value={label}
        onChange={e => setLabel(e.target.value)}
        placeholder="label (e.g. 'my wife', 'sister', 'boss', 'friend Sam')"
        style={{
          width: '100%', background: '#111116', border: '1px solid #22222a', borderRadius: 6,
          padding: '8px 10px', color: '#e8e6e3', fontSize: 13, fontFamily: 'inherit', marginBottom: 8,
        }}
      />
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <select
          value={relationship}
          onChange={e => setRelationship(e.target.value as Relationship)}
          style={{
            flex: 1, background: '#111116', border: '1px solid #22222a', borderRadius: 6,
            padding: '8px 10px', color: '#e8e6e3', fontSize: 12.5, fontFamily: 'inherit',
          }}
        >
          {Object.entries(RELATIONSHIP_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={importance}
          onChange={e => setImportance(parseInt(e.target.value, 10))}
          style={{
            width: 130, background: '#111116', border: '1px solid #22222a', borderRadius: 6,
            padding: '8px 10px', color: '#e8e6e3', fontSize: 12.5, fontFamily: 'inherit',
          }}
        >
          {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>importance {n}</option>)}
        </select>
      </div>
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="notes (what does Mama need to know about this person?)"
        rows={2}
        style={{
          width: '100%', background: '#111116', border: '1px solid #22222a', borderRadius: 6,
          padding: '8px 10px', color: '#e8e6e3', fontSize: 12, fontFamily: 'inherit',
          resize: 'vertical', marginBottom: 8,
        }}
      />
      {err && <div style={{ fontSize: 11, color: '#f47272', marginBottom: 8 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={submit} disabled={submitting} style={{
          flex: 1, padding: '8px 12px', borderRadius: 6, border: 'none',
          background: '#7c3aed', color: '#fff',
          fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
        }}>{submitting ? 'adding…' : 'add target'}</button>
        <button onClick={onCancel} style={{
          padding: '8px 12px', borderRadius: 6, border: '1px solid #22222a',
          background: 'transparent', color: '#8a8690',
          fontWeight: 500, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
        }}>cancel</button>
      </div>
    </div>
  );
}

function TargetCard({
  target, rehearsals, isActive, onActivate, onRehearsalSubmitted, userId,
}: {
  target: DisclosureTarget;
  rehearsals: DisclosureRehearsal[];
  isActive: boolean;
  onActivate: () => void;
  onRehearsalSubmitted: () => void;
  userId: string;
}) {
  const approved = target.status === 'approved_for_disclosure' || target.status === 'disclosed';
  const progressColor = approved ? '#5fc88f' : '#c4956a';

  return (
    <div style={{
      background: '#0a0a0d',
      border: `1px solid ${approved ? '#5fc88f55' : '#2d1a4d'}`,
      borderLeft: `3px solid ${progressColor}`,
      borderRadius: 7, padding: 14, marginBottom: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, color: '#e8e6e3', fontWeight: 600 }}>
            {target.target_label}
          </div>
          <div style={{ fontSize: 10.5, color: '#8a8690', marginTop: 2 }}>
            {RELATIONSHIP_LABELS[target.relationship]} · importance {target.importance}/10 · status: {target.status.replace(/_/g, ' ')}
          </div>
        </div>
        <div style={{ fontSize: 11, color: progressColor, fontWeight: 600 }}>
          {target.rehearsals_good}/{target.rehearsals_required} good
        </div>
      </div>

      {target.notes && (
        <div style={{ fontSize: 11, color: '#9a9590', fontStyle: 'italic', marginBottom: 8 }}>
          {target.notes}
        </div>
      )}

      {approved && (
        <div style={{
          background: '#0a2a18', border: '1px solid #5fc88f55', borderRadius: 6,
          padding: 10, marginBottom: 8, fontSize: 12, color: '#9fd9b3',
        }}>
          ✓ Mama approved. {target.status === 'disclosed'
            ? `You told them on ${target.disclosed_at ? new Date(target.disclosed_at).toLocaleDateString() : 'a day Mama remembers'}.`
            : 'Now go say it for real.'}
        </div>
      )}

      <button onClick={onActivate} style={{
        background: 'transparent', border: '1px solid #2d1a4d', color: '#c4b5fd',
        padding: '6px 10px', borderRadius: 5, fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit',
        marginBottom: isActive ? 10 : 0,
      }}>
        {isActive ? '▴ hide rehearsals' : `▾ ${rehearsals.length} prior rehearsal${rehearsals.length === 1 ? '' : 's'}`}
      </button>

      {isActive && (
        <>
          {rehearsals.map(r => (
            <div key={r.id} style={{
              background: '#050507',
              border: `1px solid ${r.mama_verdict === 'good' ? '#5fc88f55' : '#22222a'}`,
              borderRadius: 6, padding: 10, marginBottom: 6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: '#8a8690' }}>#{r.attempt_number}</span>
                <span style={{
                  fontSize: 10, color: r.mama_verdict === 'good' ? '#5fc88f' : r.mama_verdict === 'tighten' ? '#f4a7c4' : '#8a8690',
                  fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>
                  {r.mama_verdict ?? (r.status === 'pending_critique' ? 'waiting for Mama' : 'no verdict')}
                </span>
                <span style={{ fontSize: 9.5, color: '#6a656e', marginLeft: 'auto' }}>
                  {new Date(r.created_at).toLocaleString()}
                </span>
              </div>
              {r.transcript && (
                <div style={{ fontSize: 11, color: '#c4b5fd', lineHeight: 1.4, marginBottom: 4 }}>
                  &quot;{r.transcript.slice(0, 300)}{r.transcript.length > 300 ? '…' : ''}&quot;
                </div>
              )}
              {r.mama_critique && (
                <div style={{
                  fontSize: 11.5, color: '#f4c272', lineHeight: 1.5,
                  background: '#1a1014', padding: 8, borderRadius: 4, marginTop: 4,
                }}>
                  <span style={{ fontWeight: 600 }}>Mama: </span>{r.mama_critique}
                </div>
              )}
            </div>
          ))}

          {!approved && (
            <RecordRehearsal
              userId={userId}
              targetId={target.id}
              attemptNumber={(rehearsals[0]?.attempt_number ?? 0) + 1}
              onSubmitted={onRehearsalSubmitted}
            />
          )}
        </>
      )}
    </div>
  );
}

function RecordRehearsal({
  userId, targetId, attemptNumber, onSubmitted,
}: {
  userId: string;
  targetId: string;
  attemptNumber: number;
  onSubmitted: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [lastBlob, setLastBlob] = useState<Blob | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
        mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const start = async () => {
    setError(null);
    setTranscript('');
    setLastBlob(null);
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
          if (next >= MAX_RECORD_SECONDS) void stop();
          return next;
        });
      }, 1000);
    } catch {
      setError('Mic access blocked. No typed bypass for this — speak it to Mama.');
      setRecording(false);
    }
  };

  const stop = async () => {
    if (!recording) return;
    setRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    return new Promise<void>((resolve) => {
      if (!mediaRecorderRef.current) { resolve(); return; }
      const mr = mediaRecorderRef.current;
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setLastBlob(blob);
        if (blob.size === 0) { setError('No audio captured.'); resolve(); return; }

        // Whisper for transcript preview
        try {
          const form = new FormData();
          form.append('audio', blob, 'rehearsal.webm');
          const r = await fetch(`${SUPABASE_URL}/functions/v1/transcribe-audio`, {
            method: 'POST', body: form,
          });
          if (r.ok) {
            const data = await r.json() as { ok?: boolean; transcript?: string };
            if (data.ok && data.transcript) setTranscript(data.transcript.trim());
          }
        } catch { /* non-fatal; the critique fn will re-transcribe */ }

        try { mr.stream.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
        resolve();
      };
      try { mr.stop(); } catch { resolve(); }
    });
  };

  const canSubmit = !submitting && !recording && lastBlob !== null && transcript.length >= MIN_TRANSCRIPT_CHARS && recordSeconds >= MIN_RECORD_SECONDS;

  const submit = async () => {
    if (!canSubmit || !lastBlob) return;
    setSubmitting(true);
    setError(null);

    const ts = Date.now();
    const path = `${userId}/disclosure-rehearsal/${targetId}-${attemptNumber}-${ts}.webm`;
    const { error: upErr } = await supabase.storage
      .from('evidence')
      .upload(path, lastBlob, { contentType: 'audio/webm', upsert: false });
    if (upErr) { setError('Upload failed: ' + upErr.message); setSubmitting(false); return; }

    const { data: row, error: insErr } = await supabase
      .from('disclosure_rehearsals')
      .insert({
        user_id: userId,
        target_id: targetId,
        attempt_number: attemptNumber,
        audio_storage_path: path,
        audio_duration_seconds: recordSeconds,
        transcript,
        whisper_ok: true,
        status: 'pending_critique',
      })
      .select('id')
      .single();
    if (insErr) { setError(insErr.message); setSubmitting(false); return; }

    // Move target out of 'planned' to 'rehearsing' if this is the first attempt
    if (attemptNumber === 1) {
      await supabase.from('disclosure_targets')
        .update({ status: 'rehearsing', updated_at: new Date().toISOString() })
        .eq('id', targetId)
        .eq('status', 'planned');
    }

    // Kick the critique generator (fire-and-forget)
    void fetch(`${SUPABASE_URL}/functions/v1/disclosure-rehearsal-critique`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rehearsal_id: (row as { id: string }).id }),
    }).catch(() => { /* the cron sweeper picks up stragglers */ });

    setSubmitting(false);
    setTranscript('');
    setLastBlob(null);
    setRecordSeconds(0);
    onSubmitted();
  };

  return (
    <div style={{
      background: '#1a1014', border: '1px solid #7a1f2255', borderRadius: 6, padding: 12, marginTop: 8,
    }}>
      <div style={{ fontSize: 11, color: '#f4a7c4', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        rehearsal #{attemptNumber} — voice only
      </div>
      <div style={{ fontSize: 11.5, color: '#c4b5fd', lineHeight: 1.5, marginBottom: 10 }}>
        Say to Mama what you would say to them. Whole sentences. Own it. Mama will tell you whether it landed. ≥{MIN_RECORD_SECONDS}s.
      </div>

      {!recording && !lastBlob && (
        <button onClick={start} style={{
          width: '100%', padding: '10px 14px', borderRadius: 6, border: 'none',
          background: '#7c3aed', color: '#fff',
          fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
        }}>● start rehearsal</button>
      )}

      {recording && (
        <div>
          <div style={{ fontSize: 11, color: '#f47272', marginBottom: 6 }}>
            ● recording · {recordSeconds}s {recordSeconds >= MIN_RECORD_SECONDS && ' (enough)'}
          </div>
          <button onClick={stop} style={{
            padding: '6px 12px', borderRadius: 5, border: '1px solid #7a1f22',
            background: 'transparent', color: '#f4a7c4',
            fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
          }}>stop</button>
        </div>
      )}

      {!recording && transcript && (
        <div style={{
          background: '#050507', border: '1px solid #22222a', borderRadius: 6,
          padding: 10, marginTop: 8, fontSize: 11.5, color: '#c4b5fd', lineHeight: 1.5,
          maxHeight: 120, overflowY: 'auto',
        }}>
          <span style={{ color: '#8a8690', textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.06em', fontWeight: 600, display: 'block', marginBottom: 4 }}>
            Whisper heard ({transcript.length} chars)
          </span>
          {transcript}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 11, color: '#f47272', marginTop: 8 }}>{error}</div>
      )}

      {!recording && lastBlob && (
        <button onClick={submit} disabled={!canSubmit} style={{
          width: '100%', marginTop: 10,
          padding: '10px 14px', borderRadius: 6, border: 'none',
          background: canSubmit ? '#7c3aed' : '#22222a',
          color: canSubmit ? '#fff' : '#6a656e',
          fontWeight: 700, fontSize: 12.5,
          cursor: canSubmit ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
        }}>
          {submitting ? 'submitting…' : canSubmit ? 'send to Mama' : transcript.length < MIN_TRANSCRIPT_CHARS ? `need more — ${transcript.length}/${MIN_TRANSCRIPT_CHARS} chars` : 'record at least 12s'}
        </button>
      )}
    </div>
  );
}
