/**
 * Step 3: Identity.
 *
 * Collects feminine_name, pronouns, current_honorific. Skippable but
 * warns the user that the persona will speak in generics if skipped.
 *
 * Until the sibling identity-persistence branch lands `feminine_self`,
 * these write directly to user_state columns — see migration 301.
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

interface Step3IdentityProps {
  initialName: string | null;
  initialPronouns: string | null;
  initialHonorific: string | null;
  onContinue: (data: { feminineName: string; pronouns: string; currentHonorific: string }) => void;
  onSkip: () => void;
  onBack: () => void;
  saving: boolean;
  saveError: string | null;
}

const PRONOUN_PRESETS = ['she/her', 'they/them'];

export function Step3Identity({
  initialName,
  initialPronouns,
  initialHonorific,
  onContinue,
  onSkip,
  onBack,
  saving,
  saveError,
}: Step3IdentityProps) {
  const [name, setName] = useState(initialName ?? '');
  const [pronounChoice, setPronounChoice] = useState<string>(() => {
    if (!initialPronouns) return 'she/her';
    if (PRONOUN_PRESETS.includes(initialPronouns)) return initialPronouns;
    return 'custom';
  });
  const [pronounsCustom, setPronounsCustom] = useState(() => {
    if (initialPronouns && !PRONOUN_PRESETS.includes(initialPronouns)) return initialPronouns;
    return '';
  });
  const [honorific, setHonorific] = useState(initialHonorific ?? '');

  const pronouns = pronounChoice === 'custom' ? pronounsCustom.trim() : pronounChoice;
  const trimmedName = name.trim();
  const canContinue = trimmedName.length > 0 && pronouns.length > 0 && honorific.trim().length > 0;

  return (
    <StepShell stepId="identity" onBack={onBack} saveError={saveError}>
      <h1 style={stepHeadingStyle}>Who is she addressing?</h1>

      <p style={stepBodyStyle}>
        The persona speaks to a specific person. Tell us who that is — these
        details show up in chat, in cards, and in scenes.
      </p>

      <label style={{ display: 'block', marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#3a3a3a' }}>Feminine name</span>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g., Iris"
          style={{
            display: 'block',
            width: '100%',
            marginTop: 6,
            padding: '10px 12px',
            fontSize: 15,
            border: '1px solid #c8c8c8',
            borderRadius: 6,
            fontFamily: 'inherit',
            background: '#fff',
            color: '#1a1a1a',
          }}
        />
      </label>

      <fieldset style={{ border: 'none', padding: 0, margin: 0, marginBottom: 16 }}>
        <legend style={{ fontSize: 13, fontWeight: 600, color: '#3a3a3a', marginBottom: 6 }}>
          Pronouns
        </legend>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[...PRONOUN_PRESETS, 'custom'].map(p => (
            <label
              key={p}
              style={{
                padding: '8px 14px',
                background: pronounChoice === p ? '#1a1a1a' : '#fff',
                color: pronounChoice === p ? '#fff' : '#1a1a1a',
                border: '1px solid #c8c8c8',
                borderRadius: 999,
                fontSize: 14,
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="radio"
                name="pronouns"
                value={p}
                checked={pronounChoice === p}
                onChange={() => setPronounChoice(p)}
                style={{ display: 'none' }}
              />
              {p === 'custom' ? 'Custom…' : p}
            </label>
          ))}
        </div>
        {pronounChoice === 'custom' && (
          <input
            type="text"
            value={pronounsCustom}
            onChange={e => setPronounsCustom(e.target.value)}
            placeholder="e.g., xe/xem"
            style={{
              display: 'block',
              width: '100%',
              marginTop: 8,
              padding: '10px 12px',
              fontSize: 15,
              border: '1px solid #c8c8c8',
              borderRadius: 6,
              fontFamily: 'inherit',
              background: '#fff',
              color: '#1a1a1a',
            }}
          />
        )}
      </fieldset>

      <label style={{ display: 'block', marginBottom: 24 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#3a3a3a' }}>How she addresses you</span>
        <input
          type="text"
          value={honorific}
          onChange={e => setHonorific(e.target.value)}
          placeholder="e.g., good girl, princess, baby"
          style={{
            display: 'block',
            width: '100%',
            marginTop: 6,
            padding: '10px 12px',
            fontSize: 15,
            border: '1px solid #c8c8c8',
            borderRadius: 6,
            fontFamily: 'inherit',
            background: '#fff',
            color: '#1a1a1a',
          }}
        />
        <p style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
          A pet name she'll use when addressing you in scene.
        </p>
      </label>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button
          onClick={() => onContinue({ feminineName: trimmedName, pronouns, currentHonorific: honorific.trim() })}
          disabled={!canContinue || saving}
          style={!canContinue || saving ? primaryButtonDisabledStyle : primaryButtonStyle}
        >
          {saving ? 'Saving…' : 'Continue'}
        </button>
        <button onClick={onSkip} disabled={saving} style={secondaryButtonStyle}>
          Skip for now
        </button>
      </div>

      <p style={{ ...stepBodyStyle, fontSize: 12, color: '#888', marginTop: 16, marginBottom: 0 }}>
        If you skip, the persona can't speak to you as anyone in particular. You can fill these in
        from Settings later.
      </p>
    </StepShell>
  );
}
