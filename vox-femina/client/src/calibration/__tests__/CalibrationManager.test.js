import { describe, it, expect, beforeEach } from 'vitest';
import { CalibrationManager } from '../CalibrationManager';

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('CalibrationManager', () => {
  let cm;

  beforeEach(() => {
    localStorageMock.clear();
    cm = new CalibrationManager();
  });

  describe('initial state', () => {
    it('should not be calibrated initially', () => {
      expect(cm.isCalibrated()).toBe(false);
    });

    it('should return null data when uncalibrated', () => {
      expect(cm.getData()).toBeNull();
    });

    it('should have no active capture phase', () => {
      expect(cm.capturePhase).toBeNull();
    });
  });

  describe('capture flow', () => {
    it('should set capture phase on startCapture', () => {
      cm.startCapture('baseline');
      expect(cm.capturePhase).toBe('baseline');
    });

    it('should accumulate frames during capture', () => {
      cm.startCapture('baseline');
      cm.addFrame({ pitch: 50, lightness: 40, resonance: 30, variability: 20 });
      cm.addFrame({ pitch: 55, lightness: 45, resonance: 35, variability: 25 });
      const result = cm.endCapture();
      expect(result.sampleCount).toBe(2);
    });

    it('should ignore frames when not capturing', () => {
      cm.addFrame({ pitch: 50, lightness: 40, resonance: 30, variability: 20 });
      cm.startCapture('baseline');
      cm.addFrame({ pitch: 55, lightness: 45, resonance: 35, variability: 25 });
      const result = cm.endCapture();
      expect(result.sampleCount).toBe(1);
    });

    it('should reset capture phase after endCapture', () => {
      cm.startCapture('ceiling');
      cm.addFrame({ pitch: 60, lightness: 50, resonance: 40, variability: 30 });
      cm.endCapture();
      expect(cm.capturePhase).toBeNull();
    });

    it('should return median values from captured frames', () => {
      cm.startCapture('baseline');
      cm.addFrame({ pitch: 30, lightness: 20, resonance: 10, variability: 5 });
      cm.addFrame({ pitch: 50, lightness: 40, resonance: 30, variability: 25 });
      cm.addFrame({ pitch: 40, lightness: 30, resonance: 20, variability: 15 });
      const result = cm.endCapture();
      // Median of [30,40,50] = 40
      expect(result.pitch).toBe(40);
      expect(result.lightness).toBe(30);
      expect(result.resonance).toBe(20);
      expect(result.variability).toBe(15);
    });

    it('should filter out all-null frames from sample count', () => {
      cm.startCapture('baseline');
      cm.addFrame({ pitch: null, lightness: null, resonance: null, variability: null });
      cm.addFrame({ pitch: 50, lightness: 40, resonance: null, variability: null });
      cm.addFrame({ pitch: null, lightness: null, resonance: null, variability: null });
      const result = cm.endCapture();
      expect(result.sampleCount).toBe(1);
    });

    it('should return null for pillars with no valid data', () => {
      cm.startCapture('baseline');
      cm.addFrame({ pitch: 50, lightness: null, resonance: null, variability: null });
      const result = cm.endCapture();
      expect(result.pitch).toBe(50);
      expect(result.lightness).toBeNull();
      expect(result.resonance).toBeNull();
      expect(result.variability).toBeNull();
    });

    it('should include phase in result', () => {
      cm.startCapture('baseline');
      cm.addFrame({ pitch: 50, lightness: 40, resonance: 30, variability: 20 });
      const result = cm.endCapture();
      expect(result.phase).toBe('baseline');
    });

    it('should clear buffer on startCapture', () => {
      cm.startCapture('baseline');
      cm.addFrame({ pitch: 50, lightness: 40, resonance: 30, variability: 20 });
      cm.startCapture('baseline'); // Restart clears buffer
      cm.addFrame({ pitch: 70, lightness: 60, resonance: 50, variability: 40 });
      const result = cm.endCapture();
      expect(result.sampleCount).toBe(1);
      expect(result.pitch).toBe(70);
    });
  });

  describe('saveCalibration', () => {
    it('should mark as calibrated after saving', () => {
      cm.saveCalibration(
        { pitch: 20, lightness: 30, resonance: 25, variability: 15 },
        { pitch: 70, lightness: 80, resonance: 65, variability: 55 }
      );
      expect(cm.isCalibrated()).toBe(true);
    });

    it('should store per-pillar baseline and ceiling', () => {
      cm.saveCalibration(
        { pitch: 20, lightness: 30, resonance: 25, variability: 15 },
        { pitch: 70, lightness: 80, resonance: 65, variability: 55 }
      );
      const data = cm.getData();
      expect(data.pitch.baseline).toBe(20);
      expect(data.pitch.ceiling).toBe(70);
      expect(data.lightness.baseline).toBe(30);
      expect(data.lightness.ceiling).toBe(80);
    });

    it('should set pillar to null when baseline equals ceiling', () => {
      cm.saveCalibration(
        { pitch: 50, lightness: 30, resonance: 25, variability: 15 },
        { pitch: 50, lightness: 80, resonance: 65, variability: 55 }
      );
      const data = cm.getData();
      expect(data.pitch).toBeNull();
      expect(data.lightness.baseline).toBe(30);
    });

    it('should set pillar to null when either value is null', () => {
      cm.saveCalibration(
        { pitch: null, lightness: 30, resonance: 25, variability: 15 },
        { pitch: 70, lightness: 80, resonance: 65, variability: 55 }
      );
      const data = cm.getData();
      expect(data.pitch).toBeNull();
      expect(data.lightness.baseline).toBe(30);
    });

    it('should add a timestamp', () => {
      const before = Date.now();
      cm.saveCalibration(
        { pitch: 20, lightness: 30, resonance: 25, variability: 15 },
        { pitch: 70, lightness: 80, resonance: 65, variability: 55 }
      );
      const data = cm.getData();
      expect(data.timestamp).toBeGreaterThanOrEqual(before);
      expect(data.timestamp).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('rawToPersonalized', () => {
    beforeEach(() => {
      cm.saveCalibration(
        { pitch: 20, lightness: 30, resonance: 25, variability: 15 },
        { pitch: 70, lightness: 80, resonance: 65, variability: 55 }
      );
    });

    it('should map baseline to 20', () => {
      expect(cm.rawToPersonalized('pitch', 20)).toBe(20);
      expect(cm.rawToPersonalized('lightness', 30)).toBe(20);
    });

    it('should map ceiling to 70', () => {
      expect(cm.rawToPersonalized('pitch', 70)).toBe(70);
      expect(cm.rawToPersonalized('lightness', 80)).toBe(70);
    });

    it('should map midpoint correctly', () => {
      // Midpoint of baseline(20) and ceiling(70) for pitch = 45
      // normalized = (45 - 20) / (70 - 20) = 0.5
      // personal = 20 + 0.5 * (70 - 20) = 20 + 25 = 45
      expect(cm.rawToPersonalized('pitch', 45)).toBe(45);
    });

    it('should extrapolate beyond ceiling', () => {
      // Above ceiling: rawScore=90, baseline=20, ceiling=70, range=50
      // normalized = (90 - 20) / 50 = 1.4
      // personal = 20 + 1.4 * 50 = 90
      expect(cm.rawToPersonalized('pitch', 90)).toBe(90);
    });

    it('should extrapolate below baseline', () => {
      // Below baseline: rawScore=10, baseline=20, ceiling=70, range=50
      // normalized = (10 - 20) / 50 = -0.2
      // personal = 20 + (-0.2) * 50 = 10
      expect(cm.rawToPersonalized('pitch', 10)).toBe(10);
    });

    it('should clamp to 0 minimum', () => {
      // Far below baseline: rawScore=0, baseline=20, ceiling=70, range=50
      // normalized = (0 - 20) / 50 = -0.4
      // personal = 20 + (-0.4) * 50 = 0
      expect(cm.rawToPersonalized('pitch', 0)).toBe(0);
    });

    it('should clamp to 100 maximum', () => {
      // Far above ceiling: rawScore=100, baseline=20, ceiling=70, range=50
      // normalized = (100 - 20) / 50 = 1.6
      // personal = 20 + 1.6 * 50 = 100
      expect(cm.rawToPersonalized('pitch', 100)).toBe(100);
    });

    it('should return null for null input', () => {
      expect(cm.rawToPersonalized('pitch', null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(cm.rawToPersonalized('pitch', undefined)).toBeNull();
    });

    it('should pass through raw score for uncalibrated pillar', () => {
      // Set pitch to null calibration by making baseline=ceiling
      cm.saveCalibration(
        { pitch: 50, lightness: 30, resonance: 25, variability: 15 },
        { pitch: 50, lightness: 80, resonance: 65, variability: 55 }
      );
      expect(cm.rawToPersonalized('pitch', 42)).toBe(42);
    });

    it('should pass through when not calibrated at all', () => {
      localStorageMock.clear();
      const fresh = new CalibrationManager();
      expect(fresh.rawToPersonalized('lightness', 65)).toBe(65);
    });
  });

  describe('recalibrate', () => {
    it('should reset calibration data', () => {
      cm.saveCalibration(
        { pitch: 20, lightness: 30, resonance: 25, variability: 15 },
        { pitch: 70, lightness: 80, resonance: 65, variability: 55 }
      );
      expect(cm.isCalibrated()).toBe(true);
      cm.recalibrate();
      expect(cm.isCalibrated()).toBe(false);
      expect(cm.getData()).toBeNull();
    });

    it('should reset capture phase', () => {
      cm.startCapture('baseline');
      cm.recalibrate();
      expect(cm.capturePhase).toBeNull();
    });

    it('should clear storage', () => {
      cm.saveCalibration(
        { pitch: 20, lightness: 30, resonance: 25, variability: 15 },
        { pitch: 70, lightness: 80, resonance: 65, variability: 55 }
      );
      cm.recalibrate();
      const fresh = new CalibrationManager();
      expect(fresh.isCalibrated()).toBe(false);
    });
  });

  describe('localStorage persistence', () => {
    it('should persist calibration across instances', () => {
      cm.saveCalibration(
        { pitch: 20, lightness: 30, resonance: 25, variability: 15 },
        { pitch: 70, lightness: 80, resonance: 65, variability: 55 }
      );

      const cm2 = new CalibrationManager();
      expect(cm2.isCalibrated()).toBe(true);
      expect(cm2.getData().pitch.baseline).toBe(20);
      expect(cm2.getData().pitch.ceiling).toBe(70);
    });

    it('should persist personalized mapping across instances', () => {
      cm.saveCalibration(
        { pitch: 20, lightness: 30, resonance: 25, variability: 15 },
        { pitch: 70, lightness: 80, resonance: 65, variability: 55 }
      );

      const cm2 = new CalibrationManager();
      expect(cm2.rawToPersonalized('pitch', 20)).toBe(20);
      expect(cm2.rawToPersonalized('pitch', 70)).toBe(70);
    });

    it('should handle corrupted localStorage gracefully', () => {
      localStorageMock.setItem('vox-femina-calibration', 'not-valid-json');
      const cm2 = new CalibrationManager();
      expect(cm2.isCalibrated()).toBe(false);
    });

    it('should handle empty localStorage', () => {
      localStorageMock.clear();
      const cm2 = new CalibrationManager();
      expect(cm2.isCalibrated()).toBe(false);
      expect(cm2.getData()).toBeNull();
    });
  });

  describe('median helper', () => {
    it('should return null for empty array', () => {
      expect(CalibrationManager._median([])).toBeNull();
    });

    it('should return single value for one-element array', () => {
      expect(CalibrationManager._median([42])).toBe(42);
    });

    it('should return middle value for odd-length array', () => {
      expect(CalibrationManager._median([10, 30, 20])).toBe(20);
    });

    it('should return average of two middle values for even-length array', () => {
      expect(CalibrationManager._median([10, 20, 30, 40])).toBe(25);
    });

    it('should handle unsorted input', () => {
      expect(CalibrationManager._median([50, 10, 30, 40, 20])).toBe(30);
    });
  });
});
