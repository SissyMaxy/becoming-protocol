// Admin endpoint — verify the OpenAI key is reachable from Vercel.
//
// Auth: Bearer token must equal SUPABASE_SERVICE_ROLE_KEY. This makes
// the endpoint unusable to anyone but ops, while avoiding a separate
// admin secret to manage.
//
// GET → { ok, has_key, can_call_openai, embedding_dim, error? }

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = req.headers.authorization || '';
  const expected = `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || auth !== expected) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const hasKey = !!process.env.OPENAI_API_KEY;
  if (!hasKey) {
    return res.status(200).json({
      ok: false,
      has_key: false,
      can_call_openai: false,
      message: 'OPENAI_API_KEY is NOT set in Vercel env. Add it via Vercel dashboard → Project Settings → Environment Variables → Production.',
    });
  }

  try {
    const r = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: 'embedding sanity probe',
      }),
    });

    if (!r.ok) {
      const txt = await r.text();
      return res.status(200).json({
        ok: false,
        has_key: true,
        can_call_openai: false,
        http_status: r.status,
        error_body: txt.slice(0, 300),
      });
    }

    const data = await r.json() as { data?: Array<{ embedding?: number[] }>; usage?: { total_tokens?: number } };
    const dim = data.data?.[0]?.embedding?.length || 0;
    return res.status(200).json({
      ok: true,
      has_key: true,
      can_call_openai: true,
      embedding_dim: dim,
      tokens: data.usage?.total_tokens,
      model: 'text-embedding-3-small',
    });
  } catch (err) {
    return res.status(200).json({
      ok: false,
      has_key: true,
      can_call_openai: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
