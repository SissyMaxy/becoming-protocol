import { useState, useEffect, useRef, useCallback } from 'react';

const CAPTURE_DURATION_MS = 30000; // 30 seconds
const MIN_SAMPLES_FOR_VALID = 30; // Need at least 30 valid frames

/**
 * CalibrationFlow — Step-by-step guided calibration UI.
 *
 * Steps:
 *   1. Welcome / explanation
 *   2. Baseline capture (normal voice, 30s)
 *   3. Pause / instructions for feminine voice
 *   4. Ceiling capture (best feminine voice, 30s)
 *   5. Results summary
 *
 * @param {{ calibrationManager: object, onComplete: () => void, onSkip: () => void }} props
 */
export function CalibrationFlow({ calibrationManager, onComplete, onSkip }) {
  const [step, setStep] = useState(1);
  const [countdown, setCountdown] = useState(30);
  const [isCapturing, setIsCapturing] = useState(false);
  const [silenceWarning, setSilenceWarning] = useState(false);
  const [baselineResult, setBaselineResult] = useState(null);
  const [ceilingResult, setCeilingResult] = useState(null);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

  const startCapture = useCallback((phase) => {
    calibrationManager.startCapture(phase);
    setIsCapturing(true);
    setSilenceWarning(false);
    setCountdown(30);
    startTimeRef.current = Date.now();

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      const remaining = Math.max(0, Math.ceil((CAPTURE_DURATION_MS - elapsed) / 1000));
      setCountdown(remaining);

      if (remaining <= 0) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        const result = calibrationManager.endCapture();
        setIsCapturing(false);

        if (result.sampleCount < MIN_SAMPLES_FOR_VALID) {
          setSilenceWarning(true);
        }

        if (phase === 'baseline') {
          setBaselineResult(result);
          setStep(3);
        } else {
          setCeilingResult(result);
          setStep(5);
        }
      }
    }, 250);
  }, [calibrationManager]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleFinish = () => {
    if (baselineResult && ceilingResult) {
      calibrationManager.saveCalibration(
        { pitch: baselineResult.pitch, lightness: baselineResult.lightness, resonance: baselineResult.resonance, variability: baselineResult.variability },
        { pitch: ceilingResult.pitch, lightness: ceilingResult.lightness, resonance: ceilingResult.resonance, variability: ceilingResult.variability }
      );
    }
    onComplete();
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="max-w-lg w-full text-center space-y-6 px-4">
        {step === 1 && (
          <StepWelcome onNext={() => setStep(2)} onSkip={onSkip} />
        )}

        {step === 2 && (
          <StepCapture
            title="Baseline: Normal Voice"
            instruction="Speak in your normal, everyday voice. Read aloud, count numbers, or just talk naturally."
            countdown={countdown}
            isCapturing={isCapturing}
            silenceWarning={silenceWarning}
            onStart={() => startCapture('baseline')}
            onRetry={() => { setSilenceWarning(false); startCapture('baseline'); }}
          />
        )}

        {step === 3 && (
          <StepPause onNext={() => setStep(4)} />
        )}

        {step === 4 && (
          <StepCapture
            title="Ceiling: Best Feminine Voice"
            instruction="Now speak in your best feminine voice. Use the techniques you've been practicing — lighter weight, higher resonance, more melody."
            countdown={countdown}
            isCapturing={isCapturing}
            silenceWarning={silenceWarning}
            onStart={() => startCapture('ceiling')}
            onRetry={() => { setSilenceWarning(false); startCapture('ceiling'); }}
          />
        )}

        {step === 5 && (
          <StepResults
            baseline={baselineResult}
            ceiling={ceilingResult}
            onFinish={handleFinish}
          />
        )}
      </div>
    </div>
  );
}

