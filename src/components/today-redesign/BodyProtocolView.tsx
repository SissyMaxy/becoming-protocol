/**
 * BodyProtocolView — the focused "build your body" surface.
 *
 * The problem this solves: the Today dashboard renders 60+ cards from every
 * system the app has ever had (revenue, penalties, code audits, deploy status,
 * public dares…), and the body-shaping work — workout, measurements, HRT shots,
 * progress photos — drowns in it. This screen is ONLY about making the body more
 * feminine: today's training, the shape coming in, and the proof. It composes
 * the existing cards (each self-fetches its own data); no new plumbing.
 */
import { PhaseProgressCard } from './PhaseProgressCard';
import { WorkoutCard } from './WorkoutCard';
import { BodyMeasurementCard } from './BodyMeasurementCard';
import { NextShotsCard } from './NextShotsCard';
import { DailyMirrorSelfieCard } from '../evidence/DailyMirrorSelfieCard';
import { useStealthSettings } from '../../hooks/useStealthSettings';
import { navigate } from '../../navigation/store';

export function BodyProtocolView({ onBack }: { onBack: () => void }) {
  const { settings } = useStealthSettings();
  const sanitized = settings.sanitized_fitness_mode;

  const openBaselineIntake = () => {
    navigate('baseline-intake'); // voice-gate: ok — view id, not user-facing copy
  };

  return (
    <div style={{ maxWidth: 660, margin: '0 auto', padding: '10px 12px 48px' }}>
      <button
        onClick={onBack}
        style={{
          background: 'transparent', border: 'none', color: '#c9557f',
          fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '6px 2px 14px',
          fontFamily: 'inherit',
        }}
      >
        &larr; {sanitized ? 'Back' : 'Back to Menu'}
      </button>

      {/* Hero — one focus, in Mommy's voice, no telemetry. */}
      <div style={{
        borderRadius: 18, padding: '22px 20px', marginBottom: 16,
        background: sanitized
          ? 'radial-gradient(120% 90% at 50% 0%, #16302b 0%, #0f172a 72%)'
          : 'radial-gradient(120% 90% at 50% 0%, #241019 0%, #16090f 70%)',
        border: sanitized ? '1px solid #1d5c4d' : '1px solid #3a2130',
      }}>
        <div style={{
          fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase',
          color: sanitized ? '#6ee7b7' : '#c9557f', fontWeight: 700, marginBottom: 10,
        }}>
          {sanitized ? 'Aesthetic fitness plan' : 'Build your body'}
        </div>
        <p className="mommy-voice" style={{
          fontSize: 18, lineHeight: 1.5, color: '#f3e6ec', fontStyle: 'italic', margin: 0,
        }}>
          {sanitized
            ? 'Training, fuel, recovery, and body metrics. One clear plan, one next action, and clean evidence over time.'
            : "One thing here, baby: the body you're making. The work, the food, the shape coming in. Everything else can wait - this is what we're doing, and you show me the proof."}
        </p>
      </div>

      {/* Only the body-shaping surfaces — training, measurements, HRT shots, the mirror. */}
      <button
        type="button"
        onClick={openBaselineIntake}
        style={{
          width: '100%',
          border: sanitized ? '1px solid #1d5c4d' : '1px solid #4a2438',
          background: sanitized ? '#0f241f' : '#171017',
          color: sanitized ? '#6ee7b7' : '#edaec5',
          borderRadius: 10,
          padding: '12px 14px',
          marginBottom: 14,
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Open baseline intake
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {!sanitized && <PhaseProgressCard />}
        <WorkoutCard />
        <BodyMeasurementCard />
        {!sanitized && <NextShotsCard />}
        {!sanitized && <DailyMirrorSelfieCard />}
      </div>
    </div>
  );
}
