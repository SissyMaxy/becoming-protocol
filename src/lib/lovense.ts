// Lovense API Integration
// Supports both local (Lovense Connect) and cloud API

import type {
  LovenseToy,
  LovenseToyType,
  LovenseCommand,
  LovensePattern,
  LovenseConfig,
  CloudCommandRequest,
  CloudCommandResponse,
  HapticTriggerType,
  DbLovenseDevice,
  DbHapticPattern,
  HapticPattern,
  HapticStats,
} from '../types/lovense';
import { mapDbPatternToPattern, BUILTIN_PATTERNS } from '../types/lovense';
import { supabase } from './supabase';
import { invokeWithAuth } from './handler-ai';

// ============================================
// DEFAULT CONFIG
// ============================================

const DEFAULT_CONFIG: LovenseConfig = {
  localApiHost: '127.0.0.1',
  localApiPort: 20010, // Lovense Connect default port
};

let config: LovenseConfig = { ...DEFAULT_CONFIG };

export function setLovenseConfig(newConfig: Partial<LovenseConfig>) {
  config = { ...config, ...newConfig };
}

// ============================================
// LOCAL API (LOVENSE CONNECT)
// ============================================

/**
 * Get the local API base URL
 */
function getLocalApiUrl(): string {
  return `http://${config.localApiHost}:${config.localApiPort}`;
}

/**
 * Check if Lovense Connect is running
 */
