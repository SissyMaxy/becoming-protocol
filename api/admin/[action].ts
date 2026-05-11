// /api/admin/[action] — consolidated admin dispatcher.
//
// Routes:
//   /api/admin/mommy-evolves → mommy self-audit + wishes + evolution summaries
//   /api/admin/system-state  → architect view of underlying user state
//   /api/admin/heartbeat     → auto-poster status upsert (x-api-key auth)
//
// vercel.json rewrites preserve the public URLs. This file replaces three
// standalone functions (admin/mommy-evolves.ts, admin/system-state.ts,
// auto-poster/heartbeat.ts) to stay under the Vercel Hobby 12-function cap.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = String(req.query.action || '');

  switch (action) {
    case 'mommy-evolves':
      return handleMommyEvolves(req, res);
    case 'system-state':
      return handleSystemState(req, res);
    case 'heartbeat':
      return handleHeartbeat(req, res);
    default:
      return res.status(400).json({ error: `Unknown action: ${action}. Expected: mommy-evolves | system-state | heartbeat` });
  }
}

// ── /api/admin/mommy-evolves ────────────────────────────────────────────────
async function handleMommyEvolves(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No auth token' });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const since30d = new Date(Date.now() - 30 * 86400_000).toISOString();

    const [
      auditRuns,
      selfStrengtheningWishes,
      evolutionSummaries,
    ] = await Promise.allSettled([
      supabase
        .from('mommy_self_audit_log')
        .select('id, run_started_at, run_finished_at, trigger, status, signals_inspected, gaps_detected, wish_count, wishes_created, panel_summary, errors, notes')
        .gte('run_started_at', since30d)
        .order('run_started_at', { ascending: false })
        .limit(60),
      supabase
        .from('mommy_code_wishes')
        .select('id, wish_title, status, priority, source, wish_class, shipped_at, shipped_in_commit, ship_notes, auto_ship_blockers, auto_ship_eligible, complexity_tier, created_at')
        .eq('wish_class', 'self_strengthening')
        .gte('created_at', since30d)
        .order('created_at', { ascending: false })
        .limit(120),
      supabase
        .from('mommy_evolution_summary')
        .select('id, week_start, week_end, gap_count, wish_count, shipped_count, remaining_count, summary_text, payload, outreach_id, created_at')
        .gte('week_start', since30d.slice(0, 10))
        .order('week_start', { ascending: false })
        .limit(8),
    ]);

    const audits = auditRuns.status === 'fulfilled' ? (auditRuns.value.data || []) : [];
    const wishes = selfStrengtheningWishes.status === 'fulfilled' ? (selfStrengtheningWishes.value.data || []) : [];
    const summaries = evolutionSummaries.status === 'fulfilled' ? (evolutionSummaries.value.data || []) : [];

    const wishAuditMap: Record<string, string> = {};
    for (const a of audits as Array<{ id: string; wishes_created: string[] | null }>) {
      if (Array.isArray(a.wishes_created)) for (const wid of a.wishes_created) wishAuditMap[wid] = a.id;
    }
    const wishesWithAudit = (wishes as Array<Record<string, unknown>>).map(w => ({
      ...w,
      audit_run_id: wishAuditMap[String(w.id)] ?? null,
    }));

    const rollup = {
      audit_runs_30d: audits.length,
      gaps_detected_30d: audits.reduce(
        (s: number, a: { gaps_detected?: unknown[] | null }) =>
          s + (Array.isArray(a.gaps_detected) ? a.gaps_detected.length : 0),
        0,
      ),
      wishes_queued_30d: wishes.length,
      wishes_shipped_30d: wishes.filter((w: { status?: string }) => w.status === 'shipped').length,
      wishes_in_flight: wishes.filter((w: { status?: string }) =>
        w.status === 'in_progress' || w.status === 'queued').length,
      wishes_blocked: wishes.filter((w: { status?: string; auto_ship_blockers?: string[] | null }) =>
        w.status === 'needs_review'
        || (Array.isArray(w.auto_ship_blockers) && w.auto_ship_blockers.length > 0)).length,
      weekly_summaries: summaries.length,
    };

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      user_id: user.id,
      rollup,
      audit_runs: audits,
      wishes: wishesWithAudit,
      weekly_summaries: summaries,
      meta: {
        purpose: 'Mommy self-improvement loop visibility — gaps Mommy noticed → wishes queued → PRs shipped → weekly paragraph. Closes the autonomy loop without operator prompting.',
        signal_sources: [
          'mommy_supervisor_log', 'ci_local_failures', 'cron.job_run_details',
          'mommy_builder_run', 'mommy_code_wishes (stale)', 'handler_outreach_queue (undelivered)',
        ],
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
}

// ── /api/admin/system-state ────────────────────────────────────────────────
async function handleSystemState(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No auth token' });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  const userId = user.id;

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    const [
      state,
      hiddenOps,
      streaks,
      noncomplianceStreaks,
      recentOutcomes,
      activeObligations,
      enforcementConfig,
      recentDirectives,
      handlerNotes,
    ] = await Promise.allSettled([
      supabase.from('user_state').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('hidden_operations').select('*').eq('user_id', userId),
      supabase.from('denial_streaks').select('*').eq('user_id', userId).is('ended_at', null).maybeSingle(),
      supabase.from('noncompliance_streaks').select('*').eq('user_id', userId),
      supabase.from('directive_outcomes').select('*').eq('user_id', userId).gte('fired_at', sevenDaysAgo).order('fired_at', { ascending: false }),
      supabase.from('recurring_obligations').select('*').eq('user_id', userId).eq('active', true),
      supabase.from('enforcement_config').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('handler_directives').select('action, value, status, created_at, reasoning').eq('user_id', userId).gte('created_at', sevenDaysAgo).order('created_at', { ascending: false }).limit(50),
      supabase.from('handler_notes').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20),
    ]);

    const result = {
      timestamp: new Date().toISOString(),
      user_id: userId,
      user_state: state.status === 'fulfilled' ? state.value.data : null,
      hidden_operations: hiddenOps.status === 'fulfilled' ? hiddenOps.value.data : [],
      active_denial_streak: streaks.status === 'fulfilled' ? streaks.value.data : null,
      noncompliance_streaks: noncomplianceStreaks.status === 'fulfilled' ? noncomplianceStreaks.value.data : [],
      recent_outcomes: recentOutcomes.status === 'fulfilled' ? recentOutcomes.value.data : [],
      active_obligations: activeObligations.status === 'fulfilled' ? activeObligations.value.data : [],
      enforcement_config: enforcementConfig.status === 'fulfilled' ? enforcementConfig.value.data : null,
      recent_directives: recentDirectives.status === 'fulfilled' ? recentDirectives.value.data : [],
      handler_notes: handlerNotes.status === 'fulfilled' ? handlerNotes.value.data : [],
      meta: {
        purpose: 'Architect view — actual underlying state. The chat UI obfuscates this. This endpoint shows reality.',
      },
    };

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
}

// ── /api/admin/heartbeat (auto-poster status upsert) ──────────────────────
interface HeartbeatPayload {
  userId: string;
  status: 'running' | 'error' | 'idle';
  lastPostAt?: string;
  lastError?: string;
  platform?: string;
  postsToday?: number;
}

async function handleHeartbeat(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.AUTO_POSTER_API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  const { userId, status, lastPostAt, lastError, platform, postsToday } = req.body as HeartbeatPayload;

  if (!userId || !status) {
    return res.status(400).json({ error: 'userId and status required' });
  }

  if (!['running', 'error', 'idle'].includes(status)) {
    return res.status(400).json({ error: 'status must be running|error|idle' });
  }

  try {
    const { error: upsertErr } = await supabase
      .from('auto_poster_status')
      .upsert(
        {
          user_id: userId,
          status,
          last_post_at: lastPostAt || null,
          last_error: lastError || null,
          platform: platform || null,
          posts_today: postsToday ?? 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );

    if (upsertErr) {
      console.error('[Heartbeat] Upsert error:', upsertErr);
      return res.status(500).json({ error: 'Failed to upsert status' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[Heartbeat] Error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
}
