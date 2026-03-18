import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state } = req.query;
  const storedState = req.cookies?.whoop_oauth_state;
  const appUrl = process.env.WHOOP_APP_URL || 'https://becoming-protocol.vercel.app';

  if (!code || !state || state !== storedState) {
    return res.redirect(302, `${appUrl}/settings?whoop=error&reason=invalid_state`);
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
    console.error('[Whoop Callback] Token exchange failed:', await tokenRes.text());
    return res.redirect(302, `${appUrl}/settings?whoop=error&reason=token_exchange_failed`);
  }

  const tokens = await tokenRes.json();
  const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

  // Extract user ID from Supabase auth cookie
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  );

  // Get user from the sb-access-token cookie
  const accessToken = req.cookies?.['sb-access-token']
    || extractSupabaseToken(req.headers.cookie || '');

  if (!accessToken) {
    return res.redirect(302, `${appUrl}/settings?whoop=error&reason=not_authenticated`);
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !user) {
    return res.redirect(302, `${appUrl}/settings?whoop=error&reason=not_authenticated`);
  }

  // Upsert tokens (service role bypasses RLS)
  const { error: dbError } = await supabase.from('whoop_tokens').upsert({
    user_id: user.id,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: expiresAt.toISOString(),
    scopes: tokens.scope?.split(' ') || [],
    disconnected_at: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  if (dbError) {
    console.error('[Whoop Callback] DB error:', dbError);
    return res.redirect(302, `${appUrl}/settings?whoop=error&reason=db_error`);
  }

  // Clear CSRF cookie
  res.setHeader('Set-Cookie', 'whoop_oauth_state=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/');
  res.redirect(302, `${appUrl}/settings?whoop=connected`);
}

function extractSupabaseToken(cookieHeader: string): string | null {
  // Supabase stores auth in various cookie formats
  const patterns = [
    /sb-[a-z]+-auth-token=([^;]+)/,
    /sb-access-token=([^;]+)/,
  ];
  for (const pattern of patterns) {
    const match = cookieHeader.match(pattern);
    if (match) {
      try {
        // May be JSON-encoded array [access_token, refresh_token]
        const parsed = JSON.parse(decodeURIComponent(match[1]));
        return Array.isArray(parsed) ? parsed[0] : parsed;
      } catch {
        return decodeURIComponent(match[1]);
      }
    }
  }
  return null;
}
