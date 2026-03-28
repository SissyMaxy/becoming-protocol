import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const WHOOP_API = 'https://api.prod.whoop.com/developer';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { session_id } = req.body || {};
    if (!session_id) return res.status(400).json({ error: 'session_id required' });

    const supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    );

    // Auth
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token' });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    // Get Whoop access token
    const { data: tokenRow } = await supabase
      .from('whoop_tokens')
      .select('*')
      .eq('user_id', user.id)
      .is('disconnected_at', null)
      .maybeSingle();

    if (!tokenRow) return res.status(400).json({ error: 'whoop_auth_expired' });

    let accessToken = tokenRow.access_token;

    // Refresh if expired
    if (new Date(tokenRow.expires_at) <= new Date(Date.now() + 60000)) {
      const refreshRes = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: tokenRow.refresh_token,
          client_id: process.env.WHOOP_CLIENT_ID || '',
          client_secret: process.env.WHOOP_CLIENT_SECRET || '',
          scope: 'offline',
        }),
      });

      if (!refreshRes.ok) {
        return res.status(200).json({ error: 'whoop_auth_expired' });
      }

      const newTokens = await refreshRes.json();
      accessToken = newTokens.access_token;

      await supabase.from('whoop_tokens').update({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token || tokenRow.refresh_token,
        expires_at: new Date(Date.now() + (newTokens.expires_in || 3600) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('user_id', user.id);
    }

    // Fetch current cycle from Whoop
    const cycleRes = await fetch(`${WHOOP_API}/v1/cycle?limit=1`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!cycleRes.ok) {
      return res.status(200).json({ error: 'no_active_cycle' });
    }

    const cycleData = await cycleRes.json();
    const cycle = cycleData?.records?.[0];

    if (!cycle?.score) {
      return res.status(200).json({ error: 'no_active_cycle' });
    }

    const strain_current = cycle.score.strain ?? 0;
    const avg_heart_rate = cycle.score.average_heart_rate ?? 0;
    const max_heart_rate = cycle.score.max_heart_rate ?? 0;
    const kilojoules = cycle.score.kilojoule ?? 0;
    const now = new Date().toISOString();

    // Get baseline strain (first poll for this session)
    const { data: baseline } = await supabase
      .from('session_biometrics')
      .select('strain_current')
      .eq('session_id', session_id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    const baseline_strain = baseline?.strain_current ?? strain_current;
    const strain_delta = +(strain_current - baseline_strain).toFixed(2);

    // Insert biometric reading
    await supabase.from('session_biometrics').insert({
      session_id,
      user_id: user.id,
      strain_current,
      strain_delta,
      avg_heart_rate,
      max_heart_rate,
      kilojoules,
      created_at: now,
    });

    return res.status(200).json({
      strain_current,
      strain_delta,
      avg_heart_rate,
      max_heart_rate,
      kilojoules,
      timestamp: now,
      stale: false,
    });
  } catch (err: any) {
    console.error('[Whoop Session Poll]', err);
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
