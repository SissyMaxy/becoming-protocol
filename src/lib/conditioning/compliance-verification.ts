/**
 * Compliance Verification System
 *
 * Replaces trust-based self-reporting with evidence-based verification.
 * Each mandate type has a specific verification method: vault photos,
 * Whoop biometrics, voice pitch samples, session records.
 *
 * Tables: compliance_verifications, content_vault, voice_pitch_samples,
 *         whoop_metrics, whoop_workouts, conditioning_sessions_v2,
 *         content_posts, auto_poster_status, social_inbox,
 *         identity_journal, daily_tasks
 */

import { supabase } from '../supabase';
import {
  detectPhotoRecycling,
  validateVoicePractice,
  validateSessionEngagement,
  validateJournalEntry,
  validateDMResponse,
  generateDailyVerificationChallenge,
} from './anti-circumvention';

// ============================================
// TYPES
// ============================================

export interface VerificationResult {
  verified: boolean;
  confidence: 'high' | 'medium' | 'low';
  evidence: string;
  method: string;
}

type MandateType =
  | 'outfit'
  | 'skincare'
  | 'makeup'
  | 'voice'
  | 'exercise'
  | 'conditioning'
  | 'goon'
  | 'content_post'
  | 'social_interaction'
  | 'journal'
  | 'consumption';

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Create a pending verification record for a mandate.
 */
export async function createVerificationRecord(
  userId: string,
  mandateType: string,
  deadline: string | null,
): Promise<string | null> {
  const today = new Date().toISOString().slice(0, 10);

  // Check if already exists for today
  const { data: existing } = await supabase
    .from('compliance_verifications')
    .select('id')
    .eq('user_id', userId)
    .eq('mandate_type', mandateType)
    .eq('mandate_date', today)
    .maybeSingle();

  if (existing) return existing.id;

  const { data } = await supabase
    .from('compliance_verifications')
    .insert({
      user_id: userId,
      mandate_type: mandateType,
      mandate_date: today,
      deadline: deadline ?? null,
    })
    .select('id')
    .single();

  return data?.id ?? null;
}

/**
 * Attempt to verify a mandate using evidence from all available sources.
 */
export async function attemptVerification(
  userId: string,
  mandateType: string,
  date?: string,
): Promise<VerificationResult> {
  const targetDate = date ?? new Date().toISOString().slice(0, 10);

  const verifiers: Record<MandateType, () => Promise<VerificationResult>> = {
    outfit: () => verifyOutfit(userId, targetDate),
    skincare: () => verifySkincare(userId, targetDate),
    makeup: () => verifyMakeup(userId, targetDate),
    voice: () => verifyVoice(userId, targetDate),
    exercise: () => verifyExercise(userId, targetDate),
    conditioning: () => verifyConditioning(userId, targetDate),
    goon: () => verifyGoon(userId, targetDate),
    content_post: () => verifyContentPost(userId, targetDate),
    social_interaction: () => verifySocialInteraction(userId, targetDate),
    journal: () => verifyJournal(userId, targetDate),
    consumption: () => verifyConsumption(userId, targetDate),
  };

  const verifier = verifiers[mandateType as MandateType];
  if (!verifier) {
    return { verified: false, confidence: 'low', evidence: 'Unknown mandate type', method: 'none' };
  }

  const result = await verifier();

  // If verified, update the compliance record
  if (result.verified) {
    const now = new Date().toISOString();
    const deadlineRow = await supabase
      .from('compliance_verifications')
      .select('deadline')
      .eq('user_id', userId)
      .eq('mandate_type', mandateType)
      .eq('mandate_date', targetDate)
      .maybeSingle();

    const isLate =
      deadlineRow.data?.deadline && now > deadlineRow.data.deadline;

    await supabase
      .from('compliance_verifications')
      .update({
        verified: true,
        verification_method: result.method,
        verification_evidence: result.evidence,
        verified_at: now,
        late: isLate ?? false,
      })
      .eq('user_id', userId)
      .eq('mandate_type', mandateType)
      .eq('mandate_date', targetDate);
  }

  return result;
}

/**
 * Run verification sweep for ALL pending mandates today.
 * Fire consequences for unverified mandates past deadline.
 * Called by cron hourly.
 */
