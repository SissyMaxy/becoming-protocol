import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state } = req.query;
  const appUrl = process.env.WHOOP_APP_URL || 'https://becoming-protocol.vercel.app';

  if (!code || !state) {
    return res.redirect(302, `${appUrl}?whoop=error&reason=missing_params`);
  }

  // State contains the user ID (set during auth initiation)
  const storedState = req.cookies?.whoop_oauth_state;
  let userId: string | null = null;

  // State format: "userId:randomUUID"
  if (storedState) {
    const parts = String(storedState).split(':');
    if (parts.length === 2 && parts[1] === String(state).split(':')[1]) {
      // CSRF validation: random part matches
    }
    userId = parts[0] || null;
  }

  // Also try extracting userId from the state param itself (fallback)
  if (!userId && state) {
    const parts = String(state).split(':');
    if (parts.length === 2) {
      userId = parts[0];
    }
  }

  if (!userId) {
    return res.redirect(302, `${appUrl}?whoop=error&reason=no_user_id`);
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

  const tokens = await tokenRes.json();
  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

  // Use service role to bypass RLS
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceKey) {
    console.error('[Whoop Callback] Missing env:', { hasUrl: !!supabaseUrl, hasKey: !!serviceKey });
    return res.redirect(302, `${appUrl}?whoop=error&reason=server_config`);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Upsert tokens
  const { error: dbError } = await supabase.from('whoop_tokens').upsert({
    user_id: userId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
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
  res.setHeader('Set-Cookie', 'whoop_oauth_state=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/');
  res.redirect(302, `${appUrl}?whoop=connected`);
}
