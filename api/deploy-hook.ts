import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/deploy-hook
 *
 * Called by Vercel Deploy Hook on successful deployment.
 * Writes deploy info to system_changelog so the Handler
 * knows what's new.
 *
 * Also accepts manual POST with { message, features } for
 * non-deploy changelog entries.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  );

  try {
    // Vercel sends deployment info in the body
    const body = req.body || {};

    // Extract from Vercel webhook payload or manual entry
    const entry = {
      deploy_id: body.id || body.deploymentId || null,
      commit_sha: body.meta?.githubCommitSha?.substring(0, 7) || body.sha || null,
      commit_message: body.meta?.githubCommitMessage || body.message || body.name || 'Deploy',
      environment: body.target || body.environment || 'production',
      features: body.features || extractFeatures(body.meta?.githubCommitMessage || body.message || ''),
      deployed_at: new Date().toISOString(),
    };

    await supabase.from('system_changelog').insert(entry);

    return res.status(200).json({ ok: true, entry });
  } catch (err: any) {
    console.error('[deploy-hook]', err);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * Extract feature keywords from commit messages.
 * Looks for patterns like "P5.2:", "Add", "Fix", "Wire", "Build".
 */
function extractFeatures(message: string): string[] {
  if (!message) return [];
  const features: string[] = [];

  // Priority/task references
  const pMatch = message.match(/P\d+\.\d+/g);
  if (pMatch) features.push(...pMatch);

  // Action keywords from first line
  const firstLine = message.split('\n')[0];
  if (/\badd\b/i.test(firstLine)) features.push('new_feature');
  if (/\bfix\b/i.test(firstLine)) features.push('bugfix');
  if (/\bwire\b/i.test(firstLine)) features.push('integration');
  if (/\bbuild\b/i.test(firstLine)) features.push('new_system');
  if (/\bcondition/i.test(firstLine)) features.push('conditioning');
  if (/\bhandler\b/i.test(firstLine)) features.push('handler');
  if (/\bwhoop\b/i.test(firstLine)) features.push('whoop');
  if (/\blovense\b/i.test(firstLine)) features.push('device');
  if (/\belevenlabs\b/i.test(firstLine)) features.push('voice');

  return features;
}