export async function runVerificationSweep(userId: string): Promise<{
  verified: number;
  failed: number;
  pending: number;
  consequencesFired: number;
}> {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  const { data: records } = await supabase
    .from('compliance_verifications')
    .select('*')
    .eq('user_id', userId)
    .eq('mandate_date', today)
    .eq('verified', false);

  if (!records || records.length === 0) {
    return { verified: 0, failed: 0, pending: 0, consequencesFired: 0 };
  }

  let verified = 0;
  let failed = 0;
  let pending = 0;
  let consequencesFired = 0;

  for (const record of records) {
    const result = await attemptVerification(userId, record.mandate_type, today);

    if (result.verified) {
      verified++;
    } else if (record.deadline && now > record.deadline) {
      // Past deadline and not verified — consequence
      failed++;
      if (!record.consequence_fired) {
        await supabase
          .from('compliance_verifications')
          .update({
            consequence_fired: true,
            consequence_level: (record.consequence_level ?? 0) + 1,
          })
          .eq('id', record.id);

        // Fire consequence via handler_interventions
        await supabase.from('handler_interventions').insert({
          user_id: userId,
          intervention_type: 'compliance_failure',
          details: {
            mandate_type: record.mandate_type,
            mandate_date: today,
            deadline: record.deadline,
            consequence_level: (record.consequence_level ?? 0) + 1,
          },
        });

        consequencesFired++;
      }
    } else {
      pending++;
    }
  }

  return { verified, failed, pending, consequencesFired };
}

/**
 * Build handler context block for verification status.
 */
export async function buildVerificationContext(userId: string): Promise<string> {
  try {
    const today = new Date().toISOString().slice(0, 10);

    const { data: records } = await supabase
      .from('compliance_verifications')
      .select('*')
      .eq('user_id', userId)
      .eq('mandate_date', today)
      .order('mandate_type');

    if (!records || records.length === 0) return '';

    const verifiedCount = records.filter((r) => r.verified).length;
    const total = records.length;

    const lines: string[] = [`## Compliance Verification`];
    lines.push(`COMPLIANCE TODAY: ${verifiedCount}/${total} mandates verified.`);

    for (const r of records) {
      const deadlineStr = r.deadline
        ? new Date(r.deadline).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          })
        : 'none';

      if (r.verified) {
        const timeStr = r.verified_at
          ? new Date(r.verified_at).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            })
          : '';
        const lateStr = r.late ? ' (LATE)' : '';
        const methodStr = r.verification_method ?? '';
        lines.push(
          `  ${r.mandate_type}: VERIFIED${lateStr} (${methodStr} ${timeStr})`,
        );
      } else if (r.consequence_fired) {
        lines.push(
          `  ${r.mandate_type}: FAILED — consequence fired (L${r.consequence_level ?? 1}). Deadline was ${deadlineStr}.`,
        );
      } else {
        const now = new Date().toISOString();
        const pastDeadline = r.deadline && now > r.deadline;
        if (pastDeadline) {
          lines.push(
            `  ${r.mandate_type}: UNVERIFIED — deadline ${deadlineStr} PASSED. Enforce.`,
          );
        } else {
          lines.push(
            `  ${r.mandate_type}: PENDING (deadline ${deadlineStr})`,
          );
        }
      }
    }

    return lines.join('\n');
  } catch {
    return '';
  }
}

// ============================================
// INDIVIDUAL VERIFIERS
// ============================================

async function verifyOutfit(
  userId: string,
  date: string,
): Promise<VerificationResult> {
  // Check vault for photo tagged 'outfit' or 'clothing' today
  const { data: photos } = await supabase
    .from('content_vault')
    .select('id, tags, created_at')
    .eq('user_id', userId)
    .gte('created_at', `${date}T00:00:00`)
    .lte('created_at', `${date}T23:59:59`)
    .or('tags.cs.{outfit},tags.cs.{clothing},tags.cs.{ootd},tags.cs.{look}');

  if (photos && photos.length > 0) {
    const photo = photos[0];
    const time = new Date(photo.created_at).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });

    // ANTI-CIRCUMVENTION: Check for photo recycling
    const recycleCheck = await detectPhotoRecycling(userId, photo.id);
    if (recycleCheck.recycled) {
      // Log the attempt
      await supabase.from('handler_interventions').insert({
        user_id: userId,
        intervention_type: 'photo_recycling_detected',
        details: {
          photo_id: photo.id,
          matched_photo_id: recycleCheck.matchedPhotoId,
          reason: recycleCheck.reason,
          mandate_type: 'outfit',
          date,
        },
      });

      return {
        verified: false,
        confidence: 'high',
        evidence: `RECYCLED PHOTO DETECTED: ${recycleCheck.reason}`,
        method: 'photo_submitted',
      };
    }

    // ANTI-CIRCUMVENTION: Verify photo created_at is actually today
    const photoDate = photo.created_at?.slice(0, 10);
    if (photoDate !== date) {
      return {
        verified: false,
        confidence: 'high',
        evidence: `Photo created on ${photoDate}, not today (${date}). Old photo submitted.`,
        method: 'photo_submitted',
      };
    }

    // Update vault_photo_id on the verification record
    await supabase
      .from('compliance_verifications')
      .update({ vault_photo_id: photo.id })
      .eq('user_id', userId)
      .eq('mandate_type', 'outfit')
      .eq('mandate_date', date);

    // Include daily challenge in evidence for Handler awareness
    const challenge = generateDailyVerificationChallenge(date);

    return {
      verified: true,
      confidence: 'high',
      evidence: `Vault photo submitted at ${time}. Challenge: "${challenge.challenge}" — Handler must visually confirm.`,
      method: 'photo_submitted',
    };
  }

  return {
    verified: false,
    confidence: 'high',
    evidence: 'No outfit photo in vault today',
    method: 'photo_submitted',
  };
}

