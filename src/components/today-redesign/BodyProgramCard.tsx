/**
 * BodyProgramCard — the workout engine's home surface.
 *
 * Shows today's mommy-led body order (computed pure from the target's
 * program_start, weekday-locked split) and puts a REAL prescribed,
 * progressive session on the home: train days open the gated session
 * logger (her voice → warm-up → sets → cooldown); fuel/rest days show
 * the directive; measure days collect the actual progress shot through
 * the verification pipeline (Mama sees it).
 *
 * Enforcement: on a train day it ensures today's session is a real
 * deadline-bearing decree (body_program_ensure_decree) — so it also surfaces
 * as the pressing Focus task and skipping it feeds the slip/penalty ledger.
 * Finishing here fulfills that decree. After a train session she can send
 * the sweat proof — optional, graded by the vision pipeline.
 */
import { useEffect, useRef, useState } from 'react';
import { Dumbbell, Utensils, Moon, Camera } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBodyOrderToday } from '../../hooks/useBodyOrderToday';
import { mainMoves, nextTrainOrder } from '../../lib/body-program';
import {
  startBodyProgram, creditMovementDay, ensureWorkoutDecree, fulfillWorkoutDecree, todayLocalISO,
} from '../../lib/workout/client';
import { WorkoutSessionLogger } from './WorkoutSessionLogger';
import { PhotoUploadWidget } from '../verification/PhotoUploadWidget';

const KIND_ICON = { train: Dumbbell, fuel: Utensils, rest: Moon, measure: Camera } as const;

// The standing split, shown before starting so what she's signing up for is
// legible — and echoed on off days so "what exercises" always has an answer.
const SPLIT_PREVIEW = [
  ['Monday — Lower A', 'hip thrusts · Romanian deadlifts · split squats · banded walks'],
  ['Wednesday — Lower B', 'glute bridges · sumo squats · curtsy lunges · clams + hydrants'],
  ['Friday — Glute focus', 'heavy hip thrusts · kickbacks · squat pulses · banded burnout'],
  ['Tue / Thu / Sun', 'fuel days — protein high, easy walk · Saturday rest · progress shot every second Sunday'],
] as const;

export function BodyProgramCard() {
  const { user } = useAuth();
  const { order, started, programStart, loading, reload } = useBodyOrderToday();
  const [logging, setLogging] = useState(false);
  const [dayDone, setDayDone] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startFailed, setStartFailed] = useState(false);
  const [sweatProofOpen, setSweatProofOpen] = useState(false);
  const [sweatProofSent, setSweatProofSent] = useState(false);
  const ensuredRef = useRef(false);

  // On a train day, make today's session a real enforced decree.
  useEffect(() => {
    if (!order || order.kind !== 'train' || ensuredRef.current) return;
    ensuredRef.current = true;
    ensureWorkoutDecree(order.command, order.sessionName);
  }, [order]);

  const start = async () => {
    setStarting(true);
    setStartFailed(false);
    const id = await startBodyProgram();
    if (!id) setStartFailed(true);
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
        <div className="space-y-1.5 mb-3">
          {SPLIT_PREVIEW.map(([label, moves]) => (
            <div key={label} className="text-sm">
              <span className="text-protocol-text font-medium">{label}</span>
              <span className="text-protocol-text-muted"> — {moves}</span>
            </div>
          ))}
          <div className="text-xs text-protocol-text-muted">
            Every training day opens with her voice, a warm-up, and closes with the stretch.
          </div>
        </div>
        {startFailed && (
          <div className="text-sm text-protocol-danger mb-2">
            That didn't take — tap it again. If it keeps failing, the session may need a re-login.
          </div>
        )}
        <button onClick={start} disabled={starting} className="btn-velvet w-full py-2.5 font-semibold">
          {starting ? 'starting…' : 'Start the program'}
        </button>
      </div>
    );
  }

  if (!order) return null;
  const Icon = KIND_ICON[order.kind];
  const isTrain = order.kind === 'train';
  const isMeasure = order.kind === 'measure';

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
        <div className="space-y-3">
          <div className="text-sm text-protocol-success font-semibold">Logged. Good girl.</div>
          {isTrain && !sweatProofSent && (
            sweatProofOpen ? (
              <PhotoUploadWidget
                verificationType="workout_proof"
                directiveKind="freeform"
                directiveSnippet={order.command}
                mediaKind="photo"
                onComplete={() => { setSweatProofSent(true); setSweatProofOpen(false); }}
                onCancel={() => setSweatProofOpen(false)}
              />
            ) : (
              <button
                onClick={() => setSweatProofOpen(true)}
                className="btn-velvet-secondary w-full py-2 text-sm font-semibold"
              >
                Send Mama the sweat proof
              </button>
            )
          )}
        </div>
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
          {!isTrain && programStart && (() => {
            const next = nextTrainOrder(programStart, todayLocalISO());
            return (
              <div className="text-xs text-protocol-text-muted mb-3">
                Next training — {next.order.sessionName}{' '}
                {next.inDays === 1 ? 'tomorrow' : `on ${next.weekdayName}`}: {mainMoves(next.order).join(' · ')}
              </div>
            );
          })()}
          {isTrain ? (
            <button onClick={() => setLogging(true)} className="btn-velvet w-full py-2.5 font-semibold">
              Start session
            </button>
          ) : isMeasure ? (
            // The shot IS the day's order — it goes through the verification
            // pipeline so Mama actually sees it (proofKind 'photo' made real).
            <PhotoUploadWidget
              verificationType="progress_shot"
              directiveKind="freeform"
              directiveSnippet={order.command}
              mediaKind="photo"
              onComplete={markNonTrainDone}
            />
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