export async function checkConnection(): Promise<boolean> {
  try {
    const response = await fetch(`${getLocalApiUrl()}/`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get QR code URL for connecting toys via Lovense Remote app
 */
export async function getQRCodeUrl(): Promise<string | null> {
  try {
    const response = await fetch(`${getLocalApiUrl()}/GetQRCode`);
    const data = await response.json();
    if (data.code === 0 && data.data?.qr) {
      return data.data.qr;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get list of connected toys
 */
export async function getToys(): Promise<LovenseToy[]> {
  try {
    const response = await fetch(`${getLocalApiUrl()}/GetToys`);
    const data = await response.json();

    if (data.code !== 0 || !data.data?.toys) {
      return [];
    }

    const toys: LovenseToy[] = [];
    const toysData = typeof data.data.toys === 'string'
      ? JSON.parse(data.data.toys)
      : data.data.toys;

    for (const [id, toyData] of Object.entries(toysData)) {
      const toy = toyData as Record<string, unknown>;
      toys.push({
        id,
        name: (toy.name as string) || 'Unknown',
        type: parseToyType(toy.name as string),
        nickName: toy.nickName as string | undefined,
        battery: (toy.battery as number) || 0,
        connected: (toy.status as number) === 1,
        version: toy.version as string | undefined,
      });
    }

    return toys;
  } catch (error) {
    console.error('Failed to get toys:', error);
    return [];
  }
}

/**
 * Parse toy type from name
 */
function parseToyType(name: string): LovenseToyType {
  const lowerName = name?.toLowerCase() || '';
  const types: LovenseToyType[] = [
    'lush', 'hush', 'edge', 'domi', 'osci', 'dolce', 'diamo',
    'max', 'nora', 'ambi', 'ferri', 'exomoon', 'tenera',
    'gravity', 'flexer', 'ridge', 'lapis', 'solace',
  ];
  for (const type of types) {
    if (lowerName.includes(type)) {
      return type;
    }
  }
  return 'unknown';
}

/**
 * Send a command to a specific toy
 */
export async function sendCommand(
  toyId: string,
  command: LovenseCommand
): Promise<boolean> {
  try {
    const params = new URLSearchParams({
      t: toyId,
      v: String(command.intensity),
      ...(command.duration && { sec: String(command.duration) }),
    });

    const endpoint = command.command === 'Stop'
      ? 'Stop'
      : command.command;

    const response = await fetch(
      `${getLocalApiUrl()}/${endpoint}?${params.toString()}`
    );
    const data = await response.json();
    return data.code === 0;
  } catch (error) {
    console.error('Failed to send command:', error);
    return false;
  }
}

/**
 * Send a command to all connected toys
 */
export async function sendCommandToAll(command: LovenseCommand): Promise<boolean> {
  try {
    const params = new URLSearchParams({
      v: String(command.intensity),
      ...(command.duration && { sec: String(command.duration) }),
    });

    const endpoint = command.command === 'Stop'
      ? 'Stop'
      : command.command;

    const response = await fetch(
      `${getLocalApiUrl()}/${endpoint}?${params.toString()}`
    );
    const data = await response.json();
    return data.code === 0;
  } catch (error) {
    console.error('Failed to send command to all:', error);
    return false;
  }
}

/**
 * Set vibration intensity (0-20)
 */
export async function vibrate(toyId: string, intensity: number): Promise<boolean> {
  return sendCommand(toyId, {
    command: 'Vibrate',
    intensity: Math.min(20, Math.max(0, Math.round(intensity))),
  });
}

/**
 * Vibrate all toys
 */
export async function vibrateAll(intensity: number): Promise<boolean> {
  return sendCommandToAll({
    command: 'Vibrate',
    intensity: Math.min(20, Math.max(0, Math.round(intensity))),
  });
}

/**
 * Stop all toys
 */
export async function stopAll(): Promise<boolean> {
  return sendCommandToAll({ command: 'Stop', intensity: 0 });
}

/**
 * Stop a specific toy
 */
export async function stop(toyId: string): Promise<boolean> {
  return sendCommand(toyId, { command: 'Stop', intensity: 0 });
}

// ============================================
// PATTERN PLAYBACK
// ============================================

interface PatternPlayback {
  pattern: LovensePattern;
  toyId: string | null; // null = all toys
  currentStep: number;
  isPlaying: boolean;
  loop: boolean;
  timeoutId: NodeJS.Timeout | null;
  onStepChange?: (step: number, intensity: number) => void;
  onComplete?: () => void;
}

let activePlayback: PatternPlayback | null = null;

/**
 * Play a pattern on a toy (or all toys)
 */
export function playPattern(
  pattern: LovensePattern,
  options: {
    toyId?: string;
    loop?: boolean;
    onStepChange?: (step: number, intensity: number) => void;
    onComplete?: () => void;
  } = {}
): void {
  // Stop any existing playback
  stopPattern();

  activePlayback = {
    pattern,
    toyId: options.toyId || null,
    currentStep: 0,
    isPlaying: true,
    loop: options.loop || false,
    timeoutId: null,
    onStepChange: options.onStepChange,
    onComplete: options.onComplete,
  };

  playNextStep();
}

function playNextStep(): void {
  if (!activePlayback || !activePlayback.isPlaying) return;

  const { pattern, currentStep, loop, onStepChange, onComplete } = activePlayback;

  if (currentStep >= pattern.steps.length) {
    if (loop) {
      activePlayback.currentStep = 0;
      playNextStep();
    } else {
      stopPattern();
      onComplete?.();
    }
    return;
  }

  const step = pattern.steps[currentStep];

  // Use smart vibrate for cloud API support
  smartVibrate(step.intensity, 0, 'pattern');

  onStepChange?.(currentStep, step.intensity);

  // Schedule next step
  activePlayback.timeoutId = setTimeout(() => {
    if (activePlayback) {
      activePlayback.currentStep++;
      playNextStep();
    }
  }, step.duration);
}

/**
 * Stop pattern playback
 */
export function stopPattern(): void {
  if (activePlayback) {
    if (activePlayback.timeoutId) {
      clearTimeout(activePlayback.timeoutId);
    }
    activePlayback.isPlaying = false;
    activePlayback = null;
    smartStop('pattern');
  }
}

/**
 * Check if a pattern is currently playing
 */
export function isPatternPlaying(): boolean {
  return activePlayback?.isPlaying || false;
}

// ============================================
// EDGE TRAINING MODE
// ============================================

interface EdgeTrainingState {
  isActive: boolean;
  baseIntensity: number;
  currentIntensity: number;
  edgeCount: number;
  intensityPerEdge: number;
  maxIntensity: number;
  cooldownDuration: number;
  toyId: string | null;
  onIntensityChange?: (intensity: number) => void;
}

let edgeTraining: EdgeTrainingState | null = null;

/**
 * Start edge training mode
 */
export function startEdgeTraining(options: {
  toyId?: string;
  baseIntensity?: number;
  intensityPerEdge?: number;
  maxIntensity?: number;
  cooldownDuration?: number;
  onIntensityChange?: (intensity: number) => void;
}): void {
  edgeTraining = {
    isActive: true,
    baseIntensity: options.baseIntensity || 5,
    currentIntensity: options.baseIntensity || 5,
    edgeCount: 0,
    intensityPerEdge: options.intensityPerEdge || 2,
    maxIntensity: options.maxIntensity || 18,
    cooldownDuration: options.cooldownDuration || 3000,
    toyId: options.toyId || null,
    onIntensityChange: options.onIntensityChange,
  };

  // Start at base intensity
  setEdgeTrainingIntensity(edgeTraining.baseIntensity);
}

/**
 * Record an edge (increases intensity)
 */
export async function recordEdge(): Promise<number> {
  if (!edgeTraining || !edgeTraining.isActive) return 0;

  edgeTraining.edgeCount++;

  // Cooldown: drop to zero briefly using smart stop
  await smartStop('edge_session');

  // After cooldown, increase intensity
  setTimeout(() => {
    if (!edgeTraining || !edgeTraining.isActive) return;

    const newIntensity = Math.min(
      edgeTraining.maxIntensity,
      edgeTraining.baseIntensity + (edgeTraining.edgeCount * edgeTraining.intensityPerEdge)
    );
    edgeTraining.currentIntensity = newIntensity;
    setEdgeTrainingIntensity(newIntensity);
  }, edgeTraining.cooldownDuration);

  return edgeTraining.edgeCount;
}

function setEdgeTrainingIntensity(intensity: number): void {
  if (!edgeTraining) return;

  edgeTraining.currentIntensity = intensity;
  edgeTraining.onIntensityChange?.(intensity);

  // Use smart vibrate which routes to cloud API when enabled
  smartVibrate(intensity, 0, 'edge_session');
}

/**
 * Stop edge training mode
 */
export function stopEdgeTraining(): EdgeTrainingState | null {
  const result = edgeTraining;
  if (edgeTraining) {
    edgeTraining.isActive = false;
    smartStop('edge_session');
  }
  edgeTraining = null;
  return result;
}

/**
 * Get current edge training state
 */
export function getEdgeTrainingState(): EdgeTrainingState | null {
  return edgeTraining;
}

// ============================================
// TEASE MODE
// ============================================

interface TeaseState {
  isActive: boolean;
  minIntensity: number;
  maxIntensity: number;
  minInterval: number;
  maxInterval: number;
  pulseDuration: number;
  toyId: string | null;
  timeoutId: NodeJS.Timeout | null;
}

let teaseState: TeaseState | null = null;

/**
 * Start random tease mode
 */
export function startTeaseMode(options: {
  toyId?: string;
  minIntensity?: number;
  maxIntensity?: number;
  minInterval?: number; // ms
  maxInterval?: number; // ms
  pulseDuration?: number; // ms
} = {}): void {
  stopTeaseMode();

  teaseState = {
    isActive: true,
    minIntensity: options.minIntensity || 5,
    maxIntensity: options.maxIntensity || 18,
    minInterval: options.minInterval || 3000,
    maxInterval: options.maxInterval || 15000,
    pulseDuration: options.pulseDuration || 500,
    toyId: options.toyId || null,
    timeoutId: null,
  };

  scheduleNextTease();
}

function scheduleNextTease(): void {
  if (!teaseState || !teaseState.isActive) return;

  const interval = teaseState.minInterval +
    Math.random() * (teaseState.maxInterval - teaseState.minInterval);

  teaseState.timeoutId = setTimeout(() => {
    if (!teaseState || !teaseState.isActive) return;

    // Random intensity pulse
    const intensity = teaseState.minIntensity +
      Math.random() * (teaseState.maxIntensity - teaseState.minIntensity);

    // Use smart vibrate for cloud API support
    smartVibrate(intensity, 0, 'tease');

    // Stop after pulse duration
    setTimeout(() => {
      if (teaseState?.isActive) {
        smartStop('tease');
        scheduleNextTease();
      }
    }, teaseState.pulseDuration);
  }, interval);
}

/**
 * Stop tease mode
 */
export function stopTeaseMode(): void {
  if (teaseState) {
    teaseState.isActive = false;
    if (teaseState.timeoutId) {
      clearTimeout(teaseState.timeoutId);
    }
    smartStop('tease');
  }
  teaseState = null;
}

// ============================================
// AROUSAL SYNC MODE
// ============================================

/**
 * Map arousal level (1-10) to toy intensity (0-20)
 */
export function arousalToIntensity(
  arousalLevel: number,
  minIntensity = 0,
  maxIntensity = 20
): number {
  // Arousal 1-10 maps to minIntensity-maxIntensity
  const normalized = (arousalLevel - 1) / 9; // 0-1
  return Math.round(minIntensity + normalized * (maxIntensity - minIntensity));
}

/**
 * Sync toy intensity to arousal level
 */
export async function syncToArousal(
  arousalLevel: number,
  options: {
    toyId?: string;
    minIntensity?: number;
    maxIntensity?: number;
  } = {}
): Promise<void> {
  const intensity = arousalToIntensity(
    arousalLevel,
    options.minIntensity || 3,
    options.maxIntensity || 16
  );

  // Use smart vibrate for cloud API support
  await smartVibrate(intensity, 0, 'arousal_sync');
}

// ============================================
// DENIAL TRAINING MODE
// ============================================

interface DenialTrainingState {
  isActive: boolean;
  phase: 'building' | 'peak' | 'denial' | 'rest';
  buildDuration: number;
  peakDuration: number;
  denialDuration: number;
  restDuration: number;
  maxIntensity: number;
  cycles: number;
  currentCycle: number;
  toyId: string | null;
  timeoutId: NodeJS.Timeout | null;
  onPhaseChange?: (phase: string, cycle: number) => void;
}

let denialTraining: DenialTrainingState | null = null;

/**
 * Start denial training mode
 * Builds up, holds at peak, then denies (stops), repeats
 */
export function startDenialTraining(options: {
  toyId?: string;
  buildDuration?: number;  // ms
  peakDuration?: number;   // ms
  denialDuration?: number; // ms
  restDuration?: number;   // ms
  maxIntensity?: number;
  cycles?: number;
  onPhaseChange?: (phase: string, cycle: number) => void;
} = {}): void {
  stopDenialTraining();

  denialTraining = {
    isActive: true,
    phase: 'building',
    buildDuration: options.buildDuration || 30000,
    peakDuration: options.peakDuration || 10000,
    denialDuration: options.denialDuration || 5000,
    restDuration: options.restDuration || 10000,
    maxIntensity: options.maxIntensity || 18,
    cycles: options.cycles || 5,
    currentCycle: 1,
    toyId: options.toyId || null,
    timeoutId: null,
    onPhaseChange: options.onPhaseChange,
  };

  runDenialPhase('building');
}

function runDenialPhase(phase: DenialTrainingState['phase']): void {
  if (!denialTraining || !denialTraining.isActive) return;

  denialTraining.phase = phase;
  denialTraining.onPhaseChange?.(phase, denialTraining.currentCycle);

  const { buildDuration, peakDuration, denialDuration, restDuration, maxIntensity, cycles, currentCycle } = denialTraining;

  switch (phase) {
    case 'building':
      // Gradually increase intensity
      runBuildUp(0, maxIntensity, buildDuration, () => {
        runDenialPhase('peak');
      });
      break;

    case 'peak':
      // Hold at max - use smart vibrate for cloud API support
      smartVibrate(maxIntensity, 0, 'denial_training');
      denialTraining.timeoutId = setTimeout(() => {
        runDenialPhase('denial');
      }, peakDuration);
      break;

    case 'denial':
      // Stop completely
      smartStop('denial_training');
      denialTraining.timeoutId = setTimeout(() => {
        runDenialPhase('rest');
      }, denialDuration);
      break;

    case 'rest':
      // Stay stopped, then start next cycle or finish
      denialTraining.timeoutId = setTimeout(() => {
        if (!denialTraining) return;
        if (currentCycle < cycles) {
          denialTraining.currentCycle++;
          runDenialPhase('building');
        } else {
          stopDenialTraining();
        }
      }, restDuration);
      break;
  }
}

function runBuildUp(
  startIntensity: number,
  endIntensity: number,
  duration: number,
  onComplete: () => void
): void {
  if (!denialTraining || !denialTraining.isActive) return;

  const steps = 20;
  const stepDuration = duration / steps;
  const intensityStep = (endIntensity - startIntensity) / steps;
  let currentStep = 0;

  function nextStep(): void {
    if (!denialTraining || !denialTraining.isActive || currentStep >= steps) {
      onComplete();
      return;
    }

    const intensity = startIntensity + (currentStep * intensityStep);
    // Use smart vibrate for cloud API support
    smartVibrate(intensity, 0, 'denial_training');

    currentStep++;
    denialTraining.timeoutId = setTimeout(nextStep, stepDuration);
  }

  nextStep();
}

/**
 * Stop denial training
 */
export function stopDenialTraining(): void {
  if (denialTraining) {
    denialTraining.isActive = false;
    if (denialTraining.timeoutId) {
      clearTimeout(denialTraining.timeoutId);
    }
    smartStop('denial_training');
  }
  denialTraining = null;
}

/**
 * Get denial training state
 */
export function getDenialTrainingState(): DenialTrainingState | null {
  return denialTraining;
}

// ============================================
// CLOUD API (SUPABASE EDGE FUNCTIONS)
// ============================================

let useCloudApi = false;

/**
 * Enable/disable cloud API mode
 */
export function setCloudApiMode(enabled: boolean): void {
  useCloudApi = enabled;
}

/**
 * Check if cloud API mode is enabled
 */
export function isCloudApiEnabled(): boolean {
  return useCloudApi;
}

/**
 * Send command via cloud API (Supabase Edge Function)
 */
export async function sendCloudCommand(
  request: CloudCommandRequest
): Promise<CloudCommandResponse> {
  try {
    // Use invokeWithAuth to ensure token is passed correctly
    const response = await invokeWithAuth('lovense-command', request as unknown as Record<string, unknown>);

    if (response.error) {
      return { success: false, error: response.error.message };
    }

    return response.data as CloudCommandResponse;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send a pattern command via cloud API
 */
export async function sendPatternCommand(
  patternName: string,
  triggerType: HapticTriggerType,
  triggerId?: string
): Promise<CloudCommandResponse> {
  return sendCloudCommand({
    patternName,
    triggerType,
    triggerId,
  });
}

/**
 * Send a custom vibration command via cloud API
 */
export async function sendVibrateCommand(
  intensity: number,
  durationSec: number,
  triggerType: HapticTriggerType,
  triggerId?: string
): Promise<CloudCommandResponse> {
  return sendCloudCommand({
    customCommand: {
      command: 'Function',
      action: `Vibrate:${intensity}`,
      timeSec: durationSec,
    },
    triggerType,
    triggerId,
    intensity,
  });
}

/**
 * Send stop command via cloud API
 */
export async function sendStopCommand(
  triggerType: HapticTriggerType = 'manual'
): Promise<CloudCommandResponse> {
  return sendCloudCommand({
    customCommand: {
      command: 'Stop',
    },
    triggerType,
  });
}

// ============================================
// CLOUD QR CODE / CONNECTION
// ============================================

/**
 * Get QR code URL for connecting Lovense toys (Standard API)
 */
export async function getCloudQRCode(): Promise<{ qrUrl: string | null; error?: string }> {
  // Get session with access token
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    console.error('No session found');
    return { qrUrl: null, error: 'Please log in to connect your Lovense device.' };
  }

  console.log('Authenticated user:', session.user.id);
  console.log('Access token (first 20 chars):', session.access_token?.substring(0, 20));

  // Get the Supabase URL from env
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  try {
    // Use direct fetch instead of Supabase wrapper
    const response = await fetch(`${supabaseUrl}/functions/v1/lovense-qrcode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    console.log('Lovense QR response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovense QR error response:', errorText);
      if (response.status === 401) {
        return { qrUrl: null, error: 'Session expired. Please log out and log back in.' };
      }
      return { qrUrl: null, error: `Error ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    console.log('Lovense QR response data:', data);

    if (data.success && data.qrUrl) {
      return { qrUrl: data.qrUrl };
    }

    return { qrUrl: null, error: data.error || 'Failed to get QR code' };
  } catch (error) {
    console.error('Lovense QR code fetch error:', error);
    return {
      qrUrl: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if user has an active Lovense connection
 */
export async function checkCloudConnection(): Promise<{
  connected: boolean;
  device?: { id: string; name: string; battery?: number };
}> {
  console.log('Checking cloud connection...');

  // First check if we have a connection record
  const { data: connection, error: connError } = await supabase
    .from('lovense_connections')
    .select('*')
    .single();

  console.log('Connection record:', connection, 'Error:', connError);

  const device = await getConnectedDevice();
  console.log('Device record:', device);

  if (device && device.is_connected) {
    console.log('Device is connected!');
    return {
      connected: true,
      device: {
        id: device.id,
        name: device.nickname || device.toy_name || 'Unknown',
        battery: device.battery_level || undefined,
      },
    };
  }
  console.log('No connected device found');
  return { connected: false };
}

// ============================================
// CLOUD DEVICE MANAGEMENT
// ============================================

/**
 * Get user's connected devices from database
 */
export async function getCloudDevices(): Promise<DbLovenseDevice[]> {
  const { data, error } = await supabase
    .from('lovense_devices')
    .select('*')
    .order('last_seen_at', { ascending: false });

  if (error) {
    console.error('Failed to get devices:', error);
    return [];
  }

  return data || [];
}

/**
 * Get currently connected device
 * Only returns a device if it was seen within the last 5 minutes
 */
export async function getConnectedDevice(): Promise<DbLovenseDevice | null> {
  // First, let's see ALL devices for this user
  const { data: allDevices, error: allError } = await supabase
    .from('lovense_devices')
    .select('*');

  console.log('All devices for user:', allDevices, 'Error:', allError);

  const { data, error } = await supabase
    .from('lovense_devices')
    .select('*')
    .eq('is_connected', true)
    .maybeSingle(); // Use maybeSingle instead of single to avoid error on 0 rows

  if (error) {
    console.error('Error getting connected device:', error);
    return null;
  }

  console.log('Connected device query result:', data);

  // Check if the device was seen recently (within last 5 minutes)
  // If not, the connection is likely stale
  if (data && data.last_seen_at) {
    const lastSeen = new Date(data.last_seen_at);
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    if (lastSeen < fiveMinutesAgo) {
      console.log('Device connection is stale (last seen:', lastSeen, ')');
      // Mark the device as disconnected since it's stale
      await supabase
        .from('lovense_devices')
        .update({ is_connected: false })
        .eq('id', data.id);
      return null;
    }
  }

  return data;
}

/**
 * Update device connection status
 */
export async function updateDeviceStatus(
  toyId: string,
  isConnected: boolean
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('lovense_devices')
    .update({
      is_connected: isConnected,
      last_seen_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .eq('toy_id', toyId);
}

// ============================================
// CLOUD PATTERN LIBRARY
// ============================================

/**
 * Get all haptic patterns from database
 */
export async function getHapticPatterns(): Promise<HapticPattern[]> {
  const { data, error } = await supabase
    .from('haptic_patterns')
    .select('*')
    .order('name');

  if (error) {
    console.error('Failed to get patterns:', error);
    return [];
  }

  return (data || []).map((p: DbHapticPattern) => mapDbPatternToPattern(p));
}

/**
 * Get patterns by context
 */
export async function getPatternsByContext(
  context: string
): Promise<HapticPattern[]> {
  const { data, error } = await supabase
    .from('haptic_patterns')
    .select('*')
    .contains('use_context', [context])
    .order('name');

  if (error) {
    console.error('Failed to get patterns:', error);
    return [];
  }

  return (data || []).map((p: DbHapticPattern) => mapDbPatternToPattern(p));
}

/**
 * Get a specific pattern by name
 */
export async function getPatternByName(
  name: string
): Promise<HapticPattern | null> {
  const { data, error } = await supabase
    .from('haptic_patterns')
    .select('*')
    .eq('name', name)
    .single();

  if (error) {
    return null;
  }

  return mapDbPatternToPattern(data);
}

// ============================================
// CLOUD STATS
// ============================================

/**
 * Get user's haptic stats
 */
export async function getHapticStats(): Promise<HapticStats | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.rpc('get_haptic_stats', {
    p_user_id: user.id,
  });

  if (error) {
    console.error('Failed to get haptic stats:', error);
    return null;
  }

  return {
    totalCommands: data.total_commands || 0,
    totalSessions: data.total_sessions || 0,
    totalEdges: data.total_edges || 0,
    totalMinutesControlled: data.total_minutes_controlled || 0,
    firstCommand: data.first_command,
    recentIntensityAvg: data.recent_intensity_avg || 0,
    peakIntensityEver: data.peak_intensity_ever || 0,
    commandsToday: data.commands_today || 0,
  };
}

/**
 * Check if haptics are currently allowed
 */
export async function checkHapticsAllowed(): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { allowed: false, reason: 'Not authenticated' };

  const { data, error } = await supabase.rpc('can_use_haptics', {
    p_user_id: user.id,
  });

  if (error) {
    console.error('Failed to check haptics allowed:', error);
    return { allowed: true }; // Default to allowed on error
  }

  return {
    allowed: data?.allowed ?? true,
    reason: data?.reason,
  };
}

// ============================================
// REWARD BUZZ HELPERS
// ============================================

/**
 * Send task completion buzz
 */
export async function sendTaskCompleteBuzz(): Promise<CloudCommandResponse> {
  return sendPatternCommand('task_complete', 'task_complete');
}

/**
 * Send affirmation buzz
 */
export async function sendAffirmationBuzz(): Promise<CloudCommandResponse> {
  return sendPatternCommand('good_girl', 'affirmation');
}

/**
 * Send level up celebration
 */
export async function sendLevelUpBuzz(): Promise<CloudCommandResponse> {
  return sendPatternCommand('level_up', 'level_up');
}

/**
 * Send achievement unlock buzz
 */
export async function sendAchievementBuzz(): Promise<CloudCommandResponse> {
  return sendPatternCommand('achievement_unlock', 'achievement');
}

/**
 * Send streak milestone buzz
 */
export async function sendStreakMilestoneBuzz(): Promise<CloudCommandResponse> {
  return sendPatternCommand('streak_milestone', 'streak_milestone');
}

/**
 * Send notification reward buzz (variable intensity)
 */
export async function sendNotificationBuzz(
  intensity: 'low' | 'medium' | 'jackpot' = 'medium'
): Promise<CloudCommandResponse> {
  const patterns = {
    low: 'notification_low',
    medium: 'notification_medium',
    jackpot: 'notification_jackpot',
  };
  return sendPatternCommand(patterns[intensity], 'notification');
}

/**
 * Send edge session reward
 */
export async function sendEdgeRewardBuzz(): Promise<CloudCommandResponse> {
  return sendPatternCommand('edge_reward', 'edge_session');
}

/**
 * Send conditioning anchor buzz
 */
export async function sendAnchorBuzz(): Promise<CloudCommandResponse> {
  return sendPatternCommand('anchor_reinforcement', 'conditioning');
}

/**
 * Send voice training reward
 */
export async function sendVoiceRewardBuzz(): Promise<CloudCommandResponse> {
  return sendPatternCommand('voice_target_hit', 'conditioning');
}

/**
 * Send posture reward
 */
export async function sendPostureRewardBuzz(): Promise<CloudCommandResponse> {
  return sendPatternCommand('posture_reward', 'conditioning');
}

// ============================================
// HYBRID MODE (LOCAL + CLOUD)
// ============================================

/**
 * Smart vibrate - uses cloud API if enabled, otherwise local
 */
export async function smartVibrate(
  intensity: number,
  durationSec?: number,
  triggerType: HapticTriggerType = 'manual',
  triggerId?: string
): Promise<boolean> {
  if (useCloudApi) {
    const result = await sendVibrateCommand(
      intensity,
      durationSec || 0,
      triggerType,
      triggerId
    );
    return result.success;
  } else {
    return vibrateAll(intensity);
  }
}

/**
 * Smart stop - uses cloud API if enabled, otherwise local
 */
export async function smartStop(
  triggerType: HapticTriggerType = 'manual'
): Promise<boolean> {
  if (useCloudApi) {
    const result = await sendStopCommand(triggerType);
    return result.success;
  } else {
    return stopAll();
  }
}

/**
 * Smart pattern - uses cloud API if enabled, otherwise local
 */
export async function smartPlayPattern(
  patternName: string,
  triggerType: HapticTriggerType = 'manual',
  triggerId?: string
): Promise<boolean> {
  if (useCloudApi) {
    const result = await sendPatternCommand(patternName, triggerType, triggerId);
    return result.success;
  } else {
    // Find matching built-in pattern
    const pattern = BUILTIN_PATTERNS.find(
      (p) => p.id === patternName || p.name.toLowerCase() === patternName.toLowerCase()
    );
    if (pattern) {
      playPattern(pattern, {});
      return true;
    }
    return false;
  }
}

// Re-export for convenience
export { BUILTIN_PATTERNS } from '../types/lovense';
