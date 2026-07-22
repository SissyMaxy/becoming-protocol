import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { encryptToken, decryptToken } from '../../src/lib/calendar/crypto.js';
import { createOAuthState, verifyOAuthState } from '../_lib/oauth-state.js';

const WHOOP_API = 'https://api.prod.whoop.com/developer';

// Whoop refresh tokens are AES-256-GCM encrypted at rest (same scheme as
// calendar/outreach). WHOOP_TOKEN_KEY is a 32-byte secret, base64-encoded.
// Missing key material fails closed; plaintext token storage is not supported.
function whoopTokenKey(): string {
  const key = process.env.WHOOP_TOKEN_KEY || '';
  if (!key) throw new Error('WHOOP_TOKEN_KEY is required');
  return key;
}

// Decrypt a stored token. Legacy plaintext rows are invalidated by migration
// 671 and must reconnect rather than silently weakening storage guarantees.
async function decryptWhoopToken(stored: string | null | undefined): Promise<string> {
  if (!stored) throw new Error('Whoop token missing');
  return decryptToken(stored, whoopTokenKey());
}

// Encrypt a token before every database write.
async function encryptWhoopToken(plaintext: string): Promise<string> {
  if (!plaintext) throw new Error('Whoop token missing');
  return encryptToken(plaintext, whoopTokenKey());
}

const SPORT_NAMES: Record<number, string> = {
  0: 'Running', 1: 'Cycling', 16: 'Yoga', 17: 'Meditation',
  43: 'Strength Training', 44: 'Functional Fitness', 47: 'Walking',
  48: 'Hiking', 52: 'Swimming', 63: 'Pilates', 71: 'Sex',
  82: 'Dance', 84: 'Stretching',
};

interface WhoopTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

interface WhoopScore {
  recovery_score?: number;
  hrv_rmssd_milli?: number;
  resting_heart_rate?: number;
  spo2_percentage?: number;
  skin_temp_celsius?: number;
  sleep_performance_percentage?: number;
  sleep_consistency_percentage?: number;
  sleep_efficiency_percentage?: number;
  respiratory_rate?: number;
  strain?: number;
  kilojoule?: number;
  average_heart_rate?: number;
  max_heart_rate?: number;
  distance_meter?: number;
  stage_summary?: {
    total_in_bed_time_milli?: number;
    total_rem_sleep_time_milli?: number;
    total_slow_wave_sleep_time_milli?: number;
    total_light_sleep_time_milli?: number;
    total_awake_time_milli?: number;
    disturbance_count?: number;
  };
  sleep_needed?: { need_from_sleep_debt_milli?: number };
}

interface WhoopRecord {
  id?: string | number;
  start?: string;
  end?: string;
  sport_id?: number;
  weight_kilogram?: number;
  score?: WhoopScore;
}

interface WhoopListResponse {
  records?: WhoopRecord[];
}

// ============================================
// ACTION: auth
// ============================================

async function handleAuth(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientId = process.env.WHOOP_CLIENT_ID;
  const redirectUri = process.env.WHOOP_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return res.status(500).json({
      error: 'Whoop not configured',
      hasClientId: !!clientId,
      hasRedirectUri: !!redirectUri,
    });
  }
  try {
    whoopTokenKey();
  } catch {
    return res.status(500).json({ error: 'Whoop token encryption not configured' });
  }

  // User ID passed as query param from the client
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Supabase not configured' });
  const supabase = createClient(supabaseUrl, serviceKey);
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' });
  const { data: { user }, error } = await supabase.auth.getUser(auth.slice(7));
  if (error || !user) return res.status(401).json({ error: 'Not authenticated' });

  // State = "userId:randomUUID" — embeds user identity for the callback
  const { state, cookieValue } = createOAuthState(
    user.id,
    'whoop',
    process.env.OAUTH_STATE_SECRET || '',
  );

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'read:recovery read:cycles read:sleep read:workout read:body_measurement read:profile offline',
    state,
  });

  // Store state in cookie for CSRF validation
  res.setHeader('Set-Cookie', `whoop_oauth_state=${cookieValue}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/api/whoop`);
  return res.status(200).json({ url: `https://api.prod.whoop.com/oauth/oauth2/auth?${params.toString()}` });
}

// ============================================
// ACTION: callback
// ============================================

