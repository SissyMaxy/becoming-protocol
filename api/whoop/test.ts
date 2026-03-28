import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  return res.status(200).json({
    ok: true,
    env: {
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasSupabaseKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasWhoopId: !!process.env.WHOOP_CLIENT_ID,
      hasWhoopSecret: !!process.env.WHOOP_CLIENT_SECRET,
      hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    },
    timestamp: new Date().toISOString(),
  });
}
