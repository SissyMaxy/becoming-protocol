// Lovense React Hook
// Supports both local (Lovense Connect) and cloud API

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  LovenseToy,
  LovensePattern,
  ConnectionStatus,
  ToyMode,
  HapticPattern,
  HapticStats,
} from '../types/lovense';
import { BUILTIN_PATTERNS } from '../types/lovense';
import * as lovense from '../lib/lovense';

interface UseLovenseReturn {
  // Connection
  status: ConnectionStatus;
  toys: LovenseToy[];
  activeToy: LovenseToy | null;
  qrCodeUrl: string | null;
  error: string | null;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  selectToy: (toyId: string) => void;
  refreshToys: () => Promise<void>;

  // Control
  setIntensity: (intensity: number) => Promise<void>;
  stop: () => Promise<void>;

  // Patterns
  patterns: LovensePattern[];
  activePattern: LovensePattern | null;
  playPattern: (patternId: string, loop?: boolean) => void;
  stopPattern: () => void;

  // Modes
  activeMode: ToyMode | null;
  startEdgeTraining: (options?: EdgeTrainingOptions) => void;
  recordEdge: () => Promise<number>;
  stopEdgeTraining: () => void;
  startTeaseMode: (options?: TeaseModeOptions) => void;
  stopTeaseMode: () => void;
  startDenialTraining: (options?: DenialTrainingOptions) => void;
  stopDenialTraining: () => void;
  syncToArousal: (arousalLevel: number) => Promise<void>;

  // State
  currentIntensity: number;
  edgeCount: number;
  denialPhase: string | null;
  denialCycle: number;

  // Cloud API
  cloudApiEnabled: boolean;
  setCloudApiEnabled: (enabled: boolean) => void;
  cloudPatterns: HapticPattern[];
  hapticStats: HapticStats | null;
  refreshCloudPatterns: () => Promise<void>;
  refreshHapticStats: () => Promise<void>;
  sendRewardBuzz: (type: RewardBuzzType, triggerId?: string) => Promise<boolean>;
  checkHapticsAllowed: () => Promise<{ allowed: boolean; reason?: string }>;

  // Cloud connection
  cloudQrUrl: string | null;
  cloudConnected: boolean;
  getCloudQRCode: () => Promise<void>;
  checkCloudConnection: () => Promise<void>;
}

export type RewardBuzzType =
  | 'task_complete'
  | 'affirmation'
  | 'level_up'
  | 'achievement'
  | 'streak_milestone'
  | 'notification_low'
  | 'notification_medium'
  | 'notification_jackpot'
  | 'edge_reward'
  | 'anchor'
  | 'voice'
  | 'posture';

interface EdgeTrainingOptions {
  baseIntensity?: number;
  intensityPerEdge?: number;
  maxIntensity?: number;
  cooldownDuration?: number;
}

interface TeaseModeOptions {
  minIntensity?: number;
  maxIntensity?: number;
  minInterval?: number;
  maxInterval?: number;
  pulseDuration?: number;
}

interface DenialTrainingOptions {
  buildDuration?: number;
  peakDuration?: number;
  denialDuration?: number;
  restDuration?: number;
  maxIntensity?: number;
  cycles?: number;
}