async function handleCallback(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state } = req.query;
  const appUrl = process.env.WHOOP_APP_URL || 'https://becoming-protocol.vercel.app';

  if (!code || !state) {
    return res.redirect(302, `${appUrl}?whoop=error&reason=missing_params`);
  }

  // CSRF / credential-binding defence: the HttpOnly state cookie is the ONLY
  // source of truth for user identity. State format is "userId:randomUUID".
  // We require the cookie to be present AND the nonce in the query-param state
  // to match the nonce in the cookie. We NEVER derive user_id from the
  // query-param state alone — an attacker who crafts a state can otherwise
  // bind their Whoop account (or steal a code) onto the victim's user_id.
  const storedState = req.cookies?.whoop_oauth_state;
  const userId = verifyOAuthState(
    storedState,
    String(state),
    'whoop',
    process.env.OAUTH_STATE_SECRET || '',
  );
  if (!userId) {
    return res.redirect(302, `${appUrl}?whoop=error&reason=state_mismatch`);
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: process.env.WHOOP_REDIRECT_URI || '',
      client_id: process.env.WHOOP_CLIENT_ID || '',
      client_secret: process.env.WHOOP_CLIENT_SECRET || '',
    }),
  });

  if (!tokenRes.ok) {
    const errorText = await tokenRes.text();
    console.error('[Whoop Callback] Token exchange failed:', errorText);
    return res.redirect(302, `${appUrl}?whoop=error&reason=token_exchange_failed`);
  }

  const tokens = await tokenRes.json() as WhoopTokenResponse;
  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

  // Use service role to bypass RLS
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceKey) {
    console.error('[Whoop Callback] Missing env:', { hasUrl: !!supabaseUrl, hasKey: !!serviceKey });
    return res.redirect(302, `${appUrl}?whoop=error&reason=server_config`);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Encrypt the refresh token at rest (the long-lived secret).
  const accessEnc = await encryptWhoopToken(tokens.access_token || '');
  const refreshEnc = await encryptWhoopToken(tokens.refresh_token || '');

  // Upsert tokens
  const { error: dbError } = await supabase.from('whoop_tokens').upsert({
    user_id: userId,
    access_token: accessEnc,
    refresh_token: refreshEnc,
    expires_at: expiresAt.toISOString(),
    scopes: tokens.scope?.split(' ') || [],
    disconnected_at: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  if (dbError) {
    console.error('[Whoop Callback] DB error:', dbError);
    const detail = encodeURIComponent(dbError.message || 'unknown');
    return res.redirect(302, `${appUrl}?whoop=error&reason=db_error:${detail}`);
  }

  // Clear CSRF cookie and redirect to app root with success param
  res.setHeader('Set-Cookie', 'whoop_oauth_state=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/api/whoop');
  res.redirect(302, `${appUrl}?whoop=connected`);
}

// ============================================
// ACTION: sync (dispatches to sync | disconnect | session-poll based on body.action)
// ============================================

/**
 * Consolidated Whoop data router.
 * POST /api/whoop/sync with body.action = 'status' | 'sync' | 'disconnect' | 'session-poll'
 * Default (no action) = sync.
 */
async function handleSync(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action } = (req.body || {}) as { action?: string };

  switch (action) {
    case 'status':
      return handleStatus(req, res);
    case 'disconnect':
      return handleDisconnect(req, res);
    case 'session-poll':
      return handleSessionPoll(req, res);
    case 'sync':
    default:
      return handleSyncFetch(req, res);
  }
}

async function handleStatus(req: VercelRequest, res: VercelResponse) {
  const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  );
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  const { data, error } = await supabase
    .from('whoop_tokens')
    .select('connected_at')
    .eq('user_id', user.id)
    .is('disconnected_at', null)
    .maybeSingle();
  if (error) return res.status(500).json({ error: 'Unable to read Whoop status' });
  return res.status(200).json({ connected: !!data });
}

// ============================================
// ACTION: sync (default)
// ============================================

