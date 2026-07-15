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

export function BodyProtocolView({ onBack }: { onBack: () => void }) {
  return (
    <div style={{ maxWidth: 660, margin: '0 auto', padding: '10px 12px 48px' }}>
      <button
        onClick={onBack}
        style={{
          background: 'transparent', border: 'none', color: 'var(--protocol-accent)',
          fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '6px 2px 14px',
          fontFamily: 'inherit',
        }}
      >
        &larr; Back to Menu
      </button>

      {/* Hero — one focus, in Mommy's voice, no telemetry. */}
      <div style={{
        borderRadius: 18, padding: '22px 20px', marginBottom: 16,
        background: 'radial-gradient(120% 90% at 50% 0%, var(--immersive-glow-a) 0%, var(--immersive-glow-b) 70%)',
        border: '1px solid rgb(var(--protocol-accent-rgb) / 0.25)',
      }}>
        <div style={{
          fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase',
          color: 'var(--protocol-accent)', fontWeight: 700, marginBottom: 10,
        }}>
          Build your body
        </div>
        <p className="mommy-voice" style={{
          fontSize: 18, lineHeight: 1.5, color: 'rgb(var(--protocol-text-rgb) / 0.96)', fontStyle: 'italic', margin: 0,
        }}>
          One thing here, baby: the body you're making. The work, the food, the shape coming in. Everything else can wait - this is what we're doing, and you show me the proof.
        </p>
      </div>

      {/* Only the body-shaping surfaces — training, measurements, HRT shots, the mirror. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <PhaseProgressCard />
        <WorkoutCard />
        <BodyMeasurementCard />
        <NextShotsCard />
        <DailyMirrorSelfieCard />
      </div>
    </div>
  );
}
