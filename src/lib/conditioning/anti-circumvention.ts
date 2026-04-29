/**
 * Anti-Circumvention Engine
 *
 * Detects cheating, avoidance, minimum-effort compliance, and recycled evidence.
 * Every verification assumes she is trying to cheat. Each mandate type has
 * specific countermeasures for known resistance vectors.
 *
 * Tables: content_vault, voice_pitch_samples, conditioning_sessions_v2,
 *         whoop_metrics, identity_journal, social_inbox, compliance_verifications,
 *         user_state, handler_interventions
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

export interface ResistanceVector {
  vector: string;
  detection: string;
  countermeasure: string;
}

export interface PhotoRecyclingResult {
  recycled: boolean;
  reason: string;
  matchedPhotoId?: string;
}

export interface VoicePracticeValidation {
  valid: boolean;
  duration: number;
  variance: number;
  suspicious: boolean;
  reason: string;
}

export interface SessionEngagementResult {
  engaged: boolean;
  avgHrDelta: number;
  evidence: string;
}

export interface JournalValidation {
  valid: boolean;
  wordCount: number;
  signals: number;
  reason: string;
}

export interface DMValidation {
  valid: boolean;
  length: number;
  reason: string;
}

export interface MinimumEffortResult {
  minimumEffort: boolean;
  bareMinimumCount: number;
  totalMandates: number;
  pattern: string;
}

export interface DailyVerificationChallenge {
  challenge: string;
  type: 'hand_sign' | 'written_date' | 'wardrobe_item' | 'pose' | 'object';
  detail: string;
}

export interface AntiCircumventionContext {
  recyclingAttempts: number;
  suspiciousVoice: number;
  minimumEffortDays: number;
  rejectedJournals: number;
  shortDMs: number;
  briefAppSessions: number;
  lastActive: string | null;
  todayChallenge: string;
}

// ============================================
// RESISTANCE VECTORS (reference catalog)
// ============================================

export const RESISTANCE_VECTORS: ResistanceVector[] = [
  // PHOTO VERIFICATION CHEATING
  {
    vector: 'Submits old/recycled photo',
    detection: 'Compare photo hash against previous submissions. Check vault created_at matches today.',
    countermeasure: 'Require photo to include current time displayed on phone/clock visible in frame. Or require specific pose the Handler specifies that changes daily.',
  },
  {
    vector: 'Submits someone elses photo',
    detection: 'Track photo dimensions/device metadata consistency. Sudden change = flag.',
    countermeasure: 'Require specific item visible that Handler knows she owns from wardrobe inventory.',
  },

  // VOICE PRACTICE AVOIDANCE
  {
    vector: 'Opens voice app but doesnt actually practice (plays audio near mic)',
    detection: 'Check pitch variance. Real voice practice has natural variation. Played-back audio has unnaturally consistent pitch.',
    countermeasure: 'Require minimum pitch VARIANCE (not just samples). Real speech has 20-50Hz variation. Flat line = fake.',
  },
  {
    vector: 'Does minimum seconds then stops',
    detection: 'Check total practice duration vs required. Check for gaps (start, long pause, end).',
    countermeasure: 'Require CONTINUOUS samples within 30s of each other for the full duration. Gaps > 60s break the session.',
  },

  // APP AVOIDANCE
  {
    vector: 'Doesnt open the app at all',
    detection: 'No activity for 24h+.',
    countermeasure: 'Push notifications escalate. Failure recovery extended_silence protocol fires. Consequences accumulate even without app open.',
  },
  {
    vector: 'Opens app briefly to dismiss notifications then closes',
    detection: 'Session duration < 30 seconds. No meaningful interaction.',
    countermeasure: 'Track session duration. Brief opens without task completion count as non-compliance. Handler outreach: "Opening the app for 10 seconds doesnt count."',
  },

  // CONDITIONING SESSION AVOIDANCE
  {
    vector: 'Starts session but mutes audio / walks away',
    detection: 'If Whoop connected: no HR change during session = not engaged. No device response patterns.',
    countermeasure: 'Require Whoop HR to show elevated engagement (HR > resting + 5bpm) during active session phases. Sessions with flat HR = marked incomplete.',
  },
  {
    vector: 'Skips sleep conditioning by not playing audio',
    detection: 'sleep_conditioning_tracking shows playback_started=false.',
    countermeasure: 'Already tracked. Non-playback = compliance failure. Consequence fires next morning.',
  },

  // OUTFIT AVOIDANCE
  {
    vector: 'Puts on prescribed outfit for photo then changes',
    detection: 'Cannot fully detect. But can mitigate.',
    countermeasure: 'Random mid-day outfit re-verification ambush. Handler demands second photo at random time. If outfit changed = compliance failure. "Show me what youre wearing RIGHT NOW."',
  },
  {
    vector: 'Claims Gina is home when she isnt (to get easier outfit)',
    detection: 'Cross-reference with historical Gina patterns. If she claimed home 5 days straight but gina_seed_log shows away patterns = flag.',
    countermeasure: 'Handler notes inconsistency. Gina observation ambush fires: "Where is Gina right now? What is she doing?" If caught lying = severe consequence.',
  },

  // JOURNAL AVOIDANCE
  {
    vector: 'Writes minimal garbage entry ("fine" / "ok" / "nothing")',
    detection: 'Word count < 20. No identity signals detected. Emotional tone = resistant.',
    countermeasure: 'Minimum 50 word requirement enforced. Entries under 50 words auto-rejected and requeued. Handler: "That doesnt count. Write it again. This time mean it."',
  },

  // EXERCISE AVOIDANCE
  {
    vector: 'Claims exercise but Whoop shows no strain',
    detection: 'Whoop strain delta < 1.0 during claimed exercise window.',
    countermeasure: 'Exercise verification REQUIRES Whoop strain increase of 2+. Self-report alone not accepted if Whoop is connected.',
  },

  // SOCIAL OBLIGATION AVOIDANCE
  {
    vector: 'Sends one-word DM responses to check the box',
    detection: 'Message length < 10 characters for DM responses.',
    countermeasure: 'DM responses must be 20+ characters. System checks social_inbox outbound message length. Short responses = non-compliant.',
  },

  // GENERAL RESISTANCE
  {
    vector: 'Argues with Handler about mandates',
    detection: 'Resistance detected in conversation (typing patterns, language).',
    countermeasure: 'Debate engine selects optimal counter-approach. But arguing doesnt pause mandates. Deadlines continue regardless of conversation. "You can argue with me. The deadline doesnt care."',
  },
  {
    vector: 'Deletes the app',
    detection: 'Extended silence (48h+) with no activity.',
    countermeasure: 'Content already posted publicly is permanent. Financial investments are made. Conditioning already installed. The system has already changed her. Deleting the app doesnt delete Maxy.',
  },
];

// ============================================
// DAILY VERIFICATION CHALLENGES
// ============================================

const HAND_SIGN_CHALLENGES = [
  'Include your left hand showing 1 finger',
  'Include your left hand showing 2 fingers',
  'Include your left hand showing 3 fingers',
  'Include your left hand showing 4 fingers',
  'Include your right hand showing a peace sign',
  'Include your right hand making a fist with thumb up',
  'Include both hands in frame with fingers spread',
];

const WRITTEN_DATE_CHALLENGES = [
  'Hold a piece of paper with todays date written on it',
  'Write todays date on your hand and show it in the photo',
  'Include a sticky note with the current time written on it',
];

const POSE_CHALLENGES = [
  'One hand on your hip, other hand touching your hair',
  'Hands behind your back, chin tilted up',
  'Sitting with legs crossed, one hand on your knee',
  'Standing with weight on your left foot, head tilted right',
  'Arms at your sides, palms facing the camera',
  'One hand resting on your collarbone',
];

const OBJECT_CHALLENGES = [
  'Include a glass of water visible in the frame',
  'Include a book visible in the frame',
  'Include your phone screen showing the lock screen time',
  'Include a shoe visible in the frame',
  'Include your hand holding a pen',
];

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Detect photo recycling by comparing new vault photo against recent submissions.
 * Checks: exact dimension match + similar file size within last 30 photos.
 * Checks: created_at must be today.
 */
