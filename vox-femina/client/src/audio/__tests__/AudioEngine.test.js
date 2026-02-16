import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioEngine } from '../AudioEngine';

// Mock Web Audio API and getUserMedia
function mockWebAudioAPI() {
  const mockAnalyser = {
    fftSize: 0,
    frequencyBinCount: 2048,
    smoothingTimeConstant: 0,
    getFloatFrequencyData: vi.fn((arr) => arr.fill(-100)),
    getFloatTimeDomainData: vi.fn((arr) => arr.fill(0)),
  };

  const mockSource = {
    connect: vi.fn(),
    disconnect: vi.fn(),
  };

  const mockAudioContext = {
    sampleRate: 44100,
    state: 'running',
    createAnalyser: vi.fn(() => mockAnalyser),
    createMediaStreamSource: vi.fn(() => mockSource),
    close: vi.fn(() => { mockAudioContext.state = 'closed'; }),
  };

  const mockTrack = { stop: vi.fn() };
  const mockStream = { getTracks: () => [mockTrack] };

  // AudioContext must be a constructor (callable with `new`).
  // vi.fn(() => obj) creates a plain function; use a class instead.
  globalThis.AudioContext = function MockAudioContext() {
    return mockAudioContext;
  };
  globalThis.navigator = {
    mediaDevices: {
      getUserMedia: vi.fn(() => Promise.resolve(mockStream)),
      enumerateDevices: vi.fn(() => Promise.resolve([
        { kind: 'audioinput', deviceId: 'default', label: 'Default Mic' },
        { kind: 'videoinput', deviceId: 'cam1', label: 'Webcam' },
        { kind: 'audioinput', deviceId: 'mic2', label: 'USB Mic' },
      ])),
    },
  };

  return { mockAudioContext, mockAnalyser, mockSource, mockStream, mockTrack };
}

describe('AudioEngine', () => {
  let mocks;

  beforeEach(() => {
    mocks = mockWebAudioAPI();
  });

  describe('initialization', () => {
    it('should create in inactive state', () => {
      const engine = new AudioEngine();
      expect(engine.isActive()).toBe(false);
      expect(engine.audioContext).toBeNull();
      expect(engine.analyserNode).toBeNull();
    });
  });

  describe('start', () => {
    it('should request mic access and set up audio pipeline', async () => {
      const engine = new AudioEngine();
      await engine.start();

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      expect(engine.isActive()).toBe(true);
      expect(mocks.mockAudioContext.createAnalyser).toHaveBeenCalled();
      expect(mocks.mockAudioContext.createMediaStreamSource).toHaveBeenCalled();
      expect(mocks.mockSource.connect).toHaveBeenCalledWith(mocks.mockAnalyser);
    });

    it('should accept a specific device ID', async () => {
      const engine = new AudioEngine();
      await engine.start('usb-mic-123');

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: {
          deviceId: { exact: 'usb-mic-123' },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
    });

    it('should not restart if already active', async () => {
      const engine = new AudioEngine();
      await engine.start();
      await engine.start(); // second call should be no-op

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop', () => {
    it('should clean up all resources', async () => {
      const engine = new AudioEngine();
      await engine.start();
      engine.stop();

      expect(engine.isActive()).toBe(false);
      expect(mocks.mockSource.disconnect).toHaveBeenCalled();
      expect(mocks.mockTrack.stop).toHaveBeenCalled();
      expect(mocks.mockAudioContext.close).toHaveBeenCalled();
      expect(engine.audioContext).toBeNull();
      expect(engine.analyserNode).toBeNull();
      expect(engine.sourceNode).toBeNull();
      expect(engine.stream).toBeNull();
    });

    it('should be safe to call when not started', () => {
      const engine = new AudioEngine();
      expect(() => engine.stop()).not.toThrow();
    });
  });

  describe('data access', () => {
    it('should return empty arrays when not active', () => {
      const engine = new AudioEngine();
      expect(engine.getFrequencyData().length).toBe(0);
      expect(engine.getTimeDomainData().length).toBe(0);
    });

    it('should return data arrays when active', async () => {
      const engine = new AudioEngine();
      await engine.start();

      const freq = engine.getFrequencyData();
      const time = engine.getTimeDomainData();

      expect(freq).toBeInstanceOf(Float32Array);
      expect(time).toBeInstanceOf(Float32Array);
      expect(freq.length).toBe(2048);   // frequencyBinCount (fftSize/2)
      expect(time.length).toBe(4096);   // fftSize
    });
  });

  describe('getSampleRate', () => {
    it('should return default 44100 when not started', () => {
      const engine = new AudioEngine();
      expect(engine.getSampleRate()).toBe(44100);
    });

    it('should return actual sample rate when started', async () => {
      const engine = new AudioEngine();
      await engine.start();
      expect(engine.getSampleRate()).toBe(44100);
    });
  });

  describe('getInputDevices', () => {
    it('should return only audio input devices', async () => {
      const devices = await AudioEngine.getInputDevices();
      expect(devices).toHaveLength(2);
      expect(devices.every(d => d.kind === 'audioinput')).toBe(true);
    });
  });
});
