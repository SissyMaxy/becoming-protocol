import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

// /api/admin/mommy-evolves
//
// Closes the loop from mommy-self-audit (daily) and mommy-evolution-summary
// (weekly). Returns the last 30 days of:
//   - audit runs (when Mommy introspected; what signals she found; how many
//     wishes she queued for herself)
//   - self_strengthening wishes (status, blockers, shipped commits)
//   - weekly evolution summaries (the paragraphs)
//
// This is the architect view — the user sees the loop closing.
export default async function handler(req: VercelRequest, res: VercelResponse) {
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

    // Build a "loop closure" overlay so a UI can render gap → wish → ship
    // without doing the join client-side. For each wish, attach the audit
    // run that produced it (via wishes_created membership).
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

    // Roll-up: counts for the dashboard header.
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