function StepWelcome({ onNext, onSkip }) {
  return (
    <>
      <h2 className="text-2xl font-bold text-gray-100">Voice Calibration</h2>
      <p className="text-gray-400 leading-relaxed">
        Calibration personalizes your scores based on <em>your</em> voice.
        Instead of generic ranges, you'll see progress relative to your
        own starting point and current best.
      </p>
      <p className="text-gray-500 text-sm">
        You'll speak for 30 seconds in your normal voice, then 30 seconds
        in your best feminine voice. Total time: about 2 minutes.
      </p>
      <div className="flex flex-col gap-3 pt-4">
        <button
          onClick={onNext}
          className="px-6 py-3 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-500 transition-colors"
        >
          Start Calibration
        </button>
        <button
          onClick={onSkip}
          className="px-4 py-2 text-gray-500 text-sm hover:text-gray-300 transition-colors"
        >
          Skip — use generic scales
        </button>
      </div>
    </>
  );
}

function StepCapture({ title, instruction, countdown, isCapturing, silenceWarning, onStart, onRetry }) {
  return (
    <>
      <h2 className="text-xl font-bold text-gray-100">{title}</h2>
      <p className="text-gray-400 text-sm leading-relaxed">{instruction}</p>

      {!isCapturing && !silenceWarning && (
        <button
          onClick={onStart}
          className="px-6 py-3 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-500 transition-colors"
        >
          Begin Recording
        </button>
      )}

      {isCapturing && (
        <div className="space-y-4">
          <div
            className="text-6xl font-mono font-bold tabular-nums"
            style={{ color: countdown <= 5 ? '#f59e0b' : '#10b981' }}
          >
            {countdown}
          </div>
          <p className="text-gray-500 text-sm">Keep speaking...</p>
          <div className="w-full h-2 rounded-full bg-gray-800 overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-250"
              style={{ width: `${((30 - countdown) / 30) * 100}%` }}
            />
          </div>
        </div>
      )}

      {silenceWarning && (
        <div className="space-y-3">
          <p className="text-amber-400 text-sm">
            Not enough voice data was captured. Make sure your microphone is
            working and speak continuously during the recording.
          </p>
          <button
            onClick={onRetry}
            className="px-6 py-3 rounded-xl bg-amber-600 text-white font-medium hover:bg-amber-500 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}
    </>
  );
}

function StepPause({ onNext }) {
  return (
    <>
      <h2 className="text-xl font-bold text-gray-100">Baseline Captured</h2>
      <p className="text-gray-400 leading-relaxed">
        Great! Now let's capture your feminine voice. Take a moment to
        prepare — clear your throat, adjust your posture, and get ready
        to use your best feminine speaking voice.
      </p>
      <button
        onClick={onNext}
        className="px-6 py-3 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-500 transition-colors mt-4"
      >
        Ready — Capture Feminine Voice
      </button>
    </>
  );
}

function StepResults({ baseline, ceiling, onFinish }) {
  const pillars = [
    { key: 'pitch', label: 'Pitch', unit: '' },
    { key: 'lightness', label: 'Lightness', unit: '' },
    { key: 'resonance', label: 'Resonance', unit: '' },
    { key: 'variability', label: 'Variability', unit: '' },
  ];

  return (
    <>
      <h2 className="text-xl font-bold text-gray-100">Calibration Complete</h2>
      <p className="text-gray-400 text-sm leading-relaxed">
        Here's your starting point — and how far you've already come.
        Your scores will now be personalized to your range.
      </p>

      <div className="space-y-3 text-left">
        {pillars.map(p => {
          const b = baseline?.[p.key];
          const c = ceiling?.[p.key];
          const improved = b !== null && c !== null && c > b;
          return (
            <div key={p.key} className="flex items-center justify-between px-4 py-2 rounded-lg bg-gray-900/50 border border-gray-800">
              <span className="text-sm text-gray-300 font-medium">{p.label}</span>
              <div className="flex items-center gap-4 text-sm font-mono">
                <span className="text-gray-500">{b !== null ? b : '—'}</span>
                <span className="text-gray-600">→</span>
                <span style={{ color: improved ? '#10b981' : '#6b7280' }}>
                  {c !== null ? c : '—'}
                </span>
                {improved && (
                  <span className="text-emerald-500 text-xs">
                    +{Math.round(c - b)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={onFinish}
        className="px-6 py-3 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-500 transition-colors mt-4"
      >
        Start Training
      </button>
    </>
  );
}