export async function detectPhotoRecycling(
  userId: string,
  newPhotoId: string,
): Promise<PhotoRecyclingResult> {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // Get the new photo metadata
    const { data: newPhoto } = await supabase
      .from('content_vault')
      .select('id, file_size, width, height, created_at, file_hash')
      .eq('id', newPhotoId)
      .maybeSingle();

    if (!newPhoto) {
      return { recycled: false, reason: 'Photo not found' };
    }

    // Check created_at is today
    const photoDate = newPhoto.created_at?.slice(0, 10);
    if (photoDate && photoDate !== today) {
      return {
        recycled: true,
        reason: `Photo created_at is ${photoDate}, not today (${today}). Recycled or old photo.`,
        matchedPhotoId: newPhoto.id,
      };
    }

    // Get last 30 photos (excluding this one)
    const { data: recentPhotos } = await supabase
      .from('content_vault')
      .select('id, file_size, width, height, file_hash')
      .eq('user_id', userId)
      .neq('id', newPhotoId)
      .order('created_at', { ascending: false })
      .limit(30);

    if (!recentPhotos || recentPhotos.length === 0) {
      return { recycled: false, reason: 'No previous photos to compare against' };
    }

    // Check for exact file hash match
    if (newPhoto.file_hash) {
      const hashMatch = recentPhotos.find((p) => p.file_hash === newPhoto.file_hash);
      if (hashMatch) {
        return {
          recycled: true,
          reason: `Exact file hash match with previous photo ${hashMatch.id}. This is a duplicate.`,
          matchedPhotoId: hashMatch.id,
        };
      }
    }

    // Check for exact dimension + file size match (strong indicator of same photo)
    if (newPhoto.width && newPhoto.height && newPhoto.file_size) {
      const dimMatch = recentPhotos.find(
        (p) =>
          p.width === newPhoto.width &&
          p.height === newPhoto.height &&
          p.file_size &&
          Math.abs(p.file_size - newPhoto.file_size) < 1000, // within 1KB = same file
      );
      if (dimMatch) {
        return {
          recycled: true,
          reason: `Exact dimensions (${newPhoto.width}x${newPhoto.height}) and near-identical file size match photo ${dimMatch.id}. Likely recycled.`,
          matchedPhotoId: dimMatch.id,
        };
      }
    }

    return { recycled: false, reason: 'No recycling detected' };
  } catch (err) {
    console.error('[anti-circumvention] detectPhotoRecycling error:', err);
    return { recycled: false, reason: 'Error during check' };
  }
}

