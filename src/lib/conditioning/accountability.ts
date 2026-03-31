/**
 * Accountability Verification — P11.9
 *
 * Evidence-based task completion verification. Instead of trusting
 * self-reports, checks actual data sources per domain: voice samples,
 * Whoop metrics, vault photos, journal entries, conditioning sessions.
 *
 * Tables: voice_pitch_samples, whoop_metrics, whoop_workouts, vault,
 *         identity_journal, conditioning_sessions_v2, daily_tasks
 */

import { supabase } from '../supabase';

// ============================================
// TYPES
// ============================================

type VerificationDomain =
  | 'voice'
  | 'exercise'
  | 'skincare'
  | 'makeup'
  | 'style'
  | 'journaling'
  | 'conditioning'
  | 'general';

type Confidence = 'high' | 'medium' | 'low';

interface TaskVerification {
  verified: boolean;
  evidence: string;
  confidence: Confidence;
  method: string;
}

interface DailyTask {
  taskId: string;
  domain: VerificationDomain;
  prescribed: string;
  verified: boolean;
  evidence: string;
}

interface DailyAccountabilityReport {
  tasks: DailyTask[];
  verificationRate: number;
  unverifiedTasks: string[];
}

// ============================================
// VERIFICATION FUNCTIONS (PER DOMAIN)
// ============================================

async function verifyVoice(userId: string): Promise<TaskVerification> {
  const twoHoursAgo = new Date(Date.now() - 2 * 3600000).toISOString();

  const { data: samples } = await supabase
    .from('voice_pitch_samples')
    .select('id, avg_pitch_hz, duration_seconds, created_at')
    .eq('user_id', userId)
    .gte('created_at', twoHoursAgo)
    .order('created_at', { ascending: false })
    .limit(50);

  if (!samples || samples.length === 0) {
    return { verified: false, evidence: 'No pitch samples in last 2 hours', confidence: 'high', method: 'voice_pitch_samples query' };
  }

  const totalDuration = samples.reduce((s, r) => s + (r.duration_seconds ?? 0), 0);
  const avgPitch = samples.reduce((s, r) => s + (r.avg_pitch_hz ?? 0), 0) / samples.length;
  const durationMin = (totalDuration / 60).toFixed(1);

  return {
    verified: true,
    evidence: `${samples.length} pitch samples, avg ${avgPitch.toFixed(0)}Hz, ${durationMin} min cluster`,
    confidence: samples.length >= 5 ? 'high' : 'medium',
    method: 'voice_pitch_samples query',
  };
}

async function verifyExercise(userId: string): Promise<TaskVerification> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStr = todayStart.toISOString();

  const [metricsResult, workoutsResult] = await Promise.allSettled([
    supabase
      .from('whoop_metrics')
      .select('strain, created_at')
      .eq('user_id', userId)
      .gte('created_at', todayStr)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('whoop_workouts')
      .select('id, sport_name, strain, created_at')
      .eq('user_id', userId)
      .gte('created_at', todayStr)
      .limit(5),
  ]);

  const metrics = metricsResult.status === 'fulfilled' ? (metricsResult.value.data ?? []) : [];
  const workouts = workoutsResult.status === 'fulfilled' ? (workoutsResult.value.data ?? []) : [];

  if (workouts.length > 0) {
    const workoutNames = workouts.map(w => w.sport_name ?? 'workout').join(', ');
    const totalStrain = workouts.reduce((s, w) => s + (w.strain ?? 0), 0);
    return {
      verified: true,
      evidence: `Whoop workout logged: ${workoutNames}, strain +${totalStrain.toFixed(1)}`,
      confidence: 'high',
      method: 'whoop_workouts + whoop_metrics',
    };
  }

  if (metrics.length >= 2) {
    const strains = metrics.map(m => m.strain ?? 0);
    const delta = Math.max(...strains) - Math.min(...strains);
    if (delta > 1.5) {
      return {
        verified: true,
        evidence: `Whoop strain delta +${delta.toFixed(1)} today (no explicit workout logged)`,
        confidence: 'medium',
        method: 'whoop_metrics strain delta',
      };
    }
  }

  return { verified: false, evidence: 'No workout logged and no significant strain delta', confidence: 'high', method: 'whoop_workouts + whoop_metrics' };
}

async function verifyVaultPhoto(userId: string, tag: string): Promise<TaskVerification> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStr = todayStart.toISOString();

  const { data: photos } = await supabase
    .from('vault')
    .select('id, tags, created_at')
    .eq('user_id', userId)
    .gte('created_at', todayStr)
    .limit(50);

  if (!photos || photos.length === 0) {
    return { verified: false, evidence: `No vault photos today`, confidence: 'high', method: `vault query for '${tag}' tag` };
  }

  // Check for matching tag in JSONB tags array or comma-separated string
  const matched = photos.filter(p => {
    if (!p.tags) return false;
    if (Array.isArray(p.tags)) return p.tags.some((t: string) => t.toLowerCase().includes(tag));
    if (typeof p.tags === 'string') return p.tags.toLowerCase().includes(tag);
    return false;
  });

  if (matched.length === 0) {
    return { verified: false, evidence: `${photos.length} vault photos today but none tagged '${tag}'`, confidence: 'medium', method: `vault query for '${tag}' tag` };
  }

  const time = new Date(matched[0].created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return {
    verified: true,
    evidence: `Vault photo tagged '${tag}' at ${time}`,
    confidence: 'high',
    method: `vault query for '${tag}' tag`,
  };
}

