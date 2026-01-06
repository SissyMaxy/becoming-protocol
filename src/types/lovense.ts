// Lovense Integration Types

// ============================================
// TOY TYPES
// ============================================

export type LovenseToyType =
  | 'lush'      // Internal vibrator
  | 'hush'      // Butt plug
  | 'edge'      // Prostate massager
  | 'domi'      // Wand
  | 'osci'      // Oscillating
  | 'dolce'     // Couples vibrator
  | 'diamo'     // Cock ring
  | 'max'       // Male masturbator
  | 'nora'      // Rabbit vibrator
  | 'ambi'      // Bullet vibrator
  | 'ferri'     // Panty vibrator
  | 'exomoon'   // Clitoral stimulator
  | 'tenera'    // Clitoral vibrator
  | 'gravity'   // Thrusting vibrator
  | 'flexer'    // Insertable vibrator
  | 'ridge'     // Prostate vibrator
  | 'lapis'     // Anal vibrator
  | 'solace'    // Thrusting masturbator
  | 'unknown';

export interface LovenseToy {
  id: string;
  name: string;
  type: LovenseToyType;
  nickName?: string;
  battery: number;
  connected: boolean;
  version?: string;
}

export interface LovenseCommand {
  command: 'Vibrate' | 'Rotate' | 'Pump' | 'Thrusting' | 'Fingering' | 'Suction' | 'All' | 'Stop';
  intensity: number; // 0-20
  duration?: number; // seconds, 0 = indefinite
  loop?: boolean;
}

export interface LovensePattern {
  id: string;
  name: string;
  steps: PatternStep[];
  totalDuration: number; // ms
}

export interface PatternStep {
  intensity: number; // 0-20
  duration: number;  // ms
}

// ============================================
// CONNECTION TYPES
// ============================================

export type ConnectionStatus =
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'error';

export interface LovenseConnectionState {
  status: ConnectionStatus;
  toys: LovenseToy[];
  activeToy: LovenseToy | null;
  error?: string;
  lastCommand?: LovenseCommand;
  qrCodeUrl?: string;
}

export interface LovenseConfig {
  // Local API (Lovense Connect)
  localApiHost: string;
  localApiPort: number;
  // Cloud API (optional)
  cloudApiToken?: string;
  cloudApiUrl?: string;
}

// ============================================
// SESSION INTEGRATION
// ============================================

export type ToyMode =
  | 'manual'           // User controls intensity
  | 'edge_sync'        // Syncs with edge counter
  | 'arousal_sync'     // Syncs with arousal level
  | 'pattern'          // Runs a pattern
  | 'tease'            // Random teasing
  | 'denial_training'; // Builds up then stops

export interface ToySessionConfig {
  mode: ToyMode;
  baseIntensity: number;      // 0-20
  maxIntensity: number;       // 0-20
  edgeIntensityBoost: number; // Added per edge
  cooldownOnEdge: boolean;    // Stop briefly at edge
  patternId?: string;
  teaseInterval?: number;     // ms between tease pulses
}

// ============================================
// PATTERNS
// ============================================