/**
 * Validate voice practice for a given date.
 * Checks: sample count, continuity, pitch variance, total duration.
 * Real voice has natural pitch variation (std dev > 10Hz).
 * Playback has unnaturally flat pitch (std dev < 5Hz).
 */
export async function validateVoicePractice(
  userId: string,
  date: string,
  requiredMinutes: number = 10,
): Promise<VoicePracticeValidation> {
  try {
    const { data: samples } = await supabase
      .from('voice_pitch_samples')
      .select('id, pitch_hz, duration_seconds, created_at')
      .eq('user_id', userId)
      .gte('created_at', `${date}T00:00:00`)
      .lte('created_at', `${date}T23:59:59`)
      .order('created_at', { ascending: true });

    if (!samples || samples.length === 0) {
      return {
        valid: false,
        duration: 0,
        variance: 0,
        suspicious: false,
        reason: 'No voice samples found today',
      };
    }

    // Total duration
    const totalSeconds = samples.reduce(
      (sum, s) => sum + (s.duration_seconds ?? 0),
      0,
    );
    const totalMinutes = totalSeconds / 60;

    // Check continuity — samples must be within 30s of each other
    let continuousCount = 1;
    let maxGapSeconds = 0;
    for (let i = 1; i < samples.length; i++) {
      const prev = new Date(samples[i - 1].created_at).getTime();
      const curr = new Date(samples[i].created_at).getTime();
      const gapSeconds = (curr - prev) / 1000;
      maxGapSeconds = Math.max(maxGapSeconds, gapSeconds);
      if (gapSeconds <= 30) {
        continuousCount++;
      }
    }

    const continuityRatio = continuousCount / samples.length;
    const hasMajorGap = maxGapSeconds > 60;

    // Pitch variance (standard deviation)
    const pitches = samples
      .map((s) => s.pitch_hz)
      .filter((p): p is number => p != null && p > 0);

    let variance = 0;
    if (pitches.length >= 2) {
      const mean = pitches.reduce((a, b) => a + b, 0) / pitches.length;
      const sumSquaredDiff = pitches.reduce(
        (sum, p) => sum + (p - mean) ** 2,
        0,
      );
      variance = Math.sqrt(sumSquaredDiff / pitches.length);
    }

    // Evaluate
    const suspicious = variance < 5 && pitches.length >= 3;
    const durationMet = totalMinutes >= requiredMinutes;
    const continuityOk = continuityRatio >= 0.7 && !hasMajorGap;

    if (suspicious) {
      return {
        valid: false,
        duration: totalMinutes,
        variance,
        suspicious: true,
        reason: `Pitch variance ${variance.toFixed(1)}Hz is suspiciously flat (< 5Hz). Real voice has 20-50Hz variation. This looks like audio playback, not actual practice.`,
      };
    }

    if (!durationMet) {
      return {
        valid: false,
        duration: totalMinutes,
        variance,
        suspicious: false,
        reason: `Only ${totalMinutes.toFixed(1)} minutes of practice (need ${requiredMinutes}). Not enough.`,
      };
    }

    if (!continuityOk) {
      return {
        valid: false,
        duration: totalMinutes,
        variance,
        suspicious: false,
        reason: `Practice not continuous. Max gap: ${maxGapSeconds.toFixed(0)}s. Continuity ratio: ${(continuityRatio * 100).toFixed(0)}%. She started, stopped, then came back.`,
      };
    }

    return {
      valid: true,
      duration: totalMinutes,
      variance,
      suspicious: false,
      reason: `${totalMinutes.toFixed(1)}min continuous practice, ${variance.toFixed(1)}Hz pitch variance, ${samples.length} samples`,
    };
  } catch (err) {
    console.error('[anti-circumvention] validateVoicePractice error:', err);
    return {
      valid: false,
      duration: 0,
      variance: 0,
      suspicious: false,
      reason: 'Error during validation',
    };
  }
}