async function handleSyncFetch(req: VercelRequest, res: VercelResponse) {
  try {
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

    if (!tokenRow) return res.status(200).json({ connected: false });

    let accessToken = await decryptWhoopToken(tokenRow.access_token);

    // Refresh if expired
    if (new Date(tokenRow.expires_at) <= new Date(Date.now() + 60000)) {
      const refreshToken = await decryptWhoopToken(tokenRow.refresh_token);
      const refreshRes = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: process.env.WHOOP_CLIENT_ID || '',
          client_secret: process.env.WHOOP_CLIENT_SECRET || '',
          scope: 'offline',
        }),
      });

      if (!refreshRes.ok) {
        await supabase.from('whoop_tokens').update({
          disconnected_at: new Date().toISOString(),
        }).eq('user_id', user.id);
        return res.status(200).json({ connected: false, reason: 'token_expired' });
      }

      const newTokens = await refreshRes.json() as WhoopTokenResponse;
      accessToken = newTokens.access_token;

      const newRefreshEnc = newTokens.refresh_token
        ? await encryptWhoopToken(newTokens.refresh_token)
        : tokenRow.refresh_token;

      await supabase.from('whoop_tokens').update({
        access_token: await encryptWhoopToken(newTokens.access_token),
        refresh_token: newRefreshEnc,
        expires_at: new Date(Date.now() + (newTokens.expires_in || 3600) * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('user_id', user.id);
    }

    // Fetch Whoop data
    const [recovery, sleep, cycle, workouts, body] = await Promise.allSettled([
      whoopGet(accessToken, '/v1/recovery?limit=1'),
      whoopGet(accessToken, '/v1/activity/sleep?limit=1'),
      whoopGet(accessToken, '/v1/cycle?limit=1'),
      whoopGet(accessToken, '/v1/activity/workout?limit=5'),
      whoopGet(accessToken, '/v1/user/measurement/body?limit=1'),
    ]);

    const r = recovery.status === 'fulfilled' ? recovery.value?.records?.[0] : null;
    const s = sleep.status === 'fulfilled' ? sleep.value?.records?.[0] : null;
    const c = cycle.status === 'fulfilled' ? cycle.value?.records?.[0] : null;
    const w = workouts.status === 'fulfilled' ? workouts.value?.records || [] : [];
    const b = body.status === 'fulfilled' ? body.value?.records?.[0] : null;

    const today = new Date().toISOString().split('T')[0];
    const milliToHours = (ms: number | null | undefined) => ms ? +(ms / 3600000).toFixed(1) : 0;

    // Upsert metrics
    const metrics: Record<string, unknown> = { user_id: user.id, date: today, fetched_at: new Date().toISOString() };
    if (r?.score) {
      Object.assign(metrics, {
        recovery_score: r.score.recovery_score,
        hrv_rmssd_milli: r.score.hrv_rmssd_milli,
        resting_heart_rate: r.score.resting_heart_rate,
        spo2_percentage: r.score.spo2_percentage,
        skin_temp_celsius: r.score.skin_temp_celsius,
        raw_recovery: r,
      });
    }
    if (s?.score) {
      Object.assign(metrics, {
        sleep_performance_percentage: s.score.sleep_performance_percentage,
        sleep_consistency_percentage: s.score.sleep_consistency_percentage,
        sleep_efficiency_percentage: s.score.sleep_efficiency_percentage,
        total_sleep_duration_milli: s.score.stage_summary?.total_in_bed_time_milli,
        rem_sleep_milli: s.score.stage_summary?.total_rem_sleep_time_milli,
        deep_sleep_milli: s.score.stage_summary?.total_slow_wave_sleep_time_milli,
        light_sleep_milli: s.score.stage_summary?.total_light_sleep_time_milli,
        awake_milli: s.score.stage_summary?.total_awake_time_milli,
        disturbance_count: s.score.stage_summary?.disturbance_count,
        respiratory_rate: s.score.respiratory_rate,
        sleep_debt_milli: s.score.sleep_needed?.need_from_sleep_debt_milli,
        raw_sleep: s,
      });
    }
    if (c?.score) {
      Object.assign(metrics, {
        day_strain: c.score.strain,
        day_kilojoule: c.score.kilojoule,
        day_average_heart_rate: c.score.average_heart_rate,
        day_max_heart_rate: c.score.max_heart_rate,
        raw_cycle: c,
      });
    }
    if (b?.weight_kilogram) metrics.weight_kilogram = b.weight_kilogram;

    await supabase.from('whoop_metrics').upsert(metrics, { onConflict: 'user_id,date' });

    // Upsert workouts
    for (const workout of w) {
      if (!workout.id) continue;
      await supabase.from('whoop_workouts').upsert({
        user_id: user.id,
        whoop_workout_id: String(workout.id),
        date: workout.start ? new Date(workout.start).toISOString().split('T')[0] : today,
        sport_name: workout.sport_id != null ? (SPORT_NAMES[workout.sport_id] || 'Activity') : null,
        sport_id: workout.sport_id,
        strain: workout.score?.strain,
        average_heart_rate: workout.score?.average_heart_rate,
        max_heart_rate: workout.score?.max_heart_rate,
        kilojoule: workout.score?.kilojoule,
        distance_meter: workout.score?.distance_meter,
        raw_data: workout,
      }, { onConflict: 'user_id,whoop_workout_id' });
    }

    // Build response
    return res.status(200).json({
      date: today,
      connected: true,
      recovery: r?.score ? {
        score: r.score.recovery_score,
        hrv: r.score.hrv_rmssd_milli,
        restingHR: r.score.resting_heart_rate,
        spo2: r.score.spo2_percentage || 0,
        skinTemp: r.score.skin_temp_celsius || 0,
      } : null,
      sleep: s?.score ? {
        performance: s.score.sleep_performance_percentage,
        consistency: s.score.sleep_consistency_percentage,
        efficiency: s.score.sleep_efficiency_percentage,
        totalSleepHours: milliToHours(s.score.stage_summary?.total_in_bed_time_milli),
        remHours: milliToHours(s.score.stage_summary?.total_rem_sleep_time_milli),
        deepSleepHours: milliToHours(s.score.stage_summary?.total_slow_wave_sleep_time_milli),
        disturbances: s.score.stage_summary?.disturbance_count || 0,
        respiratoryRate: s.score.respiratory_rate || 0,
        sleepDebtMinutes: Math.round((s.score.sleep_needed?.need_from_sleep_debt_milli || 0) / 60000),
      } : null,
      strain: c?.score ? {
        dayStrain: c.score.strain,
        kilojoule: c.score.kilojoule,
        avgHR: c.score.average_heart_rate,
        maxHR: c.score.max_heart_rate,
      } : null,
      workouts: w.map((wk) => ({
        sport: wk.sport_id != null ? (SPORT_NAMES[wk.sport_id] || 'Activity') : 'Activity',
        strain: wk.score?.strain || 0,
        durationMinutes: wk.start && wk.end ? Math.round((new Date(wk.end).getTime() - new Date(wk.start).getTime()) / 60000) : 0,
        avgHR: wk.score?.average_heart_rate || 0,
        maxHR: wk.score?.max_heart_rate || 0,
      })),
      body: b?.weight_kilogram ? { weightKg: b.weight_kilogram } : null,
    });
  } catch (err: any) {
    console.error('[Whoop Sync]', err);
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}

// ============================================
// ACTION: disconnect
// ============================================

async function handleDisconnect(req: VercelRequest, res: VercelResponse) {
  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  );

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  );
  if (userError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  await supabase.from('whoop_tokens').update({
    disconnected_at: new Date().toISOString(),
  }).eq('user_id', user.id);

  return res.status(200).json({ disconnected: true });
}