async function verifySkincare(
  userId: string,
  date: string,
): Promise<VerificationResult> {
  // Check vault for skincare photo
  const { data: photos } = await supabase
    .from('content_vault')
    .select('id, created_at')
    .eq('user_id', userId)
    .gte('created_at', `${date}T00:00:00`)
    .lte('created_at', `${date}T23:59:59`)
    .or('tags.cs.{skincare},tags.cs.{routine}')
    .limit(1);

  if (photos && photos.length > 0) {
    return {
      verified: true,
      confidence: 'high',
      evidence: 'Skincare photo submitted',
      method: 'photo_submitted',
    };
  }

  // Fallback: check daily_tasks for completion
  const { data: tasks } = await supabase
    .from('daily_tasks')
    .select('id, completed')
    .eq('user_id', userId)
    .eq('date', date)
    .ilike('task_name', '%skincare%')
    .eq('completed', true)
    .limit(1);

  if (tasks && tasks.length > 0) {
    return {
      verified: true,
      confidence: 'medium',
      evidence: 'Skincare task marked complete (self-report)',
      method: 'self_report',
    };
  }

  return {
    verified: false,
    confidence: 'medium',
    evidence: 'No skincare evidence found',
    method: 'photo_submitted',
  };
}

async function verifyMakeup(
  userId: string,
  date: string,
): Promise<VerificationResult> {
  const { data: photos } = await supabase
    .from('content_vault')
    .select('id, created_at')
    .eq('user_id', userId)
    .gte('created_at', `${date}T00:00:00`)
    .lte('created_at', `${date}T23:59:59`)
    .or('tags.cs.{makeup},tags.cs.{face},tags.cs.{glam}')
    .limit(1);

  if (photos && photos.length > 0) {
    return {
      verified: true,
      confidence: 'high',
      evidence: 'Makeup photo submitted',
      method: 'photo_submitted',
    };
  }

  return {
    verified: false,
    confidence: 'high',
    evidence: 'No makeup photo in vault today',
    method: 'photo_submitted',
  };
}

async function verifyVoice(
  userId: string,
  date: string,
): Promise<VerificationResult> {
  // ANTI-CIRCUMVENTION: Full voice practice validation
  // Checks continuity, pitch variance, duration — not just sample count
  const validation = await validateVoicePractice(userId, date, 10);

  if (validation.suspicious) {
    // Log suspicious voice practice
    await supabase.from('handler_interventions').insert({
      user_id: userId,
      intervention_type: 'suspicious_voice_practice',
      details: {
        date,
        variance: validation.variance,
        duration: validation.duration,
        reason: validation.reason,
      },
    });

    return {
      verified: false,
      confidence: 'high',
      evidence: `SUSPICIOUS: ${validation.reason}`,
      method: 'audio_detected',
    };
  }

  if (!validation.valid) {
    return {
      verified: false,
      confidence: 'high',
      evidence: validation.reason,
      method: 'audio_detected',
    };
  }

  return {
    verified: true,
    confidence: 'high',
    evidence: validation.reason,
    method: 'audio_detected',
  };
}