export const BUILTIN_PATTERNS: LovensePattern[] = [
  {
    id: 'gentle_wave',
    name: 'Gentle Wave',
    steps: [
      { intensity: 3, duration: 1000 },
      { intensity: 6, duration: 1000 },
      { intensity: 9, duration: 1000 },
      { intensity: 6, duration: 1000 },
      { intensity: 3, duration: 1000 },
    ],
    totalDuration: 5000,
  },
  {
    id: 'building',
    name: 'Building',
    steps: [
      { intensity: 2, duration: 2000 },
      { intensity: 4, duration: 2000 },
      { intensity: 6, duration: 2000 },
      { intensity: 8, duration: 2000 },
      { intensity: 10, duration: 2000 },
      { intensity: 12, duration: 2000 },
      { intensity: 10, duration: 1000 },
      { intensity: 6, duration: 1000 },
    ],
    totalDuration: 14000,
  },
  {
    id: 'edge_tease',
    name: 'Edge Tease',
    steps: [
      { intensity: 5, duration: 500 },
      { intensity: 12, duration: 300 },
      { intensity: 5, duration: 500 },
      { intensity: 15, duration: 200 },
      { intensity: 0, duration: 1000 },
      { intensity: 8, duration: 500 },
      { intensity: 18, duration: 100 },
      { intensity: 0, duration: 1500 },
    ],
    totalDuration: 4600,
  },
  {
    id: 'denial_pulse',
    name: 'Denial Pulse',
    steps: [
      { intensity: 0, duration: 2000 },
      { intensity: 15, duration: 500 },
      { intensity: 0, duration: 3000 },
      { intensity: 18, duration: 300 },
      { intensity: 0, duration: 4000 },
      { intensity: 20, duration: 200 },
      { intensity: 0, duration: 5000 },
    ],
    totalDuration: 15000,
  },
  {
    id: 'constant_low',
    name: 'Constant Low',
    steps: [
      { intensity: 5, duration: 10000 },
    ],
    totalDuration: 10000,
  },
  {
    id: 'constant_medium',
    name: 'Constant Medium',
    steps: [
      { intensity: 10, duration: 10000 },
    ],
    totalDuration: 10000,
  },
  {
    id: 'constant_high',
    name: 'Constant High',
    steps: [
      { intensity: 16, duration: 10000 },
    ],
    totalDuration: 10000,
  },
  {
    id: 'heartbeat',
    name: 'Heartbeat',
    steps: [
      { intensity: 8, duration: 150 },
      { intensity: 0, duration: 100 },
      { intensity: 12, duration: 150 },
      { intensity: 0, duration: 600 },
    ],
    totalDuration: 1000,
  },
  {
    id: 'staircase',
    name: 'Staircase',
    steps: [
      { intensity: 4, duration: 3000 },
      { intensity: 8, duration: 3000 },
      { intensity: 12, duration: 3000 },
      { intensity: 16, duration: 3000 },
      { intensity: 20, duration: 2000 },
      { intensity: 0, duration: 3000 },
    ],
    totalDuration: 17000,
  },
  {
    id: 'random_tease',
    name: 'Random Tease',
    steps: [
      { intensity: 5, duration: 800 },
      { intensity: 0, duration: 1200 },
      { intensity: 15, duration: 400 },
      { intensity: 0, duration: 2000 },
      { intensity: 10, duration: 600 },
      { intensity: 0, duration: 1500 },
      { intensity: 18, duration: 300 },
      { intensity: 0, duration: 2500 },
    ],
    totalDuration: 9300,
  },
  {
    id: 'flutter_gentle',
    name: 'Flutter Gentle',
    steps: [
      { intensity: 2, duration: 300 },
      { intensity: 0, duration: 700 },
      { intensity: 3, duration: 300 },
      { intensity: 0, duration: 700 },
      { intensity: 2, duration: 300 },
      { intensity: 0, duration: 1000 },
      { intensity: 4, duration: 400 },
      { intensity: 1, duration: 600 },
      { intensity: 3, duration: 300 },
      { intensity: 0, duration: 900 },
    ],
    totalDuration: 5500,
  },
];

// ============================================
// DB TYPES (CLOUD API)
// ============================================

// Device stored in database
export interface DbLovenseDevice {
  id: string;
  user_id: string;
  toy_id: string;
  toy_name: string | null;
  nickname: string | null;
  is_connected: boolean;
  battery_level: number | null;
  last_seen_at: string | null;
  created_at: string;
}

export interface LovenseDevice {
  id: string;
  userId: string;
  toyId: string;
  toyName: LovenseToyType;
  nickname?: string;
  isConnected: boolean;
  batteryLevel?: number;
  lastSeenAt?: string;
  createdAt: string;
}

// Command log
export interface DbLovenseCommand {
  id: string;
  user_id: string;
  device_id: string | null;
  command_type: string;
  command_payload: Record<string, unknown>;
  trigger_type: HapticTriggerType;
  trigger_id: string | null;
  intensity: number | null;
  duration_sec: number | null;
  executed_at: string;
  success: boolean;
  error_message: string | null;
}

// Haptic pattern from database
export interface DbHapticPattern {
  id: string;
  name: string;
  description: string | null;
  command_type: 'Function' | 'Preset' | 'Pattern' | 'Stop';
  command_payload: Record<string, unknown>;
  duration_sec: number;
  intensity_min: number;
  intensity_max: number;
  use_context: string[];
  created_at: string;
}