// ============================================
// ACTION: session-poll
// ============================================

async function handleSessionPoll(req: VercelRequest, res: VercelResponse) {
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

    let accessToken = await decryptWhoopToken(tokenRow.access_token);

    // Refresh if expired
    if (new Date(tokenRow.expires_at) <= new Date(Date.now() + 60000)) {
      const refreshToken = await decryptWhoopToken(tokenRow.refresh_token);
      const refreshRes = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: process.env.WHOOP_CLIENT_ID || '',
          client_secret: process.env.WHOOP_CLIENT_SECRET || '',
          scope: 'offline',
        }),
      });

      if (!refreshRes.ok) {
        return res.status(200).json({ error: 'whoop_auth_expired' });
      }

      const newTokens = await refreshRes.json() as WhoopTokenResponse;
      accessToken = newTokens.access_token;

      const newRefreshEnc = newTokens.refresh_token
        ? await encryptWhoopToken(newTokens.refresh_token)
        : tokenRow.refresh_token;

      await supabase.from('whoop_tokens').update({
        access_token: await encryptWhoopToken(newTokens.access_token),
        refresh_token: newRefreshEnc,
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

    const cycleData = await cycleRes.json() as WhoopListResponse;
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

// ============================================
// SHARED: Whoop API helper
// ============================================

async function whoopGet(token: string, path: string): Promise<WhoopListResponse | null> {
  const resp = await fetch(`${WHOOP_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return null;
  return resp.json() as Promise<WhoopListResponse>;
}

// ============================================
// Default export: action router
// ============================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;
  switch (action) {
    case 'auth': return handleAuth(req, res);
    case 'callback': return handleCallback(req, res);
    case 'sync': return handleSync(req, res);
    default: return res.status(404).json({ error: `Unknown action: ${action}` });
  }
}
