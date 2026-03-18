import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'crypto';

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const state = randomUUID();

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.WHOOP_CLIENT_ID || '',
    redirect_uri: process.env.WHOOP_REDIRECT_URI || '',
    scope: 'read:recovery read:cycles read:sleep read:workout read:body_measurement',
    state,
  });

  // Store state in cookie for CSRF validation
  res.setHeader('Set-Cookie', `whoop_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`);
  res.redirect(302, `https://api.prod.whoop.com/oauth/oauth2/auth?${params.toString()}`);
}