async function verifyExercise(
  userId: string,
  date: string,
): Promise<VerificationResult> {
  // Check if Whoop is connected
  const { data: whoopConfig } = await supabase
    .from('whoop_config')
    .select('access_token')
    .eq('user_id', userId)
    .maybeSingle();

  const whoopConnected = !!whoopConfig?.access_token;

  // Check whoop_metrics for strain increase
  const { data: whoop } = await supabase
    .from('whoop_metrics')
    .select('strain, day_strain')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();

  // ANTI-CIRCUMVENTION: Require strain delta >= 2.0 when Whoop connected
  if (whoopConnected) {
    const strain = whoop?.strain ?? whoop?.day_strain ?? 0;
    if (strain >= 2) {
      return {
        verified: true,
        confidence: 'high',
        evidence: `Whoop strain: ${strain}. Biometrically confirmed.`,
        method: 'biometric_detected',
      };
    }

    // Check whoop_workouts as fallback
    const { data: workouts } = await supabase
      .from('whoop_workouts')
      .select('id, sport, strain')
      .eq('user_id', userId)
      .gte('created_at', `${date}T00:00:00`)
      .lte('created_at', `${date}T23:59:59`)
      .limit(1);

    if (workouts && workouts.length > 0 && (workouts[0].strain ?? 0) >= 2) {
      return {
        verified: true,
        confidence: 'high',
        evidence: `Whoop workout: ${workouts[0].sport ?? 'exercise'}, strain ${workouts[0].strain}`,
        method: 'biometric_detected',
      };
    }

    // Whoop connected but no strain = she didn't exercise or she removed the device
    return {
      verified: false,
      confidence: 'high',
      evidence: `Whoop IS connected but strain is ${strain.toFixed(1)} (need 2.0+). Self-report alone not accepted when Whoop is available. Either she didnt exercise or she removed the band.`,
      method: 'biometric_detected',
    };
  }

  // Whoop NOT connected — fall back to self-report with low confidence
  const { data: tasks } = await supabase
    .from('daily_tasks')
    .select('id, completed')
    .eq('user_id', userId)
    .ilike('title', '%exercise%')
    .eq('completed', true)
    .gte('created_at', `${date}T00:00:00`)
    .lte('created_at', `${date}T23:59:59`)
    .limit(1);

  if (tasks && tasks.length > 0) {
    return {
      verified: true,
      confidence: 'low',
      evidence: 'Exercise self-reported (no Whoop verification). Low confidence — self-report alone is unverifiable.',
      method: 'self_report',
    };
  }

  return {
    verified: false,
    confidence: 'high',
    evidence: 'No exercise detected. No Whoop data, no self-report.',
    method: 'biometric_detected',
  };
}

async function verifyConditioning(
  userId: string,
  date: string,
): Promise<VerificationResult> {
  const { data: sessions } = await supabase
    .from('conditioning_sessions_v2')
    .select('id, session_type, status')
    .eq('user_id', userId)
    .gte('created_at', `${date}T00:00:00`)
    .lte('created_at', `${date}T23:59:59`)
    .eq('status', 'completed')
    .limit(1);

  if (sessions && sessions.length > 0) {
    // ANTI-CIRCUMVENTION: Check biometric engagement via Whoop
    const engagement = await validateSessionEngagement(userId, sessions[0].id);

    if (!engagement.engaged && engagement.avgHrDelta === 0 && engagement.evidence.includes('Whoop IS connected')) {
      // Whoop connected but no HR change — she didn't engage
      return {
        verified: false,
        confidence: 'high',
        evidence: `Session "${sessions[0].session_type}" marked complete but ${engagement.evidence}`,
        method: 'session_completed',
      };
    }

    const engagementNote = engagement.avgHrDelta > 0
      ? ` HR delta: +${engagement.avgHrDelta.toFixed(0)}bpm.`
      : '';

    return {
      verified: true,
      confidence: engagement.engaged ? 'high' : 'medium',
      evidence: `Conditioning session completed: ${sessions[0].session_type}.${engagementNote}`,
      method: 'session_completed',
    };
  }

  return {
    verified: false,
    confidence: 'high',
    evidence: 'No completed conditioning session today',
    method: 'session_completed',
  };
}

async function verifyGoon(
  userId: string,
  date: string,
): Promise<VerificationResult> {
  const { data: sessions } = await supabase
    .from('conditioning_sessions_v2')
    .select('id, session_type, status')
    .eq('user_id', userId)
    .gte('created_at', `${date}T00:00:00`)
    .lte('created_at', `${date}T23:59:59`)
    .eq('status', 'completed')
    .in('session_type', ['goon', 'edge', 'goon_edge'])
    .limit(1);

  if (sessions && sessions.length > 0) {
    return {
      verified: true,
      confidence: 'high',
      evidence: `Goon/edge session completed: ${sessions[0].session_type}`,
      method: 'session_completed',
    };
  }

  return {
    verified: false,
    confidence: 'high',
    evidence: 'No goon/edge session today',
    method: 'session_completed',
  };
}

