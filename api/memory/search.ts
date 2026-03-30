import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

/**
 * POST /api/memory/search
 *
 * Semantic search over handler_memory using vector similarity.
 * Falls back to keyword-based retrieval if OPENAI_API_KEY is not set.
 *
 * Body: { query: string, limit?: number, threshold?: number }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', ''),
  );
  if (authErr || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { query, limit, threshold } = req.body as {
    query?: string;
    limit?: number;
    threshold?: number;
  };

  if (!query?.trim()) {
    return res.status(400).json({ error: 'query is required' });
  }

  const matchCount = Math.min(limit || 5, 20);
  const matchThreshold = threshold ?? 0.7;

  try {
    // If no OpenAI key, fall back to keyword search
    if (!process.env.OPENAI_API_KEY) {
      return fallbackKeywordSearch(res, user.id, query, matchCount);
    }

    // Embed the query text
    const embeddingRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: query.substring(0, 2000),
      }),
    });

    if (!embeddingRes.ok) {
      console.error('[memory/search] OpenAI error:', embeddingRes.status);
      // Fall back to keyword search on OpenAI failure
      return fallbackKeywordSearch(res, user.id, query, matchCount);
    }

    const embeddingData = await embeddingRes.json();
    const embedding = embeddingData.data?.[0]?.embedding;

    if (!embedding || !Array.isArray(embedding)) {
      return fallbackKeywordSearch(res, user.id, query, matchCount);
    }

    // Call the match_memories RPC function
    const vectorStr = `[${embedding.join(',')}]`;

    const { data: matches, error: rpcErr } = await supabase.rpc('match_memories', {
      query_embedding: vectorStr,
      match_user_id: user.id,
      match_count: matchCount,
      match_threshold: matchThreshold,
    });

    if (rpcErr) {
      console.error('[memory/search] RPC error:', rpcErr.message);
      // Fall back on RPC failure (e.g., pgvector not enabled yet)
      return fallbackKeywordSearch(res, user.id, query, matchCount);
    }

    return res.status(200).json({
      memories: matches || [],
      method: 'vector',
      count: matches?.length || 0,
    });
  } catch (err) {
    console.error('[memory/search] Error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
}

/**
 * Fallback: keyword-based search using ILIKE on content.
 * Used when OPENAI_API_KEY is missing or embedding fails.
 */
async function fallbackKeywordSearch(
  res: VercelResponse,
  userId: string,
  query: string,
  limit: number,
) {
  // Extract meaningful keywords (3+ chars, skip common words)
  const stopWords = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'has', 'have', 'that', 'this', 'with', 'from']);
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length >= 3 && !stopWords.has(w))
    .slice(0, 5);

  if (keywords.length === 0) {
    return res.status(200).json({ memories: [], method: 'fallback', count: 0 });
  }

  // Search with ILIKE for each keyword, union results
  const { data, error } = await supabase
    .from('handler_memory')
    .select('id, memory_type, content, importance, reinforcement_count, created_at')
    .eq('user_id', userId)
    .eq('is_active', true)
    .or(keywords.map(k => `content.ilike.%${k}%`).join(','))
    .order('importance', { ascending: false })
    .order('last_reinforced_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[memory/search] Fallback error:', error.message);
    return res.status(500).json({ error: 'Search failed' });
  }

  return res.status(200).json({
    memories: (data || []).map(m => ({ ...m, similarity: null })),
    method: 'fallback',
    count: data?.length || 0,
  });
}
