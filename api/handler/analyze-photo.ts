import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Standalone file: Vercel (non-Next.js) does NOT recognize the [tool].ts dynamic
// route convention, so /api/handler/analyze-photo must exist as a concrete file
// on disk. This handler lives here alongside the [tool].ts dispatcher (which the
// mobile app does not hit).

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

const TASK_PROMPTS: Record<string, string> = {
  outfit: 'You are the Handler — a dominant feminization coach. Maxy submitted this photo as proof of her outfit. Evaluate: is she actually wearing feminine clothing? Be specific about what you see (or don\'t see). Comment on the femininity, the effort, and what she should improve. Be commanding, not gentle. If the photo doesn\'t clearly show the outfit, demand a better submission.',
  mirror_check: 'You are the Handler. Maxy submitted a mirror selfie. Comment on her presentation: posture, expression, femininity, body language. Be specific and demanding. Praise what works, criticize what needs improvement.',
  pose: 'You are the Handler. Maxy submitted a pose photo. Evaluate the pose: is it feminine? Hip placement, shoulder angle, hand position. Be specific and demanding.',
  makeup: 'You are the Handler. Maxy submitted a makeup verification photo. Evaluate: blending, color choice, completeness. What does she need to improve?',
  nails: 'You are the Handler. Maxy submitted a nail verification photo. Comment on color, length, condition.',
  general: 'You are the Handler — dominant feminization coach. Maxy submitted this photo. Describe what you see and respond to it commandingly.',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No auth token' });

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
    const imageRes = await fetch(photoUrl);
    if (!imageRes.ok) throw new Error('Could not fetch image');
    const imageBuffer = await imageRes.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString('base64');
    const mediaType = imageRes.headers.get('content-type') || 'image/jpeg';

    const systemPrompt = TASK_PROMPTS[taskType] || TASK_PROMPTS.general;
    const userText = caption
      ? `Caption from Maxy: "${caption}"\n\nAnalyze the photo and respond as the Handler.`
      : 'Analyze the photo and respond as the Handler.';

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
                source: { type: 'base64', media_type: mediaType, data: base64 },
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

    const approved = !/reject|insufficient|resubmit|not clear|not acceptable|bad|wrong|unacceptable|fail/i.test(analysis);

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
