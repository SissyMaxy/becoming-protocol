import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

// Cron-callable endpoint. Refreshes voice profiles for every user
// who has any corpus samples. Call once daily via Vercel Cron or external trigger.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Simple shared-secret guard for cron calls
  const secret = req.headers['x-cron-secret'];
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { data: users, error } = await supabase
      .from('user_voice_corpus')
      .select('user_id')
      .limit(10000);

    if (error) throw error;

    const uniqueIds = Array.from(new Set((users || []).map((r: { user_id: string }) => r.user_id)));
    let refreshed = 0;
    const errors: Array<{ user_id: string; error: string }> = [];

    for (const userId of uniqueIds) {
      const { error: rpcErr } = await supabase.rpc('refresh_voice_profile', { p_user_id: userId });
      if (rpcErr) {
        errors.push({ user_id: userId, error: rpcErr.message });
      } else {
        refreshed += 1;
      }
    }

    return res.status(200).json({ ok: true, refreshed, total: uniqueIds.length, errors });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Refresh failed' });
  }
}