export interface HapticPattern {
  id: string;
  name: string;
  description?: string;
  commandType: 'Function' | 'Preset' | 'Pattern' | 'Stop';
  commandPayload: Record<string, unknown>;
  durationSec: number;
  intensityMin: number;
  intensityMax: number;
  useContext: HapticContext[];
  createdAt: string;
}

// Haptic session tracking
export interface DbHapticSession {
  id: string;
  user_id: string;
  session_type: HapticSessionType;
  started_at: string;
  ended_at: string | null;
  total_commands: number;
  peak_intensity: number;
  total_edges: number;
  ai_controlled: boolean;
  commitments_made: unknown[];
  notes: string | null;
  status: 'active' | 'completed' | 'abandoned';
}

export interface HapticSession {
  id: string;
  userId: string;
  sessionType: HapticSessionType;
  startedAt: string;
  endedAt?: string;
  totalCommands: number;
  peakIntensity: number;
  totalEdges: number;
  aiControlled: boolean;
  commitmentsMade: EdgeCommitment[];
  notes?: string;
  status: 'active' | 'completed' | 'abandoned';
}

// User haptic settings
export interface DbHapticSettings {
  id: string;
  user_id: string;
  enabled: boolean;
  reward_intensity: 'subtle' | 'moderate' | 'intense';
  allowed_hours_start: string;
  allowed_hours_end: string;
  quiet_days: string[];
  task_completion_rewards: boolean;
  notification_rewards: boolean;
  affirmation_rewards: boolean;
  session_mode: boolean;
  max_session_intensity: number;
  ai_control_level: 'suggestions' | 'partial' | 'full';
  max_daily_commands: number;
  cooldown_between_commands: number;
  max_session_minutes: number;
  min_cooldown_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface HapticSettings {
  id: string;
  userId: string;
  enabled: boolean;
  rewardIntensity: 'subtle' | 'moderate' | 'intense';
  allowedHoursStart: string;
  allowedHoursEnd: string;
  quietDays: string[];
  taskCompletionRewards: boolean;
  notificationRewards: boolean;
  affirmationRewards: boolean;
  sessionMode: boolean;
  maxSessionIntensity: number;
  aiControlLevel: 'suggestions' | 'partial' | 'full';
  maxDailyCommands: number;
  cooldownBetweenCommands: number;
  maxSessionMinutes: number;
  minCooldownMinutes: number;
}

// Conditioning tracking
export interface DbHapticConditioning {
  id: string;
  user_id: string;
  signal_type: ConditioningSignalType;
  signal_data: Record<string, unknown>;
  recorded_at: string;
}

// ============================================
// HAPTIC ENUMS & CONTEXTS
// ============================================

export type HapticTriggerType =
  | 'task_complete'
  | 'notification'
  | 'ai_session'
  | 'arousal_auction'
  | 'edge_session'
  | 'conditioning'
  | 'affirmation'
  | 'level_up'
  | 'achievement'
  | 'streak_milestone'
  | 'manual'
  | 'system'
  | 'tease'
  | 'denial_training'
  | 'arousal_sync'
  | 'pattern';

export type HapticContext =
  | 'task_complete'
  | 'affirmation'
  | 'notification'
  | 'milestone'
  | 'level_up'
  | 'achievement'
  | 'jackpot'
  | 'edge_session'
  | 'denial'
  | 'tease'
  | 'reward'
  | 'conditioning'
  | 'identity'
  | 'protocol'
  | 'morning'
  | 'evening'
  | 'anchor'
  | 'voice'
  | 'posture'
  | 'background'
  | 'awareness'
  | 'session';

export type HapticSessionType =
  | 'anchoring'
  | 'reward'
  | 'edge'
  | 'maintenance'
  | 'conditioning';

export type ConditioningSignalType =
  | 'haptic_withdrawal'
  | 'pattern_preference'
  | 'intensity_escalation';

// ============================================
// EDGE COMMITMENT SYSTEM
// ============================================

export interface EdgeCommitment {
  edgeNumber: number;
  commitment: string;
  madeAt: string;
  category: 'appearance' | 'behavior' | 'mindset' | 'practice';
}

export const EDGE_COMMITMENT_PROMPTS: Record<number, string[]> = {
  5: [
    'Wear something feminine under your clothes tomorrow',
    'Practice your feminine voice for 10 minutes today',
    'Apply moisturizer with intention tonight',
    'Set a posture reminder for tomorrow',
  ],
  8: [
    'Paint your toenails a color you love',
    'Practice walking in heels for 15 minutes',
    'Record yourself speaking and analyze your voice',
    'Wear a piece of feminine jewelry all day tomorrow',
  ],
  10: [
    'Shave your legs completely smooth',
    'Practice your feminine signature',
    'Take a selfie embracing your feminine side',
    'Commit to one week of daily voice practice',
  ],
};

// ============================================
// HAPTIC STATS
// ============================================

export interface HapticStats {
  totalCommands: number;
  totalSessions: number;
  totalEdges: number;
  totalMinutesControlled: number;
  firstCommand?: string;
  recentIntensityAvg: number;
  peakIntensityEver: number;
  commandsToday: number;
}

// ============================================
// CLOUD API TYPES
// ============================================

export interface CloudCommandRequest {
  patternName?: string;
  customCommand?: {
    command: 'Function' | 'Preset' | 'Pattern' | 'Stop';
    action?: string;
    name?: string;
    pattern?: string;
    timeSec?: number;
    loopRunningSec?: number;
    loopPauseSec?: number;
  };
  triggerType: HapticTriggerType;
  triggerId?: string;
  intensity?: number;
}

export interface CloudCommandResponse {
  success: boolean;
  result?: Record<string, unknown>;
  device?: {
    id: string;
    name: string;
  };
  error?: string;
}

export interface HapticsAllowedResponse {
  allowed: boolean;
  reason?: string;
}

// ============================================
// LEGACY DB TYPES (Local API)
// ============================================

export interface DbLovenseSession {
  id: string;
  user_id: string;
  toy_id: string;
  toy_type: string;
  session_type: string;
  mode: string;
  started_at: string;
  ended_at: string | null;
  total_edges: number;
  peak_intensity: number;
  average_intensity: number;
  patterns_used: string[];
  notes: string | null;
  created_at: string;
}

export interface LovenseSession {
  id: string;
  userId: string;
  toyId: string;
  toyType: LovenseToyType;
  sessionType: 'arousal' | 'edge_training' | 'denial' | 'free_play';
  mode: ToyMode;
  startedAt: string;
  endedAt?: string;
  totalEdges: number;
  peakIntensity: number;
  averageIntensity: number;
  patternsUsed: string[];
  notes?: string;
  createdAt: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

export function mapDbDeviceToDevice(db: DbLovenseDevice): LovenseDevice {
  return {
    id: db.id,
    userId: db.user_id,
    toyId: db.toy_id,
    toyName: (db.toy_name as LovenseToyType) || 'unknown',
    nickname: db.nickname || undefined,
    isConnected: db.is_connected,
    batteryLevel: db.battery_level || undefined,
    lastSeenAt: db.last_seen_at || undefined,
    createdAt: db.created_at,
  };
}

export function mapDbPatternToPattern(db: DbHapticPattern): HapticPattern {
  return {
    id: db.id,
    name: db.name,
    description: db.description || undefined,
    commandType: db.command_type,
    commandPayload: db.command_payload,
    durationSec: db.duration_sec,
    intensityMin: db.intensity_min,
    intensityMax: db.intensity_max,
    useContext: db.use_context as HapticContext[],
    createdAt: db.created_at,
  };
}

export function mapDbSessionToSession(db: DbHapticSession): HapticSession {
  return {
    id: db.id,
    userId: db.user_id,
    sessionType: db.session_type,
    startedAt: db.started_at,
    endedAt: db.ended_at || undefined,
    totalCommands: db.total_commands,
    peakIntensity: db.peak_intensity,
    totalEdges: db.total_edges,
    aiControlled: db.ai_controlled,
    commitmentsMade: (db.commitments_made as EdgeCommitment[]) || [],
    notes: db.notes || undefined,
    status: db.status,
  };
}
