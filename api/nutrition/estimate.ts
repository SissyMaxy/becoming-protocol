/**
 * POST /api/nutrition/estimate
 * Body: { foods: string }
 * Returns: { protein_g: number, calories: number, reasoning: string, estimated: true }
 *
 * Uses Claude Haiku to estimate macros from a freeform food description.
 * Called from the Today meal log when user leaves protein/calories blank.
 * Cheap, fast, ±15% accuracy on typical meals — good enough for compliance
 * tracking and Zepbound-era directional macro monitoring.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const foods = typeof req.body?.foods === 'string' ? req.body.foods.trim() : '';
  if (foods.length < 3) return res.status(400).json({ error: 'foods required (min 3 chars)' });
  if (foods.length > 500) return res.status(400).json({ error: 'foods too long (max 500 chars)' });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  try {
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 180,
      system: `You are a nutrition estimator. Given a short description of a meal, estimate protein grams and total calories for a single serving as actually eaten.

Rules:
- Use typical restaurant/home portion sizes unless the user specifies
- Round protein to nearest whole gram
- Round calories to nearest 10
- Be concise; no caveats
- If the description is ambiguous, pick the most common interpretation
- Never refuse — always give a best-effort number

Output STRICT JSON only: {"protein_g": <int>, "calories": <int>, "reasoning": "<one-line explanation>"}`,
      messages: [{ role: 'user', content: `Estimate macros for: ${foods}` }],
    });

    const text = resp.content[0].type === 'text' ? resp.content[0].text.trim() : '';
    // Strip any fences, extract JSON
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(502).json({ error: 'no JSON in model response', raw: text });

    const parsed = JSON.parse(jsonMatch[0]);
    const protein = Math.max(0, Math.round(Number(parsed.protein_g) || 0));
    const calories = Math.max(0, Math.round(Number(parsed.calories) || 0));
    const reasoning = String(parsed.reasoning || '').slice(0, 300);

    return res.status(200).json({
      protein_g: protein,
      calories,
      reasoning,
      estimated: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[nutrition/estimate] failed:', msg);
    return res.status(500).json({ error: msg });
  }
}
