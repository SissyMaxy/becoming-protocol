import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    ok: true,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    hasSupabaseUrl: !!process.env.SUPABASE_URL,
    hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    nodeVersion: process.version,
  });
}
