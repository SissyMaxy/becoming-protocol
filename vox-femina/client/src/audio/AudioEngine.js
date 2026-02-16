/**
 * AudioEngine — Web Audio API wrapper
 * Initializes microphone, creates AnalyserNode for analysis
 */

const FFT_SIZE = 4096;

export class AudioEngine {
  constructor() {
    this.audioContext = null;
    this.analyserNode = null;
    this.sourceNode = null;
    this.stream = null;
    this.active = false;
    this.fftSize = FFT_SIZE;
  }

  /**
   * Request microphone permission and initialize audio pipeline.
   * @param {string} [deviceId] — specific audio input device ID
   * @returns {Promise<void>}
   */
  async start(deviceId) {
    if (this.active) return;

    try {
      const constraints = {
        audio: deviceId
          ? { deviceId: { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
          : { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);

      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = this.fftSize;
      this.analyserNode.smoothingTimeConstant = 0.8;

      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
      this.sourceNode.connect(this.analyserNode);

      this.active = true;
    } catch (err) {
      this.active = false;
      throw err;
    }
  }

  /**
   * Stop audio capture and release resources.
   */
  stop() {
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.analyserNode = null;
    this.active = false;
  }

  /**
   * Get current frequency-domain data (magnitudes).
   * @returns {Float32Array}
   */
  getFrequencyData() {
    if (!this.analyserNode) return new Float32Array(0);
    const data = new Float32Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getFloatFrequencyData(data);
    return data;
  }

  /**
   * Get current time-domain data (waveform).
   * @returns {Float32Array}
   */
  getTimeDomainData() {
    if (!this.analyserNode) return new Float32Array(0);
    const data = new Float32Array(this.analyserNode.fftSize);
    this.analyserNode.getFloatTimeDomainData(data);
    return data;
  }

  /**
   * Get the sample rate of the audio context.
   * @returns {number}
   */
  getSampleRate() {
    return this.audioContext ? this.audioContext.sampleRate : 44100;
  }

  /**
   * Check if the engine is currently active.
   * @returns {boolean}
   */
  isActive() {
    return this.active;
  }

  /**
   * List available audio input devices.
   * @returns {Promise<MediaDeviceInfo[]>}
   */
  static async getInputDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === 'audioinput');
  }
}