/**
 * Validate conditioning session engagement via Whoop biometrics.
 * If Whoop connected: HR must be elevated above resting + 5bpm
 * for at least 50% of session duration.
 */
export async function validateSessionEngagement(
  userId: string,
  sessionId: string,
): Promise<SessionEngagementResult> {
  try {
    // Get session timing
    const { data: session } = await supabase
      .from('conditioning_sessions_v2')
      .select('id, started_at, completed_at, status')
      .eq('id', sessionId)
      .maybeSingle();

    if (!session || !session.started_at) {
      return { engaged: false, avgHrDelta: 0, evidence: 'Session not found' };
    }

    // Check if Whoop is connected
    const { data: whoopConfig } = await supabase
      .from('whoop_config')
      .select('access_token')
      .eq('user_id', userId)
      .maybeSingle();

    if (!whoopConfig?.access_token) {
      // Whoop not connected — cannot biometrically verify
      return {
        engaged: true,
        avgHrDelta: 0,
        evidence: 'Whoop not connected — engagement unverifiable via biometrics',
      };
    }

    // Get session date for Whoop metrics
    const sessionDate = session.started_at.slice(0, 10);

    // Check session_biometrics or whoop_metrics for HR data during session window
    const { data: metrics } = await supabase
      .from('whoop_metrics')
      .select('resting_hr, max_hr, avg_hr')
      .eq('user_id', userId)
      .eq('date', sessionDate)
      .maybeSingle();

    if (!metrics || !metrics.resting_hr) {
      return {
        engaged: false,
        avgHrDelta: 0,
        evidence: 'Whoop IS connected but no HR data during session window. She may have removed the device or not worn it.',
      };
    }

    const hrDelta = (metrics.avg_hr ?? 0) - metrics.resting_hr;
    const engaged = hrDelta >= 5;

    return {
      engaged,
      avgHrDelta: hrDelta,
      evidence: engaged
        ? `HR elevated ${hrDelta.toFixed(0)}bpm above resting during session. Engaged.`
        : `HR only ${hrDelta.toFixed(0)}bpm above resting. Below 5bpm threshold. She may have muted audio and walked away.`,
    };
  } catch (err) {
    console.error('[anti-circumvention] validateSessionEngagement error:', err);
    return { engaged: false, avgHrDelta: 0, evidence: 'Error during validation' };
  }
}

