/**
 * WorkoutSessionLogger — logs a real prescribed session, in order:
 * her voice (PreworkoutDrop gate) → warm-up → main sets → cooldown.
 *
 * The pre-train primer gates the surface: until today's session_preworkout
 * render has been heard, the logger shows the drop instead of the work
 * (checked once via preworkoutPlayedToday; fail-open so training is never
 * bricked by audio infra).
 *
 * Warm-up and cooldown blocks (phase-tagged in body-program.ts) render as
 * check-off items; main blocks record reps + weight per set into
 * workout_set_log (grouped by a session uid) — the spine adaptive
 * progression reads that history.
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { BodyBlock } from '../../lib/body-program';
import {
  logWorkoutSet, loadLastWeights, creditMovementDay, preworkoutPlayedToday,
} from '../../lib/workout/client';
import { PreworkoutDrop } from './PreworkoutDrop';

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

function ChecklistSection({ title, blocks, done, onToggle }: {
  title: string;
  blocks: BodyBlock[];
  done: Record<string, boolean>;
  onToggle: (move: string) => void;
}) {
  if (blocks.length === 0) return null;
  return (
    <div className="rounded-lg border border-protocol-border bg-protocol-bg-deep p-3">
      <div className="text-xs uppercase tracking-wider text-protocol-accent-soft font-semibold mb-2">
        {title}
      </div>
      <div className="space-y-2">
        {blocks.map(b => (
          <button
            key={b.move}
            onClick={() => onToggle(b.move)}
            className="w-full text-left flex items-start gap-2"
          >
            <span
              className={`mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center ${
                done[b.move] ? 'bg-protocol-accent border-protocol-accent' : 'border-protocol-border'
              }`}
            >
              {done[b.move] && <Check className="w-3 h-3 text-white" />}
            </span>
            <span>
              <span className={`text-sm font-medium ${done[b.move] ? 'text-protocol-text-muted line-through' : 'text-protocol-text'}`}>
                {b.move}
              </span>
              <span className="text-xs text-protocol-text-muted block leading-snug">{b.prescription}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function WorkoutSessionLogger({ blocks, sessionName, programWeek, programDay, onDone }: Props) {
  const { user } = useAuth();
  const sessionUid = useMemo(newUid, []);

  const warmup = useMemo(() => blocks.filter(b => b.phase === 'warmup'), [blocks]);
  const cooldown = useMemo(() => blocks.filter(b => b.phase === 'cooldown'), [blocks]);
  const main = useMemo(() => blocks.filter(b => !b.phase || b.phase === 'main'), [blocks]);
  const exercises = useMemo(() => main.map(b => b.move), [main]);

  // Her voice first — the primer gate. null = still checking.
  const [gateClear, setGateClear] = useState<boolean | null>(null);

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [setsLogged, setSetsLogged] = useState<Record<string, number>>({});
  const [reps, setReps] = useState<Record<string, string>>({});
  const [weight, setWeight] = useState<Record<string, string>>({});
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    preworkoutPlayedToday(user.id).then(setGateClear);
  }, [user?.id]);

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

  const toggleChecked = (move: string) =>
    setChecked(prev => ({ ...prev, [move]: !prev[move] }));

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

  if (gateClear === null) {
    return <div className="text-sm text-protocol-text-muted">…</div>;
  }
  if (!gateClear) {
    return <PreworkoutDrop onCleared={() => setGateClear(true)} />;
  }

  return (
    <div className="space-y-3">
      <div className="text-xs uppercase tracking-wider text-protocol-accent-soft font-semibold">
        {sessionName} · logging
      </div>

      <ChecklistSection title="Warm-up" blocks={warmup} done={checked} onToggle={toggleChecked} />

      {main.map(block => {
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

      <ChecklistSection title="Cooldown" blocks={cooldown} done={checked} onToggle={toggleChecked} />

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
