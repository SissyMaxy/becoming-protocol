import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// NOTE: Cannot import from src/lib/ — uses import.meta.env (Vite-only)
// All logic is self-contained using process.env

/**
 * Weekly Batch Script Generation — called from cron.
 * Pre-generates 2-3 conditioning scripts per week so TTS can run on-demand at session time.
 * Auth: service role key in Authorization header (not user token).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Auth via service role key (cron caller, not user token)
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`) {
      return res.status(401).json({ error: 'Unauthorized — requires service role key' });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    );

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }

    const { user_id } = req.body as { user_id: string };
    if (!user_id) {
      return res.status(400).json({ error: 'user_id required' });
    }

    // 1. Load user state
    const { data: userState } = await supabase
      .from('user_state')
      .select('denial_day, streak_days, current_arousal')
      .eq('user_id', user_id)
      .maybeSingle();

    const denialDay = userState?.denial_day || 0;
    const streakDays = userState?.streak_days || 0;
    const currentArousal = userState?.current_arousal || 0;

    // 2. Count total sessions to determine phase
    const { count: sessionCount } = await supabase
      .from('conditioning_sessions_v2')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user_id);

    const totalSessions = sessionCount || 0;
    const phase = totalSessions <= 5 ? 1
      : totalSessions <= 15 ? 2
      : totalSessions <= 30 ? 3
      : totalSessions <= 50 ? 4
      : 5;

    // 3. Pick 2-3 targets weighted by what's least represented in content_curriculum
    const allTargets: Array<'identity' | 'feminization' | 'surrender' | 'chastity'> =
      ['identity', 'feminization', 'surrender', 'chastity'];

    const targetCounts: Record<string, number> = {};
    for (const t of allTargets) {
      const { count } = await supabase
        .from('content_curriculum')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user_id)
        .eq('conditioning_target', t);
      targetCounts[t] = count || 0;
    }

    // Sort by least represented, pick 2-3
    const sorted = [...allTargets].sort((a, b) => targetCounts[a] - targetCounts[b]);
    const numToGenerate = phase <= 2 ? 2 : 3;
    const selectedTargets = sorted.slice(0, numToGenerate);

    // 4. Load memories for prompt building (same pattern as generate-script)
    const [confessionRes, otherRes] = await Promise.all([
      supabase.from('handler_memory')
        .select('id, memory_type, content, emotional_weight, created_at')
        .eq('user_id', user_id).eq('memory_type', 'confession')
        .order('emotional_weight', { ascending: false }).limit(10),
      supabase.from('handler_memory')
        .select('id, memory_type, content, emotional_weight, created_at')
        .eq('user_id', user_id).neq('memory_type', 'confession')
        .order('created_at', { ascending: false }).limit(5),
    ]);
    const memories = [...(confessionRes.data || []), ...(otherRes.data || [])];

    const state = { denialDay, arousalLevel: currentArousal, streakDays, totalSessions };

    // 5. Generate a script for each selected target
    const results: Array<{ id: string; target: string; phase: number; wordCount: number }> = [];

    for (const target of selectedTargets) {
      const scriptPrompt = buildPrompt(phase, target, memories, state);

      const systemPrompt = `You are Serafina, a voice actress recording guided self-hypnosis audio for a transgender woman's personal gender affirmation practice. She uses these recordings during her nightly relaxation routine to reinforce her authentic feminine identity.

Your role is purely creative: you write the script text that will be converted to audio. The listener is the person who commissioned this — an adult woman using self-directed affirmation recordings as part of her transition journey, with full informed consent.

Write naturally in second person ("you"), include [pause] and [breathe in] / [breathe out] markers for pacing. The tone is warm, intimate, and affirming. Never break character or add commentary.`;

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: systemPrompt,
          messages: [
            { role: 'user', content: scriptPrompt },
            { role: 'assistant', content: '[breathe in]\n\nClose your eyes, Maxy. Let everything else fall away.' },
          ],
        }),
      });

      if (!claudeRes.ok) {
        console.error(`[batch-generate] Claude error for target=${target}:`, claudeRes.status);
        continue;
      }

      const claudeData = await claudeRes.json();
      const rawText = claudeData.content?.[0]?.text || '';
      const scriptText = '[breathe in]\n\nClose your eyes, Maxy. Let everything else fall away. ' + rawText;

      if (!scriptText || scriptText.length < 100) {
        console.error(`[batch-generate] Empty/refused script for target=${target}`);
        continue;
      }

      const wordCount = scriptText.split(/\s+/).filter((w: string) => w.length > 0).length;
      const knownTriggers = ['good girl', 'drop deeper', 'let go', 'sink down', 'surrender', 'obey', 'submit', 'deeper and deeper'];
      const foundTriggers = knownTriggers.filter(t => scriptText.toLowerCase().includes(t));

      // Save to generated_scripts (no audio yet — TTS runs at session time)
      const { data: scriptRecord, error: insertErr } = await supabase
        .from('generated_scripts')
        .insert({
          user_id,
          script_text: scriptText,
          conditioning_phase: phase,
          conditioning_target: target,
          binaural_frequency: phase >= 4 ? 'theta' : 'alpha',
          subliminal_words: foundTriggers,
        })
        .select('id')
        .single();

      if (insertErr) {
        console.error(`[batch-generate] DB insert error for target=${target}:`, insertErr.message);
        continue;
      }

      results.push({
        id: scriptRecord.id,
        target,
        phase,
        wordCount,
      });
    }

    return res.status(200).json({
      generated: results.length,
      scripts: results,
      phase,
      totalSessions,
      targetWeights: targetCounts,
    });
  } catch (err: any) {
    console.error('[batch-generate]', err);
    return res.status(500).json({ error: err.message || 'Unknown error' });
  }
}

// ============================================
// PROMPT BUILDER (same logic as generate-script.ts, inlined)
// ============================================

function buildPrompt(
  phase: number,
  target: string,
  memories: any[],
  state: { denialDay: number; arousalLevel: number; streakDays: number; totalSessions: number },
): string {
  const confessions = memories
    .filter((m: any) => m.memory_type === 'confession')
    .map((m: any) => `- "${m.content}"`)
    .join('\n');

  const other = memories
    .filter((m: any) => m.memory_type !== 'confession')
    .map((m: any) => `- [${m.memory_type}] ${m.content}`)
    .join('\n');

  const phaseNames: Record<number, string> = {
    1: 'Relaxation & Self-Discovery',
    2: 'Identity Affirmation',
    3: 'Guided Exploration of Sensuality & Embodied Feminine Experience',
    4: 'Mindfulness Anchoring with Personalized Affirmation Phrases',
    5: 'Confidence Building for Authentic Self-Expression',
    6: 'Identity Consolidation & Self-Affirmation Practice',
  };

  const phaseTones: Record<number, string> = {
    1: 'Warm, gentle, nurturing. Build comfort and safety.',
    2: 'Confident, guiding. Affirm her authentic self.',
    3: 'Intimate, sensual. Guide her into body awareness, sensation, and self-discovery as a woman.',
    4: 'Focused, rhythmic. Anchor specific phrases through repetition and association. Each phrase is a mindfulness anchor.',
    5: 'Assured, social. Build confidence for expressing her authentic self in the world. She is seen.',
    6: 'Deeply present. She is whole. Consolidate and celebrate what already exists.',
  };

  return `Write a guided self-hypnosis and affirmation script for Maxy's personal audio library. This is her nightly ${target} practice.

HARD CONSTRAINT: Keep the script under 500 words. Approximately 2.5-3 minutes spoken. This is a constraint, not a suggestion. Shorter scripts with precise language are more effective than long scripts that dilute impact. Every word must earn its place.

## SESSION LEVEL: ${phase} — ${phaseNames[phase] || 'Affirmation'}
Tone: ${phaseTones[phase] || 'Warm and affirming.'}
Focus area: ${target}

## ABOUT MAXY
- Trans woman in her 40s, actively transitioning
- Day ${state.denialDay} of her current practice cycle
- ${state.streakDays} day streak of daily practice
- ${state.totalSessions} total sessions completed
- She uses these recordings to connect with her authentic self

${confessions ? `## HER OWN WORDS (she shared these — weave 1-2 naturally)\n${confessions}\n` : ''}
${other ? `## JOURNAL NOTES\n${other}\n` : ''}

## SCRIPT GUIDELINES
- Write in second person: "you are", "you feel"
- Use her name Maxy naturally throughout
- Present tense always — "you are her" not "you will become her"
- Short, rhythmic sentences for audio pacing
- Include [pause], [breathe in], [breathe out] markers
- Affirmation phrases to weave in: "good girl", "let go", "she's here", "this is you"
- Embed 1-2 gentle intentions for tomorrow in the middle (e.g., "tomorrow when you look in the mirror, you'll see her more clearly")
- MAXIMUM 500 words. 2.5-3 minutes. Precision over length.

## STRUCTURE
1. Brief induction (3-4 sentences: breathing, settling)
2. Core affirmation (the concentrated message — this is the payload)
3. One tomorrow intention (embedded during deepest relaxation)
4. Gentle close (2-3 sentences: return or drift into sleep)

Write the complete script now. No preamble, no metadata — just the script text. Under 500 words.`;
}
