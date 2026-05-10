/**
 * OnboardingWizard — the /welcome flow.
 *
 * Mounted as the default landing if user_state.onboarding_completed_at
 * is null and the user has logged in. Saves partial state after every
 * step ack so a session crash leaves the user resumable. Once done,
 * calls `onComplete` (which the App-level wrapper uses to flip to Today).
 */

import { useOnboarding } from '../../hooks/useOnboarding';
import { invalidateOnboardingCompleteCache } from '../../hooks/useOnboardingComplete';
import { useAuth } from '../../context/AuthContext';
import { ONBOARDING_STEPS } from '../../lib/onboarding/types';
import { Step1Hello } from './steps/Step1Hello';
import { Step2Choosing } from './steps/Step2Choosing';
import { Step3Identity } from './steps/Step3Identity';
import { Step4Intensity } from './steps/Step4Intensity';
import { Step5Voice } from './steps/Step5Voice';
import { Step6Calendar } from './steps/Step6Calendar';
import { Step7Stealth } from './steps/Step7Stealth';
import { Step8Aftercare } from './steps/Step8Aftercare';
import { Step9Done } from './steps/Step9Done';

interface OnboardingWizardProps {
  onComplete: () => void;
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { user } = useAuth();
  const wiz = useOnboarding();

  if (wiz.loading || !wiz.state) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#fafafa',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#888',
          fontSize: 14,
        }}
      >
        Loading…
      </div>
    );
  }

  const state = wiz.state;
  const back = (toIdx: number) => {
    const target = ONBOARDING_STEPS[toIdx]?.id;
    if (target) wiz.goTo(target);
  };
  const currentIdx = ONBOARDING_STEPS.findIndex(s => s.id === wiz.currentStep);

  switch (wiz.currentStep) {
    case 'hello':
      return (
        <Step1Hello
          onContinue={() => wiz.advance('hello')}
          saving={wiz.saving}
          saveError={wiz.saveError}
        />
      );
    case 'choosing':
      return (
        <Step2Choosing
          onContinue={() => wiz.advance('choosing', { extra: { safeword_acked: true } })}
          onBack={() => back(currentIdx - 1)}
          saving={wiz.saving}
          saveError={wiz.saveError}
        />
      );
    case 'identity':
      return (
        <Step3Identity
          initialName={state.feminineName}
          initialPronouns={state.pronouns}
          initialHonorific={state.currentHonorific}
          onContinue={({ feminineName, pronouns, currentHonorific }) =>
            wiz.advance('identity', { patch: { feminineName, pronouns, currentHonorific } })
          }
          onSkip={() => wiz.skip('identity')}
          onBack={() => back(currentIdx - 1)}
          saving={wiz.saving}
          saveError={wiz.saveError}
        />
      );
    case 'intensity':
      return (
        <Step4Intensity
          initial={state.personaIntensity}
          onContinue={level =>
            wiz.advance('intensity', {
              patch: {
                gaslightIntensity: level,
                mantraIntensity: level,
                personaIntensity: level,
              },
            })
          }
          onBack={() => back(currentIdx - 1)}
          saving={wiz.saving}
          saveError={wiz.saveError}
        />
      );
    case 'voice':
      return (
        <Step5Voice
          initial={state.prefersMommyVoice}
          onContinue={prefersMommyVoice =>
            wiz.advance('voice', { patch: { prefersMommyVoice } })
          }
          onBack={() => back(currentIdx - 1)}
          saving={wiz.saving}
          saveError={wiz.saveError}
        />
      );
    case 'calendar':
      return (
        <Step6Calendar
          onContinue={consent => wiz.advance('calendar', { extra: { consent } })}
          onSkip={() => wiz.skip('calendar')}
          onBack={() => back(currentIdx - 1)}
          saving={wiz.saving}
          saveError={wiz.saveError}
        />
      );
    case 'stealth':
      return (
        <Step7Stealth
          onContinue={interests => wiz.advance('stealth', { extra: interests })}
          onSkip={() => wiz.skip('stealth')}
          onBack={() => back(currentIdx - 1)}
          saving={wiz.saving}
          saveError={wiz.saveError}
        />
      );
    case 'aftercare':
      return (
        <Step8Aftercare
          onContinue={() => wiz.advance('aftercare')}
          onBack={() => back(currentIdx - 1)}
          saving={wiz.saving}
          saveError={wiz.saveError}
        />
      );
    case 'done':
      return (
        <Step9Done
          state={state}
          onFinish={async () => {
            await wiz.complete();
            invalidateOnboardingCompleteCache(user?.id);
            onComplete();
          }}
          onBack={() => back(currentIdx - 1)}
          saving={wiz.saving}
          saveError={wiz.saveError}
        />
      );
  }
}
