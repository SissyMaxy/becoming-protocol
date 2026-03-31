import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

/**
 * Consolidated memory router.
 * POST /api/memory with body.action = 'embed' | 'search'
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action } = req.body as { action?: string };

  switch (action) {
    case 'embed':
      return handleEmbed(req, res);
    case 'search':
      return handleSearch(req, res);
    default:
      return res.status(400).json({ error: `Unknown action: ${action}. Expected: embed | search` });
  }
}

// ============================================
// ACTION: embed
// ============================================

async function handleEmbed(req: VercelRequest, res: VercelResponse) {
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

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
  }

  const { memory_id, text, user_id } = req.body as {
    memory_id?: string;
    text?: string;
    user_id?: string;
    action?: string;
  };

  try {
    let textToEmbed: string;
    let targetMemoryId: string;

    if (memory_id) {
      // Embed an existing memory row
      const { data: memory, error: memErr } = await supabase
        .from('handler_memory')
        .select('id, content, user_id')
        .eq('id', memory_id)
        .single();

      if (memErr || !memory) {
        return res.status(404).json({ error: 'Memory not found' });
      }

      // Verify ownership
      if (memory.user_id !== user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      textToEmbed = memory.content;
      targetMemoryId = memory.id;
    } else if (text && user_id) {
      // Verify the requesting user matches user_id (or is service-role)
      if (user_id !== user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      // Store as a new memory first, then embed it
      const { data: newMem, error: insertErr } = await supabase
        .from('handler_memory')
        .insert({
          user_id,
          memory_type: 'pattern',
          content: text.substring(0, 2000),
          importance: 3,
          decay_rate: 0.05,
        })
        .select('id')
        .single();

      if (insertErr || !newMem) {
        return res.status(500).json({ error: 'Failed to store memory', detail: insertErr?.message });
      }

      textToEmbed = text.substring(0, 2000);
      targetMemoryId = newMem.id;
    } else {
      return res.status(400).json({ error: 'Provide memory_id or (text + user_id)' });
    }

    // Call OpenAI embeddings API
    const embeddingRes = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: textToEmbed,
      }),
    });

    if (!embeddingRes.ok) {
      const errBody = await embeddingRes.text();
      console.error('[memory/embed] OpenAI error:', embeddingRes.status, errBody);
      return res.status(502).json({ error: `OpenAI API error: ${embeddingRes.status}` });
    }

    const embeddingData = await embeddingRes.json();
    const embedding = embeddingData.data?.[0]?.embedding;

    if (!embedding || !Array.isArray(embedding)) {
      return res.status(502).json({ error: 'Invalid embedding response from OpenAI' });
    }

    // Store the embedding vector on the handler_memory row
    // pgvector accepts array notation: '[0.1, 0.2, ...]'
    const vectorStr = `[${embedding.join(',')}]`;

    const { error: updateErr } = await supabase
      .from('handler_memory')
      .update({ embedding: vectorStr })
      .eq('id', targetMemoryId);

    if (updateErr) {
      console.error('[memory/embed] Update error:', updateErr.message);
      return res.status(500).json({ error: 'Failed to store embedding', detail: updateErr.message });
    }

    return res.status(200).json({
      success: true,
      memory_id: targetMemoryId,
      dimensions: embedding.length,
    });
  } catch (err) {
    console.error('[memory/embed] Error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
}

// ============================================
// ACTION: search
// ============================================

async function handleSearch(req: VercelRequest, res: VercelResponse) {
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
    action?: string;
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
