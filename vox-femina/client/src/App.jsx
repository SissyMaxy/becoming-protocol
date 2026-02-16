import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AudioEngine } from './audio/AudioEngine';
import { PitchDetector } from './audio/PitchDetector';
import { VocalWeightAnalyzer } from './audio/VocalWeightAnalyzer';
import { ResonanceAnalyzer } from './audio/ResonanceAnalyzer';
import { IntonationTracker } from './audio/IntonationTracker';
import { CompositeScorer } from './audio/CompositeScorer';
import { CalibrationManager } from './calibration/CalibrationManager';
import { SessionManager } from './session/SessionManager';
import { CoachingClient } from './api/CoachingClient';
import { CalibrationFlow } from './components/CalibrationFlow';
import { SessionControls } from './components/SessionControls';
import { SessionSummary } from './components/SessionSummary';
import { CoachingChat } from './components/CoachingChat';
import { CompositeScore } from './components/CompositeScore';
import { RadarChart } from './components/RadarChart';
import { LightnessMeter } from './components/LightnessMeter';
import { LightnessGraph } from './components/LightnessGraph';
import { ResonanceMeter } from './components/ResonanceMeter';
import { FormantDisplay } from './components/FormantDisplay';
import { IntonationContour } from './components/IntonationContour';
import { VariabilityIndicator } from './components/VariabilityIndicator';
import { PitchDisplay } from './components/PitchDisplay';
import { PitchGraph } from './components/PitchGraph';
import { RangeIndicator } from './components/RangeIndicator';
import { MicStatus } from './components/MicStatus';
import './index.css';

const HISTORY_MAX = 2000;
const RESONANCE_INTERVAL_MS = 125; // ~8 Hz — LPC is heavier, don't run every frame

