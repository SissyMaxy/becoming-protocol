/**
 * Workout Card — shows today's prescribed workout, lets Maxy start/complete it.
 */

import { useCallback, useEffect, useState } from 'react';
import { Dumbbell, Check, Play, Loader2, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Exercise {
  name: string;
  sets: number;
  reps: number;
  notes: string;
}

interface WorkoutRow {
  id: string;
  workout_type: string;
  focus_area: string;
  exercises: Exercise[];
  duration_minutes: number;
  status: string;
}

interface Props {
  userId: string;
}

export function WorkoutCard({ userId }: Props) {
  const [rx, setRx] = useState<WorkoutRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [completedExercises, setCompletedExercises] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('workout_prescriptions')
      .select('id, workout_type, focus_area, exercises, duration_minutes, status')
      .eq('user_id', userId)
      .eq('scheduled_date', today)
      .maybeSingle();
    setRx(data as WorkoutRow | null);
    setLoading(false);
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return null;
  if (!rx) return null;

  const start = async () => {
    setBusy(true);
    await supabase.from('workout_prescriptions').update({ status: 'started', started_at: new Date().toISOString() }).eq('id', rx.id);
    setRx({ ...rx, status: 'started' });
    setExpanded(true);
    setBusy(false);
  };

  const complete = async () => {
    setBusy(true);
    await supabase.from('workout_prescriptions').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', rx.id);
    setRx({ ...rx, status: 'completed' });
    setBusy(false);
  };

  const toggleExercise = (idx: number) => {
    setCompletedExercises(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const exercises = rx.exercises || [];
  const allDone = exercises.length > 0 && completedExercises.size >= exercises.length;
  const typeName = rx.workout_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  if (rx.status === 'completed') {
    return (
      <div className="p-3 rounded-lg border border-green-500/30 bg-green-950/10">
        <div className="flex items-center gap-2">
          <Dumbbell className="w-4 h-4 text-green-400" />
          <span className="text-sm font-medium text-green-300">{typeName} — done</span>
          <Check className="w-4 h-4 text-green-400 ml-auto" />
        </div>
      </div>
    );
  }

  if (rx.status === 'skipped') {
    return (
      <div className="p-3 rounded-lg border border-red-500/30 bg-red-950/10">
        <div className="flex items-center gap-2">
          <Dumbbell className="w-4 h-4 text-red-400" />
          <span className="text-sm font-medium text-red-300">{typeName} — skipped (slip logged)</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 rounded-lg border border-protocol-border bg-protocol-surface space-y-3">
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left">
        <div className="flex items-center gap-2">
          <Dumbbell className="w-4 h-4 text-pink-400" />
          <span className="text-sm font-medium">{typeName}</span>
          <span className="ml-auto text-xs text-gray-500 flex items-center gap-1">
            <Clock className="w-3 h-3" /> {rx.duration_minutes}min
          </span>
        </div>
        <div className="text-xs text-protocol-text-muted mt-0.5">{rx.focus_area}</div>
      </button>

      {expanded && (
        <div className="space-y-1">
          {exercises.map((ex, idx) => (
            <button
              key={idx}
              onClick={() => toggleExercise(idx)}
              className={`w-full text-left p-2 rounded border text-xs ${
                completedExercises.has(idx)
                  ? 'border-green-500/30 bg-green-950/10 text-green-300 line-through'
                  : 'border-gray-800 text-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${
                  completedExercises.has(idx) ? 'border-green-500 bg-green-500/20' : 'border-gray-600'
                }`}>
                  {completedExercises.has(idx) && <Check className="w-3 h-3 text-green-400" />}
                </div>
                <span className="font-medium">{ex.name}</span>
                <span className="ml-auto text-gray-500">
                  {ex.sets > 1 ? `${ex.sets}×${ex.reps}` : `${ex.reps > 1 ? ex.reps + 'x' : ex.notes}`}
                </span>
              </div>
              {ex.notes && !completedExercises.has(idx) && (
                <div className="text-[10px] text-gray-500 ml-6 mt-0.5">{ex.notes}</div>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        {rx.status === 'prescribed' && (
          <button
            onClick={start}
            disabled={busy}
            className="flex-1 py-2 rounded-lg bg-pink-600 text-white text-sm font-semibold flex items-center justify-center gap-1 disabled:bg-gray-700"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Play className="w-4 h-4" /> Start</>}
          </button>
        )}
        {rx.status === 'started' && (
          <button
            onClick={complete}
            disabled={busy || !allDone}
            className="flex-1 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold flex items-center justify-center gap-1 disabled:bg-gray-700"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> {allDone ? 'Complete' : `${completedExercises.size}/${exercises.length}`}</>}
          </button>
        )}
      </div>
    </div>
  );
}
