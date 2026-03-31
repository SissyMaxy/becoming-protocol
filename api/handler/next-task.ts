/**
 * Next Task API — returns ONE task, not a list.
 *
 * GET /api/handler/next-task
 *
 * The Handler decides what's next. The user doesn't pick.
 * Returns the single highest-priority task based on:
 *   - Active goals and their domains
 *   - Time of day
 *   - Denial day
 *   - Recent completions (no repeats)
 *   - Whoop recovery (gates intensity)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  );
  if (authErr || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  try {
    const userId = user.id;
    const now = new Date();
    const hour = now.getHours();

    // Get recent completions (last 24h) to avoid repeats
    const { data: recentCompletions } = await supabase
      .from('task_completions')
      .select('task_id, category')
      .eq('user_id', userId)
      .gte('created_at', new Date(now.getTime() - 24 * 3600000).toISOString());

    const recentTaskIds = new Set((recentCompletions || []).map(c => c.task_id));
    const recentCategories = new Set((recentCompletions || []).map(c => c.category));

    // Get Whoop recovery for intensity gating
    const { data: whoop } = await supabase
      .from('whoop_metrics')
      .select('recovery_score')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    const recovery = whoop?.recovery_score ?? 67; // Default to green
    const maxIntensity = recovery >= 67 ? 5 : recovery >= 34 ? 3 : 2;

    // Get user state
    const { data: userState } = await supabase
      .from('user_state')
      .select('denial_day, current_arousal')
      .eq('user_id', userId)
      .maybeSingle();

    // Get active goals for domain weighting
    const { data: activeGoals } = await supabase
      .from('goals')
      .select('domain, priority')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('priority', { ascending: false });

    const priorityDomains = (activeGoals || []).map(g => g.domain);

    // Get generated tasks that haven't been served recently
    const { data: tasks } = await supabase
      .from('generated_tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true)
      .lte('intensity', maxIntensity)
      .order('effectiveness_score', { ascending: false })
      .limit(50);

    if (!tasks || tasks.length === 0) {
      // Fallback to handler-prescribed tasks
      const { data: prescribed } = await supabase
        .from('handler_calendar')
        .select('id, title, description, event_type, scheduled_at')
        .eq('user_id', userId)
        .in('status', ['scheduled', 'reminded'])
        .lte('scheduled_at', now.toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (prescribed) {
        return res.json({
          task: {
            id: prescribed.id,
            instruction: prescribed.description || prescribed.title,
            category: prescribed.event_type,
            source: 'calendar',
          },
        });
      }

      return res.json({ task: null, reason: 'No tasks available' });
    }

    // Score and rank
    const scored = tasks
      .filter(t => !recentTaskIds.has(t.id))
      .map(t => {
        let score = t.effectiveness_score || 5;

        // Boost for priority domains
        if (priorityDomains.includes(t.domain)) score += 3;

        // Boost for category variety (not recently done)
        if (!recentCategories.has(t.category)) score += 2;

        // Time-of-day matching
        if (hour < 10 && ['voice', 'exercise', 'journal'].includes(t.category)) score += 1;
        if (hour >= 20 && ['content', 'session', 'conditioning'].includes(t.category)) score += 1;

        // Denial day boost for arousal-related tasks
        const denialDay = userState?.denial_day ?? 0;
        if (denialDay >= 5 && ['session', 'content', 'conditioning'].includes(t.category)) score += 2;

        return { ...t, score };
      })
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      return res.json({ task: null, reason: 'All available tasks recently completed' });
    }

    const selected = scored[0];

    // Update times_served
    await supabase
      .from('generated_tasks')
      .update({ times_served: (selected.times_served || 0) + 1 })
      .eq('id', selected.id);

    return res.json({
      task: {
        id: selected.id,
        instruction: selected.instruction,
        category: selected.category,
        domain: selected.domain,
        intensity: selected.intensity,
        source: 'generated',
      },
    });
  } catch (err) {
    console.error('[next-task] Error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