function App() {
  const [micStatus, setMicStatus] = useState('inactive');
  const [errorMessage, setErrorMessage] = useState('');
  const [currentPitch, setCurrentPitch] = useState(null);
  const [currentClarity, setCurrentClarity] = useState(0);
  const [currentLightness, setCurrentLightness] = useState(null);
  const [currentH1H2, setCurrentH1H2] = useState(null);
  const [currentSlope, setCurrentSlope] = useState(null);
  const [resonanceData, setResonanceData] = useState({
    f1: null, f2: null, f3: null, resonanceScore: null, spectralCentroid: null,
  });
  const [intonationData, setIntonationData] = useState({
    variabilityScore: null, currentContour: null, phraseHistory: [], currentPhraseData: null,
  });
  const [compositeData, setCompositeData] = useState({
    compositeScore: null, breakdown: { lightness: null, resonance: null, variability: null, pitch: null },
  });
  const [pitchHistory, setPitchHistory] = useState([]);
  const [lightnessHistory, setLightnessHistory] = useState([]);

  // Calibration state
  const calibrationManager = useMemo(() => new CalibrationManager(), []);
  const [showCalibration, setShowCalibration] = useState(() => !calibrationManager.isCalibrated());

  // Session state
  const sessionManager = useMemo(() => new SessionManager(), []);
  const coachingClient = useMemo(() => new CoachingClient(), []);
  const [sessionState, setSessionState] = useState('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [sessionSummary, setSessionSummary] = useState(null);
  const [previousSummary, setPreviousSummary] = useState(null);
  const [showCoaching, setShowCoaching] = useState(false);

  const engineRef = useRef(null);
  const detectorRef = useRef(null);
  const weightRef = useRef(null);
  const resonanceRef = useRef(null);
  const intonationRef = useRef(null);
  const compositeRef = useRef(null);
  const animFrameRef = useRef(null);
  const resonanceTimerRef = useRef(null);
  // Keep latest resonance score in a ref for the rAF loop (avoids stale closure)
  const resonanceScoreRef = useRef(null);
  // Latest metrics ref for SessionManager sampler (avoids stale closure)
  const latestMetricsRef = useRef({
    lightness: null, resonance: null, variability: null, pitch: null,
    h1h2: null, f1: null, f2: null, f3: null, pitchHz: null,
  });

  const startAudio = useCallback(async () => {
    try {
      const engine = new AudioEngine();
      await engine.start();

      engineRef.current = engine;
      detectorRef.current = new PitchDetector(engine.getSampleRate());
      weightRef.current = new VocalWeightAnalyzer(engine.getSampleRate(), engine.fftSize);
      resonanceRef.current = new ResonanceAnalyzer(engine.getSampleRate());
      intonationRef.current = new IntonationTracker();
      compositeRef.current = new CompositeScorer();
      resonanceScoreRef.current = null;
      setMicStatus('active');
      setErrorMessage('');

      // Resonance analysis on a slower timer (LPC is heavier)
      resonanceTimerRef.current = setInterval(() => {
        if (!engineRef.current?.isActive() || !resonanceRef.current) return;

        const timeDomain = engineRef.current.getTimeDomainData();
        const freqData = engineRef.current.getFrequencyData();
        const result = resonanceRef.current.analyze(timeDomain, freqData);
        resonanceScoreRef.current = result.resonanceScore; // raw for rAF loop
        // Update formant data in latestMetricsRef for session sampler
        latestMetricsRef.current.f1 = result.f1;
        latestMetricsRef.current.f2 = result.f2;
        latestMetricsRef.current.f3 = result.f3;
        setResonanceData(result);
      }, RESONANCE_INTERVAL_MS);

      // Pitch + lightness + intonation + composite on rAF (fast updates)
      const analyze = () => {
        if (!engineRef.current?.isActive()) return;

        const now = Date.now();

        const timeDomain = engineRef.current.getTimeDomainData();
        const pitchResult = detectorRef.current.detect(timeDomain);

        setCurrentPitch(pitchResult.pitch);
        setCurrentClarity(pitchResult.clarity);

        const freqData = engineRef.current.getFrequencyData();
        const weightResult = weightRef.current.analyze(freqData, pitchResult.pitch);

        const rawLightness = weightResult.lightness;
        const rawResonance = resonanceScoreRef.current;

        setCurrentH1H2(weightResult.h1h2);
        setCurrentSlope(weightResult.spectralSlope);

        // Feed pitch to intonation tracker
        let rawVariability = null;
        let intResult = null;
        if (intonationRef.current) {
          intResult = intonationRef.current.addPitch(pitchResult.pitch, now);
          rawVariability = intResult.variabilityScore;
        }

        const rawPitchScore = CompositeScorer.pitchToScore(pitchResult.pitch);

        // Feed raw metrics to calibration manager during capture
        calibrationManager.addFrame({
          pitch: rawPitchScore,
          lightness: rawLightness,
          resonance: rawResonance,
          variability: rawVariability,
        });

        // Apply personalized mapping if calibrated
        const pLightness = calibrationManager.rawToPersonalized('lightness', rawLightness);
        const pResonance = calibrationManager.rawToPersonalized('resonance', rawResonance);
        const pVariability = calibrationManager.rawToPersonalized('variability', rawVariability);
        const pPitch = calibrationManager.rawToPersonalized('pitch', rawPitchScore);

        // Set personalized display values
        setCurrentLightness(pLightness);
        if (intResult) {
          setIntonationData({ ...intResult, variabilityScore: pVariability });
        }

        // Composite score uses personalized values
        if (compositeRef.current) {
          const result = compositeRef.current.score({
            lightness: pLightness,
            resonance: pResonance,
            variability: pVariability,
            pitch: pPitch,
          });
          setCompositeData(result);
        }

        // Update latest metrics ref for session sampler (resonance/formants updated in interval)
        latestMetricsRef.current.lightness = pLightness;
        latestMetricsRef.current.resonance = pResonance;
        latestMetricsRef.current.variability = pVariability;
        latestMetricsRef.current.pitch = pPitch;
        latestMetricsRef.current.h1h2 = weightResult.h1h2;
        latestMetricsRef.current.pitchHz = pitchResult.pitch;

        setPitchHistory(prev => {
          const next = [...prev, { pitch: pitchResult.pitch, time: now }];
          return next.length > HISTORY_MAX ? next.slice(next.length - HISTORY_MAX) : next;
        });

        setLightnessHistory(prev => {
          const next = [...prev, { lightness: rawLightness, time: now }];
          return next.length > HISTORY_MAX ? next.slice(next.length - HISTORY_MAX) : next;
        });

        animFrameRef.current = requestAnimationFrame(analyze);
      };

      animFrameRef.current = requestAnimationFrame(analyze);
    } catch (err) {
      setMicStatus('error');
      if (err.name === 'NotAllowedError') {
        setErrorMessage('Microphone access was denied. Please enable it in your browser settings and try again.');
      } else if (err.name === 'NotFoundError') {
        setErrorMessage('No microphone detected. Please connect a microphone and try again.');
      } else {
        setErrorMessage(`Failed to access microphone: ${err.message}`);
      }
    }
  }, [calibrationManager]);

  const stopAudio = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (resonanceTimerRef.current) {
      clearInterval(resonanceTimerRef.current);
      resonanceTimerRef.current = null;
    }
    if (engineRef.current) {
      engineRef.current.stop();
      engineRef.current = null;
    }
    detectorRef.current = null;
    if (weightRef.current) {
      weightRef.current.reset();
      weightRef.current = null;
    }
    if (resonanceRef.current) {
      resonanceRef.current.reset();
      resonanceRef.current = null;
    }
    if (intonationRef.current) {
      intonationRef.current.reset();
      intonationRef.current = null;
    }
    compositeRef.current = null;
    resonanceScoreRef.current = null;
    setMicStatus('inactive');
    setCurrentPitch(null);
    setCurrentClarity(0);
    setCurrentLightness(null);
    setCurrentH1H2(null);
    setCurrentSlope(null);
    setResonanceData({ f1: null, f2: null, f3: null, resonanceScore: null, spectralCentroid: null });
    setIntonationData({ variabilityScore: null, currentContour: null, phraseHistory: [], currentPhraseData: null });
    setCompositeData({ compositeScore: null, breakdown: { lightness: null, resonance: null, variability: null, pitch: null } });
  }, []);

  // Stable sampler function that reads from latestMetricsRef (avoids stale closure)
  const samplerFn = useCallback(() => ({ ...latestMetricsRef.current }), []);

  const handleStartSession = useCallback(() => {
    sessionManager.start(samplerFn);
    setSessionState('active');
    setSessionSummary(null);
  }, [sessionManager, samplerFn]);

  const handlePauseSession = useCallback(() => {
    sessionManager.pause();
    setSessionState('paused');
  }, [sessionManager]);

  const handleResumeSession = useCallback(() => {
    sessionManager.resume();
    setSessionState('active');
  }, [sessionManager]);

  const handleStopSession = useCallback(() => {
    const summary = sessionManager.stop(intonationData.phraseHistory);
    setSessionState('stopped');
    setSessionSummary(summary);
    // Feed metrics to coaching client
    coachingClient.setMetrics({
      compositeScore: summary.compositeScore,
      pillarScores: summary.pillarScores,
      extras: summary.extras,
      durationSeconds: summary.durationSeconds,
    });
    // Persist to server (fire-and-forget)
    sessionManager.saveSession(summary);
    // Store for trend comparison next time
    setPreviousSummary(summary);
  }, [sessionManager, coachingClient, intonationData.phraseHistory]);

  const handleNewSession = useCallback(() => {
    sessionManager.reset();
    setSessionState('idle');
    setSessionSummary(null);
    setShowCoaching(false);
  }, [sessionManager]);

  const handleRequestCoaching = useCallback(() => {
    setShowCoaching(true);
  }, []);

  // Timer update (1s interval when session is active)
  useEffect(() => {
    if (sessionState !== 'active') return;
    const timer = setInterval(() => {
      setElapsedSeconds(sessionManager.getElapsedSeconds());
    }, 1000);
    return () => clearInterval(timer);
  }, [sessionState, sessionManager]);

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (resonanceTimerRef.current) clearInterval(resonanceTimerRef.current);
      if (engineRef.current) engineRef.current.stop();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0f0f14] text-gray-200">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight">
            <span className="text-emerald-400">Vox</span> Femina
          </h1>
          <div className="flex items-center gap-2">
            {micStatus === 'active' && !showCalibration && calibrationManager.isCalibrated() && (
              <button
                onClick={() => {
                  stopAudio();
                  calibrationManager.recalibrate();
                  setShowCalibration(true);
                }}
                className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-500 text-xs font-medium hover:bg-gray-700 hover:text-gray-300 transition-colors"
              >
                Recalibrate
              </button>
            )}
            {micStatus === 'active' && (
              <button
                onClick={stopAudio}
                className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 text-xs font-medium hover:bg-gray-700 transition-colors"
              >
                Stop
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {showCalibration ? (
          <CalibrationFlow
            calibrationManager={calibrationManager}
            onComplete={() => setShowCalibration(false)}
            onSkip={() => setShowCalibration(false)}
          />
        ) : micStatus !== 'active' ? (
          <div className="flex flex-col items-center py-12">
            <MicStatus
              status={micStatus}
              errorMessage={errorMessage}
              onStart={startAudio}
            />
            {calibrationManager.isCalibrated() && (
              <button
                onClick={() => {
                  calibrationManager.recalibrate();
                  setShowCalibration(true);
                }}
                className="mt-4 text-gray-500 text-xs hover:text-gray-300 transition-colors"
              >
                Recalibrate voice profile
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Mic status */}
            <div className="flex justify-center">
              <MicStatus status="active" onStart={startAudio} />
            </div>

            {/* Session Controls */}
            <SessionControls
              sessionState={sessionState}
              elapsedSeconds={elapsedSeconds}
              onStart={handleStartSession}
              onPause={handlePauseSession}
              onResume={handleResumeSession}
              onStop={handleStopSession}
            />

            {/* HERO: Composite Score */}
            <CompositeScore
              compositeScore={compositeData.compositeScore}
              breakdown={compositeData.breakdown}
            />

            {/* THREE PRIMARY PILLARS: Lightness + Resonance + Variability */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <h2 className="text-sm font-medium text-gray-400 mb-3 text-center">Vocal Weight</h2>
                <LightnessMeter
                  lightness={currentLightness}
                  h1h2={currentH1H2}
                  spectralSlope={currentSlope}
                />
              </div>
              <div>
                <h2 className="text-sm font-medium text-gray-400 mb-3 text-center">Resonance</h2>
                <ResonanceMeter
                  resonanceScore={calibrationManager.rawToPersonalized('resonance', resonanceData.resonanceScore)}
                  f1={resonanceData.f1}
                  f2={resonanceData.f2}
                  f3={resonanceData.f3}
                  spectralCentroid={resonanceData.spectralCentroid}
                />
              </div>
              <div>
                <h2 className="text-sm font-medium text-gray-400 mb-3 text-center">Intonation</h2>
                <VariabilityIndicator
                  variabilityScore={intonationData.variabilityScore}
                  phraseHistory={intonationData.phraseHistory}
                  currentContour={intonationData.currentContour}
                />
              </div>
            </div>

            {/* Radar Chart */}
            <div className="flex justify-center">
              <div className="w-full max-w-sm">
                <h2 className="text-sm font-medium text-gray-400 mb-2 text-center">Voice Profile</h2>
                <RadarChart
                  lightness={currentLightness}
                  resonance={calibrationManager.rawToPersonalized('resonance', resonanceData.resonanceScore)}
                  variability={intonationData.variabilityScore}
                  pitch={calibrationManager.rawToPersonalized('pitch', CompositeScorer.pitchToScore(currentPitch))}
                />
              </div>
            </div>

            {/* Intonation Contour — signature visualization */}
            <div>
              <h2 className="text-sm font-medium text-gray-400 mb-2">Pitch Contour</h2>
              <IntonationContour
                pitchHistory={pitchHistory}
                phraseHistory={intonationData.phraseHistory}
              />
            </div>

            {/* Formant detail */}
            <div>
              <h2 className="text-sm font-medium text-gray-400 mb-2">Formants</h2>
              <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800">
                <FormantDisplay
                  f1={resonanceData.f1}
                  f2={resonanceData.f2}
                  f3={resonanceData.f3}
                />
              </div>
            </div>

            {/* Lightness Over Time */}
            <div>
              <h2 className="text-sm font-medium text-gray-400 mb-2">Lightness Over Time</h2>
              <LightnessGraph lightnessHistory={lightnessHistory} />
            </div>

            {/* SECONDARY: Pitch */}
            <div className="border-t border-gray-800 pt-6">
              <h2 className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wider">Pitch (Secondary)</h2>
              <div className="scale-90 origin-top">
                <PitchDisplay pitch={currentPitch} clarity={currentClarity} />
              </div>
              <div className="mt-3">
                <RangeIndicator pitch={currentPitch} />
              </div>
            </div>

            {/* Pitch Graph */}
            <div>
              <h2 className="text-sm font-medium text-gray-400 mb-2">Pitch Over Time</h2>
              <PitchGraph pitchHistory={pitchHistory} />
            </div>

            {/* Privacy notice */}
            <div className="text-center pt-4 border-t border-gray-800">
              <p className="text-xs text-gray-600">
                All audio processing happens in your browser. No audio data is sent anywhere.
              </p>
            </div>
          </>
        )}
      </main>

      {/* Session Summary modal */}
      {sessionSummary && (
        <SessionSummary
          summary={sessionSummary}
          previousSummary={previousSummary}
          onRequestCoaching={handleRequestCoaching}
          onNewSession={handleNewSession}
          onClose={() => setSessionSummary(null)}
        />
      )}

      {/* Coaching Chat drawer */}
      <CoachingChat
        isOpen={showCoaching}
        onClose={() => setShowCoaching(false)}
        coachingClient={coachingClient}
        sessionSummary={sessionSummary}
      />
    </div>
  );
}

export default App;
