/**
 * Voice Evolution Progression — P7.2
 *
 * 7-level voice feminization system with pitch targets,
 * sustain requirements, practice tracking, and Handler context.
 */

import { supabase } from '../supabase';

// ── Level Definitions ────────────────────────────────────────────────

export interface VoiceLevelDef {
  level: number;
  name: string;
  targetPitchHz: number;
  sustainMinutes: number;
  description: string;
}

export const VOICE_LEVELS: VoiceLevelDef[] = [
  { level: 1, name: 'awareness',     targetPitchHz: 180, sustainMinutes: 2,  description: 'Finding your feminine register' },
  { level: 2, name: 'practice',      targetPitchHz: 190, sustainMinutes: 3,  description: 'Building consistent pitch control' },
  { level: 3, name: 'developing',    targetPitchHz: 200, sustainMinutes: 5,  description: 'Extending range and duration' },
  { level: 4, name: 'intermediate',  targetPitchHz: 210, sustainMinutes: 7,  description: 'Pitch and resonance together' },
  { level: 5, name: 'advanced',      targetPitchHz: 220, sustainMinutes: 10, description: 'Natural feminine speech patterns' },
  { level: 6, name: 'natural',       targetPitchHz: 230, sustainMinutes: 15, description: 'Sustained feminine voice in conversation' },
  { level: 7, name: 'mastery',       targetPitchHz: 240, sustainMinutes: 20, description: 'Full vocal identity integration' },
];

export function getLevelDef(level: number): VoiceLevelDef {
  return VOICE_LEVELS[Math.min(Math.max(level, 1), 7) - 1];
}

// ── Types ────────────────────────────────────────────────────────────

export interface VoiceLevel {
  id: string;
  userId: string;
  currentLevel: number;
  targetPitchHz: number | null;
  sustainedMinutesAtTarget: number;
  totalPracticeMinutes: number;
  sessionsAtCurrentLevel: number;
  levelHistory: LevelHistoryEntry[];
  lastPracticeAt: string | null;
  updatedAt: string;
}

export interface LevelHistoryEntry {
  level: number;
  name: string;
  achievedAt: string;
  practiceMinutes: number;
  sessions: number;
}

export interface VoiceExercise {
  exercise: string;
  targetPitch: number;
  durationMinutes: number;
  notes: string;
}

// ── Get Voice Level ──────────────────────────────────────────────────