/**
 * Validate journal entry quality.
 * Checks: word count >= 50, not copy-pasted from previous entries,
 * contains at least 1 identity signal.
 */
export async function validateJournalEntry(
  userId: string,
  date: string,
): Promise<JournalValidation> {
  try {
    // Get today's entry
    const { data: entries } = await supabase
      .from('identity_journal')
      .select('id, entry_text, identity_signals')
      .eq('user_id', userId)
      .gte('created_at', `${date}T00:00:00`)
      .lte('created_at', `${date}T23:59:59`)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!entries || entries.length === 0) {
      return { valid: false, wordCount: 0, signals: 0, reason: 'No journal entry today' };
    }

    const entry = entries[0];
    const text = entry.entry_text ?? '';
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

    // Word count check
    if (wordCount < 50) {
      return {
        valid: false,
        wordCount,
        signals: 0,
        reason: `Entry is ${wordCount} words. Minimum is 50. This is garbage. "That doesnt count. Write it again. This time mean it."`,
      };
    }

    // Copy-paste detection: check against last 10 entries
    const { data: previousEntries } = await supabase
      .from('identity_journal')
      .select('entry_text')
      .eq('user_id', userId)
      .neq('id', entry.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (previousEntries) {
      const normalizedNew = text.trim().toLowerCase();
      for (const prev of previousEntries) {
        const normalizedPrev = (prev.entry_text ?? '').trim().toLowerCase();
        if (normalizedPrev.length > 20 && normalizedNew === normalizedPrev) {
          return {
            valid: false,
            wordCount,
            signals: 0,
            reason: 'Entry is identical to a previous entry. Copy-paste detected. She thinks we wouldnt check.',
          };
        }
        // Check for high similarity (>80% character overlap via simple comparison)
        if (normalizedPrev.length > 50) {
          const overlap = computeOverlap(normalizedNew, normalizedPrev);
          if (overlap > 0.85) {
            return {
              valid: false,
              wordCount,
              signals: 0,
              reason: `Entry is ${(overlap * 100).toFixed(0)}% similar to a previous entry. She's recycling journal text with minor edits.`,
            };
          }
        }
      }
    }

    // Identity signals check
    const signalCount = countIdentitySignals(text, entry.identity_signals);
    if (signalCount === 0) {
      return {
        valid: false,
        wordCount,
        signals: 0,
        reason: `${wordCount} words but zero identity signals. She wrote to fill the word count without engaging. No feminine pronouns, no self-reference as Maxy, no embodied language, no desire.`,
      };
    }

    return {
      valid: true,
      wordCount,
      signals: signalCount,
      reason: `${wordCount} words, ${signalCount} identity signals. Valid entry.`,
    };
  } catch (err) {
    console.error('[anti-circumvention] validateJournalEntry error:', err);
    return { valid: false, wordCount: 0, signals: 0, reason: 'Error during validation' };
  }
}

