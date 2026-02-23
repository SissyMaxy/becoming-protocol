/**
 * CheckoffView — simplified workout mode.
 *
 * Flat exercise list with checkboxes. No rep counting, no rest timer.
 * User checks each exercise when done, taps "Complete Workout" at the end.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Check, X, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import type { WorkoutTemplate, ExerciseBlock, ExerciseCompleted } from '../../types/exercise';

interface CheckoffViewProps {
  template: WorkoutTemplate;
  onComplete: (exercises: ExerciseCompleted[], durationMinutes: number) => void;
  onAbandon: () => void;
}

interface FlatExercise {
  block: ExerciseBlock;
  phase: 'warmup' | 'main' | 'cooldown';
  index: number;
}

function flattenExercises(template: WorkoutTemplate): FlatExercise[] {
  const result: FlatExercise[] = [];
  let idx = 0;
  for (const block of template.warmup) {
    result.push({ block, phase: 'warmup', index: idx++ });
  }
  for (const block of template.main) {
    result.push({ block, phase: 'main', index: idx++ });
  }
  for (const block of template.cooldown) {
    result.push({ block, phase: 'cooldown', index: idx++ });
  }
  return result;
}

export function CheckoffView({ template, onComplete, onAbandon }: CheckoffViewProps) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [expandedCues, setExpandedCues] = useState<Set<number>>(new Set());
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const exercises = flattenExercises(template);
  const allChecked = checked.size >= exercises.length;

  // Elapsed timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const toggleCheck = useCallback((idx: number) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }, []);

  const toggleCues = useCallback((idx: number) => {
    setExpandedCues(prev => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }, []);

  const handleComplete = useCallback(() => {
    const completed: ExerciseCompleted[] = exercises
      .filter((_, i) => checked.has(i))
      .map(ex => ({
        name: ex.block.name,
        sets: ex.block.sets,
        reps: ex.block.reps * ex.block.sets,
      }));
    const durationMin = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000));
    onComplete(completed, durationMin);
  }, [exercises, checked, onComplete]);

  const elapsedMin = Math.floor(elapsed / 60);
  const elapsedSec = elapsed % 60;

  let currentPhase = '';

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-white/5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-purple-400 font-medium uppercase">Check-off</span>
          <span className="text-xs text-white/30 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {elapsedMin}:{String(elapsedSec).padStart(2, '0')}
          </span>
        </div>
        <button
          onClick={() => setShowAbandonConfirm(true)}
          className="p-2 text-white/40 hover:text-red-400"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Template name */}
      <div className="px-4 py-2">
        <h2 className="text-lg font-bold text-white">{template.name}</h2>
        <p className="text-xs text-white/40">~{template.estimatedMinutes} min &middot; {template.location}</p>
      </div>

      {/* Exercise list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="space-y-1">
          {exercises.map((ex, i) => {
            const isChecked = checked.has(i);
            const showCues = expandedCues.has(i);

            // Phase header
            let phaseHeader = null;
            if (ex.phase !== currentPhase) {
              currentPhase = ex.phase;
              phaseHeader = (
                <p className="text-xs text-white/20 uppercase tracking-wider mt-3 mb-1 first:mt-0">
                  {ex.phase}
                </p>
              );
            }

            const setsReps = ex.block.durationSeconds
              ? `${ex.block.sets}×${ex.block.durationSeconds}s`
              : ex.block.isPerSide
                ? `${ex.block.sets}×${ex.block.reps}/side`
                : `${ex.block.sets}×${ex.block.reps}`;

            return (
              <div key={i}>
                {phaseHeader}
                <div className={`rounded-lg transition-colors ${
                  isChecked ? 'bg-green-500/10' : 'bg-white/5'
                }`}>
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleCheck(i)}
                      className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${
                        isChecked ? 'bg-green-500' : 'bg-white/10'
                      }`}
                    >
                      {isChecked && <Check className="w-4 h-4 text-white" />}
                    </button>

                    {/* Exercise info */}
                    <div className="flex-1">
                      <p className={`text-sm ${isChecked ? 'text-white/50 line-through' : 'text-white'}`}>
                        {ex.block.name}
                      </p>
                    </div>

                    {/* Sets x reps */}
                    <span className="text-xs text-white/40">{setsReps}</span>

                    {/* Cue toggle */}
                    {ex.block.cues.length > 0 && (
                      <button
                        onClick={() => toggleCues(i)}
                        className="p-1 text-white/20 hover:text-white/40"
                      >
                        {showCues
                          ? <ChevronUp className="w-3.5 h-3.5" />
                          : <ChevronDown className="w-3.5 h-3.5" />
                        }
                      </button>
                    )}
                  </div>

                  {/* Expanded cues */}
                  {showCues && (
                    <div className="px-3 pb-2.5 pl-12">
                      {ex.block.cues.map((cue, ci) => (
                        <p key={ci} className="text-xs text-white/40 py-0.5">
                          &bull; {cue}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="px-4 py-4 bg-white/5 border-t border-white/10">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-white/40">
            {checked.size}/{exercises.length} exercises
          </span>
          <span className="text-xs text-white/40">
            {elapsedMin}:{String(elapsedSec).padStart(2, '0')}
          </span>
        </div>
        <button
          onClick={handleComplete}
          disabled={checked.size === 0}
          className={`w-full py-3 rounded-xl font-semibold text-white transition-colors ${
            allChecked
              ? 'bg-gradient-to-r from-purple-500 to-pink-500'
              : checked.size > 0
                ? 'bg-purple-500/50 hover:bg-purple-500/70'
                : 'bg-white/10 text-white/30 cursor-not-allowed'
          }`}
        >
          {allChecked ? 'Complete Workout' : `Complete (${checked.size}/${exercises.length})`}
        </button>
      </div>

      {/* Abandon confirmation */}
      {showAbandonConfirm && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center px-6">
          <div className="bg-zinc-900 rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-white font-bold text-lg mb-2">Quit Workout?</h3>
            <p className="text-white/60 text-sm mb-6">
              This session won't count toward your streak.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAbandonConfirm(false)}
                className="flex-1 py-2 rounded-lg bg-white/10 text-white text-sm"
              >
                Keep Going
              </button>
              <button
                onClick={onAbandon}
                className="flex-1 py-2 rounded-lg bg-red-500/20 text-red-400 text-sm"
              >
                Quit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