export async function getVoiceLevel(userId: string): Promise<VoiceLevel | null> {
  const { data, error } = await supabase
    .from('voice_levels')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    userId: data.user_id,
    currentLevel: data.current_level,
    targetPitchHz: data.target_pitch_hz,
    sustainedMinutesAtTarget: data.sustained_minutes_at_target,
    totalPracticeMinutes: data.total_practice_minutes,
    sessionsAtCurrentLevel: data.sessions_at_current_level,
    levelHistory: (data.level_history as LevelHistoryEntry[]) || [],
    lastPracticeAt: data.last_practice_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Ensure a voice_levels row exists for the user. Creates at level 1 if missing.
 */
async function ensureVoiceLevel(userId: string): Promise<VoiceLevel> {
  const existing = await getVoiceLevel(userId);
  if (existing) return existing;

  const def = getLevelDef(1);
  const { data, error } = await supabase
    .from('voice_levels')
    .insert({
      user_id: userId,
      current_level: 1,
      target_pitch_hz: def.targetPitchHz,
      sustained_minutes_at_target: 0,
      total_practice_minutes: 0,
      sessions_at_current_level: 0,
      level_history: [],
    })
    .select('*')
    .single();

  if (error || !data) {
    console.error('[voice-evolution] ensureVoiceLevel error:', error?.message);
    // Return a sensible default
    return {
      id: '',
      userId,
      currentLevel: 1,
      targetPitchHz: def.targetPitchHz,
      sustainedMinutesAtTarget: 0,
      totalPracticeMinutes: 0,
      sessionsAtCurrentLevel: 0,
      levelHistory: [],
      lastPracticeAt: null,
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    id: data.id,
    userId: data.user_id,
    currentLevel: data.current_level,
    targetPitchHz: data.target_pitch_hz,
    sustainedMinutesAtTarget: data.sustained_minutes_at_target,
    totalPracticeMinutes: data.total_practice_minutes,
    sessionsAtCurrentLevel: data.sessions_at_current_level,
    levelHistory: (data.level_history as LevelHistoryEntry[]) || [],
    lastPracticeAt: data.last_practice_at,
    updatedAt: data.updated_at,
  };
}

// ── Check Level Advancement ──────────────────────────────────────────

/**
 * Checks voice_pitch_samples from the last 7 days.
 * If average pitch is within 10Hz of current level's target
 * AND sustained minutes meet the threshold, advance to next level.
 *
 * Returns the new level number, or the current level if no advancement.
 */
export async function checkLevelAdvancement(userId: string): Promise<number> {
  const vl = await ensureVoiceLevel(userId);
  const def = getLevelDef(vl.currentLevel);

  // Already at max
  if (vl.currentLevel >= 7) return 7;

  // Get pitch samples from last 7 days
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: samples, error } = await supabase
    .from('voice_pitch_samples')
    .select('pitch_hz')
    .eq('user_id', userId)
    .gte('created_at', since);

  if (error || !samples || samples.length === 0) return vl.currentLevel;

  // Calculate average pitch
  const avgPitch = samples.reduce((sum, s) => sum + (s.pitch_hz as number), 0) / samples.length;

  // Check if within 10Hz of target
  const withinRange = Math.abs(avgPitch - def.targetPitchHz) <= 10;

  // Check sustained minutes threshold
  const meetsSustain = vl.sustainedMinutesAtTarget >= def.sustainMinutes;

  if (withinRange && meetsSustain) {
    const nextLevel = vl.currentLevel + 1;
    const nextDef = getLevelDef(nextLevel);

    // Record advancement
    const historyEntry: LevelHistoryEntry = {
      level: vl.currentLevel,
      name: def.name,
      achievedAt: new Date().toISOString(),
      practiceMinutes: vl.totalPracticeMinutes,
      sessions: vl.sessionsAtCurrentLevel,
    };

    const newHistory = [...vl.levelHistory, historyEntry];

    const { error: updateErr } = await supabase
      .from('voice_levels')
      .update({
        current_level: nextLevel,
        target_pitch_hz: nextDef.targetPitchHz,
        sustained_minutes_at_target: 0,
        sessions_at_current_level: 0,
        level_history: newHistory,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (updateErr) {
      console.error('[voice-evolution] Advance error:', updateErr.message);
      return vl.currentLevel;
    }

    return nextLevel;
  }

  return vl.currentLevel;
}

// ── Prescribe Voice Exercise ─────────────────────────────────────────

const EXERCISES: Record<number, VoiceExercise[]> = {
  1: [
    { exercise: 'Hum Slide', targetPitch: 180, durationMinutes: 2, notes: 'Hum from your natural pitch and slide up to 180Hz. Hold. Let it feel easy, not strained.' },
    { exercise: 'Whisper Read', targetPitch: 180, durationMinutes: 3, notes: 'Read a paragraph in a breathy whisper pitched at 180Hz. Focus on lightness, not volume.' },
  ],
  2: [
    { exercise: 'Sustained Vowels', targetPitch: 190, durationMinutes: 3, notes: 'Hold each vowel (ah, ee, oo) at 190Hz for 10 seconds. Rest between. Repeat cycle.' },
    { exercise: 'Sentence Ladders', targetPitch: 190, durationMinutes: 4, notes: 'Start a sentence at 180Hz, end at 200Hz. Reverse. Find 190Hz as your center.' },
  ],
  3: [
    { exercise: 'Passage Reading', targetPitch: 200, durationMinutes: 5, notes: 'Read aloud at 200Hz for 5 minutes. Mark where you drop. Those are your weak points.' },
    { exercise: 'Resonance Shift', targetPitch: 200, durationMinutes: 4, notes: 'Say "mmm-hmm" and feel it in your head, not chest. Sustain that placement through full sentences.' },
  ],
  4: [
    { exercise: 'Conversation Practice', targetPitch: 210, durationMinutes: 7, notes: 'Record yourself answering questions at 210Hz. Play back. Note where pitch drops.' },
    { exercise: 'Sing-Speak', targetPitch: 210, durationMinutes: 5, notes: 'Pick a song in the 200-220Hz range. Sing a line, then speak the same line at the same pitch.' },
  ],
  5: [
    { exercise: 'Phone Call Drill', targetPitch: 220, durationMinutes: 10, notes: 'Practice ordering food or making an appointment — all at 220Hz. Record for review.' },
    { exercise: 'Emotion Range', targetPitch: 220, durationMinutes: 8, notes: 'Express surprise, concern, joy, boredom — all staying above 210Hz. Emotions break pitch control.' },
  ],
  6: [
    { exercise: 'Extended Conversation', targetPitch: 230, durationMinutes: 15, notes: 'Maintain 230Hz through a 15-minute recorded conversation. No slipping. This is endurance.' },
    { exercise: 'Argument Simulation', targetPitch: 230, durationMinutes: 10, notes: 'Stress breaks pitch control. Practice getting heated while keeping pitch above 220Hz.' },
  ],
  7: [
    { exercise: 'Full Day Voice', targetPitch: 240, durationMinutes: 20, notes: 'Use your feminine voice for an entire day. Record check-ins every 2 hours to verify pitch.' },
    { exercise: 'Vocal Identity Integration', targetPitch: 240, durationMinutes: 15, notes: 'Record yourself telling your story — who you are, what you want — entirely in your evolved voice.' },
  ],
};

export function prescribeVoiceExercise(level: number): VoiceExercise {
  const levelExercises = EXERCISES[Math.min(Math.max(level, 1), 7)];
  // Rotate based on day of year for variety
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return levelExercises[dayOfYear % levelExercises.length];
}

// ── Record Practice Session ──────────────────────────────────────────

/**
 * Updates voice_levels with a completed practice session.
 * Tracks sustained minutes at target, total practice, and session count.
 */
export async function recordPracticeSession(
  userId: string,
  avgPitch: number,
  durationMinutes: number,
): Promise<void> {
  const vl = await ensureVoiceLevel(userId);
  const def = getLevelDef(vl.currentLevel);

  // Count sustained minutes only if pitch was within 10Hz of target
  const withinTarget = Math.abs(avgPitch - def.targetPitchHz) <= 10;
  const sustainedDelta = withinTarget ? durationMinutes : 0;

  const { error } = await supabase
    .from('voice_levels')
    .update({
      sustained_minutes_at_target: vl.sustainedMinutesAtTarget + sustainedDelta,
      total_practice_minutes: vl.totalPracticeMinutes + durationMinutes,
      sessions_at_current_level: vl.sessionsAtCurrentLevel + 1,
      last_practice_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (error) {
    console.error('[voice-evolution] recordPracticeSession error:', error.message);
  }

  // Fire-and-forget: check for level advancement after recording
  checkLevelAdvancement(userId).catch(() => {});
}

// ── Handler Context Builder ──────────────────────────────────────────

/**
 * Build voice evolution context for injection into Handler system prompt.
 * Compact, data-dense format matching existing context blocks.
 */
export async function buildVoiceEvolutionContext(userId: string): Promise<string> {
  try {
    const vl = await getVoiceLevel(userId);
    if (!vl) return '';

    const def = getLevelDef(vl.currentLevel);
    const parts: string[] = [];

    parts.push(`VOICE EVOLUTION: L${vl.currentLevel} "${def.name}" — target ${def.targetPitchHz}Hz, sustain ${def.sustainMinutes}min`);

    // Progress toward next level
    if (vl.currentLevel < 7) {
      const sustainProgress = Math.min(100, Math.round((vl.sustainedMinutesAtTarget / def.sustainMinutes) * 100));
      parts.push(`  progress: ${sustainProgress}% sustain (${vl.sustainedMinutesAtTarget.toFixed(1)}/${def.sustainMinutes}min)`);
    } else {
      parts.push('  MASTERY ACHIEVED');
    }

    // Practice stats
    parts.push(`  sessions: ${vl.sessionsAtCurrentLevel} at this level, ${vl.totalPracticeMinutes.toFixed(0)}min total`);

    // Practice streak / recency
    if (vl.lastPracticeAt) {
      const hoursAgo = Math.round((Date.now() - new Date(vl.lastPracticeAt).getTime()) / 3600000);
      if (hoursAgo < 24) {
        parts.push(`  last practice: ${hoursAgo}h ago`);
      } else {
        const daysAgo = Math.round(hoursAgo / 24);
        parts.push(`  last practice: ${daysAgo}d ago${daysAgo >= 3 ? ' — PRACTICE LAPSE' : ''}`);
      }
    } else {
      parts.push('  NO PRACTICE RECORDED — needs first session');
    }

    // Current exercise prescription
    const exercise = prescribeVoiceExercise(vl.currentLevel);
    parts.push(`  prescribed: "${exercise.exercise}" at ${exercise.targetPitch}Hz for ${exercise.durationMinutes}min`);

    // Level history summary
    if (vl.levelHistory.length > 0) {
      const recent = vl.levelHistory[vl.levelHistory.length - 1];
      parts.push(`  last advancement: L${recent.level} "${recent.name}" after ${recent.sessions} sessions`);
    }

    return parts.join('\n');
  } catch {
    return '';
  }
}
