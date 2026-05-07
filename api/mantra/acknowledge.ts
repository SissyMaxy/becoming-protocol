import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// /api/mantra/acknowledge — flips a mantra_delivery_log row from
// queued → spoken when the user taps "spoke it" on a mantra outreach
// card. Owner-only via Bearer token.

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No auth token' });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  const body = req.body as {
    mantra_id?: string;
    outreach_id?: string;
    status?: 'spoken' | 'acknowledged' | 'skipped';
  };
  const status = body.status ?? 'spoken';
  if (!body.mantra_id && !body.outreach_id) {
    return res.status(400).json({ error: 'mantra_id or outreach_id required' });
  }
  if (!['spoken', 'acknowledged', 'skipped'].includes(status)) {
    return res.status(400).json({ error: 'invalid status' });
  }

  // Find the most recent matching log row for this user. We update the
  // newest match so re-acks on stale rows don't overwrite the latest.
  let query = supabase.from('mantra_delivery_log')
    .select('id')
    .eq('user_id', user.id)
    .order('delivered_at', { ascending: false })
    .limit(1);
  if (body.outreach_id) query = query.eq('outreach_id', body.outreach_id);
  else if (body.mantra_id) query = query.eq('mantra_id', body.mantra_id);

  const { data: row, error: findErr } = await query.maybeSingle();
  if (findErr) return res.status(500).json({ error: 'lookup_failed', detail: findErr.message });
  if (!row) return res.status(404).json({ error: 'no_matching_delivery' });

  const { error: updErr } = await supabase
    .from('mantra_delivery_log')
    .update({ status, acknowledged_at: new Date().toISOString() })
    .eq('id', (row as { id: string }).id)
    .eq('user_id', user.id);
  if (updErr) return res.status(500).json({ error: 'update_failed', detail: updErr.message });

  return res.status(200).json({ ok: true, id: (row as { id: string }).id, status });
}