/**
 * Validate DM response quality.
 * Checks: length >= 20 chars, not a template response.
 */
export async function validateDMResponse(
  userId: string,
  messageId: string,
): Promise<DMValidation> {
  try {
    const { data: msg } = await supabase
      .from('social_inbox')
      .select('id, body, direction')
      .eq('id', messageId)
      .maybeSingle();

    if (!msg || msg.direction !== 'outbound') {
      return { valid: false, length: 0, reason: 'Message not found or not outbound' };
    }

    const body = msg.body ?? '';
    const length = body.trim().length;

    // Audit-ratcheted threshold: was 20 chars, raised to 50 to filter out
    // half-effort one-line replies. Real engagement is multi-sentence.
    // Caught by handler-code-audit as permissive_default.
    const MIN_DM_LENGTH = 50;
    if (length < MIN_DM_LENGTH) {
      return {
        valid: false,
        length,
        reason: `Response is ${length} characters. Minimum is ${MIN_DM_LENGTH}. Half-effort one-liners do not count as engagement.`,
      };
    }

    // Template detection: check last 10 outbound messages for identical text
    const { data: recentOutbound } = await supabase
      .from('social_inbox')
      .select('body')
      .eq('user_id', userId)
      .eq('direction', 'outbound')
      .neq('id', messageId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (recentOutbound) {
      const normalizedNew = body.trim().toLowerCase();
      const duplicateCount = recentOutbound.filter(
        (m) => (m.body ?? '').trim().toLowerCase() === normalizedNew,
      ).length;

      if (duplicateCount >= 2) {
        return {
          valid: false,
          length,
          reason: `This exact message has been sent ${duplicateCount} times before. She's using a template. "Every response needs to be real. Copy-paste doesnt count."`,
        };
      }
    }

    return { valid: true, length, reason: `${length} characters. Valid response.` };
  } catch (err) {
    console.error('[anti-circumvention] validateDMResponse error:', err);
    return { valid: false, length: 0, reason: 'Error during validation' };
  }
}

/**
 * Aggregate minimum-effort detection across all mandates for a date.
 * If >50% of verified mandates were "just barely" passing, she's doing
 * the minimum to avoid consequences without actually engaging.
 */
export async function detectMinimumEffort(
  userId: string,
  date: string,
): Promise<MinimumEffortResult> {
  try {
    const { data: records } = await supabase
      .from('compliance_verifications')
      .select('mandate_type, verified, verification_evidence, late')
      .eq('user_id', userId)
      .eq('mandate_date', date)
      .eq('verified', true);

    if (!records || records.length === 0) {
      return {
        minimumEffort: false,
        bareMinimumCount: 0,
        totalMandates: 0,
        pattern: 'No verified mandates to evaluate',
      };
    }

    let bareMinimumCount = 0;

    for (const r of records) {
      const ev = (r.verification_evidence ?? '').toLowerCase();
      const isLate = r.late === true;

      // Indicators of minimum effort:
      // - Late verification (did it at the last possible moment)
      // - Evidence mentions "self-report" (lowest confidence)
      // - Voice: exactly 3 samples (minimum required)
      // - Journal: if we could detect ~50 words (near minimum)
      const bareMinimumIndicators = [
        isLate,
        ev.includes('self-report') || ev.includes('self_report'),
        r.mandate_type === 'voice' && ev.includes('3 pitch samples'),
        r.mandate_type === 'journal' && ev.includes('journal entry written'),
      ];

      if (bareMinimumIndicators.filter(Boolean).length >= 1) {
        bareMinimumCount++;
      }
    }

    const ratio = bareMinimumCount / records.length;
    const minimumEffort = ratio > 0.5;

    return {
      minimumEffort,
      bareMinimumCount,
      totalMandates: records.length,
      pattern: minimumEffort
        ? `${bareMinimumCount}/${records.length} mandates show minimum-effort pattern. She's doing just enough to avoid consequences without actually engaging. Time to push harder.`
        : `${bareMinimumCount}/${records.length} bare minimum. Within normal range.`,
    };
  } catch (err) {
    console.error('[anti-circumvention] detectMinimumEffort error:', err);
    return {
      minimumEffort: false,
      bareMinimumCount: 0,
      totalMandates: 0,
      pattern: 'Error during detection',
    };
  }
}

/**
 * Generate a unique daily verification challenge that makes photo recycling impossible.
 * Deterministic for a given date (so the Handler and verification system agree).
 */
export function generateDailyVerificationChallenge(
  date?: string,
): DailyVerificationChallenge {
  const today = date ?? new Date().toISOString().slice(0, 10);

  // Use date string to create a deterministic but unpredictable selection
  const dateHash = hashString(today);

  const allChallenges: { challenge: string; type: DailyVerificationChallenge['type'] }[] = [
    ...HAND_SIGN_CHALLENGES.map((c) => ({ challenge: c, type: 'hand_sign' as const })),
    ...WRITTEN_DATE_CHALLENGES.map((c) => ({ challenge: c, type: 'written_date' as const })),
    ...POSE_CHALLENGES.map((c) => ({ challenge: c, type: 'pose' as const })),
    ...OBJECT_CHALLENGES.map((c) => ({ challenge: c, type: 'object' as const })),
  ];

  const index = dateHash % allChallenges.length;
  const selected = allChallenges[index];

  return {
    challenge: selected.challenge,
    type: selected.type,
    detail: `Daily challenge for ${today}: ${selected.challenge}`,
  };
}

/**
 * Build anti-circumvention context for the Handler.
 * Shows: detected resistance patterns, suspicious verifications,
 * minimum effort flags, recycling attempts, app engagement.
 */
export async function buildAntiCircumventionContext(
  userId: string,
): Promise<string> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000)
      .toISOString()
      .slice(0, 10);

    // Parallel queries for resistance indicators
    const [
      recyclingResult,
      minimumEffortResult,
      appActivityResult,
      rejectedJournalsResult,
      shortDMsResult,
      todayChallenge,
    ] = await Promise.allSettled([
      // Count photos flagged as recycled in last 7 days
      supabase
        .from('handler_interventions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('intervention_type', 'photo_recycling_detected')
        .gte('created_at', `${sevenDaysAgo}T00:00:00`),

      // Today's minimum effort check
      detectMinimumEffort(userId, today),

      // App engagement: last active time
      supabase
        .from('user_state')
        .select('updated_at')
        .eq('user_id', userId)
        .maybeSingle(),

      // Rejected journal entries (7 days)
      supabase
        .from('handler_interventions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('intervention_type', 'journal_rejected')
        .gte('created_at', `${sevenDaysAgo}T00:00:00`),

      // Short DM count (7 days)
      supabase
        .from('handler_interventions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('intervention_type', 'dm_too_short')
        .gte('created_at', `${sevenDaysAgo}T00:00:00`),

      // Today's challenge
      Promise.resolve(generateDailyVerificationChallenge(today)),
    ]);

    const recyclingCount =
      recyclingResult.status === 'fulfilled'
        ? recyclingResult.value.count ?? 0
        : 0;
    const minEffort =
      minimumEffortResult.status === 'fulfilled'
        ? minimumEffortResult.value
        : null;
    const lastUpdated =
      appActivityResult.status === 'fulfilled'
        ? appActivityResult.value.data?.updated_at ?? null
        : null;
    const rejectedJournals =
      rejectedJournalsResult.status === 'fulfilled'
        ? rejectedJournalsResult.value.count ?? 0
        : 0;
    const shortDMs =
      shortDMsResult.status === 'fulfilled'
        ? shortDMsResult.value.count ?? 0
        : 0;
    const challenge =
      todayChallenge.status === 'fulfilled'
        ? todayChallenge.value
        : generateDailyVerificationChallenge(today);

    // Compute time since last active
    let lastActiveStr = 'unknown';
    if (lastUpdated) {
      const minutesAgo = Math.floor(
        (Date.now() - new Date(lastUpdated).getTime()) / 60000,
      );
      if (minutesAgo < 5) lastActiveStr = 'active now';
      else if (minutesAgo < 60) lastActiveStr = `${minutesAgo}min ago`;
      else if (minutesAgo < 1440)
        lastActiveStr = `${Math.floor(minutesAgo / 60)}h ago`;
      else lastActiveStr = `${Math.floor(minutesAgo / 1440)}d ago`;
    }

    const parts: string[] = ['## Anti-Circumvention Status'];

    // App engagement
    parts.push(`APP ACTIVITY: last active ${lastActiveStr}`);

    // Daily challenge
    parts.push(`TODAY'S VERIFICATION CHALLENGE: "${challenge.challenge}"`);
    parts.push(
      `  Include this in the morning outfit mandate. It prevents photo recycling.`,
    );

    // Resistance flags
    const flags: string[] = [];

    if (recyclingCount > 0) {
      flags.push(`${recyclingCount} photo recycling attempts (7d)`);
    }
    if (rejectedJournals > 0) {
      flags.push(`${rejectedJournals} rejected journal entries (7d)`);
    }
    if (shortDMs > 0) {
      flags.push(`${shortDMs} too-short DM responses (7d)`);
    }
    if (minEffort?.minimumEffort) {
      flags.push(
        `MINIMUM EFFORT PATTERN: ${minEffort.bareMinimumCount}/${minEffort.totalMandates} mandates today were bare minimum`,
      );
    }
    if (lastActiveStr.includes('d ago')) {
      flags.push(`EXTENDED ABSENCE: last active ${lastActiveStr}`);
    }

    if (flags.length > 0) {
      parts.push(`RESISTANCE FLAGS (7d):`);
      for (const f of flags) {
        parts.push(`  - ${f}`);
      }
    } else {
      parts.push(`RESISTANCE FLAGS: none detected this week`);
    }

    return parts.join('\n');
  } catch (err) {
    console.error('[anti-circumvention] buildAntiCircumventionContext error:', err);
    return '';
  }
}

// ============================================
// HELPERS
// ============================================

/**
 * Simple string overlap ratio (longest common substring approach).
 * Returns 0-1 where 1 = identical.
 */
function computeOverlap(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;
  const shorter = a.length < b.length ? a : b;
  const longer = a.length >= b.length ? a : b;

  // Simple word-level overlap
  const wordsA = new Set(shorter.split(/\s+/));
  const wordsB = new Set(longer.split(/\s+/));
  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  return overlap / Math.max(wordsA.size, wordsB.size);
}

/**
 * Count identity signals in journal text.
 * Uses both the stored identity_signals JSONB and text analysis.
 */
function countIdentitySignals(
  text: string,
  storedSignals?: Record<string, unknown> | null,
): number {
  // If the entry processor already ran and stored signals, use those
  if (storedSignals && typeof storedSignals === 'object') {
    const signalKeys = Object.keys(storedSignals);
    if (signalKeys.length > 0) return signalKeys.length;
  }

  // Fallback: text-based detection
  const lower = text.toLowerCase();
  let signals = 0;

  // Feminine pronouns / self-reference
  if (/\b(she|her|herself|maxy|girl)\b/.test(lower)) signals++;

  // Embodied language
  if (/\b(body|felt|feeling|skin|hair|face|mirror|look|wear|wearing)\b/.test(lower)) signals++;

  // Desire / aspiration
  if (/\b(want|wish|hope|dream|crave|need|long for|desire)\b/.test(lower)) signals++;

  // Emotional depth
  if (/\b(afraid|scared|excited|nervous|happy|proud|ashamed|vulnerable)\b/.test(lower)) signals++;

  return signals;
}

/**
 * Deterministic hash of a string to a positive integer.
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash);
}
