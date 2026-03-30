import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

/**
 * POST /api/memory/embed
 *
 * Generates an OpenAI embedding for a handler_memory row and stores it.
 *
 * Body options:
 *   { memory_id: string }                — embed an existing memory row
 *   { text: string, user_id: string }    — embed arbitrary text and store as new memory
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

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
  }

  const { memory_id, text, user_id } = req.body as {
    memory_id?: string;
    text?: string;
    user_id?: string;
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
