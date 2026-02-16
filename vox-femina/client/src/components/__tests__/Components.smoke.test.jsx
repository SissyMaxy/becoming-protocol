import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PitchDisplay } from '../PitchDisplay';
import { PitchGraph } from '../PitchGraph';
import { RangeIndicator } from '../RangeIndicator';
import { MicStatus } from '../MicStatus';
import { LightnessMeter } from '../LightnessMeter';
import { LightnessGraph } from '../LightnessGraph';
import { ResonanceMeter } from '../ResonanceMeter';
import { FormantDisplay } from '../FormantDisplay';
import { IntonationContour } from '../IntonationContour';
import { VariabilityIndicator } from '../VariabilityIndicator';
import { CompositeScore } from '../CompositeScore';
import { RadarChart } from '../RadarChart';
import { CalibrationFlow } from '../CalibrationFlow';
import { CalibrationManager } from '../../calibration/CalibrationManager';
import { SessionControls } from '../SessionControls';
import { SessionSummary } from '../SessionSummary';
import { CoachingChat } from '../CoachingChat';
import { CoachingClient } from '../../api/CoachingClient';

// jsdom doesn't implement canvas getContext — provide a minimal mock
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = function () {
    return {
      scale: () => {},
      clearRect: () => {},
      fillRect: () => {},
      fillText: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      arc: () => {},
      fill: () => {},
      closePath: () => {},
      setLineDash: () => {},
      set fillStyle(_v) {},
      set strokeStyle(_v) {},
      set lineWidth(_v) {},
      set lineJoin(_v) {},
      set lineCap(_v) {},
      set font(_v) {},
    };
  };
});

/**
 * Component Rendering Smoke Tests (Section 7.5)
 * Verify Phase 1 components render without errors.
 */
