import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const userId = req.query.id as string;
  if (!userId) return res.status(400).json({ error: 'id parameter required' });

  try {
    const { data } = await supabase
      .from('accountability_blog')
      .select('entry_type, entry_text, severity, day_number, created_at')
      .eq('user_id', userId)
      .eq('public_visible', true)
      .order('created_at', { ascending: false })
      .limit(50);

    const failures = (data || []).filter(d => d.severity === 'failure').length;
    const warnings = (data || []).filter(d => d.severity === 'warning').length;
    const achievements = (data || []).filter(d => d.severity === 'achievement').length;

    return res.status(200).json({
      entries: data || [],
      stats: { total: (data || []).length, failures, warnings, achievements },
    });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
}