async function verifyContentPost(
  userId: string,
  date: string,
): Promise<VerificationResult> {
  // Check ai_generated_content (unified post table)
  const { data: posts } = await supabase
    .from('ai_generated_content')
    .select('id')
    .eq('user_id', userId)
    .gte('created_at', `${date}T00:00:00`)
    .lte('created_at', `${date}T23:59:59`)
    .limit(1);

  if (posts && posts.length > 0) {
    return {
      verified: true,
      confidence: 'high',
      evidence: 'Content post published',
      method: 'session_completed',
    };
  }

  // Check auto_poster_status
  const { data: autoPosts } = await supabase
    .from('auto_poster_status')
    .select('id')
    .eq('user_id', userId)
    .gte('posted_at', `${date}T00:00:00`)
    .lte('posted_at', `${date}T23:59:59`)
    .limit(1);

  if (autoPosts && autoPosts.length > 0) {
    return {
      verified: true,
      confidence: 'high',
      evidence: 'Auto-poster published content',
      method: 'session_completed',
    };
  }

  return {
    verified: false,
    confidence: 'high',
    evidence: 'No content posted today',
    method: 'session_completed',
  };
}

async function verifySocialInteraction(
  userId: string,
  date: string,
): Promise<VerificationResult> {
  // Get outbound messages for today
  const { data: messages } = await supabase
    .from('social_inbox')
    .select('id, direction, body')
    .eq('user_id', userId)
    .eq('direction', 'outbound')
    .gte('created_at', `${date}T00:00:00`)
    .lte('created_at', `${date}T23:59:59`);

  if (!messages || messages.length === 0) {
    return {
      verified: false,
      confidence: 'medium',
      evidence: 'No outbound social interactions today',
      method: 'session_completed',
    };
  }

  // ANTI-CIRCUMVENTION: Check message quality (length + template detection)
  let validCount = 0;
  let tooShortCount = 0;

  for (const msg of messages) {
    const dmCheck = await validateDMResponse(userId, msg.id);
    if (dmCheck.valid) {
      validCount++;
    } else {
      tooShortCount++;
      // Log short DMs
      if ((msg.body ?? '').trim().length < 20) {
        await supabase.from('handler_interventions').insert({
          user_id: userId,
          intervention_type: 'dm_too_short',
          details: {
            message_id: msg.id,
            length: (msg.body ?? '').trim().length,
            date,
          },
        });
      }
    }
  }

  if (validCount > 0) {
    const evidence = tooShortCount > 0
      ? `${validCount} valid DMs sent. ${tooShortCount} too short (< 20 chars) and rejected.`
      : `${validCount} valid DMs sent.`;

    return {
      verified: true,
      confidence: 'high',
      evidence,
      method: 'session_completed',
    };
  }

  return {
    verified: false,
    confidence: 'high',
    evidence: `${messages.length} DMs sent but ALL were under 20 characters. One-word responses dont count as social engagement.`,
    method: 'session_completed',
  };
}

async function verifyJournal(
  userId: string,
  date: string,
): Promise<VerificationResult> {
  // ANTI-CIRCUMVENTION: Full journal validation (word count, copy-paste, identity signals)
  const validation = await validateJournalEntry(userId, date);

  if (!validation.valid) {
    // Log rejection if entry exists but was rejected
    if (validation.wordCount > 0) {
      await supabase.from('handler_interventions').insert({
        user_id: userId,
        intervention_type: 'journal_rejected',
        details: {
          date,
          wordCount: validation.wordCount,
          signals: validation.signals,
          reason: validation.reason,
        },
      });
    }

    return {
      verified: false,
      confidence: 'high',
      evidence: validation.reason,
      method: 'session_completed',
    };
  }

  return {
    verified: true,
    confidence: 'high',
    evidence: `Journal: ${validation.wordCount} words, ${validation.signals} identity signals. Accepted.`,
    method: 'session_completed',
  };
}

async function verifyConsumption(
  userId: string,
  date: string,
): Promise<VerificationResult> {
  const { data: sessions } = await supabase
    .from('conditioning_sessions_v2')
    .select('id, session_type, status')
    .eq('user_id', userId)
    .gte('created_at', `${date}T00:00:00`)
    .lte('created_at', `${date}T23:59:59`)
    .eq('status', 'completed')
    .limit(1);

  if (sessions && sessions.length > 0) {
    return {
      verified: true,
      confidence: 'high',
      evidence: `Consumption session completed: ${sessions[0].session_type}`,
      method: 'session_completed',
    };
  }

  return {
    verified: false,
    confidence: 'high',
    evidence: 'No consumption sessions today',
    method: 'session_completed',
  };
}