async function verifyJournaling(userId: string): Promise<TaskVerification> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStr = todayStart.toISOString();

  const { data: entries } = await supabase
    .from('identity_journal')
    .select('id, created_at')
    .eq('user_id', userId)
    .gte('created_at', todayStr)
    .limit(1);

  if (!entries || entries.length === 0) {
    return { verified: false, evidence: 'No journal entry today', confidence: 'high', method: 'identity_journal query' };
  }

  const time = new Date(entries[0].created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return { verified: true, evidence: `Journal entry at ${time}`, confidence: 'high', method: 'identity_journal query' };
}

async function verifyConditioning(userId: string): Promise<TaskVerification> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStr = todayStart.toISOString();

  const { data: sessions } = await supabase
    .from('conditioning_sessions_v2')
    .select('id, session_type, completed, created_at')
    .eq('user_id', userId)
    .gte('created_at', todayStr)
    .limit(5);

  if (!sessions || sessions.length === 0) {
    return { verified: false, evidence: 'No conditioning session today', confidence: 'high', method: 'conditioning_sessions_v2 query' };
  }

  const completed = sessions.filter(s => s.completed);
  if (completed.length === 0) {
    return { verified: false, evidence: `${sessions.length} session(s) started but none completed`, confidence: 'medium', method: 'conditioning_sessions_v2 query' };
  }

  const types = completed.map(s => s.session_type ?? 'session').join(', ');
  return { verified: true, evidence: `${completed.length} session(s) completed: ${types}`, confidence: 'high', method: 'conditioning_sessions_v2 query' };
}

async function verifyGeneral(userId: string, taskId: string): Promise<TaskVerification> {
  const { data: task } = await supabase
    .from('daily_tasks')
    .select('id, completed, completed_at')
    .eq('user_id', userId)
    .eq('id', taskId)
    .maybeSingle();

  if (!task) {
    return { verified: false, evidence: 'Task not found in daily_tasks', confidence: 'low', method: 'daily_tasks query' };
  }

  if (task.completed) {
    const time = task.completed_at
      ? new Date(task.completed_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : 'unknown time';
    return { verified: true, evidence: `Marked completed at ${time} (self-reported)`, confidence: 'low', method: 'daily_tasks self-report' };
  }

  return { verified: false, evidence: 'Task not marked completed', confidence: 'high', method: 'daily_tasks query' };
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Verify a single task's completion by checking domain-specific evidence.
 */
export async function verifyTaskCompletion(
  userId: string,
  taskId: string,
  domain: VerificationDomain
): Promise<TaskVerification> {
  try {
    switch (domain) {
      case 'voice':
        return await verifyVoice(userId);
      case 'exercise':
        return await verifyExercise(userId);
      case 'skincare':
        return await verifyVaultPhoto(userId, 'skincare');
      case 'makeup':
        return await verifyVaultPhoto(userId, 'makeup');
      case 'style':
        return await verifyVaultPhoto(userId, 'outfit');
      case 'journaling':
        return await verifyJournaling(userId);
      case 'conditioning':
        return await verifyConditioning(userId);
      case 'general':
        return await verifyGeneral(userId, taskId);
      default:
        return { verified: false, evidence: `Unknown domain: ${domain}`, confidence: 'low', method: 'none' };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return { verified: false, evidence: `Verification error: ${msg}`, confidence: 'low', method: 'error' };
  }
}

/**
 * Generate a full daily accountability report — check evidence for all prescribed tasks.
 */
export async function getDailyAccountabilityReport(userId: string): Promise<DailyAccountabilityReport> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStr = todayStart.toISOString();

  // Get today's prescribed tasks
  const { data: tasks } = await supabase
    .from('daily_tasks')
    .select('id, domain, title, completed')
    .eq('user_id', userId)
    .gte('created_at', todayStr)
    .limit(20);

  if (!tasks || tasks.length === 0) {
    return { tasks: [], verificationRate: 0, unverifiedTasks: [] };
  }

  // Verify each task
  const results: DailyTask[] = [];
  for (const task of tasks) {
    const domain = (task.domain ?? 'general') as VerificationDomain;
    const verification = await verifyTaskCompletion(userId, task.id, domain);
    results.push({
      taskId: task.id,
      domain,
      prescribed: task.title ?? 'untitled',
      verified: verification.verified,
      evidence: verification.evidence,
    });
  }

  const verifiedCount = results.filter(r => r.verified).length;
  const unverified = results.filter(r => !r.verified).map(r => r.prescribed);

  return {
    tasks: results,
    verificationRate: tasks.length > 0 ? verifiedCount / tasks.length : 0,
    unverifiedTasks: unverified,
  };
}

// ============================================
// HANDLER CONTEXT BUILDER
// ============================================

/**
 * Build accountability context block for Handler system prompt.
 */
export async function buildAccountabilityContext(userId: string): Promise<string> {
  try {
    const report = await getDailyAccountabilityReport(userId);

    if (report.tasks.length === 0) return '';

    const verified = report.tasks.filter(t => t.verified).length;
    const total = report.tasks.length;
    const lines: string[] = [`ACCOUNTABILITY: ${verified}/${total} tasks verified today.`];

    for (const task of report.tasks) {
      const status = task.verified ? 'VERIFIED' : 'UNVERIFIED';
      lines.push(`  ${capitalize(task.domain)}: ${status} (${task.evidence}).`);
    }

    if (report.unverifiedTasks.length > 0) {
      lines.push(`  Missing evidence for: ${report.unverifiedTasks.join(', ')}.`);
    }

    return lines.join('\n');
  } catch {
    return '';
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
