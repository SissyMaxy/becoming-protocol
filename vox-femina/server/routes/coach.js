import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const coachRouter = Router();

let systemPromptCache = null;

async function getSystemPrompt() {
  if (!systemPromptCache) {
    systemPromptCache = await readFile(
      join(__dirname, '..', 'prompts', 'four-pillar-coaching.txt'),
      'utf-8'
    );
  }
  return systemPromptCache;
}

/**
 * Format session metrics into a human-readable context block.
 * @param {object|null} metrics
 * @returns {string}
 */
function formatMetricsContext(metrics) {
  if (!metrics) return '';

  const lines = [];
  lines.push(`Composite Score: ${metrics.compositeScore ?? '—'}/100`);

  if (metrics.pillarScores) {
    const ps = metrics.pillarScores;
    for (const [key, label] of [['lightness', 'Lightness'], ['resonance', 'Resonance'], ['variability', 'Variability'], ['pitch', 'Pitch']]) {
      const p = ps[key];
      if (p) {
        const trend = metrics.pillarTrends?.[key] ? ` (trend: ${metrics.pillarTrends[key]})` : '';
        lines.push(`${label}: avg ${p.avg}, range ${p.min}-${p.max}${trend}`);
      }
    }
  }

  if (metrics.extras) {
    const e = metrics.extras;
    if (e.h1h2Avg != null) lines.push(`H1-H2 Average: ${e.h1h2Avg} dB`);
    if (e.f2Avg != null) lines.push(`F2 Average: ${e.f2Avg} Hz`);
    if (e.timeInTargetPct != null) lines.push(`Time in Target Pitch Range (180-250 Hz): ${e.timeInTargetPct}%`);
  }

  if (metrics.durationSeconds != null) {
    const m = Math.floor(metrics.durationSeconds / 60);
    const s = metrics.durationSeconds % 60;
    lines.push(`Session Duration: ${m}m ${s}s`);
  }

  return lines.join('\n');
}

// POST /api/coach
coachRouter.post('/', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured. Add it to the server .env file.' });
  }

  const { metrics, message, history = [] } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    const client = new Anthropic({ apiKey });
    const prompt = await getSystemPrompt();

    const metricsContext = formatMetricsContext(metrics);
    const userContent = metricsContext
      ? `[Session Data]\n${metricsContext}\n\n${message}`
      : message;

    const messages = [
      ...history,
      { role: 'user', content: userContent },
    ];

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: prompt,
      messages,
    });

    const assistantMessage = response.content[0]?.text || '';

    res.json({
      role: 'assistant',
      content: assistantMessage,
    });
  } catch (err) {
    console.error('Coach API error:', err.message);
    if (err.status === 401) {
      return res.status(500).json({ error: 'Invalid Anthropic API key' });
    }
    if (err.status === 429) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please wait a moment and try again.' });
    }
    res.status(500).json({ error: 'Failed to get coaching response. Please try again.' });
  }
});
