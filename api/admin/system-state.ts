import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

// Returns the actual underlying state — formulas, scores, parameters
// This is the architect view. The chat UI shows obfuscated/intuitive output.
// This endpoint shows reality.
export default async function handler(req: VercelRequest, res: VercelResponse) {
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
