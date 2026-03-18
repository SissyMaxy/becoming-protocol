import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'crypto';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
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

  // User ID passed as query param from the client
  const userId = req.query.user_id;
  if (!userId) {
    return res.status(400).json({ error: 'user_id query param required' });
  }

  // State = "userId:randomUUID" — embeds user identity for the callback
  const nonce = randomUUID();
  const state = `${userId}:${nonce}`;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'read:recovery read:cycles read:sleep read:workout read:body_measurement read:profile',
    state,
  });

  // Store state in cookie for CSRF validation
  res.setHeader('Set-Cookie', `whoop_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`);
  res.redirect(302, `https://api.prod.whoop.com/oauth/oauth2/auth?${params.toString()}`);
}
