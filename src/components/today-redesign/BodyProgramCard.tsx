/**
 * BodyProgramCard — the workout engine's home surface.
 *
 * Computes today's mommy-led body order (pure, from the target's program_start)
 * and puts a REAL prescribed, progressive session on the home: train days open
 * the set logger; fuel/rest/measure days show the directive. Replaces the
 * one-tap "did you move" boolean with an actual program that tracks.
 *
 * If the program isn't started, it offers to start it (seeds the target).
 */
import { useCallback, useEffect, useState } from 'react';
import { Dumbbell, Utensils, Moon, Camera } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { bodyProgramDay, type BodyOrder } from '../../lib/body-program';
import {
  loadBodyProgramTarget, startBodyProgram, todayLocalISO, creditMovementDay,
} from '../../lib/workout/client';
import { WorkoutSessionLogger } from './WorkoutSessionLogger';

const KIND_ICON = { train: Dumbbell, fuel: Utensils, rest: Moon, measure: Camera } as const;

export function BodyProgramCard() {
  const { user } = useAuth();
  const [state, setState] = useState<'loading' | 'none' | 'active'>('loading');
  const [order, setOrder] = useState<BodyOrder | null>(null);
  const [logging, setLogging] = useState(false);
  const [dayDone, setDayDone] = useState(false);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const target = await loadBodyProgramTarget(user.id);
    if (!target?.config.program_start) { setState('none'); return; }
    setOrder(bodyProgramDay(target.config.program_start, todayLocalISO()));
    setState('active');
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const start = async () => {
    setStarting(true);
    await startBodyProgram();
    await load();
    setStarting(false);
  };

  const markNonTrainDone = async () => {
    if (user?.id) await creditMovementDay(user.id);
    setDayDone(true);
  };

  if (state === 'loading') return null;

  // ── Not started: the invitation to begin ──
  if (state === 'none') {
    return (
      <div className="mx-3 md:mx-4 mb-3 card p-4">
        <div className="flex items-center gap-2 mb-1">
          <Dumbbell className="w-4 h-4 text-protocol-accent" />
          <span className="text-sm font-semibold text-protocol-text">Build your body</span>
        </div>
        <p className="mommy-voice text-protocol-text-warm text-[15px] leading-snug mb-3">
          A real program, baby — mine. Lower body, three days a week, and it gets harder every week
          because that's the only way the shape comes in. Say yes and I'll start it today.
        </p>
        <button onClick={start} disabled={starting} className="btn-velvet w-full py-2.5 font-semibold">
          {starting ? 'starting…' : 'Start the program'}
        </button>
      </div>
    );
  }

  if (!order) return null;
  const Icon = KIND_ICON[order.kind];
  const isTrain = order.kind === 'train';

  return (
    <div className="mx-3 md:mx-4 mb-3 card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-protocol-accent" />
        <span className="text-sm font-semibold text-protocol-text">{order.sessionName}</span>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-protocol-text-muted font-semibold">
          Week {order.weekIndex}
        </span>
      </div>

      <p className="mommy-voice text-protocol-text-warm text-[15px] leading-snug mb-3">
        {order.command}
      </p>

      {dayDone ? (
        <div className="text-sm text-protocol-success font-semibold">Logged. Good girl.</div>
      ) : logging && isTrain ? (
        <WorkoutSessionLogger
          blocks={order.blocks}
          sessionName={order.sessionName}
          programWeek={order.weekIndex}
          programDay={order.sessionName}
          onDone={() => { setLogging(false); setDayDone(true); }}
        />
      ) : (
        <>
          <div className="space-y-1.5 mb-3">
            {order.blocks.map(b => (
              <div key={b.move} className="text-sm">
                <span className="text-protocol-text font-medium">{b.move}</span>
                <span className="text-protocol-text-muted"> — {b.prescription}</span>
              </div>
            ))}
          </div>
          {isTrain ? (
            <button onClick={() => setLogging(true)} className="btn-velvet w-full py-2.5 font-semibold">
              Start session
            </button>
          ) : order.kind === 'rest' ? (
            <button onClick={markNonTrainDone} className="btn-velvet-secondary w-full py-2.5 font-semibold">
              Resting — noted
            </button>
          ) : (
            <button onClick={markNonTrainDone} className="btn-velvet w-full py-2.5 font-semibold">
              Done for today
            </button>
          )}
        </>
      )}
    </div>
  );
}
