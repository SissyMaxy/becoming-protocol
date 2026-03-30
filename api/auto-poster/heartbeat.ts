import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

interface HeartbeatPayload {
  userId: string;
  status: 'running' | 'error' | 'idle';
  lastPostAt?: string;
  lastError?: string;
  platform?: string;
  postsToday?: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate via shared secret
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
