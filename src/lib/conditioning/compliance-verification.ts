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

    // Update vault_photo_id on the verification record
    await supabase
      .from('compliance_verifications')
      .update({ vault_photo_id: photo.id })
      .eq('user_id', userId)
      .eq('mandate_type', 'outfit')
      .eq('mandate_date', date);

    return {
      verified: true,
      confidence: 'high',
      evidence: `Vault photo submitted at ${time}`,
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
  // Check voice_pitch_samples for 3+ samples today
  const { data: samples } = await supabase
    .from('voice_pitch_samples')
    .select('id, context, duration_seconds, pitch_hz')
    .eq('user_id', userId)
    .gte('created_at', `${date}T00:00:00`)
    .lte('created_at', `${date}T23:59:59`);

  if (!samples || samples.length < 3) {
    return {
      verified: false,
      confidence: 'high',
      evidence: `Only ${samples?.length ?? 0} voice samples today (need 3+)`,
      method: 'audio_detected',
    };
  }

  // Check total duration
  const totalSeconds = samples.reduce(
    (sum, s) => sum + (s.duration_seconds ?? 0),
    0,
  );
  const totalMinutes = Math.round(totalSeconds / 60);

  // Check how many match practice/conversation context
  const practiceCount = samples.filter(
    (s) =>
      s.context === 'practice' ||
      s.context === 'conversation' ||
      s.context === 'drill',
  ).length;

  return {
    verified: true,
    confidence: practiceCount >= 3 ? 'high' : 'medium',
    evidence: `${samples.length} pitch samples, ${totalMinutes}min total, ${practiceCount} practice/conversation`,
    method: 'audio_detected',
  };
}

async function verifyExercise(
  userId: string,
  date: string,
): Promise<VerificationResult> {
  // Check whoop_metrics for strain increase
  const { data: whoop } = await supabase
    .from('whoop_metrics')
    .select('strain, day_strain')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle();

  if (whoop && (whoop.strain >= 2 || whoop.day_strain >= 2)) {
    return {
      verified: true,
      confidence: 'high',
      evidence: `Whoop strain: ${whoop.strain ?? whoop.day_strain}`,
      method: 'biometric_detected',
    };
  }

  // Check whoop_workouts
  const { data: workouts } = await supabase
    .from('whoop_workouts')
    .select('id, sport, strain')
    .eq('user_id', userId)
    .gte('created_at', `${date}T00:00:00`)
    .lte('created_at', `${date}T23:59:59`)
    .limit(1);

  if (workouts && workouts.length > 0) {
    return {
      verified: true,
      confidence: 'high',
      evidence: `Whoop workout logged: ${workouts[0].sport ?? 'exercise'}`,
      method: 'biometric_detected',
    };
  }

  return {
    verified: false,
    confidence: 'high',
    evidence: 'No exercise detected via Whoop',
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
    return {
      verified: true,
      confidence: 'high',
      evidence: `Conditioning session completed: ${sessions[0].session_type}`,
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
  // Check content_posts
  const { data: posts } = await supabase
    .from('content_posts')
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
  const { data: messages } = await supabase
    .from('social_inbox')
    .select('id, direction')
    .eq('user_id', userId)
    .eq('direction', 'outbound')
    .gte('created_at', `${date}T00:00:00`)
    .lte('created_at', `${date}T23:59:59`)
    .limit(1);

  if (messages && messages.length > 0) {
    return {
      verified: true,
      confidence: 'high',
      evidence: 'Outbound social messages sent',
      method: 'session_completed',
    };
  }

  return {
    verified: false,
    confidence: 'medium',
    evidence: 'No outbound social interactions today',
    method: 'session_completed',
  };
}

async function verifyJournal(
  userId: string,
  date: string,
): Promise<VerificationResult> {
  const { data: entries } = await supabase
    .from('identity_journal')
    .select('id')
    .eq('user_id', userId)
    .gte('created_at', `${date}T00:00:00`)
    .lte('created_at', `${date}T23:59:59`)
    .limit(1);

  if (entries && entries.length > 0) {
    return {
      verified: true,
      confidence: 'high',
      evidence: 'Journal entry written',
      method: 'session_completed',
    };
  }

  return {
    verified: false,
    confidence: 'high',
    evidence: 'No journal entry today',
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
