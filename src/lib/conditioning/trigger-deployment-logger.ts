/**
 * Trigger Deployment Logger
 *
 * Tracks every trigger deployment with context, biometric state, and effectiveness.
 * All writes are fire-and-forget — trigger deployment logging never blocks
 * conversation flow or conditioning operations.
 */

import { supabase } from '../supabase';

// ── Types ────────────────────────────────────────────────────────────

export type DeploymentContext =
  | 'conversation'
  | 'ambush'
  | 'session'
  | 'morning_briefing'
  | 'evening_debrief'
  | 'sleep_conditioning'
  | 'micro_pulse'
  | 'proactive_outreach';

export interface DeploymentEvent {
  userId: string;
  triggerId?: string;
  triggerPhrase: string;
  context: DeploymentContext;
  messageId?: string;
}

interface TriggerDeploymentRow {
  trigger_id: string;
  trigger_phrase: string;
  deployment_context: string;
  deployed_at: string;
  effectiveness_score: number | null;
}

interface DeploymentStats {
  triggerPhrase: string;
  totalDeployments: number;
  last7Days: number;
  lastDeployedAt: string | null;
  avgEffectiveness: number | null;
  habituationRisk: number;
  byContext: Record<string, { count: number; avgEffectiveness: number | null }>;
}

/** Wrap Supabase PromiseLike in a real Promise for fire-and-forget */
function ff<T>(promiseLike: PromiseLike<T>): void {
  Promise.resolve(promiseLike).catch(() => {});
}

// ── Core: Log a trigger deployment ──────────────────────────────────

/**
 * Log a trigger deployment. Fire-and-forget — never throws.
 * Inserts deployment record, increments times_deployed, captures HR if available.
 */
export function logTriggerDeployment(event: DeploymentEvent): void {
  const now = new Date().toISOString();

  // Insert deployment record
  ff(
    supabase
      .from('trigger_deployments')
      .insert({
        user_id: event.userId,
        trigger_id: event.triggerId || null,
        trigger_phrase: event.triggerPhrase,
        deployment_context: event.context,
        message_id: event.messageId || null,
        deployed_at: now,
      })
      .select('id')
      .single()
      .then(({ data }) => {
        if (data?.id) {
          captureHrAtDeployment(event.userId, data.id);
        }
      })
  );

  // Update last_deployed_at on the trigger
  if (event.triggerId) {
    ff(
      supabase
        .from('conditioned_triggers')
        .update({ last_deployed_at: now })
        .eq('id', event.triggerId)
    );

    // Update habituation risk (async, non-blocking)
    updateHabituationRisk(event.userId, event.triggerId);
  }
}

// ── HR Capture ──────────────────────────────────────────────────────

/**
 * Capture heart rate at deployment time from session_biometrics (if active)
 * or whoop_metrics (daily resting HR). Schedules 30s follow-up capture.
 */
function captureHrAtDeployment(userId: string, deploymentId: string): void {
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  // Try session_biometrics first (real-time, if session polling active)
  ff(
    supabase
      .from('session_biometrics')
      .select('avg_heart_rate')
      .eq('user_id', userId)
      .gte('created_at', twoMinAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data: sessionHr }) => {
        if (sessionHr?.avg_heart_rate) {
          ff(
            supabase
              .from('trigger_deployments')
              .update({ hr_at_deployment: sessionHr.avg_heart_rate })
              .eq('id', deploymentId)
          );

          // Schedule 30s follow-up HR capture
          setTimeout(() => captureHrAfter30s(userId, deploymentId), 30_000);
          return;
        }

        // Fallback: today's resting HR from whoop_metrics
        const today = new Date().toISOString().split('T')[0];
        ff(
          supabase
            .from('whoop_metrics')
            .select('resting_heart_rate')
            .eq('user_id', userId)
            .eq('date', today)
            .maybeSingle()
            .then(({ data: dailyHr }) => {
              if (dailyHr?.resting_heart_rate) {
                ff(
                  supabase
                    .from('trigger_deployments')
                    .update({ hr_at_deployment: dailyHr.resting_heart_rate })
                    .eq('id', deploymentId)
                );
              }
            })
        );
      })
  );
}

/**
 * Capture HR 30 seconds after trigger deployment (only if session polling active).
 */
