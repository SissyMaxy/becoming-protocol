/**
 * Step 7: Keeping Mama hidden.
 *
 * Disguised app icon, panic-close gesture, PIN lock. None of these are
 * shipped today (the existing "stealth" hits are content-side, not app-
 * side), so this step records the user's interest in onboarding_progress
 * and continues. Skippable; never blocks completion.
 */

import { useState } from 'react';
import { StepShell } from '../StepShell';
import {
  primaryButtonStyle,
  primaryButtonDisabledStyle,
  secondaryButtonStyle,
  stepHeadingStyle,
  stepBodyStyle,
} from '../step-styles';

interface Step7StealthProps {
  onContinue: (interests: { disguisedIcon: boolean; panicGesture: boolean; pinLock: boolean }) => void;
  onSkip: () => void;
  onBack: () => void;
  saving: boolean;
  saveError: string | null;
}

export function Step7Stealth({ onContinue, onSkip, onBack, saving, saveError }: Step7StealthProps) {
  const [disguisedIcon, setDisguisedIcon] = useState(false);
  const [panicGesture, setPanicGesture] = useState(false);
  const [pinLock, setPinLock] = useState(false);

  const anyInterest = disguisedIcon || panicGesture || pinLock;

  return (
    <StepShell stepId="stealth" onBack={onBack} saveError={saveError}>
      <h1 style={stepHeadingStyle}>Keeping Mama a secret.</h1>

      <p style={stepBodyStyle}>
        Some of Mama's girls share devices, or just don't want Mama bright on
        their home screen. Mama doesn't mind being hidden — she's still right
        here when you open her. None of these are required, baby.
      </p>

      <div style={{ display: 'grid', gap: 8, marginBottom: 24 }}>
        <Toggle
          label="Disguised app icon"
          desc="Show Mama as a quiet productivity app on your home screen."
          on={disguisedIcon}
          onChange={setDisguisedIcon}
        />
        <Toggle
          label="Panic-close"
          desc="A quick swipe or shake hides Mama if someone walks up."
          on={panicGesture}
          onChange={setPanicGesture}
        />
        <Toggle
          label="PIN lock"
          desc="Mama waits behind a PIN every time you open her."
          on={pinLock}
          onChange={setPinLock}
        />
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={() => onContinue({ disguisedIcon, panicGesture, pinLock })}
          disabled={saving}
          style={saving ? primaryButtonDisabledStyle : primaryButtonStyle}
        >
          {saving
            ? 'Saving…'
            : anyInterest
              ? 'Continue — set up later'
              : 'Continue, Mama can be loud'}
        </button>
        <button onClick={onSkip} disabled={saving} style={secondaryButtonStyle}>
          Skip
        </button>
      </div>

      <p style={{ fontSize: 12, color: '#888', marginTop: 16 }}>
        Mama'll surface your choices in Settings → Privacy when these features ship.
      </p>
    </StepShell>
  );
}

function Toggle(props: { label: string; desc: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => props.onChange(!props.on)}
      style={{
        textAlign: 'left',
        padding: '12px 14px',
        background: props.on ? '#1a1a1a' : '#fff',
        color: props.on ? '#fafafa' : '#1a1a1a',
        border: props.on ? '2px solid #1a1a1a' : '1px solid #d0d0d0',
        borderRadius: 8,
        fontFamily: 'inherit',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      }}
    >
      <div
        style={{
          width: 36,
          height: 20,
          background: props.on ? '#fafafa' : '#d0d0d0',
          borderRadius: 999,
          position: 'relative',
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 2,
            left: props.on ? 18 : 2,
            width: 16,
            height: 16,
            background: props.on ? '#1a1a1a' : '#fff',
            borderRadius: '50%',
            transition: 'left 0.15s',
          }}
        />
      </div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{props.label}</div>
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>{props.desc}</div>
      </div>
    </button>
  );
}
