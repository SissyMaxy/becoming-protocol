/**
 * Step 7: Stealth setup (optional).
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
      <h1 style={stepHeadingStyle}>Privacy on the device.</h1>

      <p style={stepBodyStyle}>
        Some people share devices, lend phones out, or just want a quieter
        presence on their home screen. None of these are required, and you
        can turn any of them on later from Settings.
      </p>

      <div style={{ display: 'grid', gap: 8, marginBottom: 24 }}>
        <Toggle
          label="Disguised app icon"
          desc="Show as a generic productivity app on your home screen."
          on={disguisedIcon}
          onChange={setDisguisedIcon}
        />
        <Toggle
          label="Panic-close gesture"
          desc="Quickly hide or lock the app with a swipe or shake."
          on={panicGesture}
          onChange={setPanicGesture}
        />
        <Toggle
          label="PIN lock"
          desc="Require a PIN every time the app opens."
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
              : 'Continue without stealth'}
        </button>
        <button onClick={onSkip} disabled={saving} style={secondaryButtonStyle}>
          Skip
        </button>
      </div>

      <p style={{ fontSize: 12, color: '#888', marginTop: 16 }}>
        We'll surface your choices in Settings → Privacy when those features ship.
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