function captureHrAfter30s(userId: string, deploymentId: string): void {
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  ff(
    supabase
      .from('session_biometrics')
      .select('avg_heart_rate')
      .eq('user_id', userId)
      .gte('created_at', twoMinAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.avg_heart_rate) {
          ff(
            supabase
              .from('trigger_deployments')
              .update({
                hr_after_30s: data.avg_heart_rate,
                response_detected: true,
                response_type: 'biometric',
              })
              .eq('id', deploymentId)
          );
        }
      })
  );
}

// ── Habituation Risk ────────────────────────────────────────────────

/**
 * Compute and update habituation risk for a trigger.
 * Risk rises when deployed >3x/day avg over 7 days, decays when <1x/day.
 */
function updateHabituationRisk(userId: string, triggerId: string): void {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  ff(
    supabase
      .from('trigger_deployments')
      .select('deployed_at')
      .eq('user_id', userId)
      .eq('trigger_id', triggerId)
      .gte('deployed_at', sevenDaysAgo)
      .then(({ data: deployments }) => {
        if (!deployments) return;

        const avgPerDay = deployments.length / 7;
        let risk: number;

        if (avgPerDay > 5) risk = 0.9;
        else if (avgPerDay > 3) risk = 0.6;
        else if (avgPerDay > 2) risk = 0.3;
        else if (avgPerDay > 1) risk = 0.1;
        else risk = 0.0;

        ff(
          supabase
            .from('conditioned_triggers')
            .update({ habituation_risk: risk })
            .eq('id', triggerId)
        );
      })
  );
}

// ── Trigger Phrase Detection ────────────────────────────────────────

/**
 * Check if a message contains any known trigger phrases.
 * Returns matched phrases for logging.
 */
export function detectTriggerPhrases(
  message: string,
  knownPhrases: string[],
): string[] {
  const lower = message.toLowerCase();
  return knownPhrases.filter(phrase => lower.includes(phrase.toLowerCase()));
}

// ── Stats for Handler Context ───────────────────────────────────────

/**
 * Fetch per-trigger deployment stats for the Handler context prompt.
 */
export async function getTriggerDeploymentStats(userId: string): Promise<DeploymentStats[]> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch all triggers with their tracking columns
    const { data: triggers } = await supabase
      .from('conditioned_triggers')
      .select('id, trigger_phrase, times_deployed, last_deployed_at, habituation_risk, estimated_strength')
      .eq('user_id', userId)
      .in('estimated_strength', ['forming', 'established', 'conditioned']);

    if (!triggers?.length) return [];

    // Fetch recent deployments for all triggers
    const { data: deployments } = await supabase
      .from('trigger_deployments')
      .select('trigger_id, trigger_phrase, deployment_context, deployed_at, effectiveness_score')
      .eq('user_id', userId)
      .gte('deployed_at', sevenDaysAgo)
      .order('deployed_at', { ascending: false });

    const deploymentRows = (deployments || []) as TriggerDeploymentRow[];

    return triggers.map(t => {
      const triggerDeps = deploymentRows.filter(d => d.trigger_id === t.id);

      // Group by context
      const byContext: Record<string, { count: number; scores: number[] }> = {};
      for (const d of triggerDeps) {
        if (!byContext[d.deployment_context]) {
          byContext[d.deployment_context] = { count: 0, scores: [] };
        }
        byContext[d.deployment_context].count++;
        if (d.effectiveness_score) {
          byContext[d.deployment_context].scores.push(d.effectiveness_score);
        }
      }

      const allScores = triggerDeps
        .filter(d => d.effectiveness_score)
        .map(d => d.effectiveness_score!);

      return {
        triggerPhrase: t.trigger_phrase,
        totalDeployments: t.times_deployed || 0,
        last7Days: triggerDeps.length,
        lastDeployedAt: t.last_deployed_at || null,
        avgEffectiveness: allScores.length ? +(allScores.reduce((a, b) => a + b, 0) / allScores.length).toFixed(1) : null,
        habituationRisk: +(t.habituation_risk || 0),
        byContext: Object.fromEntries(
          Object.entries(byContext).map(([ctx, { count, scores }]) => [
            ctx,
            {
              count,
              avgEffectiveness: scores.length ? +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null,
            },
          ]),
        ),
      };
    });
  } catch (err) {
    console.error('[trigger-deployment-logger] getTriggerDeploymentStats error:', err);
    return [];
  }
}
