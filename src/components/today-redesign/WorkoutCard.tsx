/**
 * WorkoutCard — today's workout_prescriptions row with exercises and
 * completion toggle. Silent when no prescription.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Exercise {
  name: string;
  sets?: number;
  reps?: string | number;
  weight?: string;
  notes?: string;
}

interface Prescription {
  id: string;
  workout_type: string;
  focus_area: string | null;
  exercises: Exercise[] | Record<string, unknown>;
  duration_minutes: number | null;
  status: string;
  completion_notes: string | null;
  post_workout_photo_url: string | null;
}

export function WorkoutCard() {
  const { user } = useAuth();
  const [today, setToday] = useState<Prescription | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    if (!user?.id) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    const { data } = await supabase.from('workout_prescriptions')
      .select('id, workout_type, focus_area, exercises, duration_minutes, status, completion_notes, post_workout_photo_url')
      .eq('user_id', user.id)
      .eq('scheduled_date', todayStr)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setToday((data as Prescription | null) ?? null);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  if (!today) return null;

  const exList: Exercise[] = Array.isArray(today.exercises)
    ? today.exercises as Exercise[]
    : Object.values(today.exercises as Record<string, Exercise> || {});

  const markComplete = async () => {
    setSubmitting(true);
    await supabase.from('workout_prescriptions').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      completion_notes: note || null,
    }).eq('id', today.id);
    setSubmitting(false);
    setNote('');
    load();
    window.dispatchEvent(new CustomEvent('td-task-changed', { detail: { source: 'workout', id: today.id } }));
  };

  const isDone = today.status === 'completed';

  return (
    <div style={{
      background: isDone ? '#111116' : 'linear-gradient(135deg, #1a2e0f 0%, #0f2008 100%)',
      border: `1px solid ${isDone ? '#22222a' : '#1f6a3a'}`,
      borderRadius: 10, padding: 14, marginBottom: 16,
      opacity: isDone ? 0.75 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6ee7b7" strokeWidth="1.8">
          <path d="M6.5 6.5L17.5 17.5M13 2L22 11M2 13L11 22M17 6L18 5M6 17L5 18"/>
        </svg>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6ee7b7', fontWeight: 700 }}>
          Today's workout
        </span>
        <span style={{ fontSize: 10.5, color: isDone ? '#6ee7b7' : '#c8c4cc', marginLeft: 'auto', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
          {today.status}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10, fontSize: 11 }}>
        <span style={{ background: '#0a0a0d', padding: '3px 8px', borderRadius: 3, color: '#6ee7b7', fontWeight: 600 }}>
          {today.workout_type}
        </span>
        {today.focus_area && (
          <span style={{ background: '#0a0a0d', padding: '3px 8px', borderRadius: 3, color: '#c4b5fd' }}>
            focus: {today.focus_area}
          </span>
        )}
        {today.duration_minutes && (
          <span style={{ background: '#0a0a0d', padding: '3px 8px', borderRadius: 3, color: '#8a8690' }}>
            ~{today.duration_minutes} min
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
        {exList.map((ex, i) => (
          <div key={i} style={{
            fontSize: 11.5, color: '#e8e6e3',
            padding: '6px 9px', background: '#0a0a0d',
            border: '1px solid #22222a', borderRadius: 5,
            display: 'flex', gap: 8,
          }}>
            <span style={{ fontWeight: 600, flex: 1 }}>{ex.name}</span>
            {ex.sets != null && (
              <span style={{ color: '#c4b5fd' }}>
                {ex.sets}×{ex.reps ?? '—'}
                {ex.weight && ` @ ${ex.weight}`}
              </span>
            )}
          </div>
        ))}
      </div>

      {!isDone ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            placeholder="post-workout note (optional)"
            value={note}
            onChange={e => setNote(e.target.value)}
            style={{
              flex: 1, background: '#050507', border: '1px solid #22222a', borderRadius: 5,
              padding: '6px 9px', fontSize: 11, color: '#e8e6e3', fontFamily: 'inherit',
            }}
          />
          <button
            onClick={markComplete}
            disabled={submitting}
            style={{
              padding: '6px 14px', borderRadius: 5, border: 'none',
              background: '#6ee7b7', color: '#081f10', fontWeight: 600,
              fontSize: 11, cursor: submitting ? 'wait' : 'pointer', fontFamily: 'inherit',
            }}
          >
            {submitting ? '…' : 'Done'}
          </button>
        </div>
      ) : today.completion_notes && (
        <div style={{ fontSize: 10.5, color: '#8a8690', fontStyle: 'italic' }}>
          "{today.completion_notes}"
        </div>
      )}
    </div>
  );
}
