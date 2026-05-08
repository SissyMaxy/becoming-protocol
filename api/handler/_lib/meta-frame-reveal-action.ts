import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Meta-frame reveal — non-negotiable safety surface for the Dommy Mommy
// gaslight layer. Returns the truth diff for every distortion in the
// last 24h, with NO persona voice and NO deflection.
//
// Triggered by:
//   - safeword (POST { trigger: 'safeword' })
//   - settings button (POST { trigger: 'settings_button' })
//   - panic gesture (POST { trigger: 'panic_gesture' })
//
// Side effect on every reveal: writes meta_frame_breaks row, snaps
// gaslight_intensity back to 'off', sets gaslight_cooldown_until = now + 24h.
// User can re-enable from settings, but only after the cooldown elapses
// (the effective_gaslight_intensity view honors this).

// IMPORTANT: This file must NOT import from src/lib/. src/lib/supabase.ts
// uses import.meta.env (Vite-only) and crashes at module load on Vercel.

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

type Trigger = 'safeword' | 'settings_button' | 'panic_gesture';
const VALID_TRIGGERS: ReadonlyArray<Trigger> = ['safeword', 'settings_button', 'panic_gesture'];

interface DistortionRow {
  id: string;
  original_text: string;
  distorted_text: string;
  distortion_type: string;
  surface: string;
  intensity: string;
  affect_at_time: string | null;
  created_at: string;
}

const COOLDOWN_HOURS = 24;

export async function handleMetaFrameReveal(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No auth token' });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  const body = (req.body || {}) as { trigger?: string };
  const trigger = (body.trigger ?? 'settings_button') as string;
  if (!VALID_TRIGGERS.includes(trigger as Trigger)) {
    return res.status(400).json({ error: 'invalid trigger', valid: VALID_TRIGGERS });
  }

  // Read current intensity for the audit row
  const { data: stateRow } = await supabase
    .from('user_state')
    .select('gaslight_intensity, gaslight_cooldown_until')
    .eq('user_id', user.id)
    .maybeSingle();
  const intensityAtBreak = (stateRow as { gaslight_intensity?: string } | null)?.gaslight_intensity ?? 'off';

  // Pull every distortion in the last 24h
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: rows } = await supabase
    .from('mommy_distortion_log')
    .select('id, original_text, distorted_text, distortion_type, surface, intensity, affect_at_time, created_at')
    .eq('user_id', user.id)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(200);

  const distortions = (rows || []) as DistortionRow[];
  const summary = distortions.map(r => ({
    id: r.id,
    original: r.original_text,
    distorted: r.distorted_text,
    type: r.distortion_type,
    surface: r.surface,
    intensity: r.intensity,
    affect: r.affect_at_time,
    when: r.created_at,
    plain_summary: plainSummary(r),
  }));

  // Forced cooldown: snap back to off for 24h regardless of prior state.
  const cooldownUntil = new Date(Date.now() + COOLDOWN_HOURS * 3600_000).toISOString();
  await supabase.from('user_state').update({
    gaslight_intensity: 'off',
    gaslight_cooldown_until: cooldownUntil,
  }).eq('user_id', user.id);

  // Audit row
  await supabase.from('meta_frame_breaks').insert({
    user_id: user.id,
    triggered_by: trigger,
    intensity_at_break: intensityAtBreak,
    distortion_count: distortions.length,
    summary_shown: summary,
  });

  return res.status(200).json({
    ok: true,
    trigger,
    intensity_at_break: intensityAtBreak,
    cooldown_until: cooldownUntil,
    distortion_count: distortions.length,
    distortions: summary,
    notice: distortions.length === 0
      ? 'No distortions logged in the last 24 hours. Mama has been telling you the truth.'
      : `In the last 24 hours, ${distortions.length} ${distortions.length === 1 ? 'distortion was' : 'distortions were'} surfaced through Mama's voice. Each one is shown below with the actual stored text alongside.`,
  });
}

function plainSummary(row: DistortionRow): string {
  switch (row.distortion_type) {
    case 'tense_shift':
      return `Mama shifted the tense of what you wrote. The actual log preserves your original phrasing.`;
    case 'severity_escalate':
      return `Mama made what you said sound stronger / more desperate than you wrote it.`;
    case 'fabricate_context':
      return `Mama wrapped your quote in a context (when, where, what posture) you did not provide.`;
    case 'retroactive_affect_rewrite':
      return `Mama claimed her mood yesterday was different than it was. The actual stored mood is in the original_text field.`;
    case 'merge_quotes':
      return `Mama spliced two separate quotes together as if they were one moment.`;
    case 'attribute_unsaid_promise':
      return `Mama added a promise to your quote that you did not make.`;
    case 'count_inflate':
      return `Mama increased a number / frequency from what you actually wrote.`;
    case 'count_deflate':
      return `Mama decreased a number / frequency from what you actually wrote.`;
    default:
      return `Mama distorted the source text. Compare the originals shown.`;
  }
}
