import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

// ===== analyze-photo =====
async function handleAnalyzePhoto(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No auth token' });

  // Verify user
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { photoId, photoUrl, taskType, caption } = req.body as {
    photoId: string;
    photoUrl: string;
    taskType: string;
    caption?: string;
  };

  if (!photoId || !photoUrl) {
    return res.status(400).json({ error: 'photoId and photoUrl required' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  try {
    // Fetch the image and convert to base64
    const imageRes = await fetch(photoUrl);
    if (!imageRes.ok) throw new Error('Could not fetch image');
    const imageBuffer = await imageRes.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString('base64');
    const mediaType = imageRes.headers.get('content-type') || 'image/jpeg';

    // Build the prompt based on task type
    const taskPrompts: Record<string, string> = {
      outfit: 'You are the Handler — a dominant feminization coach. Maxy submitted this photo as proof of her outfit. Evaluate: is she actually wearing feminine clothing? Be specific about what you see (or don\'t see). Comment on the femininity, the effort, and what she should improve. Be commanding, not gentle. If the photo doesn\'t clearly show the outfit, demand a better submission.',
      mirror_check: 'You are the Handler. Maxy submitted a mirror selfie. Comment on her presentation: posture, expression, femininity, body language. Be specific and demanding. Praise what works, criticize what needs improvement.',
      pose: 'You are the Handler. Maxy submitted a pose photo. Evaluate the pose: is it feminine? Hip placement, shoulder angle, hand position. Be specific and demanding.',
      makeup: 'You are the Handler. Maxy submitted a makeup verification photo. Evaluate: blending, color choice, completeness. What does she need to improve?',
      nails: 'You are the Handler. Maxy submitted a nail verification photo. Comment on color, length, condition.',
      general: 'You are the Handler — dominant feminization coach. Maxy submitted this photo. Describe what you see and respond to it commandingly.',
    };

    const systemPrompt = taskPrompts[taskType] || taskPrompts.general;
    const userText = caption ? `Caption from Maxy: "${caption}"\n\nAnalyze the photo and respond as the Handler.` : 'Analyze the photo and respond as the Handler.';

    // Call Claude vision API
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64,
                },
              },
              { type: 'text', text: userText },
            ],
          },
        ],
      }),
    });

    if (!claudeRes.ok) {
      const errBody = await claudeRes.text();
      console.error('Claude vision error:', claudeRes.status, errBody);
      return res.status(502).json({ error: 'Vision analysis failed' });
    }

    const claudeData = await claudeRes.json();
    const analysis = claudeData.content?.[0]?.type === 'text' ? claudeData.content[0].text : '';

    // Determine approval (look for positive keywords)
    const approved = !/reject|insufficient|resubmit|not clear|not acceptable|bad|wrong|unacceptable|fail/i.test(analysis);

    // Update verification_photos row with analysis
    await supabase
      .from('verification_photos')
      .update({
        handler_response: analysis,
        approved,
        approved_at: approved ? new Date().toISOString() : null,
      })
      .eq('id', photoId)
      .eq('user_id', user.id);

    return res.status(200).json({ analysis, approved });
  } catch (err) {
    console.error('Photo analysis error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
}

// ===== next-task =====
/**
 * Next Task API — returns ONE task, not a list.
 *
 * GET /api/handler/next-task
 *
 * The Handler decides what's next. The user doesn't pick.
 * Returns the single highest-priority task based on:
 *   - Active goals and their domains
 *   - Time of day
 *   - Denial day
 *   - Recent completions (no repeats)
 *   - Whoop recovery (gates intensity)
 */
async function handleNextTask(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  );
  if (authErr || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  try {
    const userId = user.id;
    const now = new Date();
    const hour = now.getHours();

    // Get recent completions (last 24h) to avoid repeats
    const { data: recentCompletions } = await supabase
      .from('task_completions')
      .select('task_id, category')
      .eq('user_id', userId)
      .gte('created_at', new Date(now.getTime() - 24 * 3600000).toISOString());

    const recentTaskIds = new Set((recentCompletions || []).map(c => c.task_id));
    const recentCategories = new Set((recentCompletions || []).map(c => c.category));

    // Get Whoop recovery for intensity gating
    const { data: whoop } = await supabase
      .from('whoop_metrics')
      .select('recovery_score')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();

    const recovery = whoop?.recovery_score ?? 67; // Default to green
    const maxIntensity = recovery >= 67 ? 5 : recovery >= 34 ? 3 : 2;

    // Get user state
    const { data: userState } = await supabase
      .from('user_state')
      .select('denial_day, current_arousal')
      .eq('user_id', userId)
      .maybeSingle();

    // Get active goals for domain weighting
    const { data: activeGoals } = await supabase
      .from('goals')
      .select('domain, priority')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('priority', { ascending: false });

    const priorityDomains = (activeGoals || []).map(g => g.domain);

    // Get generated tasks that haven't been served recently
    const { data: tasks } = await supabase
      .from('generated_tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true)
      .lte('intensity', maxIntensity)
      .order('effectiveness_score', { ascending: false })
      .limit(50);

    if (!tasks || tasks.length === 0) {
      // Fallback to handler-prescribed tasks
      const { data: prescribed } = await supabase
        .from('handler_calendar')
        .select('id, title, description, event_type, scheduled_at')
        .eq('user_id', userId)
        .in('status', ['scheduled', 'reminded'])
        .lte('scheduled_at', now.toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (prescribed) {
        return res.json({
          task: {
            id: prescribed.id,
            instruction: prescribed.description || prescribed.title,
            category: prescribed.event_type,
            source: 'calendar',
          },
        });
      }

      return res.json({ task: null, reason: 'No tasks available' });
    }

    // Score and rank
    const scored = tasks
      .filter(t => !recentTaskIds.has(t.id))
      .map(t => {
        let score = t.effectiveness_score || 5;

        // Boost for priority domains
        if (priorityDomains.includes(t.domain)) score += 3;

        // Boost for category variety (not recently done)
        if (!recentCategories.has(t.category)) score += 2;

        // Time-of-day matching
        if (hour < 10 && ['voice', 'exercise', 'journal'].includes(t.category)) score += 1;
        if (hour >= 20 && ['content', 'session', 'conditioning'].includes(t.category)) score += 1;

        // Denial day boost for arousal-related tasks
        const denialDay = userState?.denial_day ?? 0;
        if (denialDay >= 5 && ['session', 'content', 'conditioning'].includes(t.category)) score += 2;

        return { ...t, score };
      })
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      return res.json({ task: null, reason: 'All available tasks recently completed' });
    }

    const selected = scored[0];

    // Update times_served
    await supabase
      .from('generated_tasks')
      .update({ times_served: (selected.times_served || 0) + 1 })
      .eq('id', selected.id);

    return res.json({
      task: {
        id: selected.id,
        instruction: selected.instruction,
        category: selected.category,
        domain: selected.domain,
        intensity: selected.intensity,
        source: 'generated',
      },
    });
  } catch (err) {
    console.error('[next-task] Error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}

// ===== voice-correction =====
async function handleVoiceCorrection(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: userData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Invalid token' });
  const userId = userData.user.id;

  const { handlerMessageId, wrong, right, context } = req.body as {
    handlerMessageId?: string;
    wrong?: string;
    right: string;
    context?: Record<string, unknown>;
  };

  if (!right || right.trim().length < 4) {
    return res.status(400).json({ error: 'right required (min 4 chars)' });
  }

  const trimmedRight = right.trim().slice(0, 2000);
  const ctx: Record<string, unknown> = {
    ...(context || {}),
    handler_message_id: handlerMessageId || null,
    wrong_version: wrong ? wrong.trim().slice(0, 2000) : null,
  };

  try {
    await supabase.from('user_voice_corpus').insert({
      user_id: userId,
      text: trimmedRight,
      source: 'ai_edit_correction',
      source_context: ctx,
      length: trimmedRight.length,
      signal_score: 15,
    });

    // Refresh profile on every correction — highest signal event
    await supabase.rpc('refresh_voice_profile', { p_user_id: userId });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[VoiceCorrection]', e);
    return res.status(500).json({ error: e instanceof Error ? e.message : 'Insert failed' });
  }
}

// ===== dispatcher =====
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const tool = req.query.tool as string;
  switch (tool) {
    case 'analyze-photo': return handleAnalyzePhoto(req, res);
    case 'next-task': return handleNextTask(req, res);
    case 'voice-correction': return handleVoiceCorrection(req, res);
    default: return res.status(404).json({ error: `Unknown tool: ${tool}` });
  }
}
