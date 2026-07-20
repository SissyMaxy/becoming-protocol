/**
 * BodyProgramCard — the workout engine's home surface.
 *
 * Shows today's mommy-led body order (computed pure from the target's
 * program_start) and puts a REAL prescribed, progressive session on the home:
 * train days open the set logger; fuel/rest/measure days show the directive.
 *
 * Enforcement: on a train day it ensures today's session is a real
 * deadline-bearing decree (body_program_ensure_decree) — so it also surfaces
 * as the pressing Focus task and skipping it feeds the slip/penalty ledger.
 * Finishing here fulfills that decree.
 */
import { useEffect, useRef, useState } from 'react';
import { Dumbbell, Utensils, Moon, Camera } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBodyOrderToday } from '../../hooks/useBodyOrderToday';
import {
  startBodyProgram, creditMovementDay, ensureWorkoutDecree, fulfillWorkoutDecree,
} from '../../lib/workout/client';
import { WorkoutSessionLogger } from './WorkoutSessionLogger';

const KIND_ICON = { train: Dumbbell, fuel: Utensils, rest: Moon, measure: Camera } as const;

export function BodyProgramCard() {
  const { user } = useAuth();
  const { order, started, loading, reload } = useBodyOrderToday();
  const [logging, setLogging] = useState(false);
  const [dayDone, setDayDone] = useState(false);
  const [starting, setStarting] = useState(false);
  const ensuredRef = useRef(false);

  // On a train day, make today's session a real enforced decree.
  useEffect(() => {
    if (!order || order.kind !== 'train' || ensuredRef.current) return;
    ensuredRef.current = true;
    ensureWorkoutDecree(order.command, order.sessionName);
  }, [order]);

  const start = async () => {
    setStarting(true);
    await startBodyProgram();
    reload();
    setStarting(false);
  };

  const markNonTrainDone = async () => {
    if (user?.id) await creditMovementDay(user.id);
    setDayDone(true);
  };

  if (loading) return null;

  // ── Not started: the invitation to begin ──
  if (!started) {
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
          onDone={async () => { await fulfillWorkoutDecree(); setLogging(false); setDayDone(true); }}
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
