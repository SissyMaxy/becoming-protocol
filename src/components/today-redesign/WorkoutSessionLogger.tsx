/**
 * WorkoutSessionLogger — logs a real prescribed session set by set.
 *
 * Given today's BodyOrder blocks, the user records reps + weight per set into
 * workout_set_log (grouped by a session uid). This is the first place in the
 * app that captures actual training numbers over time — the spine adaptive
 * progression reads next.
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { BodyBlock } from '../../lib/body-program';
import { logWorkoutSet, loadLastWeights, creditMovementDay } from '../../lib/workout/client';

interface Props {
  blocks: BodyBlock[];
  sessionName: string;
  programWeek: number;
  programDay: string;
  onDone: () => void;
}

function newUid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

export function WorkoutSessionLogger({ blocks, sessionName, programWeek, programDay, onDone }: Props) {
  const { user } = useAuth();
  const sessionUid = useMemo(newUid, []);
  const exercises = useMemo(() => blocks.map(b => b.move), [blocks]);
  const [setsLogged, setSetsLogged] = useState<Record<string, number>>({});
  const [reps, setReps] = useState<Record<string, string>>({});
  const [weight, setWeight] = useState<Record<string, string>>({});
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    loadLastWeights(user.id, exercises).then(w => {
      setWeight(prev => {
        const next = { ...prev };
        for (const [k, v] of Object.entries(w)) if (next[k] === undefined) next[k] = String(v);
        return next;
      });
    });
  }, [user?.id, exercises]);

  const totalSets = Object.values(setsLogged).reduce((a, b) => a + b, 0);

  const logSet = async (move: string) => {
    if (!user?.id) return;
    const setNumber = (setsLogged[move] ?? 0) + 1;
    const r = reps[move] ? parseInt(reps[move], 10) : null;
    const wKg = weight[move] ? parseFloat(weight[move]) : null;
    const ok = await logWorkoutSet(user.id, {
      sessionUid, exerciseName: move, setNumber,
      reps: Number.isFinite(r as number) ? r : null,
      weightKg: Number.isFinite(wKg as number) ? wKg : null,
      programWeek, programDay, sessionName,
    });
    if (ok) setSetsLogged(prev => ({ ...prev, [move]: setNumber }));
  };

  const finish = async () => {
    if (!user?.id) return;
    setFinishing(true);
    await creditMovementDay(user.id);
    onDone();
  };

  return (
    <div className="space-y-3">
      <div className="text-xs uppercase tracking-wider text-protocol-accent-soft font-semibold">
        {sessionName} · logging
      </div>
      {blocks.map(block => {
        const done = setsLogged[block.move] ?? 0;
        return (
          <div key={block.move} className="rounded-lg border border-protocol-border bg-protocol-bg-deep p-3">
            <div className="text-sm font-semibold text-protocol-text">{block.move}</div>
            <div className="text-xs text-protocol-text-muted mt-0.5 mb-2 leading-snug">{block.prescription}</div>
            <div className="flex items-center gap-2">
              <input
                inputMode="numeric" placeholder="reps"
                value={reps[block.move] ?? ''}
                onChange={e => setReps(p => ({ ...p, [block.move]: e.target.value }))}
                className="w-16 rounded-md border border-protocol-border bg-protocol-surface px-2 py-1.5 text-sm text-protocol-text placeholder:text-protocol-text-muted/60 focus:outline-none focus:border-protocol-accent"
              />
              <span className="text-protocol-text-muted text-sm">×</span>
              <input
                inputMode="decimal" placeholder="kg"
                value={weight[block.move] ?? ''}
                onChange={e => setWeight(p => ({ ...p, [block.move]: e.target.value }))}
                className="w-16 rounded-md border border-protocol-border bg-protocol-surface px-2 py-1.5 text-sm text-protocol-text placeholder:text-protocol-text-muted/60 focus:outline-none focus:border-protocol-accent"
              />
              <button
                onClick={() => logSet(block.move)}
                className="btn-velvet px-3 py-1.5 text-sm inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> set
              </button>
              {done > 0 && (
                <span className="ml-auto text-xs text-protocol-success font-semibold tabular-nums">
                  {done} logged
                </span>
              )}
            </div>
          </div>
        );
      })}
      <button
        onClick={finish}
        disabled={finishing}
        className="btn-velvet w-full py-3 inline-flex items-center justify-center gap-2 font-semibold"
      >
        <Check className="w-4 h-4" />
        {finishing ? 'saving…' : totalSets > 0 ? `Finish — ${totalSets} sets logged` : 'Finish session'}
      </button>
    </div>
  );
}