describe('Component Smoke Tests', () => {
  describe('PitchDisplay', () => {
    it('renders without errors when no signal', () => {
      const { container } = render(<PitchDisplay pitch={null} clarity={0} />);
      expect(container).toBeTruthy();
      expect(screen.getByText('No signal')).toBeTruthy();
    });

    it('renders with a valid pitch', () => {
      const { container } = render(<PitchDisplay pitch={200} clarity={0.8} />);
      expect(container).toBeTruthy();
      expect(screen.getByText('200')).toBeTruthy();
      expect(screen.getByText('Hz')).toBeTruthy();
    });

    it('renders all four range badges', () => {
      render(<PitchDisplay pitch={200} clarity={0.8} />);
      expect(screen.getByText('Masculine')).toBeTruthy();
      expect(screen.getByText('Androgynous')).toBeTruthy();
      expect(screen.getByText('Feminine')).toBeTruthy();
      expect(screen.getByText('High Fem')).toBeTruthy();
    });
  });

  describe('PitchGraph', () => {
    it('renders without errors with empty history', () => {
      const { container } = render(<PitchGraph pitchHistory={[]} />);
      expect(container).toBeTruthy();
      expect(container.querySelector('canvas')).toBeTruthy();
    });

    it('renders with pitch history data', () => {
      const history = [
        { pitch: 180, time: Date.now() - 1000 },
        { pitch: 200, time: Date.now() - 500 },
        { pitch: 210, time: Date.now() },
      ];
      const { container } = render(<PitchGraph pitchHistory={history} />);
      expect(container.querySelector('canvas')).toBeTruthy();
    });
  });

  describe('RangeIndicator', () => {
    it('renders without errors when no pitch', () => {
      const { container } = render(<RangeIndicator pitch={null} />);
      expect(container).toBeTruthy();
      expect(screen.getByText('Masculine')).toBeTruthy();
      expect(screen.getByText('Feminine')).toBeTruthy();
    });

    it('renders with a pitch value', () => {
      const { container } = render(<RangeIndicator pitch={200} />);
      expect(container).toBeTruthy();
    });
  });

  describe('MicStatus', () => {
    it('renders inactive state with start button', () => {
      const { container } = render(<MicStatus status="inactive" onStart={() => {}} />);
      expect(container).toBeTruthy();
    });

    it('renders active state', () => {
      const { container } = render(<MicStatus status="active" onStart={() => {}} />);
      expect(container).toBeTruthy();
    });

    it('renders error state with message', () => {
      render(
        <MicStatus status="error" errorMessage="Mic denied" onStart={() => {}} />
      );
      expect(screen.getByText('Mic denied')).toBeTruthy();
    });
  });

  describe('LightnessMeter', () => {
    it('renders without errors when no signal', () => {
      const { container } = render(
        <LightnessMeter lightness={null} h1h2={null} spectralSlope={null} />
      );
      expect(container).toBeTruthy();
      expect(screen.getByText('No signal')).toBeTruthy();
    });

    it('renders with a valid lightness score', () => {
      const { container } = render(
        <LightnessMeter lightness={65} h1h2={8.5} spectralSlope={-7.2} />
      );
      expect(container).toBeTruthy();
      expect(screen.getByText('65')).toBeTruthy();
      // "Light" appears in gauge label, category text, and badge — use getAllByText
      expect(screen.getAllByText('Light').length).toBeGreaterThanOrEqual(1);
    });

    it('renders all four weight badges', () => {
      render(
        <LightnessMeter lightness={65} h1h2={8.5} spectralSlope={-7.2} />
      );
      // "Heavy" and "Light" appear in both gauge labels and badges
      expect(screen.getAllByText('Heavy').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Moderate')).toBeTruthy();
      expect(screen.getAllByText('Light').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Very Light')).toBeTruthy();
    });

    it('renders H1-H2 and spectral slope detail metrics', () => {
      render(
        <LightnessMeter lightness={65} h1h2={8.5} spectralSlope={-7.2} />
      );
      expect(screen.getByText('H1-H2')).toBeTruthy();
      expect(screen.getByText('+8.5 dB')).toBeTruthy();
      expect(screen.getByText('Spectral Slope')).toBeTruthy();
      expect(screen.getByText('-7.2 dB/h')).toBeTruthy();
    });
  });

  describe('LightnessGraph', () => {
    it('renders without errors with empty history', () => {
      const { container } = render(<LightnessGraph lightnessHistory={[]} />);
      expect(container).toBeTruthy();
      expect(container.querySelector('canvas')).toBeTruthy();
    });

    it('renders with lightness history data', () => {
      const history = [
        { lightness: 45, time: Date.now() - 1000 },
        { lightness: 55, time: Date.now() - 500 },
        { lightness: 60, time: Date.now() },
      ];
      const { container } = render(<LightnessGraph lightnessHistory={history} />);
      expect(container.querySelector('canvas')).toBeTruthy();
    });
  });

  describe('ResonanceMeter', () => {
    it('renders without errors when no signal', () => {
      const { container } = render(
        <ResonanceMeter resonanceScore={null} f1={null} f2={null} f3={null} spectralCentroid={null} />
      );
      expect(container).toBeTruthy();
      expect(screen.getAllByText('No signal').length).toBeGreaterThanOrEqual(1);
    });

    it('renders with a valid resonance score', () => {
      const { container } = render(
        <ResonanceMeter resonanceScore={60} f1={500} f2={1800} f3={2600} spectralCentroid={1500} />
      );
      expect(container).toBeTruthy();
      expect(screen.getByText('60')).toBeTruthy();
    });

    it('renders all four resonance badges', () => {
      render(
        <ResonanceMeter resonanceScore={60} f1={500} f2={1800} f3={2600} spectralCentroid={1500} />
      );
      expect(screen.getAllByText('Dark').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Neutral')).toBeTruthy();
      expect(screen.getAllByText('Bright').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('V. Bright')).toBeTruthy();
    });

    it('renders F2 and centroid sub-metrics', () => {
      render(
        <ResonanceMeter resonanceScore={60} f1={500} f2={1800} f3={2600} spectralCentroid={1500} />
      );
      expect(screen.getByText('F2')).toBeTruthy();
      expect(screen.getByText('1800 Hz')).toBeTruthy();
      expect(screen.getByText('Centroid')).toBeTruthy();
      expect(screen.getByText('1500 Hz')).toBeTruthy();
    });
  });

  describe('FormantDisplay', () => {
    it('renders without errors when no formants', () => {
      const { container } = render(
        <FormantDisplay f1={null} f2={null} f3={null} />
      );
      expect(container).toBeTruthy();
      expect(screen.getByText('F1')).toBeTruthy();
      expect(screen.getByText('F2')).toBeTruthy();
      expect(screen.getByText('F3')).toBeTruthy();
    });

    it('renders with formant values', () => {
      render(
        <FormantDisplay f1={500} f2={1800} f3={2600} />
      );
      expect(screen.getByText('500 Hz')).toBeTruthy();
      expect(screen.getByText('1800 Hz')).toBeTruthy();
      expect(screen.getByText('2600 Hz')).toBeTruthy();
    });

    it('renders formant descriptions', () => {
      render(
        <FormantDisplay f1={500} f2={1800} f3={2600} />
      );
      expect(screen.getByText('Jaw openness')).toBeTruthy();
      expect(screen.getByText('Tongue position (front/back)')).toBeTruthy();
      expect(screen.getByText('Vocal tract length')).toBeTruthy();
    });
  });

  describe('IntonationContour', () => {
    it('renders without errors with empty history', () => {
      const { container } = render(
        <IntonationContour pitchHistory={[]} phraseHistory={[]} />
      );
      expect(container).toBeTruthy();
      expect(container.querySelector('canvas')).toBeTruthy();
    });

    it('renders with pitch history data', () => {
      const history = [
        { pitch: 180, time: Date.now() - 1000 },
        { pitch: 200, time: Date.now() - 500 },
        { pitch: null, time: Date.now() - 300 },
        { pitch: 220, time: Date.now() - 100 },
        { pitch: 210, time: Date.now() },
      ];
      const { container } = render(
        <IntonationContour pitchHistory={history} phraseHistory={[]} />
      );
      expect(container.querySelector('canvas')).toBeTruthy();
    });
  });

  describe('VariabilityIndicator', () => {
    it('renders without errors when no signal', () => {
      const { container } = render(
        <VariabilityIndicator variabilityScore={null} phraseHistory={[]} currentContour={null} />
      );
      expect(container).toBeTruthy();
      expect(screen.getAllByText('No signal').length).toBeGreaterThanOrEqual(1);
    });

    it('renders with a valid variability score', () => {
      const { container } = render(
        <VariabilityIndicator variabilityScore={60} phraseHistory={[]} currentContour="rising" />
      );
      expect(container).toBeTruthy();
      expect(screen.getByText('60')).toBeTruthy();
      expect(screen.getAllByText('Melodic').length).toBeGreaterThanOrEqual(1);
    });

    it('renders all four category badges', () => {
      render(
        <VariabilityIndicator variabilityScore={60} phraseHistory={[]} currentContour="rising" />
      );
      expect(screen.getAllByText('Monotone').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Moderate').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Melodic').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Animated')).toBeTruthy();
    });

    it('renders contour and phrase count sub-metrics', () => {
      render(
        <VariabilityIndicator variabilityScore={60} phraseHistory={[]} currentContour="rising" />
      );
      expect(screen.getByText('Contour')).toBeTruthy();
      expect(screen.getByText('Phrases')).toBeTruthy();
    });

    it('renders phrase history breakdown', () => {
      const phrases = [
        { variabilityScore: 30, contour: 'rising', range: 25, startTime: 1000, endTime: 1500 },
        { variabilityScore: 65, contour: 'varied', range: 55, startTime: 2000, endTime: 2500 },
      ];
      render(
        <VariabilityIndicator variabilityScore={48} phraseHistory={phrases} currentContour="varied" />
      );
      expect(screen.getByText('Recent Phrases')).toBeTruthy();
      expect(screen.getByText('30')).toBeTruthy();
      expect(screen.getByText('65')).toBeTruthy();
    });
  });

  describe('CompositeScore', () => {
    it('renders without errors when no score', () => {
      const { container } = render(
        <CompositeScore
          compositeScore={null}
          breakdown={{ lightness: null, resonance: null, variability: null, pitch: null }}
        />
      );
      expect(container).toBeTruthy();
      expect(screen.getByText('No signal')).toBeTruthy();
    });

    it('renders with a valid composite score', () => {
      render(
        <CompositeScore
          compositeScore={72}
          breakdown={{ lightness: 28, resonance: 18, variability: 11, pitch: 15 }}
        />
      );
      expect(screen.getByText('72')).toBeTruthy();
      expect(screen.getByText('Very Feminine')).toBeTruthy();
    });

    it('renders breakdown segment labels', () => {
      render(
        <CompositeScore
          compositeScore={69}
          breakdown={{ lightness: 28, resonance: 18, variability: 8, pitch: 15 }}
        />
      );
      expect(screen.getByText('Lightness')).toBeTruthy();
      expect(screen.getByText('Resonance')).toBeTruthy();
      expect(screen.getByText('Variability')).toBeTruthy();
      expect(screen.getByText('Pitch')).toBeTruthy();
    });

    it('renders with partial breakdown (some null)', () => {
      const { container } = render(
        <CompositeScore
          compositeScore={55}
          breakdown={{ lightness: 35, resonance: 20, variability: null, pitch: null }}
        />
      );
      expect(container).toBeTruthy();
      expect(screen.getByText('55')).toBeTruthy();
      expect(screen.getByText('Lightness')).toBeTruthy();
      expect(screen.getByText('Resonance')).toBeTruthy();
    });
  });

  describe('RadarChart', () => {
    it('renders without errors when all null', () => {
      const { container } = render(
        <RadarChart lightness={null} resonance={null} variability={null} pitch={null} />
      );
      expect(container).toBeTruthy();
      expect(container.querySelector('svg')).toBeTruthy();
    });

    it('renders with all values present', () => {
      const { container } = render(
        <RadarChart lightness={70} resonance={60} variability={50} pitch={80} />
      );
      expect(container.querySelector('svg')).toBeTruthy();
      // Axis labels should be present
      expect(screen.getByText('Lightness')).toBeTruthy();
      expect(screen.getByText('Resonance')).toBeTruthy();
      expect(screen.getByText('Variability')).toBeTruthy();
      expect(screen.getByText('Pitch')).toBeTruthy();
    });

    it('renders score values on axes', () => {
      render(
        <RadarChart lightness={70} resonance={60} variability={50} pitch={80} />
      );
      expect(screen.getByText('70')).toBeTruthy();
      expect(screen.getByText('60')).toBeTruthy();
      expect(screen.getByText('50')).toBeTruthy();
      expect(screen.getByText('80')).toBeTruthy();
    });

    it('renders with partial data', () => {
      const { container } = render(
        <RadarChart lightness={65} resonance={null} variability={45} pitch={null} />
      );
      expect(container.querySelector('svg')).toBeTruthy();
      expect(screen.getByText('65')).toBeTruthy();
      expect(screen.getByText('45')).toBeTruthy();
    });
  });

  describe('CalibrationFlow', () => {
    it('renders welcome step initially', () => {
      const cm = new CalibrationManager();
      render(
        <CalibrationFlow
          calibrationManager={cm}
          onComplete={() => {}}
          onSkip={() => {}}
        />
      );
      expect(screen.getByText('Voice Calibration')).toBeTruthy();
      expect(screen.getByText('Start Calibration')).toBeTruthy();
    });

    it('renders skip option', () => {
      const cm = new CalibrationManager();
      render(
        <CalibrationFlow
          calibrationManager={cm}
          onComplete={() => {}}
          onSkip={() => {}}
        />
      );
      expect(screen.getByText(/Skip/)).toBeTruthy();
    });

    it('renders calibration description text', () => {
      const cm = new CalibrationManager();
      render(
        <CalibrationFlow
          calibrationManager={cm}
          onComplete={() => {}}
          onSkip={() => {}}
        />
      );
      expect(screen.getByText(/personalizes your scores/)).toBeTruthy();
    });

    it('renders time estimate', () => {
      const cm = new CalibrationManager();
      render(
        <CalibrationFlow
          calibrationManager={cm}
          onComplete={() => {}}
          onSkip={() => {}}
        />
      );
      expect(screen.getByText(/about 2 minutes/)).toBeTruthy();
    });
  });

  describe('SessionControls', () => {
    it('renders start button in idle state', () => {
      render(
        <SessionControls
          sessionState="idle"
          elapsedSeconds={0}
          onStart={() => {}}
          onPause={() => {}}
          onResume={() => {}}
          onStop={() => {}}
        />
      );
      expect(screen.getByText('Start Session')).toBeTruthy();
    });

    it('renders pause and stop in active state', () => {
      render(
        <SessionControls
          sessionState="active"
          elapsedSeconds={65}
          onStart={() => {}}
          onPause={() => {}}
          onResume={() => {}}
          onStop={() => {}}
        />
      );
      expect(screen.getByText('Pause')).toBeTruthy();
      expect(screen.getByText('Stop')).toBeTruthy();
    });

    it('renders resume and stop in paused state', () => {
      render(
        <SessionControls
          sessionState="paused"
          elapsedSeconds={30}
          onStart={() => {}}
          onPause={() => {}}
          onResume={() => {}}
          onStop={() => {}}
        />
      );
      expect(screen.getByText('Resume')).toBeTruthy();
      expect(screen.getByText('Stop')).toBeTruthy();
    });

    it('renders formatted timer as mm:ss', () => {
      render(
        <SessionControls
          sessionState="active"
          elapsedSeconds={125}
          onStart={() => {}}
          onPause={() => {}}
          onResume={() => {}}
          onStop={() => {}}
        />
      );
      expect(screen.getByText('02:05')).toBeTruthy();
    });

    it('renders nothing when stopped', () => {
      const { container } = render(
        <SessionControls
          sessionState="stopped"
          elapsedSeconds={60}
          onStart={() => {}}
          onPause={() => {}}
          onResume={() => {}}
          onStop={() => {}}
        />
      );
      expect(container.innerHTML).toBe('');
    });
  });

  describe('SessionSummary', () => {
    const mockSummary = {
      id: 'test-123',
      startedAt: '2025-01-01T00:00:00Z',
      endedAt: '2025-01-01T00:05:00Z',
      durationSeconds: 300,
      sampleCount: 600,
      compositeScore: 62,
      pillarScores: {
        lightness: { avg: 65, min: 45, max: 80, score: 65 },
        resonance: { avg: 55, min: 40, max: 70, score: 55 },
        variability: { avg: 48, min: 30, max: 65, score: 48 },
        pitch: { avg: 60, min: 40, max: 75, score: 60 },
      },
      pillarTrends: { lightness: 'up', resonance: 'flat', variability: 'down', pitch: 'up' },
      extras: {
        timeInTargetPct: 64,
        pitchAvgHz: 192,
        h1h2Avg: 8.5,
        f2Avg: 1780,
      },
    };

    it('renders without errors with valid summary', () => {
      const { container } = render(
        <SessionSummary
          summary={mockSummary}
          previousSummary={null}
          onRequestCoaching={() => {}}
          onNewSession={() => {}}
          onClose={() => {}}
        />
      );
      expect(container).toBeTruthy();
    });

    it('renders composite score', () => {
      render(
        <SessionSummary
          summary={mockSummary}
          previousSummary={null}
          onRequestCoaching={() => {}}
          onNewSession={() => {}}
          onClose={() => {}}
        />
      );
      expect(screen.getByText('62')).toBeTruthy();
    });

    it('renders Session Complete title', () => {
      render(
        <SessionSummary
          summary={mockSummary}
          previousSummary={null}
          onRequestCoaching={() => {}}
          onNewSession={() => {}}
          onClose={() => {}}
        />
      );
      expect(screen.getByText('Session Complete')).toBeTruthy();
    });

    it('renders pillar labels', () => {
      render(
        <SessionSummary
          summary={mockSummary}
          previousSummary={null}
          onRequestCoaching={() => {}}
          onNewSession={() => {}}
          onClose={() => {}}
        />
      );
      expect(screen.getByText('Lightness')).toBeTruthy();
      expect(screen.getByText('Resonance')).toBeTruthy();
      expect(screen.getByText('Variability')).toBeTruthy();
      expect(screen.getByText('Pitch')).toBeTruthy();
    });

    it('renders action buttons', () => {
      render(
        <SessionSummary
          summary={mockSummary}
          previousSummary={null}
          onRequestCoaching={() => {}}
          onNewSession={() => {}}
          onClose={() => {}}
        />
      );
      expect(screen.getByText('Get AI Coaching')).toBeTruthy();
      expect(screen.getByText('Start New Session')).toBeTruthy();
    });

    it('returns null when summary is null', () => {
      const { container } = render(
        <SessionSummary
          summary={null}
          previousSummary={null}
          onRequestCoaching={() => {}}
          onNewSession={() => {}}
          onClose={() => {}}
        />
      );
      expect(container.innerHTML).toBe('');
    });
  });

  describe('CoachingChat', () => {
    it('renders nothing when isOpen is false', () => {
      const client = new CoachingClient();
      const { container } = render(
        <CoachingChat
          isOpen={false}
          onClose={() => {}}
          coachingClient={client}
          sessionSummary={null}
        />
      );
      expect(container.innerHTML).toBe('');
    });

    it('renders drawer when isOpen is true', () => {
      const client = new CoachingClient();
      render(
        <CoachingChat
          isOpen={true}
          onClose={() => {}}
          coachingClient={client}
          sessionSummary={null}
        />
      );
      expect(screen.getByText('AI Coach')).toBeTruthy();
    });

    it('renders message input', () => {
      const client = new CoachingClient();
      render(
        <CoachingChat
          isOpen={true}
          onClose={() => {}}
          coachingClient={client}
          sessionSummary={null}
        />
      );
      expect(screen.getByPlaceholderText('Ask your coach...')).toBeTruthy();
      expect(screen.getByText('Send')).toBeTruthy();
    });

    it('renders default prompt button when session summary provided', () => {
      const client = new CoachingClient();
      render(
        <CoachingChat
          isOpen={true}
          onClose={() => {}}
          coachingClient={client}
          sessionSummary={{ compositeScore: 55 }}
        />
      );
      expect(screen.getByText('How am I doing?')).toBeTruthy();
    });
  });
});