export function useLovense(): UseLovenseReturn {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [toys, setToys] = useState<LovenseToy[]>([]);
  const [activeToy, setActiveToy] = useState<LovenseToy | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [activePattern, setActivePattern] = useState<LovensePattern | null>(null);
  const [activeMode, setActiveMode] = useState<ToyMode | null>(null);
  const [currentIntensity, setCurrentIntensity] = useState(0);
  const [edgeCount, setEdgeCount] = useState(0);
  const [denialPhase, setDenialPhase] = useState<string | null>(null);
  const [denialCycle, setDenialCycle] = useState(0);

  // Cloud API state - persist to localStorage
  const [cloudApiEnabled, setCloudApiEnabledState] = useState(() => {
    const saved = localStorage.getItem('lovense_cloud_api_enabled');
    return saved === 'true';
  });
  const [cloudPatterns, setCloudPatterns] = useState<HapticPattern[]>([]);
  const [hapticStats, setHapticStats] = useState<HapticStats | null>(null);
  const [cloudQrUrl, setCloudQrUrl] = useState<string | null>(null);
  const [cloudConnected, setCloudConnected] = useState(false);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  // Connect to Lovense Connect
  const connect = useCallback(async () => {
    setStatus('connecting');
    setError(null);

    try {
      const isConnected = await lovense.checkConnection();
      if (!isConnected) {
        // Try to get QR code for mobile connection
        const qr = await lovense.getQRCodeUrl();
        setQrCodeUrl(qr);
        setStatus('disconnected');
        setError('Lovense Connect not found. Please ensure the app is running.');
        return;
      }

      // Get connected toys
      const connectedToys = await lovense.getToys();
      setToys(connectedToys);

      if (connectedToys.length > 0) {
        setActiveToy(connectedToys[0]);
        setStatus('connected');
      } else {
        setStatus('connected');
        // Start polling for toys
        startPolling();
      }
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to connect');
    }
  }, []);

  // Disconnect
  const disconnect = useCallback(async () => {
    stopPolling();
    lovense.stopAll();
    lovense.stopPattern();
    lovense.stopEdgeTraining();
    lovense.stopTeaseMode();
    lovense.stopDenialTraining();

    // If using cloud API, mark device as disconnected in database
    if (cloudApiEnabled && activeToy?.id) {
      await lovense.updateDeviceStatusById(activeToy.id, false);
    }

    setStatus('disconnected');
    setCloudConnected(false); // Reset cloud connection state
    setToys([]);
    setActiveToy(null);
    setActivePattern(null);
    setActiveMode(null);
    setCurrentIntensity(0);
    setEdgeCount(0);
    setDenialPhase(null);
    setDenialCycle(0);
  }, [cloudApiEnabled, activeToy]);

  // Poll for toys with proper cleanup
  const startPolling = useCallback(() => {
    // Always clear existing interval before starting new one
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    pollIntervalRef.current = setInterval(async () => {
      if (!mountedRef.current) return;
      try {
        const connectedToys = await lovense.getToys();
        if (!mountedRef.current) return;
        setToys(connectedToys);

        // Auto-select first toy if none selected
        if (!activeToy && connectedToys.length > 0) {
          setActiveToy(connectedToys[0]);
        }

        // Update active toy status
        if (activeToy) {
          const updated = connectedToys.find(t => t.id === activeToy.id);
          if (updated) {
            setActiveToy(updated);
          }
        }
      } catch (err) {
        console.error('[Lovense] Polling error:', err);
      }
    }, 5000);
  }, [activeToy]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Refresh toys
  const refreshToys = useCallback(async () => {
    const connectedToys = await lovense.getToys();
    setToys(connectedToys);
  }, []);

  // Select a toy
  const selectToy = useCallback((toyId: string) => {
    const toy = toys.find(t => t.id === toyId);
    if (toy) {
      setActiveToy(toy);
    }
  }, [toys]);

  // Set intensity
  const setIntensity = useCallback(async (intensity: number) => {
    const clamped = Math.min(20, Math.max(0, Math.round(intensity)));
    setCurrentIntensity(clamped);

    // Use smart functions that route to cloud API when enabled
    await lovense.smartVibrate(clamped, 0, 'manual');
  }, []);

  // Stop
  const stop = useCallback(async () => {
    setCurrentIntensity(0);
    // Use smart stop that routes to cloud API when enabled
    await lovense.smartStop('manual');
  }, []);

  // Play pattern
  const playPatternFn = useCallback((patternId: string, loop = false) => {
    const pattern = BUILTIN_PATTERNS.find(p => p.id === patternId);
    if (!pattern) return;

    setActivePattern(pattern);
    setActiveMode('pattern');

    lovense.playPattern(pattern, {
      toyId: activeToy?.id,
      loop,
      onStepChange: (_step, intensity) => {
        setCurrentIntensity(intensity);
      },
      onComplete: () => {
        setActivePattern(null);
        setActiveMode(null);
        setCurrentIntensity(0);
      },
    });
  }, [activeToy]);

  // Stop pattern
  const stopPatternFn = useCallback(() => {
    lovense.stopPattern();
    setActivePattern(null);
    setActiveMode(null);
    setCurrentIntensity(0);
  }, []);

  // Edge training
  const startEdgeTrainingFn = useCallback((options: EdgeTrainingOptions = {}) => {
    setActiveMode('edge_sync');
    setEdgeCount(0);

    lovense.startEdgeTraining({
      toyId: activeToy?.id,
      ...options,
      onIntensityChange: (intensity) => {
        setCurrentIntensity(intensity);
      },
    });
  }, [activeToy]);

  const recordEdgeFn = useCallback(async () => {
    const count = await lovense.recordEdge();
    setEdgeCount(count);
    return count;
  }, []);

  const stopEdgeTrainingFn = useCallback(() => {
    lovense.stopEdgeTraining();
    setActiveMode(null);
    setCurrentIntensity(0);
  }, []);

  // Tease mode
  const startTeaseModeFn = useCallback((options: TeaseModeOptions = {}) => {
    setActiveMode('tease');
    lovense.startTeaseMode({
      toyId: activeToy?.id,
      ...options,
      onIntensityChange: (intensity) => {
        setCurrentIntensity(intensity);
      },
    });
  }, [activeToy]);

  const stopTeaseModeFn = useCallback(() => {
    lovense.stopTeaseMode();
    setActiveMode(null);
    setCurrentIntensity(0);
  }, []);

  // Denial training
  const startDenialTrainingFn = useCallback((options: DenialTrainingOptions = {}) => {
    setActiveMode('denial_training');
    setDenialCycle(1);

    lovense.startDenialTraining({
      toyId: activeToy?.id,
      ...options,
      onPhaseChange: (phase, cycle) => {
        setDenialPhase(phase);
        setDenialCycle(cycle);
      },
      onIntensityChange: (intensity) => {
        setCurrentIntensity(intensity);
      },
    });
  }, [activeToy]);

  const stopDenialTrainingFn = useCallback(() => {
    lovense.stopDenialTraining();
    setActiveMode(null);
    setDenialPhase(null);
    setDenialCycle(0);
    setCurrentIntensity(0);
  }, []);

  // Sync to arousal
  const syncToArousalFn = useCallback(async (arousalLevel: number) => {
    await lovense.syncToArousal(arousalLevel, {
      toyId: activeToy?.id,
    });
    const intensity = lovense.arousalToIntensity(arousalLevel, 3, 16);
    setCurrentIntensity(intensity);
  }, [activeToy]);

  // ============================================
  // CLOUD API FUNCTIONS
  // ============================================

  // Set cloud API mode
  const setCloudApiEnabled = useCallback((enabled: boolean) => {
    setCloudApiEnabledState(enabled);
    localStorage.setItem('lovense_cloud_api_enabled', String(enabled));
    lovense.setCloudApiMode(enabled);
  }, []);

  // Refresh cloud patterns
  const refreshCloudPatterns = useCallback(async () => {
    const patterns = await lovense.getHapticPatterns();
    setCloudPatterns(patterns);
  }, []);

  // Refresh haptic stats
  const refreshHapticStats = useCallback(async () => {
    const stats = await lovense.getHapticStats();
    setHapticStats(stats);
  }, []);

  // Check if haptics are allowed
  const checkHapticsAllowedFn = useCallback(async () => {
    return lovense.checkHapticsAllowed();
  }, []);

  // Send reward buzz
  const sendRewardBuzz = useCallback(async (
    type: RewardBuzzType,
    _triggerId?: string
  ): Promise<boolean> => {
    // Check if allowed first
    const { allowed, reason } = await lovense.checkHapticsAllowed();
    if (!allowed) {
      console.log('Haptics not allowed:', reason);
      return false;
    }

    let result;
    switch (type) {
      case 'task_complete':
        result = await lovense.sendTaskCompleteBuzz();
        break;
      case 'affirmation':
        result = await lovense.sendAffirmationBuzz();
        break;
      case 'level_up':
        result = await lovense.sendLevelUpBuzz();
        break;
      case 'achievement':
        result = await lovense.sendAchievementBuzz();
        break;
      case 'streak_milestone':
        result = await lovense.sendStreakMilestoneBuzz();
        break;
      case 'notification_low':
        result = await lovense.sendNotificationBuzz('low');
        break;
      case 'notification_medium':
        result = await lovense.sendNotificationBuzz('medium');
        break;
      case 'notification_jackpot':
        result = await lovense.sendNotificationBuzz('jackpot');
        break;
      case 'edge_reward':
        result = await lovense.sendEdgeRewardBuzz();
        break;
      case 'anchor':
        result = await lovense.sendAnchorBuzz();
        break;
      case 'voice':
        result = await lovense.sendVoiceRewardBuzz();
        break;
      case 'posture':
        result = await lovense.sendPostureRewardBuzz();
        break;
      default:
        return false;
    }

    return result.success;
  }, []);

  // Get cloud QR code
  const getCloudQRCodeFn = useCallback(async () => {
    const { qrUrl, error } = await lovense.getCloudQRCode();
    if (qrUrl) {
      setCloudQrUrl(qrUrl);
      setError(null);
    } else {
      setError(error || 'Failed to get QR code');
    }
  }, []);

  // Check cloud connection status
  const checkCloudConnectionFn = useCallback(async () => {
    const { connected, device } = await lovense.checkCloudConnection();

    // Only update and log if state actually changed
    if (connected && device && !cloudConnected) {
      console.log('[Lovense] Cloud connected:', device.name);
      setCloudConnected(true);
      setStatus('connected');
      setActiveToy({
        id: device.id,
        name: device.name,
        type: 'unknown',
        battery: device.battery || 0,
        connected: true,
      });
    } else if (!connected && cloudConnected) {
      console.log('[Lovense] Cloud disconnected');
      setCloudConnected(false);
    }
  }, [cloudConnected]);

  // Sync cloud mode state with lovense module on mount
  useEffect(() => {
    lovense.setCloudApiMode(cloudApiEnabled);
  }, [cloudApiEnabled]);

  // Load cloud patterns when cloud API is enabled
  useEffect(() => {
    if (cloudApiEnabled) {
      refreshCloudPatterns();
      refreshHapticStats();
      checkCloudConnectionFn();
    }
  }, [cloudApiEnabled, refreshCloudPatterns, refreshHapticStats, checkCloudConnectionFn]);

  // Poll for cloud connection status when waiting for connection
  useEffect(() => {
    if (!cloudApiEnabled || cloudConnected) {
      return;
    }

    // Poll every 3 seconds until connected
    const pollInterval = setInterval(() => {
      checkCloudConnectionFn();
    }, 3000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [cloudApiEnabled, cloudConnected, checkCloudConnectionFn]);

  // Cleanup on unmount - only call local API if not in cloud mode
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      stopPolling();
      // Only call local API cleanup if not using cloud API
      if (!cloudApiEnabled) {
        lovense.stopAll();
        lovense.stopPattern();
        lovense.stopEdgeTraining();
        lovense.stopTeaseMode();
        lovense.stopDenialTraining();
      }
    };
  }, [stopPolling, cloudApiEnabled]);

  return {
    // Connection
    status,
    toys,
    activeToy,
    qrCodeUrl,
    error,
    connect,
    disconnect,
    selectToy,
    refreshToys,

    // Control
    setIntensity,
    stop,

    // Patterns
    patterns: BUILTIN_PATTERNS,
    activePattern,
    playPattern: playPatternFn,
    stopPattern: stopPatternFn,

    // Modes
    activeMode,
    startEdgeTraining: startEdgeTrainingFn,
    recordEdge: recordEdgeFn,
    stopEdgeTraining: stopEdgeTrainingFn,
    startTeaseMode: startTeaseModeFn,
    stopTeaseMode: stopTeaseModeFn,
    startDenialTraining: startDenialTrainingFn,
    stopDenialTraining: stopDenialTrainingFn,
    syncToArousal: syncToArousalFn,

    // State
    currentIntensity,
    edgeCount,
    denialPhase,
    denialCycle,

    // Cloud API
    cloudApiEnabled,
    setCloudApiEnabled,
    cloudPatterns,
    hapticStats,
    refreshCloudPatterns,
    refreshHapticStats,
    sendRewardBuzz,
    checkHapticsAllowed: checkHapticsAllowedFn,

    // Cloud connection
    cloudQrUrl,
    cloudConnected,
    getCloudQRCode: getCloudQRCodeFn,
    checkCloudConnection: checkCloudConnectionFn,
  };
}
