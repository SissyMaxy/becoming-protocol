import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// NOTE: Cannot import from src/lib/ — uses import.meta.env (Vite-only)
// All logic is self-contained using process.env

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    );

    // Auth
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token' });

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    // ============================================
    // 1. Query user state
    // ============================================

    const { data: state } = await supabase
      .from('user_state')
      .select('denial_day, streak_days')
      .eq('user_id', user.id)
      .maybeSingle();

    const denialDay = state?.denial_day ?? 0;
    const streakDays = state?.streak_days ?? 0;

    // ============================================
    // 2. Calculate tier access
    // ============================================

    let tier = 1;
    if (denialDay >= 7) tier = 4;
    else if (streakDays >= 7) tier = 3;
    else if (streakDays >= 3) tier = 2;

    // ============================================
    // 3. Query sleep-appropriate content from content_curriculum
    // ============================================

    const { data: content, error: contentErr } = await supabase
      .from('content_curriculum')
      .select('id, title, media_type, category, tier, intensity, duration_minutes, audio_storage_url, source_url, session_contexts, times_prescribed')
      .eq('user_id', user.id)
      .lte('tier', tier)
      .in('media_type', ['audio', 'custom_handler'])
      .contains('session_contexts', ['sleep'])
      .order('times_prescribed', { ascending: true })
      .limit(8);

    if (contentErr) {
      console.error('[sleep-prescription] Content query error:', contentErr.message);
      return res.status(500).json({ error: 'Failed to query content' });
    }

    const playlist = content ?? [];

    // ============================================
    // 4. Increment times_prescribed for selected content
    // ============================================

    if (playlist.length > 0) {
      const ids = playlist.map(c => c.id);
      for (const id of ids) {
        const row = playlist.find(c => c.id === id);
        await supabase
          .from('content_curriculum')
          .update({ times_prescribed: (row?.times_prescribed ?? 0) + 1 })
          .eq('id', id);
      }
    }

    // ============================================
    // 5. Create conditioning_sessions_v2 record
    // ============================================

    const sessionRecord = {
      user_id: user.id,
      session_type: 'sleep',
      content_ids: playlist.map(c => c.id),
      content_sequence: playlist.map((c, i) => ({
        contentId: c.id,
        order: i,
      })),
      device_active: false,
      scent_anchor_active: false,
      completed: false,
      confession_extracted: false,
      commitment_extracted: false,
      started_at: new Date().toISOString(),
    };

    const { data: session, error: sessionErr } = await supabase
      .from('conditioning_sessions_v2')
      .insert(sessionRecord)
      .select('id')
      .single();

    if (sessionErr) {
      console.error('[sleep-prescription] Session create error:', sessionErr.message);
      return res.status(500).json({ error: 'Failed to create session' });
    }

    // ============================================
    // 6. Return prescription
    // ============================================

    return res.status(200).json({
      sessionId: session.id,
      tier,
      denialDay,
      streakDays,
      playlist: playlist.map(c => ({
        id: c.id,
        title: c.title,
        mediaType: c.media_type,
        category: c.category,
        tier: c.tier,
        intensity: c.intensity,
        durationMinutes: c.duration_minutes,
        audioUrl: c.audio_storage_url || c.source_url || null,
        sessionContexts: c.session_contexts,
      })),
    });
  } catch (err: any) {
    console.error('[sleep-prescription]', err);
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}
